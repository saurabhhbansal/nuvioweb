import { AuthManager } from "../auth/authManager.js";
import { registerAccountRuntimeResetHandler } from "../auth/accountLocalDataReset.js";
import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import { CollectionsStore, getCollectionFolderSources } from "../../data/local/collectionsStore.js";
import { ProfileManager } from "./profileManager.js";
import { SyncHydrationState, SyncPullResult } from "./syncHydrationState.js";

const PULL_RPC = "sync_pull_collections";
const PUSH_RPC = "sync_push_collections";
const PUSH_DEBOUNCE_MS = 500;

function resolveProfileId(profileId = null) {
  const raw = Number(profileId ?? ProfileManager.getActiveProfileId() ?? 1);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  return 1;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// The account blob as another app last wrote it, before this app's normalizer
// dropped the fields it does not model (NuvioMobile, for one, keeps its own
// per-folder settings there). Pushing only our normalized copy would delete
// them, so a push lays our values over the raw objects instead, matched the
// way the native apps match them: collections and folders by id, sources by
// what they point at.
function readRawCollections(blob = null) {
  let raw = blob?.collections_json ?? blob?.collectionsJson ?? blob ?? [];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }
  if (isPlainObject(raw) && Array.isArray(raw.collections)) raw = raw.collections;
  return Array.isArray(raw) ? raw.filter(isPlainObject) : [];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Native apps parse these case-insensitively, so they are matched that way.
function keyPart(value) {
  return String(value ?? "").trim().toLowerCase();
}

function catalogSourceKey(source = {}) {
  const parts = [source.addonId, source.type, source.catalogId].map(keyPart);
  return parts.every(Boolean) ? parts.join("|") : null;
}

function unifiedSourceKey(source = {}) {
  const provider = keyPart(source.provider || "addon");
  if (provider === "tmdb") {
    // Older web builds wrote a missing tmdbId as 0.
    const tmdbId = Number(source.tmdbId) ? keyPart(source.tmdbId) : "";
    return keyPart(source.tmdbSourceType)
      ? ["tmdb", source.tmdbSourceType, tmdbId, source.mediaType, source.sortBy].map(keyPart).join("|")
      : null;
  }
  if (provider === "trakt") {
    return source.traktListId != null
      ? ["trakt", source.traktListId, source.mediaType, source.sortBy, source.sortHow].map(keyPart).join("|")
      : null;
  }
  const key = catalogSourceKey(source);
  return key ? `${provider}|${key}` : null;
}

function idKey(entry = {}) {
  return keyPart(entry.id) ? String(entry.id).trim() : null;
}

function layOver(raw, ours) {
  if (!isPlainObject(raw)) return ours;
  const merged = { ...raw, ...ours };
  // TMDB filters are an object of their own; keep keys only a native app set.
  if (isPlainObject(raw.filters) && isPlainObject(ours.filters)) {
    merged.filters = { ...raw.filters, ...ours.filters };
  }
  return merged;
}

// Pairs each of our entries with the raw entry it came from. Equal keys
// (two folders' sources can point at the same catalog) pair up in order.
function mergeList(rawList, ourList, keyOf, mergeEntry = layOver) {
  const rawByKey = new Map();
  (Array.isArray(rawList) ? rawList : []).filter(isPlainObject).forEach((entry) => {
    const key = keyOf(entry);
    if (!key) return;
    if (!rawByKey.has(key)) rawByKey.set(key, []);
    rawByKey.get(key).push(entry);
  });
  return (ourList || []).map((entry) => mergeEntry(rawByKey.get(keyOf(entry))?.shift(), entry));
}

// Raw sources the web normalizer cannot read (a provider added to the native
// apps later, say) never reach the web list. They were not removed here, so
// they go back as they came.
function unreadableSources(rawSources = []) {
  return (Array.isArray(rawSources) ? rawSources : [])
    .filter(isPlainObject)
    .filter((source) => getCollectionFolderSources({ sources: [source] }).length === 0);
}

function mergeFolder(rawFolder, folder) {
  const merged = layOver(rawFolder, folder);
  if (!isPlainObject(rawFolder)) return merged;
  merged.sources = [
    ...mergeList(rawFolder.sources, folder.sources, unifiedSourceKey),
    ...unreadableSources(rawFolder.sources)
  ];
  merged.catalogSources = mergeList(rawFolder.catalogSources, folder.catalogSources, catalogSourceKey);
  return merged;
}

export function preserveRemoteCollectionFields(rawCollections = [], collections = []) {
  return mergeList(rawCollections, collections, idKey, (rawCollection, collection) => {
    const merged = layOver(rawCollection, collection);
    if (isPlainObject(rawCollection)) {
      merged.folders = mergeList(rawCollection.folders, collection.folders, idKey, mergeFolder);
    }
    return merged;
  });
}

// Collections another device added after this one last read the account. The
// push replaces the blob, so without this they would be deleted by an edit
// made here to something else.
function addedElsewhere(freshRaw = [], lastSeenRaw = null, collections = []) {
  if (!Array.isArray(lastSeenRaw)) return [];
  const seen = new Set(lastSeenRaw.map(idKey).filter(Boolean));
  const ours = new Set(collections.map(idKey).filter(Boolean));
  return freshRaw.filter((entry) => {
    const id = idKey(entry);
    return id && !seen.has(id) && !ours.has(id);
  });
}

function parseRemoteCollectionsPayload(blob = null) {
  const raw = blob?.collections_json ?? blob?.collectionsJson ?? blob ?? [];
  if (typeof raw === "string") {
    return CollectionsStore.importFromJson(raw);
  }
  try {
    return CollectionsStore.importFromJson(JSON.stringify(raw));
  } catch (_) {
    return [];
  }
}

export const CollectionSyncService = {
  syncingFromRemoteProfiles: new Set(),
  pushTimers: new Map(),
  pendingLocalChanges: new Map(),
  remoteRawCollections: new Map(),

  isSyncingFromRemote(profileId = null) {
    return this.syncingFromRemoteProfiles.has(resolveProfileId(profileId));
  },

  recordLocalMutation(profileId = null, before = [], after = []) {
    const resolvedProfileId = resolveProfileId(profileId);
    const existing = this.pendingLocalChanges.get(resolvedProfileId);
    this.pendingLocalChanges.set(resolvedProfileId, { before: existing?.before || before, after });
  },

  hasPendingLocalMutation(profileId = null) {
    return this.pendingLocalChanges.has(resolveProfileId(profileId));
  },

  async push(profileId = null, { automatic = false, context = null } = {}) {
    if (!AuthManager.isAuthenticated) {
      return false;
    }
    const resolvedProfileId = resolveProfileId(profileId);
    try {
      const syncContext = context || (await SyncHydrationState.capture(resolvedProfileId));
      if (automatic && !(await SyncHydrationState.allowsAutomaticPush(syncContext, "collections"))) {
        console.info("[Sync] collections automatic push blocked", {
          hydration: SyncHydrationState.get(syncContext, "collections")
        });
        return false;
      }
      const collections = CollectionsStore.importFromJson(
        CollectionsStore.exportCurrentProfileJson(resolvedProfileId)
      );
      // Merge over the account as it is now, not as it was at the last pull,
      // so a native app's edits since then are kept.
      const lastSeenRaw = this.remoteRawCollections.get(resolvedProfileId) ?? null;
      let freshRaw = lastSeenRaw || [];
      try {
        const rows = await SupabaseApi.rpc(PULL_RPC, { p_profile_id: resolvedProfileId }, true);
        const blob = Array.isArray(rows) ? rows[0] || null : rows || null;
        if (blob) freshRaw = readRawCollections(blob);
      } catch (error) {
        console.warn("Collection sync pre-push read failed; merging over the last pull", error);
      }
      if (!(await SyncHydrationState.isCurrent(syncContext))) {
        return false;
      }
      const parsedJson = [
        ...preserveRemoteCollectionFields(freshRaw, collections),
        ...addedElsewhere(freshRaw, lastSeenRaw, collections)
      ];
      await SupabaseApi.rpc(
        PUSH_RPC,
        {
          p_profile_id: resolvedProfileId,
          p_collections_json: parsedJson
        },
        true
      );
      if (!(await SyncHydrationState.isCurrent(syncContext))) {
        return false;
      }
      this.remoteRawCollections.set(resolvedProfileId, parsedJson);
      this.pendingLocalChanges.delete(resolvedProfileId);
      return true;
    } catch (error) {
      console.warn("Collection sync push failed", error);
      return false;
    }
  },

  async pull(profileId = null, { context = null } = {}) {
    if (!AuthManager.isAuthenticated) {
      return false;
    }
    const resolvedProfileId = resolveProfileId(profileId);
    const syncContext = context || (await SyncHydrationState.capture(resolvedProfileId));
    try {
      if (!(await SyncHydrationState.beginPull(syncContext, "collections"))) {
        return { result: SyncPullResult.FAILED, items: CollectionsStore.getForProfile(resolvedProfileId) };
      }
      const rows = await SupabaseApi.rpc(
        PULL_RPC,
        {
          p_profile_id: resolvedProfileId
        },
        true
      );
      if (!(await SyncHydrationState.isCurrent(syncContext))) {
        return { result: SyncPullResult.FAILED, items: CollectionsStore.getForProfile(resolvedProfileId) };
      }
      const blob = Array.isArray(rows) ? rows[0] || null : rows || null;
      if (!blob) {
        await SyncHydrationState.completePull(syncContext, "collections", SyncPullResult.FAILED);
        return { result: SyncPullResult.FAILED, items: CollectionsStore.getForProfile(resolvedProfileId) };
      }

      this.remoteRawCollections.set(resolvedProfileId, readRawCollections(blob));
      const remoteCollections = parseRemoteCollectionsPayload(blob);
      const localCollections = CollectionsStore.getForProfile(resolvedProfileId);
      const pending = this.pendingLocalChanges.get(resolvedProfileId);
      let resolvedCollections = remoteCollections;
      if (pending) {
        const beforeById = new Map((pending.before || []).map((item) => [item.id, item]));
        const afterById = new Map((pending.after || []).map((item) => [item.id, item]));
        resolvedCollections = remoteCollections
          .filter((item) => !beforeById.has(item.id) || afterById.has(item.id))
          .map((item) => afterById.get(item.id) || item);
        afterById.forEach((item, id) => {
          if (!resolvedCollections.some((entry) => entry.id === id)) resolvedCollections.push(item);
        });
      }

      if (stableStringify(resolvedCollections) !== stableStringify(localCollections)) {
        this.syncingFromRemoteProfiles.add(resolvedProfileId);
        try {
          CollectionsStore.replaceForProfile(resolvedProfileId, resolvedCollections, { silentSync: true });
        } finally {
          this.syncingFromRemoteProfiles.delete(resolvedProfileId);
        }
      }

      const result = remoteCollections.length ? SyncPullResult.SUCCESS_WITH_DATA : SyncPullResult.SUCCESS_EMPTY;
      await SyncHydrationState.completePull(syncContext, "collections", result);
      return { result, items: resolvedCollections };
    } catch (error) {
      console.warn("Collection sync pull failed", error);
      await SyncHydrationState.completePull(syncContext, "collections", SyncPullResult.FAILED);
      return { result: SyncPullResult.FAILED, items: CollectionsStore.getForProfile(resolvedProfileId) };
    }
  },

  triggerPush(profileId = null, mutation = null) {
    if (!AuthManager.isAuthenticated) {
      return;
    }
    const resolvedProfileId = resolveProfileId(profileId);
    if (mutation) this.recordLocalMutation(resolvedProfileId, mutation.before, mutation.after);
    if (this.isSyncingFromRemote(resolvedProfileId)) {
      return;
    }
    const existingTimer = this.pushTimers.get(resolvedProfileId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timerId = setTimeout(() => {
      this.pushTimers.delete(resolvedProfileId);
      void this.push(resolvedProfileId, { automatic: true });
    }, PUSH_DEBOUNCE_MS);
    this.pushTimers.set(resolvedProfileId, timerId);
  },

  resetAccountState() {
    this.pushTimers.forEach((timerId) => clearTimeout(timerId));
    this.pushTimers.clear();
    this.pendingLocalChanges.clear();
    this.remoteRawCollections.clear();
    this.syncingFromRemoteProfiles.clear();
  }
};

registerAccountRuntimeResetHandler(() => CollectionSyncService.resetAccountState());
