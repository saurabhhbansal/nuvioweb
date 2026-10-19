// Normalized, evidence-aware audio-track observation for the browser player.
//
// This module is pure: no DOM, no network, no storage, no logging and no
// persistence. It never claims that a track is "supported" or "verified";
// engine declarations and browser predictions are reported as the evidence
// kinds they are, and missing values stay unknown.
//
// Contract: docs/plans/issues/issue-12.md §5 ("Audio observation contract",
// "Selection contract"). Normalized observations are runtime facts for one
// playback generation, never device certification.

export const AUDIO_TRACK_SELECTABILITY = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown"
});

export const AUDIO_TRACK_DECODE_SUPPORT = Object.freeze({
  PREDICTED: "predicted",
  NOT_REPORTED: "not-reported",
  UNKNOWN: "unknown"
});

export const AUDIO_TRACK_METADATA_EVIDENCE = Object.freeze({
  ENGINE_DECLARED: "engine-declared",
  UNKNOWN: "unknown"
});

export const AUDIO_TRACK_ROLES = Object.freeze({
  MAIN: "main",
  ALTERNATE: "alternate",
  COMMENTARY: "commentary",
  AUDIO_DESCRIPTION: "audio-description",
  UNKNOWN: "unknown"
});

export const AUDIO_SELECTION_REASONS = Object.freeze({
  NONE: "none",
  INVALID_REQUEST: "invalid-request",
  STALE_GENERATION: "stale-generation",
  UNKNOWN_TRACK: "unknown-track",
  AMBIGUOUS_IDENTITY: "ambiguous-identity",
  NOT_SELECTABLE: "not-selectable",
  SUPERSEDED: "superseded",
  ENGINE_REJECTED: "engine-rejected",
  NOT_CONFIRMED: "not-confirmed",
  TIMEOUT: "timeout",
  CANCELLED: "cancelled"
});

const MAX_LABEL = 96;
const MAX_LANGUAGE = 32;
const MAX_KEY = 160;
const DEFAULT_CONFIRM_DEADLINE_MS = 5000;

function boundedText(value, limit) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > limit) return null;
  return Array.from(clean).some((character) => character.charCodeAt(0) < 32) ? null : clean;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Codec strings are evidence, not free text: accept only a codec token or a
// media type with a codecs parameter, the same shape the source descriptor uses.
function audioCodec(value) {
  const clean = boundedText(value, 64);
  if (!clean) return null;
  const token = /^[a-z0-9._+-]+$/i.test(clean);
  const typed = /^(?:audio|video)\/[a-z0-9.+-]+(?:;\s*codecs="[a-z0-9., _-]+")?$/i.test(clean);
  return token || typed ? clean : null;
}

function channelCount(value) {
  if (typeof value === "number")
    return Number.isInteger(value) && value > 0 && value <= 64 ? value : null;
  const clean = boundedText(value, 32);
  if (!clean) return null;
  const match = /^(\d{1,2})(?:\s*\/.*)?$/.exec(clean);
  if (!match) return null;
  const channels = Number(match[1]);
  return Number.isInteger(channels) && channels > 0 && channels <= 64 ? channels : null;
}

// HLS/DASH expose roles through different shapes: HLS CHARACTERISTICS strings
// and DASH role values. Normalize only what is actually declared.
export function normalizeAudioRole({ characteristics = null, roles = null, kind = null } = {}) {
  const tokens = [];
  if (typeof characteristics === "string") {
    tokens.push(
      ...characteristics
        .split(",")
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean)
    );
  }
  if (Array.isArray(roles)) {
    for (const role of roles) {
      const value = typeof role === "string" ? role : role?.value;
      const clean = boundedText(value, 48);
      if (clean) tokens.push(clean.toLowerCase());
    }
  }
  if (tokens.includes("public.accessibility.describes-video")) {
    return AUDIO_TRACK_ROLES.AUDIO_DESCRIPTION;
  }
  if (tokens.some((token) => token === "commentary" || token === "comment")) {
    return AUDIO_TRACK_ROLES.COMMENTARY;
  }
  if (tokens.some((token) => token === "main" || token === "primary")) {
    return AUDIO_TRACK_ROLES.MAIN;
  }
  if (tokens.some((token) => token === "alternate" || token === "dub" || token === "description")) {
    return AUDIO_TRACK_ROLES.ALTERNATE;
  }
  if (boundedText(kind, 32)) {
    return AUDIO_TRACK_ROLES.MAIN;
  }
  return AUDIO_TRACK_ROLES.UNKNOWN;
}

