// MDBList tracking calls, straight from the browser to api.mdblist.com with the
// profile's own API key. No server of ours sits between them (ADR-025).
//
// MDBList answers cross-origin requests (`Access-Control-Allow-Origin: *`) but
// rejects the CORS preflight with 405, so every call here is a "simple"
// request: the key travels as the `apikey` query parameter (as the ratings
// lookups already do), no custom headers, and a POST body is JSON sent as
// text/plain, which needs no preflight.

import { MDBLIST_API_BASE_URL } from "../../config.js";
import { MdbListSettingsStore } from "../local/mdbListSettingsStore.js";

const API_BASE_URL = String(MDBLIST_API_BASE_URL || "https://api.mdblist.com/").replace(/\/+$/, "");

export const MdbListTracking = {
  /** Connected for tracking: the switch is on and a key is saved. */
  isAuthenticated(settings = MdbListSettingsStore.get()) {
    return Boolean(settings?.trackingEnabled && String(settings?.apiKey || "").trim());
  },

  apiKey(settings = MdbListSettingsStore.get()) {
    return String(settings?.apiKey || "").trim();
  }
};

async function readBody(response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

/**
 * One MDBList API call. Resolves `{ response, payload }`; a non-2xx status is
 * not thrown here, callers decide (see `mdbListApiJson`).
 */
export async function mdbListApiRequest(
  path,
  { method = "GET", query = null, body = null, apiKey = MdbListTracking.apiKey(), fetchImpl = globalThis.fetch } = {}
) {
  if (!String(path || "").startsWith("/")) throw new Error("Invalid MDBList API path");
  if (!apiKey) {
    const error = new Error("MDBList is not connected");
    error.status = 401;
    throw error;
  }
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  url.searchParams.set("apikey", apiKey);
  const response = await fetchImpl(url.href, {
    method,
    credentials: "omit",
    cache: "no-store",
    // A string body is sent as text/plain: a simple request, no preflight.
    body: body == null ? undefined : JSON.stringify(body)
  });
  return { response, payload: await readBody(response) };
}

/** Like mdbListApiRequest, but throws with `status` when MDBList refuses. */
export async function mdbListApiJson(path, options = {}) {
  const { response, payload } = await mdbListApiRequest(path, options);
  if (!response.ok) {
    const error = new Error(
      (payload && typeof payload === "object" && (payload.error || payload.message)) ||
        `MDBList request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}
