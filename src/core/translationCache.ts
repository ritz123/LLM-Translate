/** Section 9: TranslationCache — LRU by hash key. */

export class LruTranslationCache {
  private readonly max: number;
  private readonly map = new Map<string, string>();

  constructor(maxEntries = 256) {
    this.max = maxEntries;
  }

  get(hash: string): string | null {
    const v = this.map.get(hash);
    if (v === undefined) return null;
    this.map.delete(hash);
    this.map.set(hash, v);
    return v;
  }

  set(hash: string, translation: string): void {
    if (this.map.has(hash)) this.map.delete(hash);
    this.map.set(hash, translation);
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }
}
