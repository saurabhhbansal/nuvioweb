import { SUPABASE_URL, SUPABASE_ANON_KEY, TV_LOGIN_WEB_BASE_URL } from "../../config.js";
import { Environment } from "../../platform/environment.js";
import { SessionStore } from "../storage/sessionStore.js";
import { AuthManager } from "./authManager.js";
import { fetchSupabaseAuth } from "./supabaseAuthFetch.js";
import { isJwtExpired, isJwtLike } from "./jwt.js";

let lastError = null;
let activeAttempt = null;
let attemptSequence = 0;

function hasQrAuthConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getBearerToken() {
  const token = SessionStore.accessToken;
  if (isJwtLike(token) && !isJwtExpired(token, 0)) {
    return token;
  }
  return SUPABASE_ANON_KEY;
}

function generateDeviceNonce() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(24);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The approval page the QR code points at. Nuvio rejects any base without
// "/tv-login" and appends "?code=..." itself, so the page this app is served
// from (which has no approval page) is never a valid fallback.
export function resolveTvLoginRedirectBase(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || text.includes("?") || text.includes("#")) {
    return null;
  }
  const secure = url.protocol === "https:" ||
    (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname));
  if (!secure) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (!/\/tv-login$/.test(path)) return null;
  return `${url.origin}${path}`;
}

function buildRedirectCandidates() {
  if (!TV_LOGIN_WEB_BASE_URL) return [];
  const base = resolveTvLoginRedirectBase(TV_LOGIN_WEB_BASE_URL);
  if (!base) {
    // Set but unusable: say so, rather than look like it was never set.
    throw new Error("Invalid TV login redirect base URL in configuration");
  }
  return [base];
}

// The QR and link may only point at the approval page this client asked for.
// Anything else in the response (another host or path) is dropped.
export function expectedQrLoginUrl(loginUrl, redirectBase) {
  if (!loginUrl || !redirectBase) return null;
  try {
    const url = new URL(String(loginUrl));
    const base = new URL(redirectBase);
    if (url.username || url.password || url.hash) return null;
    if (url.origin !== base.origin) return null;
    if (url.pathname.replace(/\/+$/, "") !== base.pathname.replace(/\/+$/, "")) return null;
    return url.href;
  } catch {
    return null;
  }
}

function toEpochMillis(session) {
  if (typeof session?.expires_at_millis === "number") {
    return session.expires_at_millis;
  }
  if (session?.expires_at) {
    const parsed = Date.parse(session.expires_at);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now() + 5 * 60 * 1000;
}

function isLegacyStartSignatureError(text) {
  const message = String(text || "").toLowerCase();
  return (
    message.includes("start_tv_login_session") &&
    message.includes("could not find the function") &&
    message.includes("p_device_name")
  );
}

function isCallerSessionRejected(text) {
  const message = String(text || "").toLowerCase();
  return (
    message.includes("http 401") ||
    message.includes("invalid caller session") ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt")
  );
}

async function parseErrorText(response) {
  const status = Number(response?.status || 0);
  try {
    const rawText = await response.text();
    const text = String(rawText || "").trim();
    if (!text) {
      return status ? `HTTP ${status}` : "Request failed";
    }

    try {
      const parsed = JSON.parse(text);
      const jsonMessage = [
        parsed?.msg,
        parsed?.message,
        parsed?.error_description,
        parsed?.error,
        parsed?.hint
      ].find((value) => typeof value === "string" && value.trim());
      if (jsonMessage) {
        return status ? `HTTP ${status}: ${jsonMessage.trim()}` : jsonMessage.trim();
      }
    } catch {
      // Ignore non-JSON payloads.
    }

    const strippedHtml = text
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!strippedHtml) {
      return status ? `HTTP ${status}` : "Request failed";
    }

    if (/<!doctype html>|<html[\s>]/i.test(text) && status) {
      return `HTTP ${status}: ${strippedHtml}`;
    }

    return status ? `HTTP ${status}: ${strippedHtml}` : strippedHtml;
  } catch {
    return status ? `HTTP ${status}` : "Request failed";
  }
}

