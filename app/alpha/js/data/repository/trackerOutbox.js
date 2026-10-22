// Trakt and Simkl writes that could not be delivered, kept until they can be.
//
// A tracker write used to be sent once and forgotten. Watching a download with
// no network, or losing the network at the end of an episode, meant the finish
// or the position never reached the tracker at all. Writes that fail because
// the network or the tracker is down are now saved here, per profile, and sent
// again when the network returns, when the app starts and after the next write
// that gets through. A write the tracker refuses outright (bad id, revoked
// sign-in) is dropped: sending it again would only be refused again.
//
// A saved write only ever goes out while its own profile is the active one,
// because the senders sign in with the active profile's tracker account.
//
// What a retry cannot fix: Trakt has no way to set a resume position at a past
// time, so a position recorded offline arrives stamped with the time it was
// sent. A finish keeps its real time, because history writes carry
// `watched_at`.

import { LocalStore } from "../../core/storage/localStore.js";
import { ProfileManager } from "../../core/profile/profileManager.js";

const STORE_KEY = "trackerOutbox";
const MAX_ENTRIES = 200;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const FIRST_RETRY_MS = 60 * 1000;
const LONGEST_RETRY_MS = 6 * 60 * 60 * 1000;

const senders = new Map();
const flushes = new Map();
let installed = false;

function senderKey(provider, kind) {
  return `${provider}:${kind}`;
}

function activeProfile() {
  return String(ProfileManager.getActiveProfileId() || "1");
}

/** The key one title's finish is saved under, shared by every path that saves one. */
export function trackerHistoryKey(item = {}) {
  return `${String(item.contentId || "").toLowerCase()}:${item.season ?? ""}:${item.episode ?? ""}`;
}

/**
 * Whether a failed write is worth sending again: the network was down, the
 * request never got an answer, or the tracker said to come back later. An
 * answer from the tracker is believed even when the device thinks it is
 * offline.
 */
export function isRetryableTrackerFailure(error, runtime = globalThis) {
  const status = Number(error?.status || 0);
  if (status) return status === 408 || status === 429 || status >= 500;
  if (error?.retryable === true) return true;
  if (runtime?.navigator?.onLine === false) return true;
  // fetch rejects with a TypeError when there is no network; a timeout aborts.
  return error instanceof TypeError || error?.name === "AbortError";
}

/** How a provider delivers one kind of saved write. */
export function registerTrackerSender(provider, kind, send) {
  senders.set(senderKey(provider, kind), send);
}

function readAll() {
  const stored = LocalStore.get(STORE_KEY, []);
  return Array.isArray(stored) ? stored.filter((entry) => entry && typeof entry === "object") : [];
}

// Over the cap, positions go first: a finish is the record worth keeping.
function trim(entries) {
  const excess = entries.length - MAX_ENTRIES;
  if (excess <= 0) return entries;
  const doomed = new Set(
    [...entries]
      .sort((left, right) =>
        (left.kind === "history") - (right.kind === "history") || Number(left.queuedAt || 0) - Number(right.queuedAt || 0)
      )
      .slice(0, excess)
  );
  return entries.filter((entry) => !doomed.has(entry));
}

function writeAll(entries) {
  if (entries.length) LocalStore.set(STORE_KEY, trim(entries));
  else LocalStore.remove(STORE_KEY);
}

function sameWrite(left, right) {
  return (
    left.provider === right.provider &&
    left.kind === right.kind &&
    left.key === right.key &&
    left.profileId === right.profileId
  );
}

export function readTrackerOutbox() {
  return readAll();
}

/**
 * Save a write for later. One title has one saved finish and one saved
 * position per provider and profile: a newer one replaces the older, because
 * only the latest is still true.
 */
export function enqueueTrackerWrite({ provider, kind, key, payload, profileId, now = Date.now() } = {}) {
  if (!provider || !kind || !key) return false;
  const entry = { provider, kind, key, payload, profileId: String(profileId ?? ""), queuedAt: now, attempts: 0, nextAttemptAt: 0 };
  writeAll([...readAll().filter((current) => !sameWrite(current, entry)), entry]);
  return true;
}

/**
 * Forget a saved write that a newer action has made untrue: a position sent
 * now must not be followed by the older one, and a title marked unwatched must
 * not have its saved finish sent afterwards.
 */
