// Honest user-facing copy for audio-track availability (#12 unit 2).
//
// The observation module reports counts and evidence kinds; this module turns
// them into an i18n key plus an English fallback for the audio dialog. It never
// claims that a track is supported or that audio was audible: "available" means
// the engine exposes an addressable track, nothing more.
//
// Input contract: a plain object whose count fields are primitive, non-negative
// safe integers. Anything else is "unknown" — never "no tracks", never an
// action, and never a reason to trust partial evidence.
//
// Pure: no DOM, no i18n import, no logging. The caller resolves the key with t().

export const AUDIO_AVAILABILITY_KEYS = Object.freeze({
  NO_TRACKS: "player_audio_no_tracks",
  UNAVAILABLE: "player_audio_unavailable",
  AMBIGUOUS: "player_audio_ambiguous",
  UNKNOWN: "player_audio_unknown",
  AVAILABLE: "player_audio_available",
  AVAILABLE_WITH_PREDICTED: "player_audio_available_predicted"
});

const FALLBACKS = Object.freeze({
  [AUDIO_AVAILABILITY_KEYS.NO_TRACKS]: "No audio tracks are available for this source.",
  [AUDIO_AVAILABILITY_KEYS.UNAVAILABLE]:
    "This player cannot change audio tracks for the current source.",
  [AUDIO_AVAILABILITY_KEYS.AMBIGUOUS]:
    "This source declares duplicate audio tracks, so switching is disabled to avoid playing the wrong one.",
  [AUDIO_AVAILABILITY_KEYS.UNKNOWN]: "Audio compatibility is unknown for this source.",
  [AUDIO_AVAILABILITY_KEYS.AVAILABLE]: "Select an audio track.",
  [AUDIO_AVAILABILITY_KEYS.AVAILABLE_WITH_PREDICTED]:
    "Select an audio track. Browser support is predicted, not verified."
});

const COUNT_FIELDS = [
  "trackCount",
  "ambiguousCount",
  "availableCount",
  "unavailableCount",
  "unknownCount",
  "predictedCount"
];

// Read a field as its own data property without invoking getters, and accept
// only primitive non-negative safe integers. No coercion, no valueOf().
function readCount(object, name) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (!descriptor) return { ok: true, value: 0, present: false };
    if (!("value" in descriptor)) return { ok: false };
    const value = descriptor.value;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return { ok: false };
    }
    return { ok: true, value, present: true };
  } catch (_) {
    return { ok: false };
  }
}

function unknown() {
  return {
    key: AUDIO_AVAILABILITY_KEYS.UNKNOWN,
    fallback: FALLBACKS[AUDIO_AVAILABILITY_KEYS.UNKNOWN],
    tone: "info"
  };
}

export function describeAudioTrackAvailability(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return unknown();
  const counts = {};
  for (const field of COUNT_FIELDS) {
    const read = readCount(summary, field);
    if (!read.ok) return unknown();
    counts[field] = read.value;
    if (field === "trackCount") counts.trackCountPresent = read.present;
  }
  // Without an explicit track count we do not know; an absent count is not zero.
  if (!counts.trackCountPresent) return unknown();
  const {
    trackCount,
    ambiguousCount,
    availableCount,
    unavailableCount,
    unknownCount,
    predictedCount
  } = counts;

  // Contradictory evidence is unknown, not a guess.
  const classified = availableCount + unavailableCount + unknownCount;
  if (ambiguousCount > trackCount) return unknown();
  if (classified > trackCount) return unknown();
  if (predictedCount > availableCount) return unknown();

  const pick = (key, tone) => ({ key, fallback: FALLBACKS[key], tone });

  if (trackCount === 0) {
    if (ambiguousCount || classified) return unknown();
    return pick(AUDIO_AVAILABILITY_KEYS.NO_TRACKS, "empty");
  }
  // Ambiguity outranks availability: never offer a track we cannot identify.
  if (ambiguousCount > 0) return pick(AUDIO_AVAILABILITY_KEYS.AMBIGUOUS, "warning");
  if (availableCount > 0) {
    return predictedCount > 0
      ? pick(AUDIO_AVAILABILITY_KEYS.AVAILABLE_WITH_PREDICTED, "action")
      : pick(AUDIO_AVAILABILITY_KEYS.AVAILABLE, "action");
  }
  if (unavailableCount > 0) return pick(AUDIO_AVAILABILITY_KEYS.UNAVAILABLE, "warning");
  if (unknownCount > 0) return pick(AUDIO_AVAILABILITY_KEYS.UNKNOWN, "info");
  // Tracks declared but none classified: still unknown.
  return unknown();
}
