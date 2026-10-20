import { AuthState } from "./authState.js";
import { clearAccountLocalData, resetAccountRuntimeState } from "./accountLocalDataReset.js";
import { SessionStore } from "../storage/sessionStore.js";
import { SUPABASE_ANON_KEY } from "../../config.js";
import { fetchSupabaseAuth } from "./supabaseAuthFetch.js";

const ACCOUNT_OWNER_MARKER_KEY = "nuvioAccountOwnerMarker";

function isJwtLike(token) {
  const value = String(token || "").trim();
  return value.split(".").length === 3;
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isJwtExpired(token, leewaySeconds = 30) {
  if (!isJwtLike(token)) {
    return true;
  }
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp <= nowSeconds + leewaySeconds;
}

function isTransientNetworkError(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return (
    name === "typeerror" ||
    name === "aborterror" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed") ||
    message.includes("internet") ||
    message.includes("offline")
  );
}

function getStoredAccountOwnerMarker() {
  try {
    return String(globalThis.localStorage?.getItem(ACCOUNT_OWNER_MARKER_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

function createOwnerResponseError(response, message) {
  const error = new Error(message || `Unable to resolve sync owner (${response?.status || "unknown"})`);
  error.status = Number(response?.status || 0) || null;
  return error;
}

class AuthManagerClass {
  constructor() {
    this.state = AuthState.LOADING;
    this.listeners = [];
    this.cachedEffectiveUserId = null;
    this.cachedEffectiveUserSourceUserId = null;
    this.refreshPromise = null;
    this.lastRefreshFailureKind = null;
    this.sessionGeneration = 0;
    this.authAttemptSequence = 0;
  }

  // ------------------------------------
  // SUBSCRIBE (equivalente StateFlow)
  // ------------------------------------
  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  setState(newState) {
    this.state = newState;
    this.listeners.forEach((l) => l(newState));
  }

  // ------------------------------------
  // BOOTSTRAP (equivalente observeSessionStatus)
  // ------------------------------------
  async bootstrap() {
    const authAttempt = this.beginAuthenticationAttempt();
    const sessionGeneration = this.sessionGeneration;
    const token = SessionStore.accessToken;

    if (!token) {
      this.setState(AuthState.SIGNED_OUT);
      return;
    }

    if (SessionStore.isAnonymousSession) {
      this.setState(AuthState.SIGNED_OUT);
      return;
    }

    const refreshed = await this.refreshSessionIfNeeded();
    if (authAttempt !== this.authAttemptSequence || sessionGeneration !== this.sessionGeneration) return;
    if (!refreshed) {
      // Signing out here stops every cloud pull and push for the rest of the
      // run, and nothing retries afterwards -- so a session lost to a bad
      // moment on the network looks exactly like a session the server
      // rejected. `lastRefreshFailureKind` is the one fact that tells them
      // apart, and it was never recorded anywhere the device could show it.
      console.warn(`[Auth] bootstrap signed out: refresh ${this.lastRefreshFailureKind}`);
      this.setState(AuthState.SIGNED_OUT);
      return;
    }

    await this.establishAuthenticatedSession(authAttempt);
  }

  getAuthState() {
    return this.state;
  }

  get isAuthenticated() {
    return this.state === AuthState.AUTHENTICATED;
  }

  wasLastSessionRefreshTransientFailure() {
    return this.lastRefreshFailureKind === "transient";
  }

  isAccessTokenExpired(leewaySeconds = 30) {
    return isJwtExpired(SessionStore.accessToken, leewaySeconds);
  }

  // ------------------------------------
  // EMAIL LOGIN
  // ------------------------------------
  async signInWithEmail(email, password) {
    const authAttempt = this.beginAuthenticationAttempt();
    const sessionGeneration = this.sessionGeneration;
    const res = await fetchSupabaseAuth("/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });

    if (authAttempt !== this.authAttemptSequence || sessionGeneration !== this.sessionGeneration) {
      throw new Error("Session changed during sign-in");
    }
    if (!res.ok) throw new Error("Login failed");

    const data = await res.json();
    if (authAttempt !== this.authAttemptSequence || sessionGeneration !== this.sessionGeneration) {
      throw new Error("Session changed during sign-in");
    }

    const writtenAccess = data.access_token;
    const writtenRefresh = data.refresh_token;
    SessionStore.accessToken = writtenAccess;
    SessionStore.refreshToken = writtenRefresh;
    SessionStore.isAnonymousSession = false;

    try {
      await this.establishAuthenticatedSession(authAttempt);
    } catch (error) {
      if (authAttempt === this.authAttemptSequence) {
        await this.signOut().catch(() => {});
      } else if (SessionStore.accessToken === writtenAccess && SessionStore.refreshToken === writtenRefresh) {
        SessionStore.clear();
      }
      throw error;
    }
  }

  async signOut() {
    this.sessionGeneration += 1;
    this.authAttemptSequence += 1;
    this.refreshPromise = null;
    SessionStore.clear();
    this.cachedEffectiveUserId = null;
    this.cachedEffectiveUserSourceUserId = null;
    this.setState(AuthState.SIGNED_OUT);
    clearAccountLocalData();
    await resetAccountRuntimeState();
  }

  getSessionGeneration() {
    return this.sessionGeneration;
  }

  beginAuthenticationAttempt() {
    this.authAttemptSequence += 1;
    return this.authAttemptSequence;
  }

  isSessionCurrent(generation) {
    return this.state === AuthState.AUTHENTICATED && generation === this.sessionGeneration;
  }

  async establishAuthenticatedSession(expectedAuthAttempt = null, { canPublish = null } = {}) {
    const authAttempt = expectedAuthAttempt ?? this.authAttemptSequence;
    const checkAuthAttempt = () => {
      if (authAttempt !== this.authAttemptSequence) {
        throw new Error("Authentication attempt was superseded");
      }
      if (typeof canPublish === "function" && !canPublish()) {
        throw new Error("Authentication publication was cancelled");
      }
    };
    checkAuthAttempt();
    // Always resolve the owner again before profile routing. A host may replace
    // a session without an explicit sign-out, and profile index alone is not an
    // account boundary.
    this.cachedEffectiveUserId = null;
    let ownerId = "";
    try {
      ownerId = String(await this.getEffectiveUserId()).trim();
    } catch (error) {
      const cachedOwner = getStoredAccountOwnerMarker();
      // A cached owner is only trusted for a previously authenticated local
      // session when owner verification itself cannot reach the backend. HTTP
      // rejections and malformed responses remain authoritative failures.
      if (
        !SessionStore.accessToken ||
        !cachedOwner ||
        Number(error?.status || 0) > 0 ||
        !isTransientNetworkError(error)
      ) {
        throw error;
      }
      ownerId = cachedOwner;
    }
    checkAuthAttempt();
    if (!ownerId) {
      throw new Error("Missing valid sync owner");
    }
    const previousOwner = getStoredAccountOwnerMarker() || null;

    // A missing marker is treated conservatively during migration: account
    // state is cleared once, then rehydrated from the authenticated owner.
    let sessionGeneration = this.sessionGeneration;
    if (!previousOwner || previousOwner !== ownerId) {
      this.sessionGeneration += 1;
      sessionGeneration = this.sessionGeneration;
      checkAuthAttempt();
      this.setState(AuthState.LOADING);
      clearAccountLocalData();
      await resetAccountRuntimeState();
      if (sessionGeneration !== this.sessionGeneration) {
        throw new Error("Authentication attempt was superseded");
      }
      checkAuthAttempt();
    }

    try {
      globalThis.localStorage?.setItem?.(ACCOUNT_OWNER_MARKER_KEY, ownerId);
    } catch (_) {}
    this.cachedEffectiveUserId = ownerId;
    if (sessionGeneration !== this.sessionGeneration) {
      throw new Error("Authentication attempt was superseded");
    }
    checkAuthAttempt();
    this.setState(AuthState.AUTHENTICATED);
  }

  async refreshSessionIfNeeded({ force = false } = {}) {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.lastRefreshFailureKind = null;
    const accessToken = SessionStore.accessToken;
    const refreshToken = SessionStore.refreshToken;
    const sessionGeneration = this.sessionGeneration;
    const ownsSession = () =>
      sessionGeneration === this.sessionGeneration &&
      SessionStore.accessToken === accessToken &&
      SessionStore.refreshToken === refreshToken;
    if (!refreshToken) {
      return Boolean(accessToken) && !isJwtExpired(accessToken, 0);
    }

    if (!force && accessToken && !isJwtExpired(accessToken)) {
      return true;
    }

    const refreshPromise = (async () => {
      try {
        const res = await fetchSupabaseAuth("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!ownsSession()) return false;
        if (!res.ok) {
          this.lastRefreshFailureKind = "rejected";
          return false;
        }
        const data = await res.json();
        if (!ownsSession()) return false;
        if (!data?.access_token) {
          this.lastRefreshFailureKind = "invalid";
          return false;
        }
        SessionStore.accessToken = data.access_token;
        if (data.refresh_token) {
          SessionStore.refreshToken = data.refresh_token;
        }
        this.lastRefreshFailureKind = null;
        return true;
      } catch (error) {
        if (!ownsSession()) return false;
        console.warn("Session refresh failed", error);
        if (isTransientNetworkError(error) && accessToken) {
          this.lastRefreshFailureKind = "transient";
          return true;
        }
        this.lastRefreshFailureKind = "failed";
        return false;
      } finally {
        if (this.refreshPromise === refreshPromise) this.refreshPromise = null;
      }
    })();
    this.refreshPromise = refreshPromise;

    return refreshPromise;
  }

  // ------------------------------------
  // QR LOGIN FLOW
  // ------------------------------------

  async startTvLoginSession(deviceNonce, deviceName, redirectBaseUrl) {
    const res = await fetchSupabaseAuth("/rest/v1/rpc/start_tv_login_session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SessionStore.accessToken}`
      },
      body: JSON.stringify({
        p_device_nonce: deviceNonce,
        p_redirect_base_url: redirectBaseUrl,
        ...(deviceName && { p_device_name: deviceName })
      })
    });

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    return data[0];
  }

  async pollTvLoginSession(code, deviceNonce) {
    const res = await fetchSupabaseAuth("/rest/v1/rpc/poll_tv_login_session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SessionStore.accessToken}`
      },
      body: JSON.stringify({
        p_code: code,
        p_device_nonce: deviceNonce
      })
    });

    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    return data[0];
  }

  async exchangeTvLoginSession(code, deviceNonce) {
    const authAttempt = this.beginAuthenticationAttempt();
    const sessionGeneration = this.sessionGeneration;
    const res = await fetchSupabaseAuth("/functions/v1/tv-logins-exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SessionStore.accessToken}`
      },
      body: JSON.stringify({
        code,
        device_nonce: deviceNonce
      })
    });

    if (authAttempt !== this.authAttemptSequence || sessionGeneration !== this.sessionGeneration) {
      throw new Error("Session changed during TV login exchange");
    }
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    if (authAttempt !== this.authAttemptSequence || sessionGeneration !== this.sessionGeneration) {
      throw new Error("Session changed during TV login exchange");
    }

    const writtenAccess = data.accessToken;
    const writtenRefresh = data.refreshToken;
    SessionStore.accessToken = writtenAccess;
    SessionStore.refreshToken = writtenRefresh;

    try {
      await this.establishAuthenticatedSession(authAttempt);
    } catch (error) {
      if (authAttempt === this.authAttemptSequence) {
        await this.signOut().catch(() => {});
      } else if (SessionStore.accessToken === writtenAccess && SessionStore.refreshToken === writtenRefresh) {
        SessionStore.clear();
      }
      throw error;
    }
  }

  // ------------------------------------
  // EFFECTIVE USER ID (PORTING CACHE LOGIC)
  // ------------------------------------

  async getEffectiveUserId() {
    if (this.cachedEffectiveUserId) return this.cachedEffectiveUserId;

    const sessionGeneration = this.sessionGeneration;

    if (!SessionStore.accessToken) {
      const refreshed = await this.refreshSessionIfNeeded();
      if (!refreshed || !SessionStore.accessToken) {
        await this.signOut();
        throw new Error("Missing valid session token");
      }
    }

    const authHeaders = {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SessionStore.accessToken}`
    };

    let res = await fetchSupabaseAuth("/rest/v1/rpc/get_sync_owner", {
      method: "POST",
      headers: authHeaders
    });

    if (sessionGeneration !== this.sessionGeneration) {
      throw new Error("Session changed while resolving sync owner");
    }

    if (res.status === 401) {
      const refreshed = await this.refreshSessionIfNeeded();
      if (refreshed) {
        res = await fetchSupabaseAuth("/rest/v1/rpc/get_sync_owner", {
          method: "POST",
          headers: {
            ...authHeaders,
            Authorization: `Bearer ${SessionStore.accessToken}`
          }
        });
        if (sessionGeneration !== this.sessionGeneration) {
          throw new Error("Session changed while resolving sync owner");
        }
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        await this.signOut();
      }
      throw createOwnerResponseError(res, await res.text());
    }

    const data = await res.json();
    const id = typeof data === "string" ? data.trim() : "";
    if (!id) {
      throw new Error("Invalid sync owner response");
    }

    if (sessionGeneration !== this.sessionGeneration) {
      throw new Error("Session changed while resolving sync owner");
    }
    this.cachedEffectiveUserId = id;
    return id;
  }
}

export const AuthManager = new AuthManagerClass();
