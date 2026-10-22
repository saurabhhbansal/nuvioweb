// Explains, in plain words, why the audio picker has nothing (or only one
// track) to offer. Switching itself lives in PlayerController.

const ADAPTIVE_ENGINES = new Set(["hls.js", "dash.js", "native-hls", "native-dash"]);

export const AUDIO_AVAILABILITY_MESSAGES = {
  loading: "Loading audio tracks...",
  browserCannotList:
    "This browser can't list or switch the audio tracks inside a single video file, so it plays the file's default track. To hear another language, use an external player or pick a source in that language.",
  adaptiveNone: "This stream has no separate audio tracks. It plays its built-in audio.",
  nativeNone: "No audio tracks available.",
  single: "This source has only one audio track."
};

/**
 * @param {object} input
 * @param {string} [input.playbackEngine] "hls.js", "dash.js", "native-hls", "native-dash", "native-file" or "none".
 * @param {boolean} [input.adaptiveSource] The source URL or type is an HLS/DASH manifest.
 * @param {boolean} [input.nativeTrackListAvailable] The video element exposes `audioTracks`.
 * @param {number} [input.trackCount] Tracks the picker can list.
 * @param {boolean} [input.loading] An adaptive manifest is still being read.
 * @returns {{ kind: string, message: string }}
 */
export function describeAudioTrackAvailability({
  playbackEngine = "none",
  nativeTrackListAvailable = false,
  adaptiveSource = false,
  trackCount = 0,
  loading = false
} = {}) {
  const count = Math.max(0, Number(trackCount) || 0);
  const adaptive = Boolean(adaptiveSource) || ADAPTIVE_ENGINES.has(String(playbackEngine || ""));
  if (count >= 2) {
    return { kind: "switchable", message: "" };
  }
  if (count === 1) {
    return { kind: "single", message: AUDIO_AVAILABILITY_MESSAGES.single };
  }
  if (loading) {
    return { kind: "loading", message: AUDIO_AVAILABILITY_MESSAGES.loading };
  }
  if (adaptive) {
    return { kind: "adaptive-none", message: AUDIO_AVAILABILITY_MESSAGES.adaptiveNone };
  }
  if (!nativeTrackListAvailable) {
    return { kind: "browser-cannot-list", message: AUDIO_AVAILABILITY_MESSAGES.browserCannotList };
  }
  return { kind: "none", message: AUDIO_AVAILABILITY_MESSAGES.nativeNone };
}
