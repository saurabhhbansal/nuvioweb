// Hash routes for the screens worth reloading or sharing.
//
//   #/                                 home
//   #/search  #/library  #/settings    top-level screens
//   #/detail/<type>/<id>               a title
//   #/stream/<type>/<id>[?video=&season=&episode=]   its source list
//
// Hash routes need no server fallback and leave the service worker's exact-path
// app-shell matching alone: the document path never changes.
//
// The URL carries content IDs and nothing else. Tokens, stream URLs, add-on or
// plugin data and free text never go in it, because a URL is copied, shared
// and logged. Anything that is not a recognised ID is dropped, not escaped.

const SIMPLE_ROUTES = Object.freeze({
  home: "",
  search: "search",
  library: "library",
  settings: "settings"
});

const TITLE_ROUTES = new Set(["detail", "stream"]);

// Content types are short lowercase words (movie, series, tv, anime, ...).
const TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
// Content IDs come from add-ons: tt123, tmdb:456, kitsu:7, tt123:1:2 for an
// episode. Anything with spaces, slashes or a scheme is not an ID.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NUMBER_PATTERN = /^\d{1,5}$/;

function cleanType(value) {
  const text = String(value ?? "").trim();
  return TYPE_PATTERN.test(text) ? text : null;
}

function cleanId(value) {
  const text = String(value ?? "").trim();
  if (!ID_PATTERN.test(text)) return null;
  // A URL-shaped value (http:, https:, data:, ...) is never a content ID.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null;
  return text;
}

function cleanNumber(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return NUMBER_PATTERN.test(text) ? Number(text) : null;
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

// The route a URL can stand for, or null when this screen has no URL of its own.
export function serializeRouteHash(routeName, params = {}) {
  if (Object.prototype.hasOwnProperty.call(SIMPLE_ROUTES, routeName)) {
    return `#/${SIMPLE_ROUTES[routeName]}`;
  }
  if (!TITLE_ROUTES.has(routeName)) {
    return null;
  }
  const type = cleanType(params?.itemType);
  const id = cleanId(params?.itemId ?? params?.id);
  if (!type || !id) {
    return null;
  }
  const base = `#/${routeName}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  if (routeName !== "stream") {
    return base;
  }
  const query = new URLSearchParams();
  const videoId = cleanId(params?.videoId);
  if (videoId && videoId !== id) query.set("video", videoId);
  const season = cleanNumber(params?.season);
  const episode = cleanNumber(params?.episode);
  if (season != null && episode != null) {
    query.set("season", String(season));
    query.set("episode", String(episode));
  }
  const search = query.toString();
  return search ? `${base}?${search}` : base;
}

// { route, params } for a hash this app wrote, or null for anything else.
export function parseRouteHash(hash) {
  const raw = String(hash ?? "");
  const body = raw.startsWith("#") ? raw.slice(1) : raw;
  if (body === "" || body === "/") {
    return { route: "home", params: {} };
  }
  if (!body.startsWith("/")) {
    return null;
  }
  const queryStart = body.indexOf("?");
  const path = queryStart >= 0 ? body.slice(1, queryStart) : body.slice(1);
  const query = new URLSearchParams(queryStart >= 0 ? body.slice(queryStart + 1) : "");
  const segments = path.split("/").filter((segment, index, all) => {
    // Tolerate one trailing slash, nothing else empty.
    return segment !== "" || index !== all.length - 1;
  });
  if (segments.some((segment) => segment === "")) {
    return null;
  }
  const [first, ...rest] = segments.map(decodeSegment);
  if (segments.length === 1) {
    const route = Object.keys(SIMPLE_ROUTES).find(
      (name) => SIMPLE_ROUTES[name] && SIMPLE_ROUTES[name] === first
    );
    return route ? { route, params: {} } : null;
  }
  if (!TITLE_ROUTES.has(first) || rest.length !== 2) {
    return null;
  }
  const itemType = cleanType(rest[0]);
  const itemId = cleanId(rest[1]);
  if (!itemType || !itemId) {
    return null;
  }
  const params = { itemId, itemType };
  if (first === "stream") {
    // Opening a source list from a link or a reload shows the list; it never
    // starts playback on its own.
    params.manualSelection = true;
    const videoId = cleanId(query.get("video"));
    params.videoId = videoId || itemId;
    const season = cleanNumber(query.get("season"));
    const episode = cleanNumber(query.get("episode"));
    if (season != null && episode != null) {
      params.season = season;
      params.episode = episode;
    }
  }
  return { route: first, params };
}
