import type {
  BottleneckClass,
  CacheSpec,
  HardwareConfig,
  LevelId,
  OutstandingStats,
  ResourceRole,
  ResourceStats,
  SimResult,
  SimSpan,
} from './types';
import { SetAssociativeCache } from './cache';
import { EventQueue } from './event-queue';
import { fullAccessNs, transferNs } from './memory';

export const DEFAULT_LINE_BYTES = 64;
export const DEFAULT_SATURATION_THRESHOLD = 0.8;

/** One access emitted by a workload. */
export interface WorkloadAccess {
  readonly address: number;
  readonly bytes: number;
  /** True when this access needs the previous one's data before it can issue. */
  readonly dependent: boolean;
}

export interface SimulateOptions {
  readonly lineBytes?: number;
  readonly saturationThreshold?: number;
  /**
   * Records per-request spans for the first N accesses so the view can replay
   * real activity. Off by default: a trace for a million accesses is waste.
   */
  readonly traceRequests?: number;
}

const LEVELS = ['l1', 'l2', 'l3'] as const;
type CacheLevel = (typeof LEVELS)[number];
type OutstandingLevel = CacheLevel | 'memory';

const RESOURCE_IDS: readonly LevelId[] = ['cpu', 'l1', 'l2', 'l3', 'memory'];
const OUTSTANDING_LEVELS: readonly OutstandingLevel[] = ['l1', 'l2', 'l3', 'memory'];

interface PathEntry {
  readonly level: CacheLevel;
  /** When the request began probing this level; its residency starts there. */
  readonly waitStartNs: number;
}

interface Request {
  readonly index: number;
  readonly access: WorkloadAccess;
  readonly issuedAtNs: number;
  /** Levels that missed, in order; the data fills each of them on return. */
  readonly path: PathEntry[];
}

interface Waiter {
  readonly request: Request;
  readonly levelIndex: number;
}

/** Resumes a request that is riding on someone else's in-flight miss. */
type SecondaryResume = (atNs: number) => void;

/**
 * Discrete-event model of the memory path: one core issuing accesses that walk
 * L1 → L2 → L3 → memory. Simulated time advances by jumping between events, so
 * queueing and contention emerge from resource occupancy rather than being
 * asserted.
 *
 * Two accounting rules keep the numbers honest:
 *
 * - **Latency and occupancy are different things.** A level's `hitTimeNs` is a
 *   delay on the request's path; its `bytesPerNs` is the data rate that
 *   consumes the resource. Charging latency as occupancy lets utilisation
 *   exceed 100%, which makes "the busiest resource" meaningless.
 * - **Every level is a serial server.** Data ports, like the memory channel,
 *   are reserved on a free-time cursor rather than accumulated in parallel.
 */
export class MemorySystemSimulation {
  private readonly config: HardwareConfig;
  private readonly accesses: readonly WorkloadAccess[];
  private readonly lineBytes: number;
  private readonly saturationThreshold: number;
  private readonly traceLimit: number;
  private readonly spans: SimSpan[] = [];
  private readonly caches: Record<CacheLevel, SetAssociativeCache>;
  private readonly queue = new EventQueue<() => void>();

  private nowNs = 0;
  private nextIndex = 0;
  private inFlight = 0;
  private prevIssueNs = 0;
  private channelFreeAtNs = 0;
  private lastCompletionNs = 0;
  private completed = 0;

