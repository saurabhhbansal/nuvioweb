import { AuthState } from "./authState.js";
import { clearAccountLocalData, resetAccountRuntimeState } from "./accountLocalDataReset.js";
import { SessionStore } from "../storage/sessionStore.js";
import { SUPABASE_ANON_KEY } from "../../config.js";
import { fetchSupabaseAuth } from "./supabaseAuthFetch.js";
import { isJwtExpired } from "./jwt.js";

const ACCOUNT_OWNER_MARKER_KEY = "nuvioAccountOwnerMarker";
const SESSION_RETRY_MS = 60000;

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

// The server could not answer (outage, rate limit or no network). That says
// nothing about whether the session is still valid.
function isServerUnavailable(error) {
  const status = Number(error?.status || 0);
  if (status > 0) return status >= 500 || status === 429;
  return isTransientNetworkError(error);
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
    this.refreshPromise = null;
    this.lastRefreshFailureKind = null;
    this.sessionGeneration = 0;
    this.authAttemptSequence = 0;
    this.sessionRetryTimer = null;
    this.sessionRetryListener = null;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // A listener that throws must not stop the others from hearing the change,
  // nor abort whatever changed the state (sign-out above all).
  setState(newState, detail = {}) {
    this.state = newState;
    this.listeners.slice().forEach((listener) => {
      try {
        listener(newState, detail);
      } catch (error) {
        console.warn(`[Auth] state listener failed (${error?.name || "error"})`);
      }
    });
  }

  async bootstrap() {
    const authAttempt = this.beginAuthenticationAttempt();
    const sessionGeneration = this.sessionGeneration;
    const isCurrent = () =>
      authAttempt === this.authAttemptSequence && sessionGeneration === this.sessionGeneration;

    if (!SessionStore.accessToken || SessionStore.isAnonymousSession) {
      this.setState(AuthState.SIGNED_OUT);
      return;
    }

    const refreshed = await this.refreshSessionIfNeeded();
    if (!isCurrent()) return;
    if (!refreshed) {
      console.warn(`[Auth] bootstrap refresh ${this.lastRefreshFailureKind}`);
      if (this.lastRefreshFailureKind === "rejected") {
        await this.signOut();
        return;
      }
      // The server or network failed. Keep the tokens, continue with the
      // account this device last verified, and try again later.
      this.scheduleSessionRetry();
      if (!this.resumeWithCachedOwner()) this.setState(AuthState.SIGNED_OUT);
      return;
    }

    try {
      await this.establishAuthenticatedSession(authAttempt);
      if (this.lastRefreshFailureKind === "transient") this.scheduleSessionRetry();
    } catch (error) {
      if (!isCurrent()) return;
      console.warn(`[Auth] bootstrap could not confirm the account (${error?.status || "no status"})`);
      if (isServerUnavailable(error)) this.scheduleSessionRetry();
      if (this.state !== AuthState.SIGNED_OUT) this.setState(AuthState.SIGNED_OUT);
    }
  }

  resumeWithCachedOwner() {
    const cachedOwner = getStoredAccountOwnerMarker();
    if (!cachedOwner || !SessionStore.accessToken) return false;
    this.cachedEffectiveUserId = cachedOwner;
    this.setState(AuthState.AUTHENTICATED);
    return true;
  }

  // After a startup that could not reach the server, try again when the
  // browser comes back online or after SESSION_RETRY_MS, whichever is first.
  scheduleSessionRetry() {
    this.clearSessionRetry();
    const generation = this.sessionGeneration;
    const retry = () => {
      this.clearSessionRetry();
      if (generation === this.sessionGeneration) void this.retrySession();
    };
    this.sessionRetryTimer = setTimeout(retry, SESSION_RETRY_MS);
    this.sessionRetryTimer?.unref?.();
    if (typeof globalThis.addEventListener === "function") {
      this.sessionRetryListener = retry;
      globalThis.addEventListener("online", retry);
    }
  }

  clearSessionRetry() {
    if (this.sessionRetryTimer) clearTimeout(this.sessionRetryTimer);
    this.sessionRetryTimer = null;
    if (this.sessionRetryListener && typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("online", this.sessionRetryListener);
    }
    this.sessionRetryListener = null;
  }

  async retrySession() {
    if (this.state !== AuthState.AUTHENTICATED) {
      if (SessionStore.accessToken && !SessionStore.isAnonymousSession) await this.bootstrap();
      return;
    }
    const generation = this.sessionGeneration;
    const refreshed = await this.refreshSessionIfNeeded();
    if (generation !== this.sessionGeneration) return;
    if (!refreshed && this.lastRefreshFailureKind === "rejected") {
      await this.signOut();
    } else if (!refreshed || this.lastRefreshFailureKind === "transient") {
      this.scheduleSessionRetry();
    }
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

  // Purely local and always completes: nothing here waits on the network.
  // The account's data is gone before anyone is told, so a listener (or the
  // screen it opens) can never see the previous account's data.
  async signOut() {
    const wasAuthenticated = this.state === AuthState.AUTHENTICATED;
    this.sessionGeneration += 1;
    this.authAttemptSequence += 1;
    this.refreshPromise = null;
    this.clearSessionRetry();
    this.cachedEffectiveUserId = null;
    try {
      SessionStore.clear();
    } catch (_) {}
    try {
      clearAccountLocalData();
    } catch (_) {}
    // The marker exists to recognise the same account at a later startup. Once
    // signed out there is no account to recognise, and keeping it would let
    // the next sign-in fall back to this account's owner if the owner lookup
    // fails.
    try {
      globalThis.localStorage?.removeItem?.(ACCOUNT_OWNER_MARKER_KEY);
    } catch (_) {}
    this.setState(AuthState.SIGNED_OUT, { reason: "signOut", wasAuthenticated });
    try {
      await resetAccountRuntimeState();
    } catch (_) {}
  }

  getSessionGeneration() {
    return this.sessionGeneration;
  }

  beginAuthenticationAttempt() {
    // A new sign-in or startup owns the session now; a pending retry must not
    // start a competing attempt in the middle of it.
    this.clearSessionRetry();
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
        const error = new Error("Authentication publication was cancelled");
        error.code = "AUTH_PUBLICATION_CANCELLED";
        throw error;
      }
    };
    checkAuthAttempt();
    // Always resolve the owner again before profile routing. A host may replace
    // a session without an explicit sign-out, and profile index alone is not an
    // account boundary.
    this.cachedEffectiveUserId = null;
    let ownerId = "";
    try {
      ownerId = String(await this.getEffectiveUserId({ assertCurrent: checkAuthAttempt, cacheResult: false })).trim();
    } catch (error) {
      const cachedOwner = getStoredAccountOwnerMarker();
      // A cached owner is trusted only for a session this device already
      // verified, and only when the server could not answer. 4xx rejections
      // and malformed responses stay authoritative failures.
      if (!SessionStore.accessToken || !cachedOwner || !isServerUnavailable(error)) {
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
    if (!refreshToken) {
      const usable = Boolean(accessToken) && !isJwtExpired(accessToken, 0);
      // An expired token with nothing to refresh it can never recover.
      if (!usable) this.lastRefreshFailureKind = "rejected";
      return usable;
    }

    if (!force && accessToken && !isJwtExpired(accessToken)) {
      return true;
    }

    const ownerAtStart = getStoredAccountOwnerMarker();
    const tokensUnchanged = () =>
      SessionStore.accessToken === accessToken && SessionStore.refreshToken === refreshToken;
    // Another tab or the installed app shares this session and may rotate the
    // token pair first. Its new pair is then the session: a rejection of the
    // old refresh token is expected and must not sign this device out. A pair
    // for a different account (the other tab signed in as someone else) is
    // never adopted.
    const adoptStoredTokens = () => {
      this.lastRefreshFailureKind = null;
      if (getStoredAccountOwnerMarker() !== ownerAtStart) return false;
      return Boolean(SessionStore.accessToken) && !isJwtExpired(SessionStore.accessToken, 0);
    };

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
        if (sessionGeneration !== this.sessionGeneration) return false;
        if (!tokensUnchanged()) return adoptStoredTokens();
        if (!res.ok) {
          this.lastRefreshFailureKind = [400, 401, 403].includes(res.status) ? "rejected" : "unavailable";
          return false;
        }
        const data = await res.json();
        if (sessionGeneration !== this.sessionGeneration) return false;
        if (!tokensUnchanged()) return adoptStoredTokens();
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
        if (sessionGeneration !== this.sessionGeneration) return false;
        if (!tokensUnchanged()) return adoptStoredTokens();
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

  async getEffectiveUserId({ assertCurrent = () => {}, cacheResult = true } = {}) {
    const sessionGeneration = this.sessionGeneration;
    const checkCurrent = () => {
      assertCurrent();
      if (sessionGeneration !== this.sessionGeneration) {
        throw new Error("Session changed while resolving sync owner");
      }
    };
    checkCurrent();
    if (this.cachedEffectiveUserId) return this.cachedEffectiveUserId;

    if (!SessionStore.accessToken) {
      const refreshed = await this.refreshSessionIfNeeded();
      checkCurrent();
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
      method: "POST", headers: authHeaders
    });
    checkCurrent();
    if (res.status === 401) {
      const refreshed = await this.refreshSessionIfNeeded();
      checkCurrent();
      if (refreshed) {
        res = await fetchSupabaseAuth("/rest/v1/rpc/get_sync_owner", {
          method: "POST",
          headers: { ...authHeaders, Authorization: `Bearer ${SessionStore.accessToken}` }
        });
        checkCurrent();
      }
    }
    if (!res.ok) {
      const responseText = await res.text();
      checkCurrent();
      if (res.status === 401) await this.signOut();
      throw createOwnerResponseError(res, responseText);
    }
    const data = await res.json();
    checkCurrent();
    const id = typeof data === "string" ? data.trim() : "";
    if (!id) throw new Error("Invalid sync owner response");
    if (cacheResult) this.cachedEffectiveUserId = id;
    return id;
  }
}

export const AuthManager = new AuthManagerClass();
