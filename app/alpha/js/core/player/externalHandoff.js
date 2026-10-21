// URL-only hand-off rules shared by the source list and the external-player UI.

export function isTransferableExternalMediaUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username && !parsed.password && !Array.from(String(value)).some((character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  } catch (_) {
    return false;
  }
}

// All shipped hand-off routes are URL-only. Treat every declared request map as
// required, including unknown names/empty values; never silently strip a map.
// `notWebReady` alone does not block: those sources are what an external player is for.
export function assessBrowserExternalHandoff({ mediaUrl, source, subtitle, subtitleUrl = "", requestHeaders } = {}) {
  const descriptors = [source, source?.raw, subtitle, subtitle?.raw];
  const maps = [requestHeaders, ...descriptors.flatMap((entry) => [
    entry?.headers, entry?.requestHeaders, entry?.proxyHeaders?.request,
    entry?.behaviorHints?.proxyHeaders?.request
  ])];
  const declared = descriptors.some((entry) => Number(entry?.requiredHeaderCount || entry?.sourceDescriptor?.requiredHeaderCount) > 0) ||
    maps.some((map) => map != null && (typeof map !== "object" || Object.keys(map).length > 0));
  if (declared) return { allowed: false, code: "headers-required", reason: "This source or subtitle requires request headers. These URL-only hand-offs cannot deliver them. Choose another source or ask the provider for a self-authorizing URL." };
  if (!isTransferableExternalMediaUrl(mediaUrl) || (subtitleUrl && !isTransferableExternalMediaUrl(subtitleUrl))) {
    return { allowed: false, code: "invalid-url", reason: "Only HTTP(S) stream and subtitle links without embedded login credentials can leave this browser. Choose another source." };
  }
  return { allowed: true, reason: "URL only: browser cookies and request headers are not transferred." };
}
