// Small IndexedDB key-value cache for plugin manifests and scraper code.
// Falls back to memory when IndexedDB is unavailable (private mode, tests).

const DATABASE_NAME = "nuvio-plugin-cache";
const STORE = "entries";

function openDatabase(idb) {
  return new Promise((resolve, reject) => {
    const request = idb.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(database, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function createPluginCache({ idb = globalThis.indexedDB } = {}) {
  const memory = new Map();
  let databasePromise = null;
  const database = () => {
    if (!idb) return Promise.resolve(null);
    databasePromise ||= openDatabase(idb).catch(() => null);
    return databasePromise;
  };

  return {
    async get(key) {
      if (memory.has(key)) return memory.get(key);
      const db = await database();
      if (!db) return null;
      try {
        const value = (await run(db, "readonly", (store) => store.get(key))) ?? null;
        if (value) memory.set(key, value);
        return value;
      } catch {
        return null;
      }
    },

    async set(key, value) {
      memory.set(key, value);
      const db = await database();
      if (!db) return;
      try {
        await run(db, "readwrite", (store) => store.put(value, key));
      } catch {
        // Memory copy still serves this session.
      }
    }
  };
}
