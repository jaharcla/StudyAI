export class RecognitionCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly maxEntries = 128, private readonly ttlMs = 30 * 60_000) {}
  get(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.values.delete(key); return undefined; }
    this.values.delete(key); this.values.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T) {
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value!);
  }
  clear() { this.values.clear(); }
  get size() { return this.values.size; }
}