// Read the engine's own raw track object. Wrapper objects do not expose every
// field at the top level, so metadata comes from the raw shape per engine.
function readRawMetadata(engine, raw = {}) {
  const attrs = raw?.attrs && typeof raw.attrs === "object" ? raw.attrs : {};
  if (engine === "hls.js" || engine === "native-hls") {
    return {
      language: boundedText(raw?.lang ?? raw?.language ?? attrs?.LANGUAGE, MAX_LANGUAGE),
      label: boundedText(raw?.name ?? raw?.label ?? attrs?.NAME, MAX_LABEL),
      codec: audioCodec(attrs?.CODECS ?? raw?.codec),
      channels: channelCount(attrs?.CHANNELS ?? raw?.channels),
      role: normalizeAudioRole({ characteristics: attrs?.CHARACTERISTICS })
    };
  }
  if (engine === "dash.js") {
    const labels = Array.isArray(raw?.labels)
      ? raw.labels.map((label) => boundedText(label?.text, MAX_LABEL)).filter(Boolean)
      : [];
    return {
      language: boundedText(raw?.lang ?? raw?.language, MAX_LANGUAGE),
      label: labels[0] || boundedText(raw?.label ?? raw?.name, MAX_LABEL),
      codec: audioCodec(raw?.codec ?? raw?.mimeType),
      channels: channelCount(raw?.channels ?? raw?.audioChannelConfiguration),
      role: normalizeAudioRole({ roles: raw?.roles })
    };
  }
  return {
    language: boundedText(raw?.language ?? raw?.lang, MAX_LANGUAGE),
    label: boundedText(raw?.label ?? raw?.name, MAX_LABEL),
    codec: audioCodec(raw?.codec),
    channels: channelCount(raw?.channels ?? raw?.channelCount),
    role: normalizeAudioRole({ kind: raw?.kind })
  };
}

function selectabilityFor({ engine, ambiguous, hasSetter }) {
  if (hasSetter === false) return AUDIO_TRACK_SELECTABILITY.UNAVAILABLE;
  if (ambiguous) return AUDIO_TRACK_SELECTABILITY.UNAVAILABLE;
  if (!engine) return AUDIO_TRACK_SELECTABILITY.UNKNOWN;
  return AUDIO_TRACK_SELECTABILITY.AVAILABLE;
}

