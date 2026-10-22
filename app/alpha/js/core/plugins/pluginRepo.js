// Pure helpers for Nuvio plugin repositories: URL checks and manifest parsing.

const TEMPLATE_PATTERN = /[{}]|%7b|%7d/i;
const MAX_SCRAPERS = 100;

function parseHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// A URL template such as https://host/stream/{tmdbId} is not a repository.
export function isTemplateUrl(value) {
  return TEMPLATE_PATTERN.test(String(value || ""));
}

// A real repository URL: plain http(s), no template placeholders, no credentials.
export function isRepoUrl(value) {
  const url = parseHttpUrl(value);
  return Boolean(url && !isTemplateUrl(value) && !url.username && !url.password);
}

// Users may paste the manifest URL or the folder that holds it.
export function manifestUrlFor(repoUrl) {
  const url = parseHttpUrl(repoUrl);
  if (!url) return "";
  if (/\.json$/i.test(url.pathname)) return url.href;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/manifest.json`;
  return url.href;
}

export function scraperCodeUrl(manifestUrl, filename) {
  const name = String(filename || "").trim();
  if (!name || /^[a-z][\w+.-]*:/i.test(name) || name.startsWith("//")) {
    return "";
  }
  try {
    const url = new URL(name, manifestUrl);
    const base = new URL(manifestUrl);
    return url.origin === base.origin ? url.href : "";
  } catch {
    return "";
  }
}

export function scraperKey(repoUrl, scraperId) {
  return `${String(repoUrl || "").trim()}#${String(scraperId || "").trim()}`;
}

function normalizeTypes(value) {
  const types = Array.isArray(value) ? value : ["movie", "tv"];
  return types
    .map((type) => String(type || "").toLowerCase())
    .map((type) => (type === "series" ? "tv" : type))
    .filter((type) => type === "movie" || type === "tv");
}

export function parseManifest(json, manifestUrl) {
  if (!json || typeof json !== "object" || !Array.isArray(json.scrapers)) {
    throw new Error("Not a plugin repository manifest");
  }
  const seen = new Set();
  const scrapers = json.scrapers
    .slice(0, MAX_SCRAPERS)
    .map((entry) => {
      const id = String(entry?.id || "").trim();
      const codeUrl = scraperCodeUrl(manifestUrl, entry?.filename);
      if (!id || !codeUrl || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name: String(entry.name || id).trim().slice(0, 80),
        version: String(entry.version || "").slice(0, 32),
        codeUrl,
        supportedTypes: normalizeTypes(entry.supportedTypes),
        enabledByDefault: entry.enabled !== false
      };
    })
    .filter(Boolean);
  return {
    name: String(json.name || "").trim().slice(0, 80),
    version: String(json.version || "").slice(0, 32),
    scrapers
  };
}
