export interface CacheConfig {
  readonly capacityBytes: number;
  readonly ways: number;
  readonly lineBytes: number;
}

/**
 * Set-associative, LRU cache keyed by byte address. Hit and miss are not
 * asserted by the caller: a miss is whatever the address stream produces
 * against this capacity, associativity and line size.
 */
export class SetAssociativeCache {
  private readonly lineBytes: number;
  private readonly ways: number;
  private readonly setCount: number;
  /** Per set, tags ordered most-recently-used first. */
  private readonly tags: number[][];

  constructor(config: CacheConfig) {
    const { capacityBytes, lineBytes, ways } = config;
    if (ways < 1)
      throw new Error('cache ways must be at least 1');
    if (lineBytes < 1)
      throw new Error('cache lineBytes must be at least 1');

    const setCount = Math.floor(capacityBytes / (ways * lineBytes));
    if (setCount < 1)
      throw new Error('cache capacity is smaller than a single set');

    this.lineBytes = lineBytes;
    this.ways = ways;
    this.setCount = setCount;
    this.tags = Array.from({ length: setCount }, () => []);
  }

  get capacityBytes(): number {
    return this.setCount * this.ways * this.lineBytes;
  }

  get sets(): number {
    return this.setCount;
  }

  /** Probes the line, promoting it to most-recently-used on a hit. */
  lookup(address: number): boolean {
    const { set, tag } = this.locate(address);
    const tags = this.tags[set];
    if (tags === undefined)
      return false;

    const at = tags.indexOf(tag);
    if (at === -1)
      return false;

    if (at > 0) {
      tags.splice(at, 1);
      tags.unshift(tag);
    }
    return true;
  }

  /** Installs the line, returning the evicted address if one was displaced. */
  fill(address: number): number | null {
    const { set, tag } = this.locate(address);
    const tags = this.tags[set];
    if (tags === undefined)
      return null;

    const at = tags.indexOf(tag);
    if (at !== -1) {
      if (at > 0) {
        tags.splice(at, 1);
        tags.unshift(tag);
      }
      return null;
    }

    let evicted: number | null = null;
    if (tags.length >= this.ways) {
      const evictedTag = tags.pop();
      if (evictedTag !== undefined)
        evicted = this.addressOf(set, evictedTag);
    }
    tags.unshift(tag);
    return evicted;
  }

  private locate(address: number): { set: number; tag: number } {
    const block = Math.floor(address / this.lineBytes);
    return { set: block % this.setCount, tag: Math.floor(block / this.setCount) };
  }

  private addressOf(set: number, tag: number): number {
    return (tag * this.setCount + set) * this.lineBytes;
  }
}
