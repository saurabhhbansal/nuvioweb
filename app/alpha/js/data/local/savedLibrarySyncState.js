import { readLibraryStorage, writeLibraryStorage } from "./savedLibraryStorage.js";
import { registerAccountRuntimeResetHandler } from "../../core/auth/accountLocalDataReset.js";

const KEY = "savedLibrarySyncState";
const runtimeStates = new Map();

function readEnvelope() {
  const value = readLibraryStorage(KEY, null);
  return value?.__profileScoped === true && value.version === 1 &&
    value.profiles && typeof value.profiles === "object" && !Array.isArray(value.profiles)
    ? value
    : { __profileScoped: true, version: 1, profiles: {} };
}

function normalize(value) {
  return {
    revision: Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    pending: value?.pending === true
  };
}

function write(profileId, state) {
  // Retain the current-page guard even if LocalStore cannot persist metadata.
  runtimeStates.set(profileId, state);
  try {
    const envelope = readEnvelope();
    writeLibraryStorage(KEY, { ...envelope, profiles: { ...envelope.profiles, [profileId]: state } });
  } catch {
    // A failed clean write must keep the pending guard as well as persisted intent.
    runtimeStates.set(profileId, { ...state, pending: true });
  }
  return { ...state };
}

export const SavedLibrarySyncState = {
  has(profileId) {
    const key = String(profileId || "1");
    try { return runtimeStates.has(key) || Object.prototype.hasOwnProperty.call(readEnvelope().profiles, key); }
    catch { return true; } // Unknown storage must never establish a clean baseline.
  },

  get(profileId) {
    const key = String(profileId || "1");
    try { return { ...(runtimeStates.get(key) || normalize(readEnvelope().profiles[key])) }; }
    catch {
      const pending = { revision: 0, pending: true };
      runtimeStates.set(key, pending);
      return { ...pending };
    }
  },

  markPending(profileId) {
    const current = this.get(profileId);
    const revision = current.revision === Number.MAX_SAFE_INTEGER ? 1 : current.revision + 1;
    return write(String(profileId || "1"), { revision, pending: true });
  },

  isPersisted(profileId, state = this.get(profileId)) {
    try {
      const stored = readEnvelope().profiles[String(profileId || "1")];
      return stored?.revision === state.revision && stored?.pending === state.pending;
    } catch { return false; }
  },

  acknowledge(profileId, revision) {
    const current = this.get(profileId);
    if (current.revision !== revision) return false;
    write(String(profileId || "1"), { revision, pending: false });
    return !this.get(profileId).pending && this.isPersisted(profileId);
  }
};

registerAccountRuntimeResetHandler(() => runtimeStates.clear());