// `tracks` are the player's existing wrapper objects:
//   { id, index, label, language, selected, engine, raw }
// Optional `decodePredictions` maps a track key to a browser prediction
// ("probably" | "maybe" | "not-reported" | "unknown") when a probe exists.
export function normalizeEngineAudioTracks({
  engine = "",
  generation = 0,
  tracks = [],
  selectedIndex = -1,
  decodePredictions = null,
  hasSetter = true
} = {}) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  const engineName = boundedText(String(engine ?? ""), 32) || "unknown";
  const generationValue = positiveInteger(generation) || 1;

  // Detect duplicate engine identities before building keys: ambiguous identity
  // must fail closed rather than selecting the wrong rendition.
  const identityCounts = new Map();
  const identities = list.map((track, index) => {
    // Prefer a stable declared identity: a string engine id (DASH) or a declared
    // name. A numeric engine index changes when the manifest reorders, so it is
    // only a last resort before the adapter index.
    const stableId =
      typeof track?.raw?.id === "string" && track.raw.id.trim()
        ? track.raw.id
        : track?.raw?.name || (typeof track?.id === "string" ? track.id : null);
    const engineTrackId =
      boundedText(String(stableId ?? "").replace(/[^A-Za-z0-9._:-]+/g, "_"), 96) ||
      `index-${index}`;
    const identity = `${engineName}:${engineTrackId}`;
    identityCounts.set(identity, (identityCounts.get(identity) || 0) + 1);
    return { engineTrackId, identity };
  });

  const normalized = list.map((track, index) => {
    const meta = readRawMetadata(engineName, track?.raw || {});
    const { engineTrackId, identity } = identities[index];
    const ambiguous = (identityCounts.get(identity) || 0) > 1;
    const key = boundedText(`${identity}`, MAX_KEY) || `index-${index}`;
    const prediction = decodePredictions?.[key] ?? decodePredictions?.[engineTrackId] ?? null;
    const decodeSupport =
      prediction === "probably" || prediction === "maybe"
        ? AUDIO_TRACK_DECODE_SUPPORT.PREDICTED
        : prediction === "not-reported"
          ? AUDIO_TRACK_DECODE_SUPPORT.NOT_REPORTED
          : AUDIO_TRACK_DECODE_SUPPORT.UNKNOWN;
    const declared = Boolean(meta.language || meta.label || meta.codec || meta.channels);
    const rawIndex = Number(track?.index);
    const indexValue = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : index;
    return {
      generation: generationValue,
      key,
      engine: engineName,
      engineTrackId,
      index: indexValue,
      language: meta.language,
      role: meta.role,
      label: meta.label || boundedText(track?.label, MAX_LABEL),
      codec: meta.codec,
      channels: meta.channels,
      selected:
        Number.isInteger(selectedIndex) && selectedIndex >= 0
          ? indexValue === selectedIndex
          : Boolean(track?.selected),
      selectability: selectabilityFor({ engine: engineName, ambiguous, hasSetter }),
      decodeSupport,
      ambiguous,
      metadataEvidence: declared
        ? AUDIO_TRACK_METADATA_EVIDENCE.ENGINE_DECLARED
        : AUDIO_TRACK_METADATA_EVIDENCE.UNKNOWN
    };
  });

  return {
    generation: generationValue,
    engine: engineName,
    tracks: normalized,
    selectedKey: normalized.find((track) => track.selected)?.key ?? null,
    ...summarizeAudioTracks(normalized)
  };
}

export function summarizeAudioTracks(tracks = []) {
  const list = Array.isArray(tracks) ? tracks : [];
  return {
    trackCount: list.length,
    availableCount: list.filter(
      (track) => track.selectability === AUDIO_TRACK_SELECTABILITY.AVAILABLE
    ).length,
    unavailableCount: list.filter(
      (track) => track.selectability === AUDIO_TRACK_SELECTABILITY.UNAVAILABLE
    ).length,
    unknownCount: list.filter((track) => track.selectability === AUDIO_TRACK_SELECTABILITY.UNKNOWN)
      .length,
    ambiguousCount: list.filter((track) => track.ambiguous === true).length,
    predictedCount: list.filter(
      (track) => track.decodeSupport === AUDIO_TRACK_DECODE_SUPPORT.PREDICTED
    ).length
  };
}