  private readonly completionTimes: number[] = [];
  private readonly waiters: Record<OutstandingLevel, Waiter[]> = { l1: [], l2: [], l3: [], memory: [] };
  private readonly outstanding: Record<OutstandingLevel, number> = { l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly outstandingMax: Record<OutstandingLevel, number> = { l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly outstandingArea: Record<OutstandingLevel, number> = { l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly outstandingMarkNs: Record<OutstandingLevel, number> = { l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly busyNs: Record<LevelId, number> = { cpu: 0, l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly hitCount: Record<LevelId, number> = { cpu: 0, l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly accessCount: Record<LevelId, number> = { cpu: 0, l1: 0, l2: 0, l3: 0, memory: 0 };
  private readonly levelFreeAtNs: Record<CacheLevel, number> = { l1: 0, l2: 0, l3: 0 };
  private readonly inFlightLines: Record<CacheLevel, Map<number, SecondaryResume[]>> = {
    l1: new Map(),
    l2: new Map(),
    l3: new Map(),
  };

  private latencySumNs = 0;
  private latencyMinNs = Number.POSITIVE_INFINITY;
  private latencyMaxNs = 0;
  private movedBytes = 0;

  constructor(config: HardwareConfig, accesses: readonly WorkloadAccess[], options: SimulateOptions = {}) {
    this.config = config;
    this.accesses = accesses;
    this.lineBytes = options.lineBytes ?? DEFAULT_LINE_BYTES;
    this.saturationThreshold = options.saturationThreshold ?? DEFAULT_SATURATION_THRESHOLD;
    this.traceLimit = Math.max(0, options.traceRequests ?? 0);
    this.caches = {
      l1: this.buildCache(config.caches.l1),
      l2: this.buildCache(config.caches.l2),
      l3: this.buildCache(config.caches.l3),
    };
  }

  run(): SimResult {
    this.schedule(0, () => this.drainIssues());
    while (!this.queue.isEmpty) {
      const event = this.queue.pop();
      if (event === undefined)
        break;
      this.nowNs = event.timeNs;
      event.payload();
    }

    if (this.completed !== this.accesses.length)
      throw new Error(`simulation stalled: ${this.completed} of ${this.accesses.length} accesses completed`);

    return this.buildResult();
  }

  private buildCache(spec: CacheSpec): SetAssociativeCache {
    return new SetAssociativeCache({
      capacityBytes: spec.capacityBytes,
      lineBytes: this.lineBytes,
      ways: spec.ways,
    });
  }

  private schedule(timeNs: number, action: () => void): void {
    this.queue.push(timeNs, action);
  }

  /**
   * The L1's outstanding-miss limit *is* the core's memory-level parallelism: a
   * miss cannot be in flight without holding an L1 slot. L2 and L3 carry their
   * own limits, which only bind when a configuration sets them lower.
   */
  private get inFlightBudget(): number {
    return this.config.caches.l1.maxOutstandingMisses;
  }

  private roleOf(id: LevelId): ResourceRole {
    if (id === 'cpu')
      return this.config.cpu.role;
    if (id === 'memory')
      return this.config.memory.role;
    return this.config.caches[id].role;
  }

  private levelLimit(level: OutstandingLevel): number {
    return level === 'memory'
      ? this.config.memory.maxOutstandingMisses
      : this.config.caches[level].maxOutstandingMisses;
  }

  /**
   * Issues as many accesses as the core legally can right now. A dependent
   * access waits for its producer; independent ones are capped by the core's
   * in-flight budget, which is what bounds memory-level parallelism.
   */
  private drainIssues(): void {
    while (this.nextIndex < this.accesses.length) {
      const access = this.accesses[this.nextIndex];
      if (access === undefined)
        return;

      const base = this.nextIndex === 0
        ? 0
        : this.prevIssueNs + this.config.cpu.serviceTimeNs;
      let atNs = Math.max(base, this.nowNs);

      if (access.dependent) {
        // The first access has no producer; later ones wait for the previous
        // access's data, which is what serialises a pointer chase.
        const producerNs = this.nextIndex === 0 ? atNs : this.completionTimes[this.nextIndex - 1];
        if (producerNs === undefined)
          return;
        atNs = Math.max(atNs, producerNs);
      }

      if (this.inFlight >= this.inFlightBudget)
        return;

      this.issue(this.nextIndex, access, atNs);
      this.nextIndex += 1;
    }
  }

  private issue(index: number, access: WorkloadAccess, atNs: number): void {
    const serviceNs = this.config.cpu.serviceTimeNs;
    this.prevIssueNs = atNs;
    this.inFlight += 1;
    this.accessCount.cpu += 1;
    this.busyNs.cpu += serviceNs;

    // The access leaves only once the core has finished issuing it, which keeps
    // the core's busy windows disjoint and its utilisation under 100%.
    const request: Request = { access, index, issuedAtNs: atNs, path: [] };
    this.schedule(atNs + serviceNs, () => this.accessLevel(request, 0, atNs + serviceNs));
  }

  private accessLevel(request: Request, levelIndex: number, atNs: number): void {
    if (levelIndex >= LEVELS.length) {
      this.accessMemory(request, atNs);
      return;
    }

    const level = LEVELS[levelIndex];
    const spec = this.config.caches[level];
    const cache = this.caches[level];
    const probedAtNs = atNs + spec.hitTimeNs;

    if (cache.lookup(request.access.address)) {
      this.accessCount[level] += 1;
      this.hitCount[level] += 1;
      const servedAtNs = this.reservePort(level, request.access.bytes, probedAtNs);
      this.recordSpan(request, level, 'level', atNs, servedAtNs);
      this.complete(request, servedAtNs);
      return;
    }

    // A miss for a line already in flight at this level rides on the existing
    // fetch instead of duplicating it, the way a real MSHR merges a secondary
    // miss.
    const pending = this.inFlightLines[level].get(request.access.address);
    if (pending !== undefined) {
      this.accessCount[level] += 1;
      pending.push(resumeAtNs => this.complete(request, resumeAtNs));
      return;
    }

    if (this.outstanding[level] >= spec.maxOutstandingMisses) {
      // Counted once, when the request is finally handled — never per retry.
      this.waiters[level].push({ levelIndex, request });
      return;
    }

    this.accessCount[level] += 1;
    this.setOutstanding(level, this.outstanding[level] + 1);
    request.path.push({ level, waitStartNs: atNs });
    this.inFlightLines[level].set(request.access.address, []);
    this.accessLevel(request, levelIndex + 1, probedAtNs);
  }

  private accessMemory(request: Request, atNs: number): void {
    const spec = this.config.memory;

    if (this.outstanding.memory >= spec.maxOutstandingMisses) {
      this.waiters.memory.push({ levelIndex: LEVELS.length, request });
      return;
    }

    this.setOutstanding('memory', this.outstanding.memory + 1);

    const serviceNs = transferNs(request.access.bytes, spec);
    const startAtNs = Math.max(atNs, this.channelFreeAtNs);
    const wiredAtNs = startAtNs + serviceNs;
    this.channelFreeAtNs = wiredAtNs;

    this.accessCount.memory += 1;
    this.busyNs.memory += serviceNs;
    this.movedBytes += request.access.bytes;
    // Starts at arrival, not at grant, so the span covers any time spent queued
    // behind another transfer: the row's occupancy count must be exact.
    this.recordSpan(request, 'memory', 'transfer', atNs, wiredAtNs);

    // The channel is occupied for the transfer; the DRAM access latency runs
    // alongside other transfers, standing in for bank-level parallelism. Both
    // phases are traced: the wait is what a latency-bound workload spends its
    // whole life in, and leaving it out makes the picture look idle.
    const readyAtNs = wiredAtNs + fullAccessNs(spec);
    this.recordSpan(request, 'memory', 'dram', wiredAtNs, readyAtNs);
    this.schedule(readyAtNs, () => {
      this.setOutstanding('memory', this.outstanding.memory - 1);
      this.releaseWaiters('memory', readyAtNs);
      this.complete(request, readyAtNs);
    });
  }

  private complete(request: Request, atNs: number): void {
    const path = [...request.path];
    request.path.length = 0;

    let finishedAtNs = atNs;
    // Reversed: the line comes back from the DRAM into the L3 first, then down
    // through L2 into L1, which is the order the data actually moves.
    for (const entry of [...path].reverse()) {
      const fillStartNs = finishedAtNs;
      // One span from the original probe to the start of the fill, so the
      // request is visibly resident for the whole wait — which is most of what
      // a dependent chase spends its time doing.
      this.recordSpan(request, entry.level, 'level', entry.waitStartNs, fillStartNs);
      finishedAtNs = this.fillLevel(entry.level, request.access.address, request.access.bytes, finishedAtNs);
      this.recordSpan(request, entry.level, 'fill', fillStartNs, finishedAtNs);
      this.setOutstanding(entry.level, this.outstanding[entry.level] - 1);
      this.releaseWaiters(entry.level, finishedAtNs);
    }

    const latencyNs = finishedAtNs - request.issuedAtNs;
    this.latencySumNs += latencyNs;
    this.latencyMinNs = Math.min(this.latencyMinNs, latencyNs);
    this.latencyMaxNs = Math.max(this.latencyMaxNs, latencyNs);
    this.completionTimes[request.index] = finishedAtNs;
    this.lastCompletionNs = Math.max(this.lastCompletionNs, finishedAtNs);
    this.completed += 1;
    this.inFlight -= 1;

    this.schedule(finishedAtNs, () => this.drainIssues());
  }

  /** Installs a line, serves it, and completes anything riding on it. */
  private fillLevel(level: CacheLevel, line: number, bytes: number, atNs: number): number {
    this.caches[level].fill(line);
    const finishedAtNs = this.reservePort(level, bytes, atNs);

    const secondaries = this.inFlightLines[level].get(line);
    if (secondaries !== undefined) {
      this.inFlightLines[level].delete(line);
      for (const resume of [...secondaries])
        resume(finishedAtNs);
    }
    return finishedAtNs;
  }

  /** Reserves a level's data port, returning when the transfer completes. */
  private reservePort(level: CacheLevel, bytes: number, atNs: number): number {
    const serviceNs = bytes / this.config.caches[level].bytesPerNs;
    const startAtNs = Math.max(atNs, this.levelFreeAtNs[level]);
    this.levelFreeAtNs[level] = startAtNs + serviceNs;
    this.busyNs[level] += serviceNs;
    return startAtNs + serviceNs;
  }

  /**
   * Hands freed capacity to waiters. Today a released waiter always consumes the
   * freed slot — a request for a line already queued below merges at L1 rather
   * than queuing again — so this normally runs at most once. It loops anyway: if
   * a resume ever did hit or merge, stopping after a single release would strand
   * the remaining waiters with no further completion coming.
   */
  private releaseWaiters(level: OutstandingLevel, atNs: number): void {
    const limit = this.levelLimit(level);
    while (this.waiters[level].length > 0 && this.outstanding[level] < limit) {
      const waiter = this.waiters[level].shift();
      if (waiter === undefined)
        return;
      this.accessLevel(waiter.request, waiter.levelIndex, atNs);
    }
  }

  /**
   * Integrates the outstanding-request count over time. The change is booked at
   * the current event time rather than the exact instant inside a synchronous
   * cascade, so `mean` is accurate to well under a nanosecond.
   */
  private setOutstanding(level: OutstandingLevel, value: number): void {
    this.outstandingArea[level] += this.outstanding[level] * (this.nowNs - this.outstandingMarkNs[level]);
    this.outstandingMarkNs[level] = this.nowNs;
    this.outstanding[level] = value;
    this.outstandingMax[level] = Math.max(this.outstandingMax[level], value);
  }

  private recordSpan(
    request: Request,
    level: LevelId,
    kind: SimSpan['kind'],
    startNs: number,
    endNs: number,
  ): void {
    if (request.index >= this.traceLimit)
      return;
    this.spans.push({ endNs, kind, level, requestIndex: request.index, startNs });
  }

  private buildResult(): SimResult {
    const elapsedNs = this.lastCompletionNs;

    for (const level of OUTSTANDING_LEVELS) {
      this.outstandingArea[level] += this.outstanding[level] * Math.max(0, elapsedNs - this.outstandingMarkNs[level]);
    }

    const resources: ResourceStats[] = RESOURCE_IDS.map((id) => {
      const busyNs = this.busyNs[id];
      return {
        accesses: this.accessCount[id],
        busyNs,
        hits: this.hitCount[id],
        id,
        role: this.roleOf(id),
        utilisation: elapsedNs > 0 ? busyNs / elapsedNs : 0,
      };
    });

    // Ties keep the earlier entry, and RESOURCE_IDS is ordered by proximity to
    // the core, so equal utilisation resolves toward the CPU.
    const busiest = resources.reduce(
      (best, candidate) => (candidate.utilisation > best.utilisation ? candidate : best),
      resources[0],
    );

    const resourceBound = busiest.utilisation >= this.saturationThreshold;
    const classification: BottleneckClass = resourceBound ? 'resource-bound' : 'latency-bound';

    const outstanding = {} as Record<OutstandingLevel, OutstandingStats>;
    for (const level of OUTSTANDING_LEVELS) {
      outstanding[level] = {
        max: this.outstandingMax[level],
        mean: elapsedNs > 0 ? this.outstandingArea[level] / elapsedNs : 0,
      };
    }

    return {
      accesses: this.completed,
      achievedBandwidthBytesPerNs: elapsedNs > 0 ? this.movedBytes / elapsedNs : 0,
      bottleneckId: resourceBound ? busiest.id : null,
      classification,
      cpuStallNs: Math.max(0, elapsedNs - this.busyNs.cpu),
      elapsedNs,
      hitRates: {
        l1: this.hitRate('l1'),
        l2: this.hitRate('l2'),
        l3: this.hitRate('l3'),
      },
      maxLatencyNs: this.latencyMaxNs,
      meanLatencyNs: this.completed > 0 ? this.latencySumNs / this.completed : 0,
      minLatencyNs: Number.isFinite(this.latencyMinNs) ? this.latencyMinNs : 0,
      movedBytes: this.movedBytes,
      outstanding,
      resources,
      spans: this.spans,
    };
  }

  private hitRate(level: CacheLevel): number {
    const accesses = this.accessCount[level];
    return accesses > 0 ? this.hitCount[level] / accesses : 0;
  }
}

export function simulate(
  config: HardwareConfig,
  accesses: readonly WorkloadAccess[],
  options: SimulateOptions = {},
): SimResult {
  return new MemorySystemSimulation(config, accesses, options).run();
}
