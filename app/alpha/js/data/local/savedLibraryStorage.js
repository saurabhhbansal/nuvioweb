import { LocalStore } from "../../core/storage/localStore.js";

export function libraryStorageError(code = "LIBRARY_STORAGE_UNAVAILABLE") {
  const error = new Error("Library changes could not be saved on this device. Check available browser storage and try again.");
  error.code = code;
  return error;
}

export function readLibraryStorage(key, fallback) {
  try { return LocalStore.get(key, fallback, { strict: true }); }
  catch { throw libraryStorageError(); }
}

export function writeLibraryStorage(key, value) {
  try {
    LocalStore.set(key, value, { strict: true });
    if (JSON.stringify(LocalStore.get(key, null, { strict: true })) !== JSON.stringify(value)) throw libraryStorageError();
  } catch { throw libraryStorageError(); }
}
