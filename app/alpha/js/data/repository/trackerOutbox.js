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
// What a retry cannot fix: Trakt has no way to set a resume position at a past
// time, so a position recorded offline arrives stamped with the time it was
// sent. A finish keeps its real time, because history writes carry
// `watched_at`.

import { LocalStore } from "../../core/storage/localStore.js";

const STORE_KEY = "trackerOutbox";
const MAX_ENTRIES = 200;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const senders = new Map();
let flushing = null;
let installed = false;

function senderKey(provider, kind) {
  return `${provider}:${kind}`;
}

/**
 * Whether a failed write is worth sending again: the network was down, the
 * request never got an answer, or the tracker said to come back later.
 */
export function isRetryableTrackerFailure(error, runtime = globalThis) {
  if (runtime?.navigator?.onLine === false) return true;
  const status = Number(error?.status || 0);
  if (status) return status === 408 || status === 429 || status >= 500;
  // fetch rejects with a TypeError when there is no network; a timeout aborts.
  return error instanceof TypeError || error?.name === "AbortError" || error?.retryable === true;
}

/** How a provider delivers one kind of saved write. */
export function registerTrackerSender(provider, kind, send) {
  senders.set(senderKey(provider, kind), send);
}

function readAll() {
  const stored = LocalStore.get(STORE_KEY, []);
  return Array.isArray(stored) ? stored.filter((entry) => entry && typeof entry === "object") : [];
}

function writeAll(entries) {
  if (entries.length) LocalStore.set(STORE_KEY, entries.slice(-MAX_ENTRIES));
  else LocalStore.remove(STORE_KEY);
}

export function readTrackerOutbox() {
  return readAll();
}

/**
 * Save a write for later. One title has one saved finish and one saved
 * position per provider: a newer one replaces the older, because only the
 * latest is still true.
 */
export function enqueueTrackerWrite({ provider, kind, key, payload, profileId, now = Date.now() } = {}) {
  if (!provider || !kind || !key) return false;
  const profile = String(profileId ?? "");
  const entries = readAll().filter(
    (entry) =>
      !(entry.provider === provider && entry.kind === kind && entry.key === key && entry.profileId === profile)
  );
  entries.push({ provider, kind, key, payload, profileId: profile, queuedAt: now, attempts: 0 });
  writeAll(entries);
  return true;
}

/**
 * Forget a saved write that a newer one has made untrue. A position sent now
 * must not be followed by the older one saved earlier, or the older one wins.
 */
export function dropTrackerWrite({ provider, kind, key, profileId } = {}) {
  const profile = String(profileId ?? "");
  const entries = readAll();
  const kept = entries.filter(
    (entry) => !(entry.provider === provider && entry.kind === kind && entry.key === key && entry.profileId === profile)
  );
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

async function flushOnce({ profileId, now, runtime }) {
  const profile = String(profileId ?? "");
  const stalled = new Set();
  for (const entry of readAll()) {
    if (entry.profileId !== profile) continue;
    const stillQueued = () =>
      readAll().some((current) => current.provider === entry.provider && current.kind === entry.kind && current.key === entry.key && current.profileId === profile && current.queuedAt === entry.queuedAt);
    const drop = () =>
      writeAll(readAll().filter((current) => !(current.provider === entry.provider && current.kind === entry.kind && current.key === entry.key && current.profileId === profile && current.queuedAt === entry.queuedAt)));
    if (now - Number(entry.queuedAt || 0) > MAX_AGE_MS || Number(entry.attempts || 0) >= MAX_ATTEMPTS) {
      drop();
      continue;
    }
    // One provider still unreachable says nothing about the other, but it does
    // say the rest of its own queue will fail the same way.
    if (stalled.has(entry.provider)) continue;
    const send = senders.get(senderKey(entry.provider, entry.kind));
    if (!send) continue;
    try {
      await send(entry.payload);
      if (stillQueued()) drop();
    } catch (error) {
      if (!isRetryableTrackerFailure(error, runtime)) {
        drop();
        continue;
      }
      stalled.add(entry.provider);
      writeAll(
        readAll().map((current) =>
          current.provider === entry.provider && current.kind === entry.kind && current.key === entry.key && current.profileId === profile && current.queuedAt === entry.queuedAt
            ? { ...current, attempts: Number(current.attempts || 0) + 1 }
            : current
        )
      );
    }
  }
}

/** Send what is saved for this profile. One flush at a time. */
export function flushTrackerOutbox({ profileId, now = Date.now(), runtime = globalThis } = {}) {
  if (runtime?.navigator?.onLine === false) return Promise.resolve();
  if (flushing) return flushing;
  flushing = flushOnce({ profileId, now, runtime })
    .catch((error) => console.warn("[TrackerOutbox] flush failed", error))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

/** Flush whenever the network comes back. Safe to call more than once. */
export function installTrackerOutboxFlush({ getProfileId, runtime = globalThis } = {}) {
  if (installed || typeof runtime?.addEventListener !== "function") return;
  installed = true;
  runtime.addEventListener("online", () => void flushTrackerOutbox({ profileId: getProfileId?.(), runtime }));
}

/** Sign-out and profile wipes. */
export function clearTrackerOutbox(profileId = null) {
  if (profileId == null) {
    LocalStore.remove(STORE_KEY);
    return;
  }
  writeAll(readAll().filter((entry) => entry.profileId !== String(profileId)));
}
