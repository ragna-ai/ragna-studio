// Limits how many callers run concurrently. Callers beyond the limit queue
// up and are released in order as slots free up.
export class Semaphore {
  private slotsFree: number;
  private readonly waiting: Array<() => void> = [];

  constructor(concurrency: number) {
    this.slotsFree = concurrency;
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.slotsFree > 0) {
      this.slotsFree -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
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