function extractSessionTokens(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const accessToken =
    payload.access_token || payload.accessToken || payload?.session?.access_token || null;
  const refreshToken =
    payload.refresh_token || payload.refreshToken || payload?.session?.refresh_token || null;
  if (!accessToken || !refreshToken) {
    return null;
  }
  return { accessToken, refreshToken };
}

function redactSecrets(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets) {
    const normalized = String(secret || "").trim();
    if (normalized.length < 4) continue;
    text = text.split(normalized).join("[redacted]");
  }
  return text;
}

function staleAttemptError() {
  const error = new Error("QR login attempt was superseded");
  error.code = "STALE_QR_ATTEMPT";
  return error;
}

function isStaleAttemptError(error) {
  return error?.code === "STALE_QR_ATTEMPT";
}

function beginAttempt() {
  const previous = activeAttempt;
  if (previous?.authAttemptId != null && AuthManager.authAttemptSequence === previous.authAttemptId) {
    AuthManager.beginAuthenticationAttempt();
  }
  if (
    previous?.qrAccessToken &&
    SessionStore.accessToken === previous.qrAccessToken &&
    SessionStore.refreshToken === previous.qrRefreshToken
  ) {
    // An approved exchange's account tokens belong to the superseded attempt.
    // A new QR attempt must start from a fresh anonymous caller, not reuse them.
    SessionStore.clear();
  }
  if (previous) {
    previous.qrAccessToken = null;
    previous.qrRefreshToken = null;
  }
  attemptSequence += 1;
  const attempt = {
    id: attemptSequence,
    sessionGeneration: AuthManager.getSessionGeneration(),
    qrAccessToken: null,
    qrRefreshToken: null
  };
  activeAttempt = attempt;
  return attempt.id;
}

function currentAttempt(attemptId = null) {
  if (!activeAttempt) return null;
  if (attemptId != null && activeAttempt.id !== attemptId) return null;
  return activeAttempt;
}

function attemptIsActive(attempt) {
  return Boolean(attempt) && activeAttempt === attempt &&
    (attempt.expiresAt == null || Date.now() < attempt.expiresAt);
}

function attemptIsOwned(attempt) {
  return attemptIsActive(attempt) &&
    AuthManager.getSessionGeneration() === attempt.sessionGeneration;
}

function assertAttemptOwned(attempt) {
  if (!attemptIsOwned(attempt)) throw staleAttemptError();
}

function cancelAttempt(attemptId = null) {
  if (attemptId == null || activeAttempt?.id === attemptId) {
    const cancelled = activeAttempt;
    activeAttempt = null;
    attemptSequence += 1;
    // A cancel during the final owner resolution must invalidate the
    // establishment that is already in flight, not let it publish afterwards.
    if (cancelled?.authAttemptId != null && AuthManager.authAttemptSequence === cancelled.authAttemptId) {
      AuthManager.beginAuthenticationAttempt();
    }
    // The anonymous caller exists only to start and poll this QR attempt.
    // An approved exchange may already have written the account pair before its
    // owner resolution finished, so clear that pair only while it is still the
    // stored pair. A later session's different tokens are never touched.
    const ownsStoredPair = cancelled?.qrAccessToken &&
      SessionStore.accessToken === cancelled.qrAccessToken &&
      SessionStore.refreshToken === cancelled.qrRefreshToken;
    if (SessionStore.isAnonymousSession || ownsStoredPair) {
      SessionStore.clear();
    }
    if (cancelled) {
      cancelled.qrAccessToken = null;
      cancelled.qrRefreshToken = null;
    }
  }
}

