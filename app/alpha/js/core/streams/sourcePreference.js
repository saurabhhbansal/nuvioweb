import { describeSource, normalizeSourceDescriptor } from "./sourceCapabilities.js";
import { assessBrowserExternalHandoff } from "../player/externalHandoff.js";

/**
 * One compact display hint for a source card, or null when nothing is
 * positively known. Never reorders, fetches, probes or launches a source.
 */
export function assessSourceForDevice(stream = {}, { now = Date.now() } = {}) {
  const raw = describeSource({ ...stream?.raw, ...stream });
  let declared = null;
  try {
    declared = stream?.sourceDescriptor ? normalizeSourceDescriptor(stream.sourceDescriptor) : null;
  } catch (_) {
    declared = null;
  }
  const handoff = assessBrowserExternalHandoff({ mediaUrl: stream?.url || stream?.raw?.url, source: stream });
  if (handoff.code === "headers-required" || raw.requiredHeaderCount || declared?.requiredHeaderCount) {
    return { reason: "headers-required", label: "Needs headers" };
  }
  if ([raw.expiresAt, declared?.expiresAt].some((expiry) => expiry && Date.parse(expiry) <= now)) {
    return { reason: "expired", label: "Link expired" };
  }
  return null;
}
