// Reads claims from a session token for local expiry checks and display only.
// The signature is never checked here; the server stays the authority.

export function isJwtLike(token) {
  return String(token || "").trim().split(".").length === 3;
}

export function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isJwtExpired(token, leewaySeconds = 30) {
  if (!isJwtLike(token)) return true;
  const exp = Number(decodeJwtPayload(token)?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp <= Math.floor(Date.now() / 1000) + leewaySeconds;
}
