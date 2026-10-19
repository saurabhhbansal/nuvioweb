import {
  describeSource,
  normalizeSourceDescriptor,
  probeNativeSource
} from "./sourceCapabilities.js";

// Display preference only: no source is removed, rewritten or chosen to play.
export function orderSourcesByNativePrediction(
  streams = [],
  { videoElement, now = Date.now() } = {}
) {
  const predictions = new Map();
  const rank = (stream) => {
    const raw = describeSource(stream);
    const descriptor = stream?.sourceDescriptor
      ? normalizeSourceDescriptor(stream.sourceDescriptor)
      : raw;
    if (
      descriptor.requiredHeaderCount ||
      raw.requiredHeaderCount ||
      [descriptor.expiresAt, raw.expiresAt].some((expiry) => expiry && Date.parse(expiry) <= now)
    )
      return 2;
    // A file probe cannot establish an adaptive engine's support. A bare MIME
    // type also says nothing about the actual codecs a container may contain.
    if (
      descriptor.transportHint !== "direct" ||
      raw.transportHint !== "direct" ||
      !descriptor.contentType?.startsWith("video/") ||
      !/;\s*codecs="[a-z0-9]/i.test(descriptor.contentType)
    )
      return 1;
    if (!predictions.has(descriptor.contentType)) {
      predictions.set(descriptor.contentType, probeNativeSource(descriptor, videoElement));
    }
    const prediction = predictions.get(descriptor.contentType);
    return prediction === "probably" || prediction === "maybe"
      ? 0
      : prediction === "not-reported"
        ? 2
        : 1;
  };
  return (Array.isArray(streams) ? streams : [])
    .map((stream, index) => ({
      stream,
      index,
      rank: rank(stream)
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ stream }) => stream);
}
