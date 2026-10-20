// Bounded, evidence-gated classification of a browser playback startup failure.
// This module is pure: no DOM, no network, no storage, no user-facing strings.
// It never authorizes transcoding, remuxing or a "supported" claim; it only
// separates a failure the engine positively rejected from one it never explained.
import { hasSourceCodecConflict, normalizeSourceDescriptor } from "../streams/sourceCapabilities.js";

export const STARTUP_FAILURE_REASONS = Object.freeze({
  HEADER_REQUIRED: "header-required",
  UNSUPPORTED_CONTAINER: "unsupported-container",
  UNSUPPORTED_CODEC: "unsupported-codec",
  INVALID_CONTENT: "invalid-content",
  NETWORK: "network",
  ABORTED: "aborted",
  DECODE_ERROR: "decode-error",
  STARTUP_STALL: "startup-stall",
  STARTUP_MEDIA_ERROR: "startup-media-error",
  STARTUP_SOURCE_ERROR: "startup-source-error",
  STARTUP_UNKNOWN: "startup-unknown"
});

export const STARTUP_FAILURE_CATEGORIES = Object.freeze({
  HEADER_REQUIRED: "header-required",
  UNSUPPORTED: "unsupported",
  INVALID_CONTENT: "invalid-content",
  NETWORK: "network",
  ABORTED: "aborted",
  DECODE: "decode",
  STALL: "stall",
  ENGINE_ERROR: "engine-error",
  UNKNOWN: "unknown"
});

const REASON_CATEGORY = Object.freeze({
  [STARTUP_FAILURE_REASONS.HEADER_REQUIRED]: STARTUP_FAILURE_CATEGORIES.HEADER_REQUIRED,
  [STARTUP_FAILURE_REASONS.UNSUPPORTED_CONTAINER]: STARTUP_FAILURE_CATEGORIES.UNSUPPORTED,
  [STARTUP_FAILURE_REASONS.UNSUPPORTED_CODEC]: STARTUP_FAILURE_CATEGORIES.UNSUPPORTED,
  [STARTUP_FAILURE_REASONS.INVALID_CONTENT]: STARTUP_FAILURE_CATEGORIES.INVALID_CONTENT,
  [STARTUP_FAILURE_REASONS.NETWORK]: STARTUP_FAILURE_CATEGORIES.NETWORK,
  [STARTUP_FAILURE_REASONS.ABORTED]: STARTUP_FAILURE_CATEGORIES.ABORTED,
  [STARTUP_FAILURE_REASONS.DECODE_ERROR]: STARTUP_FAILURE_CATEGORIES.DECODE,
  [STARTUP_FAILURE_REASONS.STARTUP_STALL]: STARTUP_FAILURE_CATEGORIES.STALL,
  [STARTUP_FAILURE_REASONS.STARTUP_MEDIA_ERROR]: STARTUP_FAILURE_CATEGORIES.ENGINE_ERROR,
  [STARTUP_FAILURE_REASONS.STARTUP_SOURCE_ERROR]: STARTUP_FAILURE_CATEGORIES.ENGINE_ERROR,
  [STARTUP_FAILURE_REASONS.STARTUP_UNKNOWN]: STARTUP_FAILURE_CATEGORIES.UNKNOWN
});

// Adaptive engines decide playback themselves; a native canPlayType prediction is
// not evidence about them, so container claims are limited to native playback.
const NATIVE_ENGINES = new Set(["native-file", "none", ""]);

// Containers with a native HTML media type. Anything else declared by the
// provider is not something this class of engine can be assumed to open.
const WEB_CONTAINERS = new Set(["mp4", "webm"]);

const INVALID_CONTENT_MARKERS = [
  "manifestparsingerror",
  "manifest parsing",
  "invalid content",
  "invalid data",
  "unrecognized",
  "text/html",
  "inline html",
  "<!doctype",
  "<html"
];

// Runtime details that describe a transport fault. These outrank any codec
// guess: an unreachable or interrupted request says nothing about formats.
// Only transport-specific wording belongs here: a generic "load failed" also
// appears next to genuine codec rejections, so it is not evidence by itself.
const TRANSPORT_MARKERS = [
  "failed to fetch",
  "net::err",
  "networkerror",
  "network error",
  "err_internet_disconnected",
  "err_connection",
  "econnrefused",
  "econnreset",
  "enotfound",
  "socket hang up",
  "request timed out",
  "timed out"
];