export function dropTrackerWrite({ provider, kind, key, profileId } = {}) {
  const target = { provider, kind, key, profileId: String(profileId ?? "") };
  const entries = readAll();
  const kept = entries.filter((entry) => !sameWrite(entry, target));
  if (kept.length !== entries.length) writeAll(kept);
}

/**
 * Send now, or save it when the failure is one a retry can fix. Resolves true
 * when delivered, false when saved; rejects with the error when the tracker
 * refused it.
 */
export async function deliverOrQueue({ provider, kind, key, payload, profileId, send, runtime = globalThis }) {
  try {
    await send(payload);
  } catch (error) {
    if (!isRetryableTrackerFailure(error, runtime)) throw error;
    enqueueTrackerWrite({ provider, kind, key, payload, profileId });
    return false;
  }
  dropTrackerWrite({ provider, kind, key, profileId });
  // The network is evidently back, so anything still waiting can go too.
  void flushTrackerOutbox({ profileId });
  return true;
}

function retryDelay(attempts) {
  return Math.min(LONGEST_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

async function flushOnce({ profileId, now, runtime, force }) {
  const profile = String(profileId ?? "");
  const stalled = new Set();
  for (const snapshot of readAll()) {
    if (snapshot.profileId !== profile) continue;
    // Read again: a newer write may have replaced or removed this one while an
    // earlier send in this loop was waiting on the network.
    const entry = readAll().find((current) => sameWrite(current, snapshot) && current.queuedAt === snapshot.queuedAt);
    if (!entry) continue;
    if (now - Number(entry.queuedAt || 0) > MAX_AGE_MS || Number(entry.attempts || 0) >= MAX_ATTEMPTS) {
      dropTrackerWrite(entry);
      continue;
    }
    if (!force && Number(entry.nextAttemptAt || 0) > now) continue;
    // One provider still unreachable says nothing about the other, but it does
    // say the rest of its own queue will fail the same way.
    if (stalled.has(entry.provider)) continue;
    const send = senders.get(senderKey(entry.provider, entry.kind));
    if (!send) continue;
    // The senders use the active profile's tracker account.
    if (activeProfile() !== profile) return;
    try {
      await send(entry.payload);
      writeAll(readAll().filter((current) => !(sameWrite(current, entry) && current.queuedAt === entry.queuedAt)));
    } catch (error) {
      if (!isRetryableTrackerFailure(error, runtime)) {
        writeAll(readAll().filter((current) => !(sameWrite(current, entry) && current.queuedAt === entry.queuedAt)));
        continue;
      }
      stalled.add(entry.provider);
      const attempts = Number(entry.attempts || 0) + 1;
      writeAll(
        readAll().map((current) =>
          sameWrite(current, entry) && current.queuedAt === entry.queuedAt
            ? { ...current, attempts, nextAttemptAt: now + retryDelay(attempts) }
            : current
        )
      );
    }
  }
}

/**
 * Send what is saved for this profile, if it is the active one. One flush per
 * profile at a time. A failed write waits before it is tried again, longer
 * each time, unless the network has just come back (`force`).
 */
export function flushTrackerOutbox({ profileId, now = Date.now(), runtime = globalThis, force = false } = {}) {
  const profile = String(profileId ?? activeProfile());
  if (runtime?.navigator?.onLine === false) return Promise.resolve();
  if (flushes.has(profile)) return flushes.get(profile);
  const flushing = flushOnce({ profileId: profile, now, runtime, force })
    .catch((error) => console.warn("[TrackerOutbox] flush failed", error))
    .finally(() => flushes.delete(profile));
  flushes.set(profile, flushing);
  return flushing;
}

/** Flush whenever the network comes back. Safe to call more than once. */
export function installTrackerOutboxFlush({ runtime = globalThis } = {}) {
  if (installed || typeof runtime?.addEventListener !== "function") return;
  installed = true;
  runtime.addEventListener("online", () => void flushTrackerOutbox({ runtime, force: true }));
}

/** Sign-out and profile wipes. */
export function clearTrackerOutbox(profileId = null) {
  if (profileId == null) {
    LocalStore.remove(STORE_KEY);
    return;
  }
  writeAll(readAll().filter((entry) => entry.profileId !== String(profileId)));
}
