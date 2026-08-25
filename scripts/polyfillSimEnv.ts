/** In-memory Web Storage so game libs can run under Node without a browser. */
const memory = new Map<string, string>();

const localStorageShim: Storage = {
  get length() {
    return memory.size;
  },
  clear() {
    memory.clear();
  },
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  key(index: number) {
    return [...memory.keys()][index] ?? null;
  },
  removeItem(key: string) {
    memory.delete(key);
  },
  setItem(key: string, value: string) {
    memory.set(key, String(value));
  },
};

const g = globalThis as typeof globalThis & { localStorage?: Storage; window?: typeof globalThis };
g.localStorage = localStorageShim;
if (typeof g.window === 'undefined') {
  g.window = g;
}