async function ensureQrSessionAuthenticated({ forceNewAnonymous = false, attempt = null } = {}) {
  assertAttemptOwned(attempt);
  // The QR caller is always a fresh anonymous session. A signed-out device
  // may still hold an old account pair (kept for retry after a server error);
  // the exchange would reject it as stale, so drop it here. A live sign-in
  // made elsewhere during this attempt supersedes the attempt instead.
  if (SessionStore.accessToken && !SessionStore.isAnonymousSession) {
    if (AuthManager.isAuthenticated) throw staleAttemptError();
    SessionStore.clear();
  }
  if (forceNewAnonymous || (SessionStore.accessToken && !isJwtLike(SessionStore.accessToken))) {
    SessionStore.clear();
  }
  if (SessionStore.accessToken && SessionStore.isAnonymousSession) {
    if (!isJwtExpired(SessionStore.accessToken)) {
      return true;
    }
    SessionStore.accessToken = null;
    SessionStore.refreshToken = null;
    SessionStore.isAnonymousSession = false;
  }

  const commonHeaders = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`
  };

  const tryAnonymousSignup = async () => {
    const response = await fetchSupabaseAuth("/auth/v1/signup", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        data: { tv_client: "webos" }
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    return text ? JSON.parse(text) : {};
  };

  const tryAnonymousToken = async () => {
    const response = await fetchSupabaseAuth("/auth/v1/token?grant_type=anonymous", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({})
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    return text ? JSON.parse(text) : {};
  };

  let payload;
  try {
    payload = await tryAnonymousSignup();
    assertAttemptOwned(attempt);
  } catch (firstError) {
    if (isStaleAttemptError(firstError)) throw firstError;
    assertAttemptOwned(attempt);
    payload = await tryAnonymousToken();
    assertAttemptOwned(attempt);
  }

  const tokens = extractSessionTokens(payload);
  if (!tokens) {
    throw new Error("Anonymous auth did not return session tokens");
  }

  assertAttemptOwned(attempt);
  SessionStore.accessToken = tokens.accessToken;
  SessionStore.refreshToken = tokens.refreshToken;
  SessionStore.isAnonymousSession = true;
  return true;
}

async function fetchWithCallerSessionRecovery(requestFactory, attempt) {
  await ensureQrSessionAuthenticated({ attempt });
  assertAttemptOwned(attempt);
  let response = await requestFactory();
  assertAttemptOwned(attempt);
  if (response.ok || response.status !== 401) {
    return response;
  }

  const firstErrorText = await parseErrorText(response);
  assertAttemptOwned(attempt);
  if (!isCallerSessionRejected(firstErrorText)) {
    throw new Error(firstErrorText || `HTTP ${response.status}`);
  }

  await ensureQrSessionAuthenticated({ forceNewAnonymous: true, attempt });
  assertAttemptOwned(attempt);
  response = await requestFactory();
  assertAttemptOwned(attempt);
  return response;
}

async function startRpc(deviceNonce, redirectBaseUrl, includeDeviceName, attempt) {
  const payload = {
    p_device_nonce: deviceNonce,
    p_redirect_base_url: redirectBaseUrl
  };
  if (includeDeviceName) {
    payload.p_device_name = Environment.getDeviceLabel();
  }

  const response = await fetchWithCallerSessionRecovery(() =>
    fetchSupabaseAuth("/rest/v1/rpc/start_tv_login_session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${getBearerToken()}`
      },
      body: JSON.stringify(payload)
    }),
    attempt
  );

  if (!response.ok) {
    const errorText = await parseErrorText(response);
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data?.[0] || null;
}

export function isSafeQrLoginUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isSafeQrImageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/["'<>`]/.test(text)) return false;
  if (Array.from(text).some((character) => character.charCodeAt(0) < 32)) return false;
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(text)) {
    return true;
  }
  let url;
  try {
    const baseHref = typeof globalThis.location?.href === "string" ? globalThis.location.href : undefined;
    url = new URL(text, baseHref);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const base = typeof globalThis.location?.href === "string" ? new URL(globalThis.location.href) : null;
  if (!base) return false;
  if (url.protocol === "https:") {
    return url.origin === base.origin;
  }
  if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) {
    return url.origin === base.origin;
  }
  return false;
}

