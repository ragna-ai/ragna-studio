export class QueueFullError extends Error {
  constructor() {
    super('Too many callers are already waiting');
    this.name = 'QueueFullError';
  }
}

// Limits how many callers run concurrently. Callers beyond the limit queue
// up and are released in order as slots free up. A full queue rejects new
// callers right away, so they fail fast instead of waiting indefinitely.
export class Semaphore {
  private slotsFree: number;
  private readonly maxQueued: number;
  private readonly waiting: Array<() => void> = [];

  constructor(concurrency: number, maxQueued: number) {
    this.slotsFree = concurrency;
    this.maxQueued = maxQueued;
  }

  async withLock<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason);
    }
    if (this.slotsFree > 0) {
      this.slotsFree -= 1;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.maxQueued) {
      return Promise.reject(new QueueFullError());
    }

    return new Promise((resolve, reject) => {
      const grantSlot = () => {
        signal?.removeEventListener('abort', leaveQueue);
        resolve();
      };
      const leaveQueue = () => {
        this.waiting.splice(this.waiting.indexOf(grantSlot), 1);
        reject(signal?.reason);
      };
      this.waiting.push(grantSlot);
      signal?.addEventListener('abort', leaveQueue, { once: true });
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      // Hand the freed slot straight to the next waiter instead of
      // incrementing then immediately decrementing slotsFree.
      next();
    } else {
      this.slotsFree += 1;
    }
  }
}
