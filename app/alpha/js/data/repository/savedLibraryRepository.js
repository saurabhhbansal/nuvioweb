import { SavedLibraryStore, normalizeItem } from "../local/savedLibraryStore.js";
import { SavedLibraryOutbox, outboxKey } from "../local/savedLibraryOutbox.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { AuthManager } from "../../core/auth/authManager.js";
import { registerAccountRuntimeResetHandler } from "../../core/auth/accountLocalDataReset.js";

// Signed-in Library edits go to the local store and to a persisted outbox.
// The outbox is sent shortly after each change, on every pull (startup and the
// periodic sync) and when the browser comes back online. A sent operation
// leaves the outbox only once the cloud confirmed it.
const FLUSH_DELAY_MS = 500;
const flushTimers = new Map();
const syncLocks = new Map();

function activeProfileId() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

function copyItem(item) {
  return { ...item, genres: Array.isArray(item.genres) ? [...item.genres] : [] };
}

function scheduleFlush(profileId) {
  const pid = String(profileId || "1");
  clearTimeout(flushTimers.get(pid));
  flushTimers.set(pid, setTimeout(() => {
    flushTimers.delete(pid);
    void savedLibraryRepository.flush(pid);
  }, FLUSH_DELAY_MS));
}

// Queues the cloud operations, then applies the local change. If the local
// write fails, the queued operations are undone so the cloud never receives
// a change this device reported as failed.
function commitChange(profileId, changes, applyLocally) {
  if (!AuthManager.isAuthenticated) return applyLocally();
  const queued = [];
  try {
    for (const [kind, item] of changes) queued.push(SavedLibraryOutbox.put(profileId, kind, copyItem(item)));
    const value = applyLocally();
    scheduleFlush(profileId);
    return value;
  } catch (error) {
    for (const entry of queued.reverse()) {
      try { SavedLibraryOutbox.revert(profileId, entry); } catch { /* storage unavailable */ }
    }
    throw error;
  }
}

class SavedLibraryRepository {
  // Runs cloud work for one profile one task at a time, so a pull never
  // interleaves with a push. Locks belong to one session.
  withSyncLock(profileId, task) {
    const key = `${AuthManager.getSessionGeneration()}:${String(profileId || "1")}`;
    const run = (syncLocks.get(key) || Promise.resolve()).then(task);
    const tail = run.catch(() => {});
    syncLocks.set(key, tail);
    tail.then(() => { if (syncLocks.get(key) === tail) syncLocks.delete(key); });
    return run;
  }

  hasPendingChanges(profileId = activeProfileId()) {
    try { return SavedLibraryOutbox.list(profileId).length > 0; }
    catch { return false; }
  }

  async flush(profileId = activeProfileId()) {
    if (!AuthManager.isAuthenticated) return false;
    const generation = AuthManager.getSessionGeneration();
    return this.withSyncLock(profileId, async () => {
      if (!AuthManager.isSessionCurrent(generation)) return false;
      const ops = SavedLibraryOutbox.list(profileId);
      if (!ops.length) return true;
      const { SavedLibrarySyncService } = await import("../../core/profile/savedLibrarySyncService.js");
      return SavedLibrarySyncService.push(profileId, ops, {
        onSent: (op) => {
          if (AuthManager.isSessionCurrent(generation)) SavedLibraryOutbox.acknowledge(profileId, op);
        }
      });
    });
  }

  async flushAll() {
    if (!AuthManager.isAuthenticated) return false;
    let ok = true;
    for (const profileId of SavedLibraryOutbox.profileIds()) {
      ok = (await this.flush(profileId)) && ok;
    }
    return ok;
  }

  // Replaces the profile's local list with the cloud list, then re-applies
  // changes still waiting in the outbox so unsent edits are not lost.
  applyRemote(items, profileId = activeProfileId()) {
    const byKey = new Map((items || []).map((item) => [outboxKey(item), item]));
    for (const op of SavedLibraryOutbox.list(profileId)) {
      if (op.kind === "remove") byKey.delete(outboxKey(op.item));
      else byKey.set(outboxKey(op.item), op.item);
    }
    SavedLibraryStore.replaceForProfile(profileId, [...byKey.values()]);
    return SavedLibraryStore.listForProfile(profileId);
  }

  async getAll(limit = 200, profileId = activeProfileId()) {
    return SavedLibraryStore.listForProfile(profileId).slice(0, limit);
  }

  async isSaved(contentId, profileId = activeProfileId()) {
    return Boolean(SavedLibraryStore.findByContentId(contentId, profileId));
  }

  async save(item, profileId = activeProfileId()) {
    if (!item?.contentId) return;
    const normalized = normalizeItem({ ...item, updatedAt: item.updatedAt || Date.now() }, profileId);
    commitChange(profileId, [["save", normalized]], () => SavedLibraryStore.upsert(normalized, profileId));
  }

  async remove(contentId, profileId = activeProfileId()) {
    const items = SavedLibraryStore.listForProfile(profileId, true).filter((item) => item.contentId === contentId);
    if (!items.length) return;
    commitChange(profileId, items.map((item) => ["remove", item]), () => SavedLibraryStore.remove(contentId, profileId));
  }

  async toggle(item, profileId = activeProfileId()) {
    if (!item?.contentId) return false;
    if (SavedLibraryStore.findByContentId(item.contentId, profileId, true)) {
      await this.remove(item.contentId, profileId);
      return false;
    }
    await this.save(item, profileId);
    return true;
  }
}

export const savedLibraryRepository = new SavedLibraryRepository();

registerAccountRuntimeResetHandler(() => {
  flushTimers.forEach((timer) => clearTimeout(timer));
  flushTimers.clear();
  syncLocks.clear();
});

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("online", () => {
    void savedLibraryRepository.flushAll().catch(() => {});
  });
}
