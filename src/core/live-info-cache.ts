/**
 * Tick-based cache for lazily loaded live view info.
 *
 * Entries are valid until the next refresh tick (`newTick()`), which keeps
 * the cache timer-free and makes staleness deterministic per tick.
 */
export class LiveInfoCache<T> {
  private readonly entries = new Map<string, T>();

  get(name: string): T | undefined {
    return this.entries.get(name);
  }

  set(name: string, value: T): void {
    this.entries.set(name, value);
  }

  newTick(): void {
    this.entries.clear();
  }

  snapshot(): Map<string, T> {
    return new Map(this.entries);
  }

  size(): number {
    return this.entries.size;
  }
}