// Detail text is inspected up to this bound. Anything longer is treated as
// uninspected evidence, so an unread transport or parse marker can never turn
// into an unsupported-format claim.
const DETAIL_INSPECTION_LIMIT = 1024;

// HTML media error codes. 3 and 4 are the engine rejecting the media itself;
// 1 and 2 are interruption/transport and must never be reported as unsupported.
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

function boundedText(value, limit = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, limit);
}

function normalizePrediction(value) {
  const clean = boundedText(value, 32).toLowerCase();
  return ["probably", "maybe", "not-reported", "unknown"].includes(clean) ? clean : "unknown";
}

function normalizeMediaErrorCode(value) {
  const code = Number(value || 0);
  return Number.isInteger(code) && code > 0 && code <= 4 ? code : 0;
}

function normalizeHttpStatus(value) {
  const status = Number(value || 0);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
}

function normalizeDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") return null;
  try {
    return normalizeSourceDescriptor(descriptor);
  } catch (_) {
    return null;
  }
}

function inspectableDetail(detail) {
  if (detail == null) {
    return { text: "", complete: true };
  }
  // Only a primitive string can be inspected reliably. An Error, a boxed String
  // or any other object may carry text we cannot see, so it is scanned for
  // markers but never counted as fully inspected.
  const raw = typeof detail === "string" ? detail : String(detail);
  return {
    text: raw.slice(0, DETAIL_INSPECTION_LIMIT).toLowerCase(),
    complete: typeof detail === "string" && raw.length <= DETAIL_INSPECTION_LIMIT
  };
}

function matchesMarker(detail, markers) {
  const { text } = inspectableDetail(detail);
  if (!text) return false;
  return markers.some((marker) => text.includes(marker));
}

function hasInvalidContentEvidence(detail) {
  return matchesMarker(detail, INVALID_CONTENT_MARKERS);
}

function hasTransportEvidence(detail) {
  return matchesMarker(detail, TRANSPORT_MARKERS);
}

function detailFullyInspected(detail) {
  return inspectableDetail(detail).complete;
}

function containerEvidence(descriptor) {
  if (!descriptor) return null;
  const container = typeof descriptor.container === "string" ? descriptor.container : null;
  if (container && WEB_CONTAINERS.has(container)) return null;
  if (container) return container;
  // A declared media type the descriptor could not map to a web container is
  // container evidence in its own right, but only when it was actually declared.
  if (descriptor.contentType) {
    return descriptor.contentType.split(";")[0].trim().toLowerCase();
  }
  return null;
}

function codecEvidence(descriptor) {
  if (hasSourceCodecConflict(descriptor)) return null;
  const declared = descriptor?.video?.codec;
  if (typeof declared === "string" && declared) return declared;
  // MIME-only declarations are common in the wild: a provider may give
  // `video/mp4; codecs="hvc1"` and no separate video metadata.
  const contentType = typeof descriptor?.contentType === "string" ? descriptor.contentType : "";
  const match = /;\s*codecs="([^"]{1,120})"/i.exec(contentType);
  if (!match) return null;
  const first = match[1].split(",")[0].trim();
  return /^[a-z0-9._+-]+$/i.test(first) ? first : null;
}

function buildResult(reason, evidence, descriptor, extra = {}) {
  return {
    reason,
    category: REASON_CATEGORY[reason] || STARTUP_FAILURE_CATEGORIES.UNKNOWN,
    evidence,
    container: containerEvidence(descriptor),
    codec: codecEvidence(descriptor),
    ...extra
  };
}

