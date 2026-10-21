// Pure, allowlisted failure evidence. No source URLs, raw errors or UA exports.
import { normalizeSourceDescriptor, hasSourceCodecConflict } from "../streams/sourceCapabilities.js";
import { platformHints } from "../streams/deviceCapabilities.js";

const pick = (value, choices, fallback = "unknown") => choices.includes(value) ? value : fallback;
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max ? value : null;
const MIME_TYPES = new Set(["video/mp4", "video/webm", "video/x-matroska", "video/mp2t", "audio/mp4", "audio/webm", "application/vnd.apple.mpegurl", "application/x-mpegurl", "application/dash+xml", "application/octet-stream", "text/html", "application/json"]);
const mime = value => typeof value === "string" && MIME_TYPES.has(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
const token = value => typeof value === "string" && ["mp4", "webm", "matroska", "mpegts"].includes(value) ? value : null;
const codec = value => typeof value === "string" && /^(?:avc[13](?:\.[0-9a-f]{6})?|(?:hvc1|hev1)(?:\.[0-9a-fhlb.]{1,64})?|av01(?:\.[0-9a-z.]{1,64})?|vp0?[89](?:\.[0-9.]{1,64})?|mp4a(?:\.[0-9a-f.]{1,20})?|aac|ac-3|ec-3|ac3|eac3|dts|dtsc|dtsh|truehd|mlp|opus|vorbis|flac)$/i.test(value) ? value.toLowerCase() : null;

export function diagnosePlaybackFailure(input = {}) {
  let descriptor = null;
  try { descriptor = normalizeSourceDescriptor(input.descriptor || {}); } catch { /* unknown */ }
  const hints = platformHints(input.navigator || {});
  const observed = {
    engine: pick(input.engine, ["native-file", "native-hls", "hls.js", "dash.js", "none"]),
    platform: hints.platform, engineHint: hints.engine,
    version: null, // UA versions are not runtime/backend proof.
    phase: pick(input.phase, ["startup", "seek", "playback"], "startup"),
    readyState: integer(input.readyState, 0, 4), networkState: integer(input.networkState, 0, 3),
    mediaErrorCode: integer(input.mediaErrorCode, 1, 4),
    httpStatus: integer(input.httpStatus, 100, 599),
    contentType: mime(input.responseContentType),
    rangeCapability: pick(input.rangeCapability, ["supported", "rejected", "not-observed"], "not-observed"),
    requiredHeaders: input.headerRequired === true || (descriptor?.requiredHeaderCount || 0) > 0,
    nativePrediction: pick(input.nativePrediction, ["probably", "maybe", "not-reported"]),
    activationRejected: input.activationRejected === true,
    transportFailure: input.transportFailure === true
  };
  const declared = {
    contentType: mime(descriptor?.contentType?.split(";")[0]),
    container: token(descriptor?.container), codec: codec(descriptor?.video?.codec),
    audio: (descriptor?.audioTracks || []).map(track => codec(track.codec)).filter(Boolean).slice(0, 32),
    codecConflict: hasSourceCodecConflict(descriptor)
  };
  let cause = "unknown-at-" + (observed.phase === "seek" ? "seek" : "transport/startup");
  let confidence = "unknown";
  let evidence = ["observed.readyState", "observed.networkState"];
  let explanation = "The browser did not expose why playback failed. Access, transport or media configuration may be responsible; no provider or codec fault is proven.";
  let nextAction = "choose-source";
  let actionLabel = "Go Back to refresh sources or choose another original source. Compare the same source in another engine if it still fails.";
  const set = (reason, level, fields, message) => { cause = reason; confidence = level; evidence = fields; explanation = message; };
  const status = observed.httpStatus;
  if (observed.requiredHeaders) {
    set("header-required", "observed", ["observed.requiredHeaders"], "This source declares special request headers. The current browser path cannot supply that access contract; this is not a codec or provider failure.");
    nextAction = "own-proxy-or-source";
    actionLabel = "Go Back and choose a source without required headers, or configure your own header-capable proxy. No proxy is started here.";
  } else if (status === 401 || status === 403) {
    set("source-access", "observed", ["observed.httpStatus"], `The media request returned HTTP ${status}: access was refused. Expiry or authorization may be responsible; the exact cause is not exposed.`);
  } else if (status === 410) {
    set("source-expired-or-gone", "observed", ["observed.httpStatus"], "The media request returned HTTP 410 (gone). Refresh sources; this does not prove a codec fault or why the link was removed.");
  } else if (status === 416 || observed.rangeCapability === "rejected") {
    set("range-rejected", "observed", [status === 416 ? "observed.httpStatus" : "observed.rangeCapability"], "The server rejected a byte-range request. Seeking or resuming may be unavailable for this source; no codec failure is established.");
  } else if ((status && status >= 400) || observed.mediaErrorCode === 2 || observed.transportFailure) {
    set("provider-or-transport", "observed", [status && status >= 400 ? "observed.httpStatus" : observed.mediaErrorCode === 2 ? "observed.mediaErrorCode" : "observed.transportFailure"], "The media request or transfer failed. This identifies a delivery failure, not whether the provider, network, CORS or local interference caused it.");
  } else if (["text/html", "application/json"].includes(observed.contentType)) {
    set("invalid-media-response", "observed", ["observed.contentType"], "The observed response type is a page or JSON, not media. Refresh sources or check source access before trying format repair.");
  } else if (observed.activationRejected) {
    set("activation-required", "observed", ["observed.activationRejected"], "Playback was rejected with NotAllowedError. User activation or browser permission policy may be responsible; no media-format failure is established.");
    actionLabel = "Go Back and select the source with a click or tap. Check this site's playback permission if it is rejected again.";
  } else if (observed.mediaErrorCode === 1) {
    set("aborted", "observed", ["observed.mediaErrorCode"], "The media operation was aborted. This does not establish a provider or codec fault.");
  } else if (observed.engine === "native-file" && !["hls", "dash"].includes(descriptor?.transportHint) && !declared.codecConflict) {
    // A generic code3/4 cannot isolate audio, video or container. Declarations
    // plus a negative exact native prediction identify candidates, not bytes.
    if (observed.nativePrediction === "not-reported") {
      if (declared.container === "matroska") {
        set("unsupported-container", "predicted", ["declared.container", "observed.nativePrediction"], "The source declares MKV (Matroska), and this engine reports no native support for its declared type. Container incompatibility is a candidate, not a verified inspection of the media bytes.");
      } else if (declared.audio.length > 0 && declared.audio.every(codec => /^(truehd|mlp)(\.|$)/i.test(codec))) {
        set("unsupported-audio", "predicted", ["declared.audio", "observed.nativePrediction"], "The source declares TrueHD audio, and native support is not reported. Undecodable audio is a candidate; this signal alone cannot isolate audio from video or container.");
      } else if (declared.codec?.includes(".") && descriptor?.contentType?.includes("codecs=")) {
        set("unsupported-codec-config", "predicted", ["declared.contentType", "declared.codec", "observed.nativePrediction"], "This engine reports no native support for the declared codec/configuration. That is a browser prediction, not proof of the source bytes or a universal codec limit.");
      }
      if (confidence === "predicted") {
        nextAction = "external-player-or-source";
        actionLabel = "Try another browser-compatible original source first. If available, use Open in another player; otherwise use your own repack or transcode route after verifying the format. These repairs are not run here.";
      }
    }
  }
  if (confidence === "unknown" && observed.mediaErrorCode === 3) {
    set("decode-error", "observed", ["observed.mediaErrorCode"], "The engine reported a decode failure, but did not identify audio, video, container, corruption or resource pressure. No specific codec is proven unsupported.");
  }
  const candidateCauses = [{ cause, confidence, evidence }];
  if (confidence === "unknown") {
    for (const candidate of ["source-access", "CORS-or-transport", "codec-or-container", "resource-pressure", "possible-interference"]) {
      candidateCauses.push({ cause: candidate, confidence: "unknown", evidence: [] });
    }
  }
  return { version: 1, observed, declared, cause, confidence, candidateCauses,
    explanation, nextAction: { id: nextAction, label: actionLabel },
    limits: "Declarations and predictions are not playback results. CORS, resource pressure and interference need discriminating evidence; no extension enumeration or global protection changes are recommended." };
}

// Export reconstructs from allowed primitives; never serialize a caller's object.
export function exportPlaybackDiagnostic(input = {}) {
  return JSON.stringify(diagnosePlaybackFailure(input), null, 2);
}
