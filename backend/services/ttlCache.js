class TTLCache {
  constructor({ ttlMs = 45_000, maxEntries = 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map(); // key -> { value, expiresAt }
  }

  _now() {
    return Date.now();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const now = this._now();
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, { ttlMs } = {}) {
    const now = this._now();
    const expiresAt = now + (ttlMs ?? this.ttlMs);
    this.store.set(key, { value, expiresAt });

    // Basic eviction: remove expired first, then oldest insertion order.
    if (this.store.size > this.maxEntries) {
      for (const [k, v] of this.store) {
        if (v.expiresAt <= now) this.store.delete(k);
      }
      while (this.store.size > this.maxEntries) {
        const firstKey = this.store.keys().next().value;
        this.store.delete(firstKey);
      }
    }
  }
}

module.exports = { TTLCache };