export function classifyStartupFailure({
  descriptor = null,
  nativePrediction = "unknown",
  engine = "none",
  mediaErrorCode = 0,
  detail = "",
  httpStatus = 0,
  headerRequired = false,
  timedOut = false,
  sourceElementError = false
} = {}) {
  const normalizedDescriptor = normalizeDescriptor(descriptor);
  const prediction = normalizePrediction(nativePrediction);
  const code = normalizeMediaErrorCode(mediaErrorCode);
  const status = normalizeHttpStatus(httpStatus);
  const engineName = boundedText(String(engine ?? ""), 32).toLowerCase();

  // 1. The source cannot even be requested correctly, so no media verdict exists.
  if (headerRequired === true) {
    return buildResult(
      STARTUP_FAILURE_REASONS.HEADER_REQUIRED,
      "provider-declared",
      normalizedDescriptor
    );
  }

  // 2. Transport evidence outranks any codec guess.
  if (status) {
    return buildResult(STARTUP_FAILURE_REASONS.NETWORK, "http-status", normalizedDescriptor, {
      httpStatus: status
    });
  }

  // 3. A parsed error page or manifest is a source fault, not a codec verdict.
  if (hasInvalidContentEvidence(detail)) {
    return buildResult(
      STARTUP_FAILURE_REASONS.INVALID_CONTENT,
      "runtime-detail",
      normalizedDescriptor
    );
  }

  // 3b. Transport wording in the runtime detail outranks any format guess.
  if (hasTransportEvidence(detail)) {
    return buildResult(STARTUP_FAILURE_REASONS.NETWORK, "runtime-detail", normalizedDescriptor);
  }

  // 4. Interruption and transport media errors stay transport errors.
  if (code === MEDIA_ERR_NETWORK) {
    return buildResult(STARTUP_FAILURE_REASONS.NETWORK, "media-error", normalizedDescriptor);
  }
  if (code === MEDIA_ERR_ABORTED) {
    return buildResult(STARTUP_FAILURE_REASONS.ABORTED, "media-error", normalizedDescriptor);
  }

  // 5. Unsupported claims require a native engine, a positive engine signal and
  //    descriptor evidence. A predicted-playable source can never land here, and
  //    neither can a detail too long to have been fully inspected for a transport
  //    or parse marker.
  const transportHint = boundedText(normalizedDescriptor?.transportHint, 16);
  const nativeContainer = NATIVE_ENGINES.has(engineName);
  const adaptiveTransport = transportHint === "hls" || transportHint === "dash";
  const detailInspected = detailFullyInspected(detail);
  if (
    normalizedDescriptor && nativeContainer && !adaptiveTransport && detailInspected &&
    !hasSourceCodecConflict(normalizedDescriptor)
  ) {
    const engineRejected =
      prediction === "not-reported" ||
      code === MEDIA_ERR_DECODE ||
      code === MEDIA_ERR_SRC_NOT_SUPPORTED;
    if (engineRejected && prediction !== "probably" && prediction !== "maybe") {
      const evidence = prediction === "not-reported" ? "native-not-reported" : "media-error";
      const container = containerEvidence(normalizedDescriptor);
      if (container) {
        return buildResult(
          STARTUP_FAILURE_REASONS.UNSUPPORTED_CONTAINER,
          evidence,
          normalizedDescriptor
        );
      }
      if (codecEvidence(normalizedDescriptor)) {
        return buildResult(
          STARTUP_FAILURE_REASONS.UNSUPPORTED_CODEC,
          evidence,
          normalizedDescriptor
        );
      }
    }
  }

  // 6. A decode failure without descriptor evidence is still a decode failure,
  //    but it cannot be attributed to a container or a codec.
  if (code === MEDIA_ERR_DECODE) {
    return buildResult(STARTUP_FAILURE_REASONS.DECODE_ERROR, "media-error", normalizedDescriptor);
  }

  // 7. A genuine timed-out startup keeps the retry-friendly stall reason.
  if (timedOut === true) {
    return buildResult(
      STARTUP_FAILURE_REASONS.STARTUP_STALL,
      "startup-timeout",
      normalizedDescriptor
    );
  }

  // 8. Remaining engine faults keep their existing distinction.
  if (sourceElementError === true) {
    return buildResult(
      STARTUP_FAILURE_REASONS.STARTUP_SOURCE_ERROR,
      "element-error",
      normalizedDescriptor
    );
  }
  if (code || evidencePresent(normalizedDescriptor) || boundedText(detail)) {
    return buildResult(
      STARTUP_FAILURE_REASONS.STARTUP_MEDIA_ERROR,
      "engine-error",
      normalizedDescriptor
    );
  }
  return buildResult(
    STARTUP_FAILURE_REASONS.STARTUP_UNKNOWN,
    "insufficient-evidence",
    normalizedDescriptor
  );
}

function evidencePresent(descriptor) {
  return Boolean(descriptor && (descriptor.contentType || containerEvidence(descriptor)));
}

export function isUnsupportedStartupFailure(classification) {
  const category = classification?.category;
  return (
    category === STARTUP_FAILURE_CATEGORIES.UNSUPPORTED ||
    category === STARTUP_FAILURE_CATEGORIES.HEADER_REQUIRED
  );
}
