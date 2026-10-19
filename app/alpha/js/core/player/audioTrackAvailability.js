// Honest user-facing copy for audio-track availability (#12 unit 2).
//
// The observation module reports counts and evidence kinds; this module turns
// them into an i18n key plus an English fallback for the audio dialog. It never
// claims that a track is supported or that audio was audible: "available" means
// the engine exposes an addressable track, nothing more.
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

function count(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

export function describeAudioTrackAvailability(summary) {
  // A missing or malformed summary means "we do not know", not "there are none".
  if (!summary || typeof summary !== "object") {
    return {
      key: AUDIO_AVAILABILITY_KEYS.UNKNOWN,
      fallback: FALLBACKS[AUDIO_AVAILABILITY_KEYS.UNKNOWN],
      tone: "info"
    };
  }
  const source = summary;
  if (
    source.trackCount !== undefined &&
    !(Number.isInteger(source.trackCount) && source.trackCount >= 0)
  ) {
    return {
      key: AUDIO_AVAILABILITY_KEYS.UNKNOWN,
      fallback: FALLBACKS[AUDIO_AVAILABILITY_KEYS.UNKNOWN],
      tone: "info"
    };
  }
  const trackCount = count(source.trackCount);
  const ambiguous = count(source.ambiguousCount);
  const available = count(source.availableCount);
  const unavailable = count(source.unavailableCount);
  const unknown = count(source.unknownCount);
  const predicted = count(source.predictedCount);

  const pick = (key) => ({ key, fallback: FALLBACKS[key] });

  if (trackCount === 0) return { ...pick(AUDIO_AVAILABILITY_KEYS.NO_TRACKS), tone: "empty" };
  if (ambiguous > 0) return { ...pick(AUDIO_AVAILABILITY_KEYS.AMBIGUOUS), tone: "warning" };
  if (available > 0) {
    return {
      ...pick(
        predicted > 0
          ? AUDIO_AVAILABILITY_KEYS.AVAILABLE_WITH_PREDICTED
          : AUDIO_AVAILABILITY_KEYS.AVAILABLE
      ),
      tone: "action"
    };
  }
  if (unavailable > 0) return { ...pick(AUDIO_AVAILABILITY_KEYS.UNAVAILABLE), tone: "warning" };
  if (unknown > 0) return { ...pick(AUDIO_AVAILABILITY_KEYS.UNKNOWN), tone: "info" };
  // Defensive: a summary with tracks but no classified selectability.
  return { ...pick(AUDIO_AVAILABILITY_KEYS.UNKNOWN), tone: "info" };
}
