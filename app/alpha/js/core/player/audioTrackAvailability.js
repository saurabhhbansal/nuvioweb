// Explains, in plain words, why the audio picker has nothing (or only one
// track) to offer, and whether to point the viewer at an external player.
// Switching itself lives in PlayerController.
//
// What the browser can switch:
//   HLS via hls.js, DASH via dash.js     every browser with Media Source Extensions
//   native HLS / single files            Safari (HTMLMediaElement.audioTracks)
//   single MP4/MKV/WebM files            Chrome, Edge, Firefox via the remux path
//                                        (core/player/remux), only when the host
//                                        allows CORS range reads; otherwise they
//                                        play the file's first track only.

const ADAPTIVE_ENGINES = new Set(["hls.js", "dash.js", "native-hls", "native-dash"]);

export const AUDIO_AVAILABILITY_MESSAGES = {
  loading: "Loading audio tracks...",
  browserCannotList:
    "This browser can't list or switch the audio tracks inside a single video file, so it plays the file's default track. To hear another language, use an external player or pick a source in that language.",
  adaptiveNone: "This stream has no separate audio tracks. It plays its built-in audio.",
  nativeNone: "No audio tracks available.",
  single: "This source has only one audio track.",
  unsupportedCodec:
    "This browser can't play any of this source's audio tracks (for example AC-3, E-AC-3 or DTS). Use an external player or pick another source."
};

/**
 * @param {object} input
 * @param {string} [input.playbackEngine] "hls.js", "dash.js", "native-hls", "native-dash", "native-file" or "none".
 * @param {boolean} [input.adaptiveSource] The source URL or type is an HLS/DASH manifest.
 * @param {boolean} [input.nativeTrackListAvailable] The video element exposes `audioTracks`.
 * @param {number} [input.trackCount] Tracks the picker can list.
 * @param {number} [input.supportedTrackCount] Listed tracks whose codec this browser can decode.
 *   Defaults to `trackCount`.
 * @param {boolean} [input.singleTrackKnown] The file was read and has one audio track.
 * @param {boolean} [input.loading] An adaptive manifest or a file's track list is still being read.
 * @returns {{ kind: string, message: string, offerExternalPlayer: boolean }}
 */
export function describeAudioTrackAvailability({
  playbackEngine = "none",
  nativeTrackListAvailable = false,
  adaptiveSource = false,
  trackCount = 0,
  supportedTrackCount = undefined,
  singleTrackKnown = false,
  loading = false
} = {}) {
  const count = Math.max(0, Number(trackCount) || 0);
  const supportedInput = Number(supportedTrackCount);
  const supported = Number.isFinite(supportedInput)
    ? Math.min(count, Math.max(0, supportedInput))
    : count;
  const adaptive = Boolean(adaptiveSource) || ADAPTIVE_ENGINES.has(String(playbackEngine || ""));
  const result = (kind, message, offerExternalPlayer = false) => ({
    kind,
    message,
    offerExternalPlayer
  });
  if (count >= 1 && supported === 0) {
    return result("unsupported-codec", AUDIO_AVAILABILITY_MESSAGES.unsupportedCodec, true);
  }
  if (count >= 2) {
    return result("switchable", "");
  }
  if (count === 1 || (count === 0 && singleTrackKnown && !loading)) {
    return result("single", AUDIO_AVAILABILITY_MESSAGES.single);
  }
  if (loading) {
    return result("loading", AUDIO_AVAILABILITY_MESSAGES.loading);
  }
  if (adaptive) {
    return result("adaptive-none", AUDIO_AVAILABILITY_MESSAGES.adaptiveNone);
  }
  if (!nativeTrackListAvailable) {
    return result("browser-cannot-list", AUDIO_AVAILABILITY_MESSAGES.browserCannotList, true);
  }
  return result("none", AUDIO_AVAILABILITY_MESSAGES.nativeNone);
}
