import { SavedLibraryStore } from "../local/savedLibraryStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { AuthManager } from "../../core/auth/authManager.js";
import { SavedLibrarySyncState } from "../local/savedLibrarySyncState.js";

function activeProfileId() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

let savedLibrarySyncTimers = null;
const savedLibrarySyncInFlightByProfile = new Map();

function queueSavedLibraryCloudSync(profileId = activeProfileId(), delayMs = 500) {
  if (!AuthManager.isAuthenticated) return;
  SavedLibrarySyncState.markPending(profileId);
  const sessionGeneration = AuthManager.getSessionGeneration();
  const isCurrent = () => AuthManager.isSessionCurrent(sessionGeneration);
  // Repeated profile IDs belong to different queues after an account switch.
  const profileKey = `${sessionGeneration}:${String(profileId || "1")}`;
  if (savedLibrarySyncTimers) {
    const existingTimer = savedLibrarySyncTimers.get(profileKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
  }
  if (!savedLibrarySyncTimers) {
    savedLibrarySyncTimers = new Map();
  }
  const timerId = setTimeout(() => {
    savedLibrarySyncTimers.delete(profileKey);
    if (!isCurrent()) return;
    const inFlight = savedLibrarySyncInFlightByProfile.get(profileKey);
    // Publish the queue tail before awaiting it so later work stays serialized.
    const pushPromise = Promise.resolve(inFlight)
      .catch(() => false)
      .then(async () => {
        if (!isCurrent()) return false;
        const { SavedLibrarySyncService } = await import("../../core/profile/savedLibrarySyncService.js");
        return isCurrent() ? SavedLibrarySyncService.push(profileId) : false;
      })
      .catch((error) => {
        console.warn("Saved library cloud sync enqueue failed", error);
        return false;
      })
      .finally(() => {
        if (savedLibrarySyncInFlightByProfile.get(profileKey) === pushPromise) {
          savedLibrarySyncInFlightByProfile.delete(profileKey);
        }
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
    SavedLibraryStore.upsert(item, profileId);
    queueSavedLibraryCloudSync(profileId);
  }

  async remove(contentId, profileId = activeProfileId()) {
    SavedLibraryStore.remove(contentId, profileId);
    queueSavedLibraryCloudSync(profileId);
  }

  async toggle(item, profileId = activeProfileId()) {
    if (!item?.contentId) {
      return false;
    }
    const exists = SavedLibraryStore.findByContentId(item.contentId, profileId);
    if (exists) {
      SavedLibraryStore.remove(item.contentId, profileId);
      queueSavedLibraryCloudSync(profileId);
      return false;
    }
    SavedLibraryStore.upsert(item, profileId);
    queueSavedLibraryCloudSync(profileId);
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
