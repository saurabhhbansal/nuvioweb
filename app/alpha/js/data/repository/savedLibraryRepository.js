import { SavedLibraryStore } from "../local/savedLibraryStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { AuthManager } from "../../core/auth/authManager.js";
import { SavedLibrarySyncState } from "../local/savedLibrarySyncState.js";

function activeProfileId() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

const savedLibrarySyncTimers = new Map();
const savedLibrarySyncBatches = new Map();
const savedLibrarySyncInFlightByProfile = new Map();
const unconfirmedProfiles = new Set();
function sessionProfileKey(profileId) {
  return `${AuthManager.getSessionGeneration()}:${String(profileId || "1")}`;
}

function queueSavedLibraryCloudSync(profileId, change, edit, delayMs = 500) {
  if (!AuthManager.isAuthenticated) return;
  const { previousState, state } = edit;
  const sessionGeneration = AuthManager.getSessionGeneration();
  const isCurrent = () => AuthManager.isSessionCurrent(sessionGeneration);
  const profileKey = `${sessionGeneration}:${String(profileId || "1")}`;
  let batch = savedLibrarySyncBatches.get(profileKey);
  if (!batch) {
    batch = { changes: new Map(), predecessor: savedLibrarySyncInFlightByProfile.get(profileKey), acknowledge: !unconfirmedProfiles.has(profileKey) && (!previousState.pending || savedLibrarySyncInFlightByProfile.has(profileKey)) };
    savedLibrarySyncBatches.set(profileKey, batch);
  }
  batch.revision = state.revision;
  // Only explicit operations are replayable. Distinct keys survive debounce;
  // repeated same-key actions retain the last local intent.
  const item = { ...change.item, genres: Array.isArray(change.item.genres) ? [...change.item.genres] : [] };
  batch.changes.set(JSON.stringify([item.contentType, item.contentId]), { kind: change.kind, item });
  clearTimeout(savedLibrarySyncTimers.get(profileKey));
  const timerId = setTimeout(() => {
    savedLibrarySyncTimers.delete(profileKey);
    savedLibrarySyncBatches.delete(profileKey);
    if (!isCurrent()) return;
    const inFlight = savedLibrarySyncInFlightByProfile.get(profileKey) || batch.predecessor;
    const pushPromise = Promise.resolve(inFlight).catch(() => false)
      .then(async (priorSucceeded) => {
        if (!isCurrent()) return false;
        const { SavedLibrarySyncService } = await import("../../core/profile/savedLibrarySyncService.js");
        if (!isCurrent()) return false;
        const acknowledge = batch.acknowledge && !unconfirmedProfiles.has(profileKey) && priorSucceeded !== false;
        const success = await SavedLibrarySyncService.push(profileId, [...batch.changes.values()], {
          revision: batch.revision, acknowledge
        });
        // A later successful operation must not mark a failed/legacy edit clean.
        return success && acknowledge;
      })
      .catch(() => false)
      .finally(() => {
        if (savedLibrarySyncInFlightByProfile.get(profileKey) === pushPromise) savedLibrarySyncInFlightByProfile.delete(profileKey);
      });
    savedLibrarySyncInFlightByProfile.set(profileKey, pushPromise);
  }, delayMs);
  savedLibrarySyncTimers.set(profileKey, timerId);
}

function beginLocalEdit(profileId) {
  if (!AuthManager.isAuthenticated) return null;
  const previousState = SavedLibrarySyncState.get(profileId);
  const state = SavedLibrarySyncState.markPending(profileId);
  if (!SavedLibrarySyncState.isPersisted(profileId, state)) {
    unconfirmedProfiles.add(sessionProfileKey(profileId));
    const error = new Error("Library changes could not be saved safely on this device. Check browser storage and try again. Cloud sync was not started.");
    error.code = "LIBRARY_SYNC_STORAGE_UNAVAILABLE";
    throw error;
  }
  return { previousState, state };
}

function commitLocalEdit(profileId, mutation) {
  const edit = beginLocalEdit(profileId);
  try { mutation(); }
  catch (error) {
    if (edit) unconfirmedProfiles.add(sessionProfileKey(profileId));
    // A write may have committed before its readback failed. Retain pending;
    // clearing it here would let the next pull silently discard that edit.
    throw error;
  }
  return edit;
}

class SavedLibraryRepository {
  getSyncState(profileId = activeProfileId()) {
    if (AuthManager.isAuthenticated && !SavedLibrarySyncState.has(profileId) &&
      SavedLibraryStore.listForProfile(profileId).length) {
      // An older cache may contain unsynced edits; never infer that it is clean.
      return SavedLibrarySyncState.markPending(profileId);
    }
    return SavedLibrarySyncState.get(profileId);
  }

  acknowledgeSync(profileId, revision) {
    if (unconfirmedProfiles.has(sessionProfileKey(profileId))) return false;
    return SavedLibrarySyncState.acknowledge(profileId, revision);
  }

  async getAll(limit = 200, profileId = activeProfileId()) {
    return SavedLibraryStore.listForProfile(profileId).slice(0, limit);
  }

  async isSaved(contentId, profileId = activeProfileId()) {
    return Boolean(SavedLibraryStore.findByContentId(contentId, profileId));
  }

  async save(item, profileId = activeProfileId()) {
    if (!item?.contentId) {
      return;
    }
    this.getSyncState(profileId);
    const edit = commitLocalEdit(profileId, () => SavedLibraryStore.upsert(item, profileId));
    queueSavedLibraryCloudSync(profileId, { kind: "save", item: SavedLibraryStore.listForProfile(profileId).find(saved => saved.contentId === item.contentId && saved.contentType === String(item.contentType || item.itemType || item.type || "movie")) }, edit);
  }

  async remove(contentId, profileId = activeProfileId()) {
    this.getSyncState(profileId);
    const items = SavedLibraryStore.listForProfile(profileId).filter(item => item.contentId === contentId);
    if (!items.length) return;
    const edit = commitLocalEdit(profileId, () => SavedLibraryStore.remove(contentId, profileId));
    for (const item of items) queueSavedLibraryCloudSync(profileId, { kind: "remove", item }, edit);
  }

  async toggle(item, profileId = activeProfileId()) {
    if (!item?.contentId) {
      return false;
    }
    this.getSyncState(profileId);
    const exists = SavedLibraryStore.findByContentId(item.contentId, profileId);
    if (exists) {
      await this.remove(item.contentId, profileId);
      return false;
    }
    const edit = commitLocalEdit(profileId, () => SavedLibraryStore.upsert(item, profileId));
    queueSavedLibraryCloudSync(profileId, { kind: "save", item: SavedLibraryStore.listForProfile(profileId).find(saved => saved.contentId === item.contentId && saved.contentType === String(item.contentType || item.itemType || item.type || "movie")) }, edit);
    return true;
  }

  async replaceAll(items, profileId = activeProfileId()) {
    if (!SavedLibrarySyncState.has(profileId)) {
      // Establish a clean baseline before store notifications can trigger reads.
      SavedLibrarySyncState.acknowledge(profileId, 0);
    }
    SavedLibraryStore.replaceForProfile(profileId, items || []);
  }
}

export const savedLibraryRepository = new SavedLibraryRepository();
