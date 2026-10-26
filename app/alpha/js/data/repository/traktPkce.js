// Trakt sign-in for websites: the authorization code flow with PKCE.
//
// Trakt no longer issues client secrets for user sign-in, and its device-code
// poll never hands out a token without one, so a site can only sign in this
// way: send the viewer to Trakt with a one-time challenge, get a code back on
// this site's address, and trade the code plus the matching verifier for a
// token. Nothing here needs a secret or a server.
// https://developer.trakt.tv/docs/pkce

const PENDING_KEY = "traktPkcePending";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;
export const TRAKT_AUTHORIZE_URL = "https://auth.trakt.tv/oauth/authorize";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteLength, cryptoRef = globalThis.crypto) {
  return base64Url(cryptoRef.getRandomValues(new Uint8Array(byteLength)));
}

/** 64 random bytes make an 86-character verifier, inside Trakt's 43-128. */
export function createCodeVerifier(cryptoRef = globalThis.crypto) {
  return randomString(64, cryptoRef);
}

export async function codeChallengeFor(verifier, cryptoRef = globalThis.crypto) {
  const digest = await cryptoRef.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/**
 * Where Trakt sends the viewer back: this site's root. It must match one of
 * the Redirect URIs on the Trakt app exactly, so each site address is listed
 * there (see docs/DEPLOY_PREVIEW.md).
 */
export function traktRedirectUri(runtime = globalThis) {
  const origin = String(runtime?.location?.origin || "");
  return /^https?:\/\//.test(origin) ? `${origin}/` : null;
}

function storage(runtime) {
  try {
    return runtime?.localStorage || null;
  } catch {
    return null;
  }
}

function readPending(runtime) {
  try {
    const value = JSON.parse(storage(runtime)?.getItem(PENDING_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function clearPending(runtime) {
  try {
    storage(runtime)?.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Remember this attempt and return the Trakt address to open. The verifier
 * stays on the device; only its hash goes to Trakt.
 */
export async function beginTraktPkce({ clientId, profileId, runtime = globalThis, now = Date.now() } = {}) {
  const redirectUri = traktRedirectUri(runtime);
  if (!clientId || !redirectUri) throw new Error("Trakt sign-in is not available on this address");
  const verifier = createCodeVerifier(runtime.crypto);
  const state = randomString(24, runtime.crypto);
  storage(runtime)?.setItem(
    PENDING_KEY,
    JSON.stringify({ state, verifier, redirectUri, profileId: String(profileId ?? ""), createdAt: now })
  );
  const url = new URL(TRAKT_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await codeChallengeFor(verifier, runtime.crypto));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Read Trakt's answer from the address this page was opened at. Returns null
 * when the address is not a Trakt answer to an attempt made on this device,
 * so other `code`/`state` parameters are left alone. The parameters are
 * removed from the address bar either way once they are recognised.
 */
export function takeTraktPkceCallback({ runtime = globalThis, now = Date.now() } = {}) {
  let params;
  try {
    params = new URLSearchParams(String(runtime?.location?.search || ""));
  } catch {
    return null;
  }
  const state = params.get("state");
  if (!state || !(params.has("code") || params.has("error"))) return null;
  const pending = readPending(runtime);
  if (!pending || pending.state !== state) return null;
  clearPending(runtime);
  const code = params.get("code");
  const refused = params.has("error");
  try {
    for (const key of ["code", "state", "error", "error_description"]) params.delete(key);
    const query = params.toString();
    runtime.history?.replaceState?.(
      runtime.history.state,
      "",
      `${runtime.location.pathname}${query ? `?${query}` : ""}${runtime.location.hash || ""}`
    );
  } catch {
    // The address bar keeps the parameters; the code is single-use anyway.
  }
  if (refused || !code) {
    return { type: "denied", profileId: pending.profileId };
  }
  if (now - Number(pending.createdAt || 0) > PENDING_MAX_AGE_MS) {
    return { type: "expired", profileId: pending.profileId };
  }
  return {
    type: "code",
    code,
    verifier: pending.verifier,
    redirectUri: pending.redirectUri,
    profileId: pending.profileId
  };
}
