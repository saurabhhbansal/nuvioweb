import { LocalStore } from "../../core/storage/localStore.js";
import { libraryStorageError } from "./savedLibraryStore.js";

// Library changes not yet confirmed by the cloud, per profile. One entry per
// item: a later save or remove of the same item replaces the earlier one.
// The envelope is profile-scoped, so sign-out clears it with other account data.
const KEY = "savedLibrarySyncOutbox";

export function outboxKey(item = {}) {
  return `${String(item.contentType || "movie").trim().toLowerCase()}::${String(item.contentId || "").trim()}`;
}

// Strict: an unreadable outbox throws rather than reading as empty, so a
// later write can never replace queued changes with an empty envelope.
function read() {
  let value;
  try { value = LocalStore.get(KEY, null, { strict: true }); }
  catch { throw libraryStorageError(); }
  return value?.__profileScoped === true && value.profiles && typeof value.profiles === "object" && !Array.isArray(value.profiles)
    ? value
    : { __profileScoped: true, version: 1, profiles: {} };
}

function writeProfile(profileId, entries) {
  const envelope = read();
  const profiles = { ...envelope.profiles };
  if (Object.keys(entries).length) profiles[profileId] = entries;
  else delete profiles[profileId];
  try {
    LocalStore.set(KEY, { ...envelope, profiles }, { strict: true });
  } catch {
    throw libraryStorageError();
  }
}

let sequence = 0;

export const SavedLibraryOutbox = {
  list(profileId) {
    return Object.values(read().profiles[String(profileId || "1")] || {});
  },

  profileIds() {
    return Object.keys(read().profiles);
  },

  // Returns what revert() needs to undo this put.
  put(profileId, kind, item) {
    const pid = String(profileId || "1");
    const entries = { ...(read().profiles[pid] || {}) };
    const key = outboxKey(item);
    const previous = entries[key] || null;
    const op = { id: `${Date.now()}-${++sequence}`, kind, item };
    entries[key] = op;
    writeProfile(pid, entries);
    return { op, previous };
  },

  revert(profileId, { op, previous }) {
    const pid = String(profileId || "1");
    const entries = { ...(read().profiles[pid] || {}) };
    const key = outboxKey(op.item);
    if (entries[key]?.id !== op.id) return;
    if (previous) entries[key] = previous;
    else delete entries[key];
    writeProfile(pid, entries);
  },

  // Removes an operation once the cloud confirmed it, unless a newer change
  // to the same item replaced it in the meantime.
  acknowledge(profileId, op) {
    const pid = String(profileId || "1");
    const entries = { ...(read().profiles[pid] || {}) };
    const key = outboxKey(op.item);
    if (entries[key]?.id !== op.id) return;
    delete entries[key];
    writeProfile(pid, entries);
  }
};
