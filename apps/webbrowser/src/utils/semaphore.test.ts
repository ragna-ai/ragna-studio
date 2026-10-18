import { describe, expect, test } from 'bun:test';
import { QueueFullError, Semaphore } from './semaphore';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Semaphore', () => {
  test('runs queued callers once a slot frees up', async () => {
    const semaphore = new Semaphore(1, 5);
    const first = deferred();
    const order: string[] = [];

    const firstRun = semaphore.withLock(async () => {
      await first.promise;
      order.push('first');
    });
    const secondRun = semaphore.withLock(async () => {
      order.push('second');
    });

    first.resolve();
    await Promise.all([firstRun, secondRun]);

    expect(order).toEqual(['first', 'second']);
  });

  test('rejects with QueueFullError when the queue is full', async () => {
    const semaphore = new Semaphore(1, 1);
    const blocker = deferred();

    const running = semaphore.withLock(() => blocker.promise);
    const queued = semaphore.withLock(async () => {});

    await expect(semaphore.withLock(async () => {})).rejects.toBeInstanceOf(QueueFullError);

    blocker.resolve();
    await Promise.all([running, queued]);
  });

  test('rejects an already aborted caller without taking a slot', async () => {
    const semaphore = new Semaphore(1, 5);
    const controller = new AbortController();
    controller.abort();
    let ran = false;

    const run = semaphore.withLock(async () => {
      ran = true;
    }, controller.signal);

    await expect(run).rejects.toThrow();
    expect(ran).toBe(false);
    await semaphore.withLock(async () => {});
  });

  test('drops a waiting caller from the queue when it aborts', async () => {
    const semaphore = new Semaphore(1, 1);
    const blocker = deferred();
    const controller = new AbortController();
    let abortedRan = false;

    const running = semaphore.withLock(() => blocker.promise);
    const aborted = semaphore.withLock(async () => {
      abortedRan = true;
    }, controller.signal);

    controller.abort();
    await expect(aborted).rejects.toThrow();

    const next = semaphore.withLock(async () => 'next');
    blocker.resolve();
    await running;

    expect(await next).toBe('next');
    expect(abortedRan).toBe(false);
  });
});
