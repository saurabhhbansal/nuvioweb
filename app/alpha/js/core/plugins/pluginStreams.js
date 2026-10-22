// Maps cleaned scraper results to the app's stream rows.
// Header-locked streams keep their headers in behaviorHints so the source list
// shows the existing "Needs headers" label; they are never relayed through a proxy.

const MAX_STREAMS = 200;

function cleanStream(stream) {
  if (!stream || typeof stream !== "object") return null;
  const url = String(stream.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const headers =
    stream.headers && typeof stream.headers === "object" && !Array.isArray(stream.headers)
      ? Object.fromEntries(
          Object.entries(stream.headers)
            .slice(0, 32)
            .map(([key, value]) => [String(key).slice(0, 128), String(value).slice(0, 2048)])
        )
      : null;
  const text = (value, max = 200) => (value == null ? "" : String(value).slice(0, max));
  return {
    url,
    name: text(stream.name),
    title: text(stream.title, 500),
    quality: text(stream.quality, 40),
    size: text(stream.size, 40),
    headers: headers && Object.keys(headers).length ? headers : null
  };
}

// Applied in the worker and again on the main thread: plugin code could post
// its own message, so nothing from the worker is trusted as already clean.
export function cleanPluginStreams(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_STREAMS * 2).map(cleanStream).filter(Boolean).slice(0, MAX_STREAMS);
}

export function mapPluginStreams(scraper, streams = []) {
  return cleanPluginStreams(streams).map((stream) => {
    const details = [stream.quality, stream.size].filter(Boolean).join(" · ");
    const row = {
      name: stream.name || scraper.name,
      title: stream.title || details || scraper.name,
      description: details || undefined,
      url: stream.url
    };
    if (stream.headers) {
      row.behaviorHints = { notWebReady: true, proxyHeaders: { request: { ...stream.headers } } };
    }
    return row;
  });
}