// Reject non-integer, stale, unknown, ambiguous and non-selectable requests.
// A newer request is allowed and explicitly supersedes the pending one.
export function resolveAudioSelectionRequest({
  generation = 0,
  trackKey = "",
  tracks = [],
  currentGeneration = 0,
  pendingTrackKey = null
} = {}) {
  const requestedGeneration = Number(generation);
  if (!Number.isInteger(requestedGeneration) || requestedGeneration <= 0) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.INVALID_REQUEST, track: null };
  }
  if (Number(currentGeneration) !== requestedGeneration) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.STALE_GENERATION, track: null };
  }
  if (typeof trackKey !== "string" || !trackKey.trim()) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.INVALID_REQUEST, track: null };
  }
  const key = boundedText(trackKey, MAX_KEY);
  if (!key) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.INVALID_REQUEST, track: null };
  }
  const list = Array.isArray(tracks) ? tracks : [];
  const matches = list.filter((track) => track?.key === key);
  if (!matches.length) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.UNKNOWN_TRACK, track: null };
  }
  if (matches.length > 1 || matches[0].ambiguous === true) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.AMBIGUOUS_IDENTITY, track: matches[0] };
  }
  const track = matches[0];
  if (track.selectability !== AUDIO_TRACK_SELECTABILITY.AVAILABLE) {
    return { ok: false, reason: AUDIO_SELECTION_REASONS.NOT_SELECTABLE, track };
  }
  return {
    ok: true,
    reason: AUDIO_SELECTION_REASONS.NONE,
    track,
    supersedes: pendingTrackKey && pendingTrackKey !== key ? pendingTrackKey : null
  };
}

// One pending selection at a time. A newer request cancels the earlier one, and
// the deadline resolves as timed-out instead of leaving a stuck pending state.
export function createAudioSelectionTracker({
  deadlineMs = DEFAULT_CONFIRM_DEADLINE_MS,
  now = () => Date.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle)
} = {}) {
  const deadline =
    Number.isFinite(Number(deadlineMs)) && Number(deadlineMs) > 0
      ? Number(deadlineMs)
      : DEFAULT_CONFIRM_DEADLINE_MS;
  let pending = null;
  let counter = 0;

  const settle = (entry, status, reason) => {
    if (!entry || entry.settled) return null;
    entry.settled = true;
    if (entry.timer !== null) clearTimer(entry.timer);
    if (pending === entry) pending = null;
    const result = {
      status,
      generation: entry.generation,
      trackKey: entry.trackKey,
      previousTrackKey: entry.previousTrackKey,
      reason
    };
    entry.resolve(result);
    return result;
  };

  const cancelPending = (reason) => {
    if (!pending) return false;
    settle(pending, "cancelled", reason);
    return true;
  };

  return {
    begin({ generation, trackKey, previousTrackKey = null } = {}) {
      const superseded = pending ? pending.trackKey : null;
      cancelPending(AUDIO_SELECTION_REASONS.SUPERSEDED);
      counter += 1;
      const entry = {
        token: counter,
        generation: Number(generation),
        trackKey: String(trackKey ?? ""),
        previousTrackKey: previousTrackKey ? String(previousTrackKey) : null,
        startedAt: now(),
        settled: false,
        timer: null,
        resolve: null
      };
      const promise = new Promise((resolve) => {
        entry.resolve = resolve;
      });
      entry.timer = setTimer(() => {
        settle(entry, "timed-out", AUDIO_SELECTION_REASONS.TIMEOUT);
      }, deadline);
      if (entry.timer && typeof entry.timer.unref === "function") entry.timer.unref();
      pending = entry;
      return {
        token: entry.token,
        generation: entry.generation,
        trackKey: entry.trackKey,
        superseded,
        promise,
        confirm: () => settle(entry, "confirmed", AUDIO_SELECTION_REASONS.NONE),
        reject: (reason = AUDIO_SELECTION_REASONS.ENGINE_REJECTED) =>
          settle(entry, "rejected", reason),
        cancel: (reason = AUDIO_SELECTION_REASONS.CANCELLED) => settle(entry, "cancelled", reason)
      };
    },
    invalidate(reason = AUDIO_SELECTION_REASONS.STALE_GENERATION) {
      return cancelPending(reason);
    },
    getPending() {
      return pending ? { generation: pending.generation, trackKey: pending.trackKey } : null;
    }
  };
}
