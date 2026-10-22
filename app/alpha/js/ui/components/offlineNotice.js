import { I18n } from "../../i18n/index.js";

const NOTICE_ID = "app-offline-notice";

function isOffline(runtime) {
  return runtime?.navigator?.onLine === false;
}

function render(documentRef, offline) {
  const existing = documentRef.getElementById(NOTICE_ID);
  if (!offline) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const notice = documentRef.createElement("div");
  notice.id = NOTICE_ID;
  notice.className = "app-offline-notice";
  notice.setAttribute("role", "status");
  notice.textContent = I18n.t(
    "offline_notice",
    {},
    { fallback: "You're offline. Showing what's saved on this device." }
  );
  documentRef.body?.appendChild(notice);
}

/**
 * Shows a small notice while the browser reports no connection.
 * @returns {Function} removes the listeners
 */
export function installOfflineNotice({
  runtime = globalThis,
  documentRef = globalThis.document
} = {}) {
  if (!runtime?.addEventListener || !documentRef?.body) {
    return () => {};
  }
  const update = () => render(documentRef, isOffline(runtime));
  runtime.addEventListener("online", update);
  runtime.addEventListener("offline", update);
  update();
  return () => {
    runtime.removeEventListener?.("online", update);
    runtime.removeEventListener?.("offline", update);
  };
}