export const QrLoginService = {
  getLastError() {
    return lastError;
  },

  beginAttempt,

  cancelAttempt,

  isAttemptActive(attemptId) {
    return Boolean(currentAttempt(attemptId));
  },

  isSafeQrImageUrl,

  async start(attemptId = null) {
    lastError = null;
    let attempt = null;
    if (attemptId == null) {
      const id = beginAttempt();
      attempt = currentAttempt(id);
    } else {
      attempt = currentAttempt(attemptId);
    }
    if (!attempt) {
      lastError = "QR login attempt is not active";
      return null;
    }
    let deviceNonce = "";
    try {
      if (!hasQrAuthConfig()) {
        throw new Error("QR auth is not configured");
      }
      const redirectCandidates = buildRedirectCandidates();
      if (!redirectCandidates.length) {
        throw new Error("Missing redirect_base_url configuration");
      }
      assertAttemptOwned(attempt);
      await ensureQrSessionAuthenticated({ attempt });
      assertAttemptOwned(attempt);
      deviceNonce = generateDeviceNonce();

      let session = null;
      let lastStartError = null;

      for (const redirectCandidate of redirectCandidates) {
        assertAttemptOwned(attempt);
        try {
          session = await startRpc(deviceNonce, redirectCandidate, true, attempt);
          assertAttemptOwned(attempt);
          if (session) {
            break;
          }
        } catch (error) {
          if (isStaleAttemptError(error)) throw error;
          const message = String(error?.message || "");
          if (isLegacyStartSignatureError(message)) {
            try {
              session = await startRpc(deviceNonce, redirectCandidate, false, attempt);
              assertAttemptOwned(attempt);
              if (session) {
                break;
              }
            } catch (legacyError) {
              if (isStaleAttemptError(legacyError)) throw legacyError;
              lastStartError = legacyError;
              continue;
            }
          }
          lastStartError = error;
          continue;
        }
      }

      assertAttemptOwned(attempt);
      if (!session) {
        if (lastStartError) {
          throw new Error(
            `${lastStartError.message} | tried redirect_base_url: ${redirectCandidates.join(" , ")}`
          );
        }
        throw new Error("Empty response from start_tv_login_session");
      }

      attempt.expiresAt = toEpochMillis(session);
      assertAttemptOwned(attempt);
      return {
        code: session.code,
        loginUrl: expectedQrLoginUrl(session.qr_content || session.web_url, redirectCandidates[0]),
        qrImageUrl: session.qr_image_url || null,
        expiresAt: attempt.expiresAt,
        pollIntervalSeconds: Number(session.poll_interval_seconds || 3),
        deviceNonce,
        attemptId: attempt.id
      };
    } catch (error) {
      if (isStaleAttemptError(error)) {
        lastError = "QR login attempt was superseded";
        cancelAttempt(attempt.id);
        return null;
      }
      lastError = redactSecrets(String(error?.message || "QR start failed"), [deviceNonce]);
      console.error("QR start failed");
      cancelAttempt(attempt.id);
      return null;
    }
  },

  async poll(code, deviceNonce, attemptId = null) {
    lastError = null;
    const attempt = currentAttempt(attemptId);
    if (!attempt) {
      lastError = "QR login attempt is not active";
      return null;
    }
    try {
      if (!hasQrAuthConfig()) {
        lastError = "QR auth is not configured";
        return null;
      }
      const response = await fetchWithCallerSessionRecovery(() =>
        fetchSupabaseAuth("/rest/v1/rpc/poll_tv_login_session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${getBearerToken()}`
          },
          body: JSON.stringify({
            p_code: code,
            p_device_nonce: deviceNonce
          })
        }),
        attempt
      );

      if (!response.ok) {
        lastError = redactSecrets(await parseErrorText(response), [code, deviceNonce]);
        return null;
      }

      const data = await response.json();
      assertAttemptOwned(attempt);
      return data?.[0]?.status || null;
    } catch (error) {
      if (isStaleAttemptError(error)) {
        lastError = "QR login attempt was superseded";
        cancelAttempt(attempt.id);
        return null;
      }
      lastError = redactSecrets(String(error?.message || "QR poll failed"), [code, deviceNonce]);
      console.error("QR poll failed");
      return null;
    }
  },

  exchange(code, deviceNonce, attemptId = null) {
    const attempt = currentAttempt(attemptId);
    if (!attempt) return Promise.resolve(false);
    // Poll callbacks and other callers may overlap. Share the entire exchange,
    // including owner resolution, rather than cancel this attempt's own tokens.
    if (!attempt.exchangePromise) {
      attempt.exchangePromise = this.exchangeOwned(code, deviceNonce, attempt.id);
    }
    return attempt.exchangePromise;
  },

  async exchangeOwned(code, deviceNonce, attemptId) {
    lastError = null;
    const attempt = currentAttempt(attemptId);
    if (!attempt) {
      lastError = "QR login attempt is not active";
      return false;
    }
    let qrAccessToken = null;
    let qrRefreshToken = null;
    try {
      if (!hasQrAuthConfig()) {
        lastError = "QR auth is not configured";
        return false;
      }
      await ensureQrSessionAuthenticated({ attempt });
      assertAttemptOwned(attempt);
      const response = await fetchWithCallerSessionRecovery(() =>
        fetchSupabaseAuth("/functions/v1/tv-logins-exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${getBearerToken()}`
          },
          body: JSON.stringify({
            code,
            device_nonce: deviceNonce
          })
        }),
        attempt
      );
      assertAttemptOwned(attempt);
      if (!response.ok) {
        lastError = redactSecrets(await parseErrorText(response), [code, deviceNonce]);
        console.error("QR exchange rejected");
        return false;
      }

      const result = await response.json();
      assertAttemptOwned(attempt);
      if (!SessionStore.isAnonymousSession) throw staleAttemptError();
      const tokens = extractSessionTokens(result) || {
        accessToken: result?.access_token || null,
        refreshToken: result?.refresh_token || null
      };
      if (!tokens?.accessToken || !tokens?.refreshToken) {
        lastError = "QR exchange missing session tokens";
        return false;
      }
      qrAccessToken = tokens.accessToken;
      qrRefreshToken = tokens.refreshToken;
      attempt.qrAccessToken = qrAccessToken;
      attempt.qrRefreshToken = qrRefreshToken;
      SessionStore.accessToken = qrAccessToken;
      SessionStore.refreshToken = qrRefreshToken;
      SessionStore.isAnonymousSession = false;
      const authAttempt = AuthManager.beginAuthenticationAttempt();
      attempt.authAttemptId = authAttempt;
      await AuthManager.establishAuthenticatedSession(authAttempt, {
        canPublish: () => attemptIsActive(attempt)
      });
      attempt.authAttemptId = null;
      attempt.qrAccessToken = null;
      attempt.qrRefreshToken = null;
      cancelAttempt(attempt.id);
      return result;
    } catch (error) {
      if (isStaleAttemptError(error)) {
        lastError = "QR login attempt was superseded";
        attempt.authAttemptId = null;
        cancelAttempt(attempt.id);
        return false;
      }
      const authAttempt = attempt.authAttemptId;
      const superseded = error?.code === "AUTH_PUBLICATION_CANCELLED" ||
        (authAttempt != null && AuthManager.authAttemptSequence !== authAttempt);
      const newerAttemptActive = activeAttempt != null && activeAttempt !== attempt;
      if (!superseded && authAttempt != null) {
        // This exchange still owns the current authentication attempt, so a
        // failed establishment must fail closed and clear its local session.
        await AuthManager.signOut().catch(() => {});
      } else if (!newerAttemptActive && qrAccessToken && SessionStore.accessToken === qrAccessToken && SessionStore.refreshToken === qrRefreshToken) {
        // A later session (not another QR attempt) owns the store; remove only
        // the QR token pair this exchange wrote. If a new QR attempt is active,
        // beginAttempt already discarded the old pair.
        SessionStore.clear();
      }
      attempt.authAttemptId = null;
      attempt.qrAccessToken = null;
      attempt.qrRefreshToken = null;
      lastError = "QR exchange could not establish the session";
      console.error("QR exchange failed");
      cancelAttempt(attempt.id);
      return false;
    }
  },

  cleanup() {
    cancelAttempt();
  }
};
