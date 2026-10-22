import assert from "node:assert/strict";
import test from "node:test";
import { activateWaitingWorker, watchForWaitingWorker } from "./serviceWorkerReload.js";

function emitter(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) || []), handler]);
    },
    removeEventListener(type, handler) {
      listeners.set(
        type,
        (listeners.get(type) || []).filter((entry) => entry !== handler)
      );
    },
    emit(type) {
      for (const handler of listeners.get(type) || []) handler({ type });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    }
  };
}

function fakeWorker(state = "installing") {
  const worker = emitter({ state, messages: [] });
  worker.postMessage = (message) => worker.messages.push(message);
  return worker;
}

test("a worker already waiting when the page loads is offered once", () => {
  const waiting = fakeWorker("installed");
  const registration = emitter({ waiting });
  const offered = [];
  watchForWaitingWorker(registration, { controller: {} }, (worker) => offered.push(worker));
  assert.deepEqual(offered, [waiting]);
});

test("a worker that finishes installing while the page is open is offered", () => {
  const registration = emitter({ waiting: null, installing: null });
  const offered = [];
  watchForWaitingWorker(registration, { controller: {} }, (worker) => offered.push(worker));

  const installing = fakeWorker();
  registration.installing = installing;
  registration.emit("updatefound");
  assert.equal(offered.length, 0, "nothing to offer until it has installed");

  installing.state = "installed";
  registration.waiting = installing;
  installing.emit("statechange");
  installing.emit("statechange");
  assert.deepEqual(offered, [installing]);
});

test("the first install, with no controller to replace, offers nothing", () => {
  const registration = emitter({ waiting: fakeWorker("installed") });
  const offered = [];
  watchForWaitingWorker(registration, { controller: null }, (worker) => offered.push(worker));
  assert.equal(offered.length, 0);
});

test("nothing reloads until the user accepts, then reload follows the takeover", () => {
  const serviceWorker = emitter({ controller: {} });
  const waiting = fakeWorker("installed");
  let reloads = 0;

  // Being offered an update changes nothing on its own.
  serviceWorker.emit("controllerchange");
  assert.equal(reloads, 0);

  activateWaitingWorker(serviceWorker, waiting, () => {
    reloads += 1;
  });
  assert.deepEqual(waiting.messages, [{ type: "SKIP_WAITING" }]);
  assert.equal(reloads, 0, "reload waits for the new worker to take control");

  serviceWorker.emit("controllerchange");
  serviceWorker.emit("controllerchange");
  assert.equal(reloads, 1);
});

test("teardown detaches the update listener", () => {
  const registration = emitter({ waiting: null });
  const stop = watchForWaitingWorker(registration, { controller: {} }, () => {});
  assert.equal(registration.listenerCount("updatefound"), 1);
  stop();
  assert.equal(registration.listenerCount("updatefound"), 0);
});

test("missing service worker support is left alone", () => {
  assert.doesNotThrow(() => watchForWaitingWorker(null, null, () => {})());
  assert.doesNotThrow(() => activateWaitingWorker(null, null, () => {}));
});
