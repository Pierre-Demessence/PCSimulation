interface QueueEntry<T> {
  readonly timeNs: number;
  readonly seq: number;
  readonly payload: T;
}

/**
 * Binary min-heap ordered by simulated time. Equal timestamps fall back to
 * insertion order, so a fixed seed always produces the same run.
 */
export class EventQueue<T> {
  private readonly heap: QueueEntry<T>[] = [];
  private counter = 0;

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(timeNs: number, payload: T): void {
    const entry: QueueEntry<T> = { payload, seq: this.counter, timeNs };
    this.counter += 1;
    this.heap.push(entry);
    this.siftUp(this.heap.length - 1);
  }

  pop(): QueueEntry<T> | undefined {
    const top = this.heap[0];
    if (top === undefined)
      return undefined;

    const last = this.heap.pop();
    if (last === undefined)
      return undefined;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private less(a: QueueEntry<T>, b: QueueEntry<T>): boolean {
    if (a.timeNs !== b.timeNs)
      return a.timeNs < b.timeNs;
    return a.seq < b.seq;
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const child = this.heap[index];
      const up = this.heap[parent];
      if (child === undefined || up === undefined || !this.less(child, up))
        break;
      this.heap[index] = up;
      this.heap[parent] = child;
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    const length = this.heap.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      const candidate = this.heap[smallest];
      const leftEntry = this.heap[left];
      const rightEntry = this.heap[right];
      if (candidate === undefined)
        return;

      if (left < length && leftEntry !== undefined && this.less(leftEntry, candidate))
        smallest = left;

      const best = this.heap[smallest];
      if (best === undefined)
        return;

      if (right < length && rightEntry !== undefined && this.less(rightEntry, best))
        smallest = right;

      if (smallest === index)
        return;

      const a = this.heap[index];
      const b = this.heap[smallest];
      if (a === undefined || b === undefined)
        return;
      this.heap[index] = b;
      this.heap[smallest] = a;
      index = smallest;
    }
  }
}
