const DEFAULT_TTL_MS = 60 * 1000; // 1 minute
const MAX_STORE_SIZE = 500;

const store = new Map();

const purgeIfExpired = (key, entry) => {
  if (!entry) return null;
  if (!entry.expiresAt || entry.expiresAt > Date.now()) {
    return entry.value;
  }
  store.delete(key);
  return null;
};

const evictOldest = () => {
  if (store.size <= MAX_STORE_SIZE) {
    return;
  }
  const oldestKey = store.keys().next().value;
  if (oldestKey) {
    store.delete(oldestKey);
  }
};

export const cache = {
  get(key) {
    return purgeIfExpired(key, store.get(key));
  },

  set(key, value, ttl = DEFAULT_TTL_MS) {
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;
    store.set(key, { value, expiresAt });
    evictOldest();
    return value;
  },

  del(key) {
    store.delete(key);
  },

  clear() {
    store.clear();
  },

  async wrap(key, ttl, factory) {
    const cached = this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
    const value = await factory();
    this.set(key, value, ttl);
    return value;
  },
};
