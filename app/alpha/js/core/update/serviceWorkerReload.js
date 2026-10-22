// A new build installs in the background and then waits. The page keeps the
// build it started with until the user chooses to reload, so an update never
// wipes what they were doing. Reloading is two steps: tell the waiting worker
// to take over, then reload once it has (`controllerchange`).

/**
 * Calls `onWaiting(worker)` once for each new worker that is installed and
 * waiting to replace the one controlling this page.
 *
 * @param {object} registration ServiceWorkerRegistration
 * @param {{controller?: object}} serviceWorker navigator.serviceWorker
 * @param {(worker: object) => void} onWaiting
 * @returns {Function} removes the listener
 */
export function watchForWaitingWorker(registration, serviceWorker, onWaiting) {
  if (!registration?.addEventListener || typeof onWaiting !== "function") {
    return () => {};
  }
  const seen = new Set();
  const notify = (worker) => {
    // Without a controller this is the first install: nothing to replace.
    if (!worker || !serviceWorker?.controller || seen.has(worker)) return;
    seen.add(worker);
    onWaiting(worker);
  };

  if (registration.waiting) notify(registration.waiting);

  const onUpdateFound = () => {
    const installing = registration.installing;
    if (!installing?.addEventListener) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") notify(registration.waiting || installing);
    });
  };
  registration.addEventListener("updatefound", onUpdateFound);
  return () => registration.removeEventListener?.("updatefound", onUpdateFound);
}

/**
 * Asks the waiting worker to take over and reloads once it controls the page.
 * Only called from the user's tap on "Reload".
 */
export function activateWaitingWorker(serviceWorker, worker, reload) {
  if (!worker?.postMessage) return;
  let reloading = false;
  serviceWorker?.addEventListener?.("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    if (typeof reload === "function") reload();
  });
  worker.postMessage({ type: "SKIP_WAITING" });
}
