import { LocalStore } from "../../core/storage/localStore.js";

export const LIBRARY_ITEM_LIMIT = 1000;

export function libraryStorageError() {
  const error = new Error("Library changes could not be saved on this device. Check available browser storage and try again.");
  error.code = "LIBRARY_STORAGE_UNAVAILABLE";
  return error;
}

function readLibraryStorage(key, fallback) {
  try { return LocalStore.get(key, fallback, { strict: true }); }
  catch { throw libraryStorageError(); }
}

function writeLibraryStorage(key, value) {
  try { LocalStore.set(key, value, { strict: true }); }
  catch { throw libraryStorageError(); }
}

const SAVED_LIBRARY_KEY = "savedLibraryItems";
const changeListeners = new Set();

function itemsSignature(items = []) {
  return JSON.stringify(items || []);
}

function notifyChange(profileId, reason) {
  const change = {
    profileId: String(profileId || "1"),
    reason: String(reason || "change")
  };
  changeListeners.forEach((listener) => {
    try {
      listener(change);
    } catch (error) {
      console.warn("Saved library change listener failed", error);
    }
  });
}

export function normalizeItem(item = {}, profileId = 1) {
  const updatedAt = Number(item.updatedAt || item.addedAt || Date.now());
  return {
    ...item,
    profileId: String(item.profileId || profileId || "1"),
    contentId: String(item.contentId || item.itemId || item.id || ""),
    contentType: String(item.contentType || item.itemType || item.type || "movie"),
    title: String(item.title || item.name || item.contentId || item.itemId || "Untitled"),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
  };
}

function savedLibraryItemKey(item = {}) {
  const profileId = String(item.profileId || "1").trim() || "1";
  const contentType =
    String(item.contentType || "movie")
      .trim()
      .toLowerCase() || "movie";
  const contentId = String(item.contentId || "").trim();
  return `${profileId}::${contentType}::${contentId}`;
}

function dedupeAndSort(items = []) {
  const byKey = new Map();
  (items || []).forEach((raw) => {
    const normalized = normalizeItem(raw, raw?.profileId);
    if (!normalized.contentId) {
      return;
    }
    const key = savedLibraryItemKey(normalized);
    const existing = byKey.get(key);
    if (!existing || Number(normalized.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
      byKey.set(key, normalized);
    }
  });
  return Array.from(byKey.values()).sort(
    (left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0)
  );
}

export const SavedLibraryStore = {
  subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  listAll(strict = false) {
    let raw;
    try { raw = readLibraryStorage(SAVED_LIBRARY_KEY, []); }
    catch (error) { if (strict) throw error; return []; }
    return dedupeAndSort(Array.isArray(raw) ? raw : []);
  },

  list() {
    return this.listAll();
  },

  listForProfile(profileId, strict = false) {
    const pid = String(profileId || "1");
    return this.listAll(strict).filter((item) => String(item.profileId || "1") === pid);
  },

  upsert(item, profileId) {
    const pid = String(profileId || "1");
    const normalized = normalizeItem(
      {
        ...item,
        updatedAt: item.updatedAt || Date.now()
      },
      pid
    );
    if (!normalized.contentId) {
      return;
    }
    const key = savedLibraryItemKey(normalized);
    const items = this.listAll(true);
    const others = items.filter((entry) => savedLibraryItemKey(entry) !== key);
    // Keep at most LIBRARY_ITEM_LIMIT items per profile on this device. The
    // oldest ones drop off locally only; the cloud keeps them.
    const sameProfile = others.filter((entry) => String(entry.profileId || "1") === pid);
    const dropped = new Set(sameProfile.slice(LIBRARY_ITEM_LIMIT - 1));
    const nextItems = dedupeAndSort([normalized, ...others.filter((entry) => !dropped.has(entry))]);
    if (itemsSignature(items) === itemsSignature(nextItems)) {
      return normalized;
    }
    writeLibraryStorage(SAVED_LIBRARY_KEY, nextItems);
    notifyChange(pid, "upsert");
    return normalized;
  },

  findByContentId(contentId, profileId, strict = false) {
    const wanted = String(contentId || "").trim();
    return this.listForProfile(profileId, strict).find((item) => item.contentId === wanted) || null;
  },

  remove(contentId, profileId) {
    const pid = String(profileId || "1");
    const wanted = String(contentId || "").trim();
    const items = this.listAll(true);
    const next = items.filter((item) => {
      return String(item.profileId || "1") !== pid || item.contentId !== wanted;
    });
    if (items.length === next.length) {
      return;
    }
    writeLibraryStorage(SAVED_LIBRARY_KEY, next);
    notifyChange(pid, "remove");
  },

  replaceAll(items = []) {
    const previousItems = this.listAll(true);
    const nextItems = dedupeAndSort(Array.isArray(items) ? items : []);
    if (itemsSignature(previousItems) === itemsSignature(nextItems)) {
      return;
    }
    writeLibraryStorage(SAVED_LIBRARY_KEY, nextItems);
    const profileIds = new Set(
      [...previousItems, ...nextItems].map((item) => String(item.profileId || "1"))
    );
    profileIds.forEach((profileId) => {
      if (
        itemsSignature(previousItems.filter((item) => String(item.profileId || "1") === profileId)) !==
        itemsSignature(nextItems.filter((item) => String(item.profileId || "1") === profileId))
      ) {
        notifyChange(profileId, "replaceAll");
      }
    });
  },

  replaceForProfile(profileId, items = []) {
    const pid = String(profileId || "1");
    const currentItems = this.listAll(true);
    const previousProfileItems = currentItems.filter(
      (item) => String(item.profileId || "1") === pid
    );
    const keepOtherProfiles = currentItems.filter(
      (item) => String(item.profileId || "1") !== pid
    );
    const normalized = dedupeAndSort(
      (Array.isArray(items) ? items : [])
      .map((item) => normalizeItem(item, pid))
      .filter((item) => Boolean(item.contentId))
    );
    const nextItems = dedupeAndSort([...normalized, ...keepOtherProfiles]);
    if (itemsSignature(previousProfileItems) === itemsSignature(normalized)) {
      return;
    }
    writeLibraryStorage(SAVED_LIBRARY_KEY, nextItems);
    notifyChange(pid, "replaceForProfile");
  }
};
