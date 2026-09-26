import { describe, expect, it } from 'vitest';

import { EventQueue } from './event-queue';

describe('eventQueue', () => {
  it('pops in simulated-time order regardless of insertion order', () => {
    const queue = new EventQueue<string>();
    queue.push(30, 'c');
    queue.push(10, 'a');
    queue.push(20, 'b');

    expect([queue.pop()?.payload, queue.pop()?.payload, queue.pop()?.payload]).toEqual(['a', 'b', 'c']);
  });

  it('breaks equal timestamps by insertion order', () => {
    const queue = new EventQueue<string>();
    queue.push(5, 'first');
    queue.push(5, 'second');
    queue.push(5, 'third');

    expect([queue.pop()?.payload, queue.pop()?.payload, queue.pop()?.payload]).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('stays ordered across many interleaved pushes', () => {
    const queue = new EventQueue<number>();
    const values = [17, 3, 42, 8, 99, 1, 23, 4, 56, 2];
    for (const value of values)
      queue.push(value, value);

    const drained: number[] = [];
    while (!queue.isEmpty) {
      const entry = queue.pop();
      if (entry !== undefined)
        drained.push(entry.payload);
    }

    expect(drained).toEqual([...values].sort((a, b) => a - b));
  });

  it('reports empty and returns undefined when drained', () => {
    const queue = new EventQueue<string>();
    expect(queue.isEmpty).toBe(true);
    expect(queue.pop()).toBeUndefined();

    queue.push(1, 'only');
    expect(queue.size).toBe(1);
    expect(queue.pop()?.payload).toBe('only');
    expect(queue.isEmpty).toBe(true);
  });
});
