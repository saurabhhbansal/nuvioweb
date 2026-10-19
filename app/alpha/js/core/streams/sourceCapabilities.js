// Provider declarations and browser predictions are evidence of different kinds.
// This module never fetches media, changes source choice or authorizes processing.
function text(value, limit = 96) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean &&
    clean.length <= limit &&
    !/[<>]/.test(clean) &&
    !Array.from(clean).some((character) => character.charCodeAt(0) < 32)
    ? clean
    : null;
}

function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function token(value, limit = 96) {
  const clean = text(value, limit);
  return clean && /^[a-z0-9._+-]+$/i.test(clean) ? clean : null;
}

function contentType(value) {
  const clean = text(value, 200);
  return clean &&
    /^(?:video|audio|application)\/[a-z0-9.+-]+(?:;\s*codecs="[a-z0-9., _-]+")?$/i.test(clean)
    ? clean.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    : null;
}

// Provider stream objects mix real media types with short aliases ("mkv",
// "hls"). Only a validated media type is evidence; an alias must not shadow a
// declared MIME type just because it appears first in the object.
export function selectSourceContentType(values = []) {
  const candidates = Array.isArray(values) ? values : [values];
  for (const value of candidates) {
    const clean = contentType(value);
    if (clean) return clean;
  }
  return "";
}

function tracks(value, map) {
  return Array.isArray(value) ? value.slice(0, 32).map(map) : [];
}

function transportHint(url, mimeType) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "magnet:") return "torrent";
    if (!["http:", "https:", "blob:"].includes(parsed.protocol)) return "unknown";
    if (/mpegurl/i.test(mimeType || "") || /\.m3u8$/i.test(parsed.pathname)) return "hls";
    if (/dash\+xml/i.test(mimeType || "") || /\.mpd$/i.test(parsed.pathname)) return "dash";
    return "direct";
  } catch (_) {
    return "unknown";
  }
}

export function describeSource(stream = {}) {
  stream = stream && typeof stream === "object" ? stream : {};
  const mimeType = contentType(stream.mimeType);
  const video = stream.video || {};
  const headers = stream.behaviorHints?.proxyHeaders?.request;
  const headerCount =
    headers && typeof headers === "object" && !Array.isArray(headers)
      ? Object.entries(headers).filter(
          ([key, value]) => key.trim() && typeof value === "string" && value.trim()
        ).length
      : 0;
  const expiry = text(stream.expiresAt);
  const expiryTime =
    expiry && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(expiry) ? Date.parse(expiry) : NaN;
  return {
    version: 1,
    evidence: "provider-declared",
    contentType: mimeType,
    container:
      { "video/webm": "webm", "video/mp4": "mp4", "video/x-matroska": "matroska" }[
        mimeType?.split(";")[0].toLowerCase()
      ] || null,
    transportHint: transportHint(stream.url, mimeType),
    video: {
      codec: token(video.codec),
      width: positive(video.width),
      height: positive(video.height),
      bitrate: positive(video.bitrate),
      framerate: positive(video.framerate),
      hdr: token(video.hdr)
    },
    audioTracks: tracks(stream.audioTracks, (track) => ({
      codec: token(track?.codec),
      language: token(track?.language, 32),
      channels: positive(track?.channels)
    })),
    subtitleTracks: tracks(stream.subtitles, (track) => ({
      language: token(track?.lang || track?.language, 32),
      format: token(track?.format, 32)
    })),
    requiredHeaderCount: Math.min(256, headerCount),
    expiresAt: Number.isFinite(expiryTime) ? new Date(expiryTime).toISOString() : null
  };
}

// JSON-returning providers/plugins can supply this internal-looking field too.
// Revalidate its declarations before carrying or rendering it.
export function normalizeSourceDescriptor(descriptor) {
  const normalized = describeSource({
    mimeType: descriptor?.contentType,
    video: descriptor?.video,
    audioTracks: descriptor?.audioTracks,
    subtitles: descriptor?.subtitleTracks,
    expiresAt: descriptor?.expiresAt
  });
  const count = descriptor?.requiredHeaderCount;
  normalized.requiredHeaderCount = Number.isInteger(count) && count > 0 ? Math.min(256, count) : 0;
  normalized.transportHint = ["direct", "hls", "dash", "torrent"].includes(
    descriptor?.transportHint
  )
    ? descriptor.transportHint
    : "unknown";
  return normalized;
}

export function probeNativeSource(descriptor, videoElement) {
  descriptor = normalizeSourceDescriptor(descriptor);
  if (!descriptor?.contentType || typeof videoElement?.canPlayType !== "function") return "unknown";
  try {
    const result = videoElement.canPlayType(descriptor.contentType);
    return result === "probably" || result === "maybe"
      ? result
      : result === ""
        ? "not-reported"
        : "unknown";
  } catch (_) {
    return "unknown";
  }
}

export async function probeSourceCapabilities(
  descriptor,
  { videoElement, mediaCapabilities, timeoutMs = 750 } = {}
) {
  descriptor = normalizeSourceDescriptor(descriptor);
  const report = {
    evidence: "browser-prediction",
    native: probeNativeSource(descriptor, videoElement),
    videoDecoding: null,
    decodingStatus: "unknown",
    scope: "video-only; audio/HDR/output unverified"
  };
  const video = descriptor?.video || {};
  if (
    !descriptor?.contentType?.startsWith("video/") ||
    !/^[a-z0-9._-]+$/i.test(video.codec || "") ||
    ![video.width, video.height, video.bitrate, video.framerate].every((value) =>
      positive(value)
    ) ||
    typeof mediaCapabilities?.decodingInfo !== "function"
  )
    return report;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("probe-timeout")),
        Math.min(2000, Math.max(1, Number(timeoutMs) || 750))
      );
    });
    const result = await Promise.race([
      mediaCapabilities.decodingInfo({
        type: "file",
        video: {
          contentType: `${descriptor.contentType.split(";")[0]}; codecs="${video.codec}"`,
          width: video.width,
          height: video.height,
          bitrate: video.bitrate,
          framerate: video.framerate
        }
      }),
      timeout
    ]);
    if (
      [result?.supported, result?.smooth, result?.powerEfficient].every(
        (value) => typeof value === "boolean"
      )
    ) {
      report.videoDecoding = {
        supported: result.supported,
        smooth: result.smooth,
        powerEfficient: result.powerEfficient
      };
      report.decodingStatus = "reported";
    }
  } catch (_) {
    report.decodingStatus = "unavailable";
  } finally {
    clearTimeout(timer);
  }
  return report;
}
