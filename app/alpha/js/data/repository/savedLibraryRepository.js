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

function queueSavedLibraryCloudSync(profileId, change, delayMs = 500) {
  if (!AuthManager.isAuthenticated) return;
  const previousState = SavedLibrarySyncState.get(profileId);
  const state = SavedLibrarySyncState.markPending(profileId);
  const sessionGeneration = AuthManager.getSessionGeneration();
  const isCurrent = () => AuthManager.isSessionCurrent(sessionGeneration);
  const profileKey = `${sessionGeneration}:${String(profileId || "1")}`;
  let batch = savedLibrarySyncBatches.get(profileKey);
  if (!batch) {
    batch = { changes: new Map(), acknowledge: !previousState.pending || savedLibrarySyncInFlightByProfile.has(profileKey) };
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
    const inFlight = savedLibrarySyncInFlightByProfile.get(profileKey);
    const pushPromise = Promise.resolve(inFlight).catch(() => false)
      .then(async (priorSucceeded) => {
        if (!isCurrent()) return false;
        const { SavedLibrarySyncService } = await import("../../core/profile/savedLibrarySyncService.js");
        if (!isCurrent()) return false;
        const acknowledge = batch.acknowledge && priorSucceeded !== false;
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
    SavedLibraryStore.upsert(item, profileId);
    queueSavedLibraryCloudSync(profileId, { kind: "save", item: SavedLibraryStore.findByContentId(item.contentId, profileId) });
  }

  async remove(contentId, profileId = activeProfileId()) {
    this.getSyncState(profileId);
    const item = SavedLibraryStore.findByContentId(contentId, profileId);
    if (!item) return;
    SavedLibraryStore.remove(contentId, profileId);
    queueSavedLibraryCloudSync(profileId, { kind: "remove", item });
  }

  async toggle(item, profileId = activeProfileId()) {
    if (!item?.contentId) {
      return false;
    }
    this.getSyncState(profileId);
    const exists = SavedLibraryStore.findByContentId(item.contentId, profileId);
    if (exists) {
      SavedLibraryStore.remove(item.contentId, profileId);
      queueSavedLibraryCloudSync(profileId, { kind: "remove", item: exists });
      return false;
    }
    SavedLibraryStore.upsert(item, profileId);
    queueSavedLibraryCloudSync(profileId, { kind: "save", item: SavedLibraryStore.findByContentId(item.contentId, profileId) });
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
