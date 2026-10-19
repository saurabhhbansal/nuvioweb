import { LocalStore } from "../../core/storage/localStore.js";
import { registerAccountRuntimeResetHandler } from "../../core/auth/accountLocalDataReset.js";

const KEY = "savedLibrarySyncState";
const runtimeStates = new Map();

function readEnvelope() {
  const value = LocalStore.get(KEY, null);
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
  const envelope = readEnvelope();
  LocalStore.set(KEY, { ...envelope, profiles: { ...envelope.profiles, [profileId]: state } });
  return { ...state };
}

export const SavedLibrarySyncState = {
  get(profileId) {
    const key = String(profileId || "1");
    return { ...(runtimeStates.get(key) || normalize(readEnvelope().profiles[key])) };
  },

  markPending(profileId) {
    const current = this.get(profileId);
    const revision = current.revision === Number.MAX_SAFE_INTEGER ? 1 : current.revision + 1;
    return write(String(profileId || "1"), { revision, pending: true });
  },

  acknowledge(profileId, revision) {
    const current = this.get(profileId);
    if (current.revision !== revision) return false;
    write(String(profileId || "1"), { revision, pending: false });
    return true;
  }
};

registerAccountRuntimeResetHandler(() => runtimeStates.clear());
