import { TRAKT_API_URL, TRAKT_CLIENT_ID } from "../../config.js";
import { TraktAuthStore } from "../local/traktAuthStore.js";
import { detailWatchedEnrichmentService } from "./detailWatchedEnrichmentService.js";
import { TraktCredentialSyncService } from "../../core/profile/traktCredentialSyncService.js";
import { getSidecarCapabilities, requireSidecarCapability, sidecarUnavailableMessage } from "../../core/platform/sidecarCapabilities.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { beginTraktPkce, takeTraktPkceCallback, traktRedirectUri } from "./traktPkce.js";

const API_VERSION = "2";
const DEFAULT_API_URL = "https://api.trakt.tv";
const REFRESH_LEEWAY_SECONDS = 60;
const BROWSER_AUTH_BRIDGE_BASE_PATH = "/api/trakt";
// Trakt's own answer for apps that show a code instead of redirecting back.
const DEVICE_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";
let browserBridgeStatus = "unknown";
let lastRedirectResult = null;

function apiBaseUrl() {
  return String(TRAKT_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

function hasRequiredCredentials() {
  return Boolean(getSidecarCapabilities().traktAuth && TRAKT_CLIENT_ID && browserBridgeStatus !== "unavailable");
}

function normalizeAuthErrorMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    return String(payload.error_description || payload.error || payload.message || fallback);
  }
  return fallback;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

// The sign-in requests the bridge would make, made from the browser instead.
// Trakt accepts them cross-origin and needs only the public client id.
function directAuthRequest(path, body = {}) {
  if (path === "/device/code") return ["/oauth/device/code", { client_id: TRAKT_CLIENT_ID }];
  if (path === "/device/token") {
    return ["/oauth/device/token", { code: String(body.code || ""), client_id: TRAKT_CLIENT_ID }];
  }
  if (path === "/refresh") {
    return [
      "/oauth/token",
      {
        refresh_token: String(body.refresh_token || ""),
        client_id: TRAKT_CLIENT_ID,
        // A token from the PKCE sign-in was issued for this site's address.
        redirect_uri: traktRedirectUri() || DEVICE_REDIRECT_URI,
        grant_type: "refresh_token"
      }
    ];
  }
  return null;
}

async function requestBrowserBridge(path, { method = "POST", body = null } = {}) {
  requireSidecarCapability("traktAuth");
  if (!getSidecarCapabilities().traktBridge) {
    const direct = directAuthRequest(path, body || {});
    if (!direct) throw new Error("Unsupported Trakt sign-in request");
    const response = await fetch(`${apiBaseUrl()}${direct[0]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(direct[1]),
      cache: "no-store"
    });
    return { response, payload: await readResponseBody(response) };
  }
  const response = await fetch(`${BROWSER_AUTH_BRIDGE_BASE_PATH}${path}`, {
    method,
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  return { response, payload: await readResponseBody(response) };
}

async function ensureBrowserAuthBridge() {
  if (!getSidecarCapabilities().traktAuth) {
    browserBridgeStatus = "unavailable";
    return false;
  }
  // No bridge to ask: signing in directly needs nothing but the client id.
  if (!getSidecarCapabilities().traktBridge) {
    browserBridgeStatus = TRAKT_CLIENT_ID ? "available" : "unavailable";
    return browserBridgeStatus === "available";
  }
  try {
    const { response, payload } = await requestBrowserBridge("/health", { method: "GET" });
    browserBridgeStatus = response.ok && payload?.configured === true ? "available" : "unavailable";
  } catch {
    browserBridgeStatus = "unavailable";
  }
  return browserBridgeStatus === "available";
}

export async function requestJson(
  path,
  { method = "GET", body = null, authorization = null, clientId = TRAKT_CLIENT_ID } = {}
) {
  const headers = {
    "Content-Type": "application/json",
    "trakt-api-version": API_VERSION,
    "trakt-api-key": clientId
  };
  if (authorization) {
    headers.Authorization = authorization;
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
  const payload = await readResponseBody(response);
  return { response, payload };
}

function isTokenExpiredOrExpiring(state) {
  const createdAt = Number(state.createdAt || 0);
  const expiresIn = Number(state.expiresIn || 0);
  if (!createdAt || !expiresIn) {
    return true;
  }
  const expiresAt = createdAt + expiresIn;
  return Date.now() / 1000 >= expiresAt - REFRESH_LEEWAY_SECONDS;
}

async function fetchUserSettings() {
  const token = await TraktAuthService.getValidAccessToken();
  if (!token) {
    return null;
  }
  const { response, payload } = await requestJson("/users/settings", {
    authorization: `Bearer ${token}`
  });
  if (!response.ok) {
    return null;
  }
  const user = payload?.user || {};
  const username = user.username || null;
  const userSlug = user.ids?.slug || null;
  TraktAuthStore.saveUser({ username, userSlug });
  return username;
}

export const TraktAuthService = {
  hasRequiredCredentials,

  getBrowserBridgeStatus() {
    return browserBridgeStatus;
  },

  async refreshBrowserBridgeAvailability() {
    return ensureBrowserAuthBridge();
  },

  getCurrentAuthState() {
    return TraktAuthStore.get();
  },

  isAuthenticated() {
    return TraktAuthStore.isAuthenticated();
  },

  /**
   * Whether this site signs in to Trakt by sending the viewer to trakt.tv and
   * back (PKCE). That is the only way without a server: the device-code poll
   * needs a client secret. A deployment with the /api/trakt helper keeps the
   * device code.
   */
  usesRedirectSignIn() {
    const capabilities = getSidecarCapabilities();
    return Boolean(capabilities.traktAuth && !capabilities.traktBridge && TRAKT_CLIENT_ID);
  },

  /** Leave for trakt.tv. The page comes back to this site's root. */
  async startRedirectAuth({ runtime = globalThis } = {}) {
    requireSidecarCapability("traktAuth");
    if (!TRAKT_CLIENT_ID) throw new Error("Missing TRAKT credentials");
    const url = await beginTraktPkce({
      clientId: TRAKT_CLIENT_ID,
      profileId: ProfileManager.getActiveProfileId() || "1",
      runtime
    });
    runtime.location.assign(url);
  },

  /**
   * Finish a sign-in Trakt sent the viewer back from. Called once at startup;
   * does nothing when the address is not a Trakt answer. The result waits for
   * Settings to show it (see takeRedirectResult).
   */
  async completeRedirectAuth({ runtime = globalThis } = {}) {
    const answer = takeTraktPkceCallback({ runtime });
    if (!answer) return null;
    const profileId = answer.profileId || String(ProfileManager.getActiveProfileId() || "1");
    let result;
    if (answer.type !== "code") {
      result = { type: answer.type };
    } else {
      try {
        const response = await fetch(`${apiBaseUrl()}/oauth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            code: answer.code,
            client_id: TRAKT_CLIENT_ID,
            redirect_uri: answer.redirectUri,
            code_verifier: answer.verifier,
            grant_type: "authorization_code"
          }),
          cache: "no-store"
        });
        const payload = await readResponseBody(response);
        if (response.ok && payload?.access_token) {
          TraktAuthStore.saveToken(payload, profileId);
          const username = await fetchUserSettings().catch(() => null);
          result = { type: "approved", username };
        } else {
          result = {
            type: "failed",
            message: normalizeAuthErrorMessage(payload, `Trakt sign-in failed (${response.status})`)
          };
        }
      } catch (error) {
        result = { type: "failed", message: String(error?.message || "Unable to reach Trakt") };
      }
    }
    lastRedirectResult = result;
    return result;
  },

  /** The outcome of the last return from trakt.tv, handed out once. */
  takeRedirectResult() {
    const result = lastRedirectResult;
    lastRedirectResult = null;
    return result;
  },

  async startDeviceAuth() {
    requireSidecarCapability("traktAuth");
    if (!TRAKT_CLIENT_ID) {
      throw new Error("Missing TRAKT credentials");
    }
    if (!(await ensureBrowserAuthBridge())) {
      throw new Error(sidecarUnavailableMessage("traktAuth"));
    }

    const current = TraktAuthStore.get();
    if (current.deviceCode && current.expiresAt && Date.now() < Number(current.expiresAt)) {
      return current;
    }

    const startRequest = () => requestBrowserBridge("/device/code");
    let { response, payload } = await startRequest();

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After") || 0);
      if (retryAfterSeconds >= 1 && retryAfterSeconds <= 10) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
        ({ response, payload } = await startRequest());
      }
    }

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") || 300);
        const minutes = Math.ceil(retryAfter / 60);
        throw new Error(`Trakt is rate limiting requests. Try again in ~${minutes} min`);
      }
      throw new Error(
        normalizeAuthErrorMessage(payload, `Failed to start Trakt auth (${response.status})`)
      );
    }

    return TraktAuthStore.saveDeviceFlow(payload);
  },

  async pollDeviceToken() {
    if (!getSidecarCapabilities().traktAuth) {
      return { type: "failed", message: sidecarUnavailableMessage("traktAuth") };
    }
    if (!hasRequiredCredentials()) {
      return { type: "failed", message: "Missing TRAKT credentials" };
    }
    const state = TraktAuthStore.get();
    if (!state.deviceCode) {
      return { type: "failed", message: "No active Trakt device code" };
    }
    if (state.expiresAt && Date.now() >= Number(state.expiresAt)) {
      TraktAuthStore.clearDeviceFlow();
      return { type: "expired" };
    }

    const { response, payload } = await requestBrowserBridge("/device/token", {
      body: { code: state.deviceCode }
    });

    if (response.ok && payload) {
      TraktAuthStore.saveToken(payload);
      const username = await fetchUserSettings();
      await TraktCredentialSyncService.pushCurrentToRemote();
      return { type: "approved", username };
    }

    if (response.status === 400) {
      return { type: "pending" };
    }
    if (response.status === 409) {
      TraktAuthStore.clearDeviceFlow();
      return { type: "already_used" };
    }
    if (response.status === 410) {
      TraktAuthStore.clearDeviceFlow();
      return { type: "expired" };
    }
    if (response.status === 418) {
      TraktAuthStore.clearDeviceFlow();
      return { type: "denied" };
    }
    if (response.status === 429) {
      const interval = Math.min(60, Math.max(5, Number(state.pollInterval || 5) + 5));
      TraktAuthStore.updatePollInterval(interval);
      return { type: "slow_down", pollIntervalSeconds: interval };
    }
    return {
      type: "failed",
      message: normalizeAuthErrorMessage(payload, `Token polling failed (${response.status})`)
    };
  },

  async refreshTokenIfNeeded(force = false) {
    if (!hasRequiredCredentials()) {
      return false;
    }
    const state = TraktAuthStore.get();
    if (!state.refreshToken) {
      return false;
    }
    if (!force && !isTokenExpiredOrExpiring(state)) {
      return true;
    }

    if (!(await ensureBrowserAuthBridge())) {
      return false;
    }
    const { response, payload } = await requestBrowserBridge("/refresh", {
      body: { refresh_token: state.refreshToken }
    });

    if (!response.ok || !payload) {
      if (response.status === 401 || response.status === 403) {
        const recovered = await TraktCredentialSyncService.pullFromRemote();
        if (recovered && TraktAuthStore.get().refreshToken !== state.refreshToken) {
          return this.refreshTokenIfNeeded(true);
        }
        TraktAuthStore.clearAuth();
      }
      return false;
    }
    TraktAuthStore.saveToken(payload);
    await fetchUserSettings();
    await TraktCredentialSyncService.pushCurrentToRemote();
    return true;
  },

  async getValidAccessToken() {
    if (!getSidecarCapabilities().traktAuth) return null;
    const state = TraktAuthStore.get();
    if (!state.accessToken) {
      return null;
    }
    if (isTokenExpiredOrExpiring(state)) {
      const refreshed = await this.refreshTokenIfNeeded(true);
      if (!refreshed) {
        return null;
      }
      return TraktAuthStore.get().accessToken;
    }
    return state.accessToken;
  },

  async disconnect() {
    await TraktCredentialSyncService.deleteRemote();
    detailWatchedEnrichmentService.invalidateAllCache();
    TraktAuthStore.clearAuth();
  },

  fetchUserSettings,

  async fetchStats(forceRefresh = false) {
    const state = TraktAuthStore.get();
    const username = state.userSlug || state.username;
    if (!username) {
      await fetchUserSettings();
    }
    const nextState = TraktAuthStore.get();
    const userId = nextState.userSlug || nextState.username || "me";
    const token = await this.getValidAccessToken();
    if (!token) {
      return null;
    }
    const cacheKey = `traktCachedStats:${userId}`;
    const cached = forceRefresh ? null : JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - Number(cached.cachedAt || 0) < 60 * 60 * 1000) {
      return cached.stats || null;
    }
    const { response, payload } = await requestJson(`/users/${encodeURIComponent(userId)}/stats`, {
      authorization: `Bearer ${token}`
    });
    if (!response.ok || !payload) {
      return null;
    }
    const stats = {
      moviesWatched: Number(payload.movies?.watched || 0),
      showsWatched: Number(payload.shows?.watched || 0),
      episodesWatched: Number(payload.episodes?.watched || 0),
      totalWatchedHours: Math.round(
        Number(payload.movies?.minutes || 0) / 60 + Number(payload.episodes?.minutes || 0) / 60
      )
    };
    localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: Date.now(), stats }));
    return stats;
  },

  async fetchWatchHistory({ limit = 100 } = {}) {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const allItems = [];
    let page = 1;
    const perPage = Math.min(limit, 100);

    while (allItems.length < limit) {
      const { response, payload } = await requestJson(
        `/sync/history?limit=${perPage}&page=${page}`,
        { authorization: `Bearer ${token}` }
      );
      if (!response.ok || !Array.isArray(payload)) break;

      allItems.push(...payload.map(normalizeHistoryItem).filter(Boolean));
      if (payload.length < perPage) break;
      page++;
    }

    return allItems.slice(0, limit);
  },

  async fetchWatchlist({ limit = 100 } = {}) {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const allItems = [];
    let page = 1;
    const perPage = Math.min(limit, 100);

    while (allItems.length < limit) {
      const { response, payload } = await requestJson(
        `/sync/watchlist?limit=${perPage}&page=${page}`,
        { authorization: `Bearer ${token}` }
      );
      if (!response.ok || !Array.isArray(payload)) break;

      allItems.push(...payload.map(normalizeWatchlistItem).filter(Boolean));
      if (payload.length < perPage) break;
      page++;
    }

    return allItems.slice(0, limit);
  },

  async fetchPlaybackState({ limit = 50 } = {}) {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const { response, payload } = await requestJson(`/sync/playback?limit=${limit}`, {
      authorization: `Bearer ${token}`
    });
    if (!response.ok || !Array.isArray(payload)) return [];

    return payload.map(normalizePlaybackItem).filter(Boolean).slice(0, limit);
  },

  /**
   * Delete Trakt playback entries by id.
   *
   * Only /sync/playback is touched. Trakt watched history lives behind
   * /sync/history and is never removed by a Continue Watching removal.
   */
  async removePlaybackEntries(playbackIds = []) {
    const ids = Array.from(
      new Set(
        (Array.isArray(playbackIds) ? playbackIds : [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );
    if (!ids.length) return { attempted: 0, deleted: 0, failed: 0 };
    const token = await this.getValidAccessToken();
    if (!token) return { attempted: ids.length, deleted: 0, failed: ids.length };

    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const { response } = await requestJson(`/sync/playback/${id}`, {
          method: "DELETE",
          authorization: `Bearer ${token}`
        });
        if (response.ok) {
          deleted += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("[CW] Trakt playback removal failed", id, error);
      }
    }
    return { attempted: ids.length, deleted, failed };
  },

  async fetchWatchedShows() {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const { response, payload } = await requestJson("/sync/watched/shows", {
      authorization: `Bearer ${token}`
    });
    if (!response.ok || !Array.isArray(payload)) return [];

    return payload.map(normalizeWatchedShowItem).filter(Boolean);
  },

  async fetchWatchedMovies() {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const state = TraktAuthStore.get();
    const userId = state.userSlug || state.username || "me";

    const { response, payload } = await requestJson(
      `/users/${encodeURIComponent(userId)}/watched/movies?extended=noseasons`,
      { authorization: `Bearer ${token}` }
    );
    if (!response.ok || !Array.isArray(payload)) return [];

    return payload.map(normalizeWatchedMovieItem).filter(Boolean);
  },

  async fetchWatchedProgress(showTraktId) {
    const token = await this.getValidAccessToken();
    if (!token) return null;

    const { response, payload } = await requestJson(
      `/shows/${encodeURIComponent(showTraktId)}/progress/watched`,
      { authorization: `Bearer ${token}` }
    );
    if (!response.ok || !payload) return null;

    return normalizeWatchedProgress(payload);
  }
};

function normalizeHistoryItem(entry) {
  if (!entry || !entry.watched_at) return null;
  const item = {};
  item.watchedAt = entry.watched_at;
  item.action = "watch";

  if (entry.movie) {
    item.type = "movie";
    item.title = entry.movie.title;
    item.year = entry.movie.year;
    item.tmdbId = entry.movie.ids?.tmdb;
    item.imdbId = entry.movie.ids?.imdb;
    item.traktId = entry.movie.ids?.trakt;
  } else if (entry.show || entry.episode) {
    item.type = "episode";
    item.showTitle = entry.show?.title;
    item.showYear = entry.show?.year;
    item.showTmdbId = entry.show?.ids?.tmdb;
    item.showImdbId = entry.show?.ids?.imdb;
    item.showTraktId = entry.show?.ids?.trakt;
    if (entry.episode) {
      item.seasonNumber = entry.episode.season;
      item.episodeNumber = entry.episode.number;
      item.episodeTitle = entry.episode.title;
      item.episodeTmdbId = entry.episode.ids?.tmdb;
      item.episodeTraktId = entry.episode.ids?.trakt;
    }
  } else {
    return null;
  }
  return item;
}

function normalizeWatchlistItem(entry) {
  if (!entry || !entry.listed_at) return null;
  const item = {};
  item.addedAt = entry.listed_at;
  item.type = entry.type;

  if (entry.movie) {
    item.title = entry.movie.title;
    item.year = entry.movie.year;
    item.tmdbId = entry.movie.ids?.tmdb;
    item.imdbId = entry.movie.ids?.imdb;
    item.traktId = entry.movie.ids?.trakt;
  } else if (entry.show) {
    item.title = entry.show.title;
    item.year = entry.show.year;
    item.tmdbId = entry.show.ids?.tmdb;
    item.imdbId = entry.show.ids?.imdb;
    item.traktId = entry.show.ids?.trakt;
  } else {
    return null;
  }
  return item;
}

function normalizePlaybackItem(entry) {
  if (!entry || entry.progress == null) return null;
  const isEpisode = entry.type === "episode";
  const media = isEpisode ? entry.episode : entry.movie;
  const show = isEpisode ? entry.show : null;
  if (!media) return null;

  const tmdbId = isEpisode ? show?.ids?.tmdb : media.ids?.tmdb;
  const traktId = isEpisode ? show?.ids?.trakt : media.ids?.trakt;
  const contentId = tmdbId ? `tmdb:${tmdbId}` : traktId ? `trakt:${traktId}` : null;
  if (!contentId) return null;

  return {
    type: isEpisode ? "episode" : "movie",
    // Trakt's own playback entry id. Required to remove a paused item:
    // DELETE /sync/playback/{id}. Dropping it made provider removal impossible.
    traktPlaybackId: entry.id == null ? null : Number(entry.id),
    contentId,
    videoId: isEpisode && media.ids?.tmdb ? `tmdb:${media.ids.tmdb}` : contentId,
    progressPercent: Math.max(0, Math.min(100, Number(entry.progress) || 0)),
    pausedAt: entry.paused_at,
    title: isEpisode ? show?.title : media.title,
    year: isEpisode ? show?.year : media.year,
    imdbId: isEpisode ? show?.ids?.imdb : media.ids?.imdb,
    tmdbId,
    traktId,
    seasonNumber: isEpisode ? media.season : undefined,
    episodeNumber: isEpisode ? media.number : undefined,
    episodeTitle: isEpisode ? media.title : undefined
  };
}

function normalizeWatchedShowItem(entry) {
  if (!entry || !entry.show?.ids) return null;
  const show = entry.show;

  const tmdbId = show.ids?.tmdb;
  const traktId = show.ids?.trakt;
  const contentId = tmdbId ? `tmdb:${tmdbId}` : traktId ? `trakt:${traktId}` : null;
  if (!contentId) return null;

  const seasons = Array.isArray(entry.seasons)
    ? entry.seasons
        .map((season) => ({
          number: Number(season?.number || 0),
          episodes: Array.isArray(season?.episodes)
            ? season.episodes
                .map((episode) => ({
                  number: Number(episode?.number || 0),
                  plays: Number(episode?.plays || 0),
                  lastWatchedAt: episode?.last_watched_at || null
                }))
                .filter((episode) => episode.number > 0 && episode.plays > 0)
            : []
        }))
        .filter((season) => season.number > 0 && season.episodes.length)
    : [];

  return {
    type: "series",
    contentId,
    title: show.title,
    year: show.year,
    imdbId: show.ids?.imdb,
    tmdbId,
    traktId,
    plays: Number(entry.plays || 0),
    lastWatchedAt: entry.last_watched_at || null,
    lastUpdatedAt: entry.last_updated_at || null,
    seasons
  };
}

function normalizeWatchedProgress(payload) {
  const map = new Map();

  if (!payload?.seasons || !Array.isArray(payload.seasons)) {
    return map;
  }

  for (const season of payload.seasons) {
    const seasonNumber = season.number;
    if (!season.episodes || !Array.isArray(season.episodes)) continue;

    for (const episode of season.episodes) {
      if (!episode.completed) continue;

      const key = `${seasonNumber}:${episode.number}`;
      map.set(key, {
        isWatched: true,
        watchedAt: episode.last_watched_at || null,
        source: "trakt"
      });
    }
  }

  return map;
}

function normalizeWatchedMovieItem(entry) {
  if (!entry || !entry.movie?.ids) return null;
  const movie = entry.movie;

  const tmdbId = movie.ids?.tmdb;
  const traktId = movie.ids?.trakt;
  const contentId = tmdbId ? `tmdb:${tmdbId}` : traktId ? `trakt:${traktId}` : null;
  if (!contentId) return null;

  return {
    type: "movie",
    contentId,
    title: movie.title,
    year: movie.year,
    imdbId: movie.ids?.imdb,
    tmdbId,
    traktId,
    plays: Number(entry.plays || 0),
    lastWatchedAt: entry.last_watched_at
  };
}
