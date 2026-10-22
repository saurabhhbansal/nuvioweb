import assert from "node:assert/strict";
import test from "node:test";
import { installOfflineNotice } from "./offlineNotice.js";

function fakeDom() {
  const nodes = new Map();
  const body = {
    appendChild(node) {
      nodes.set(node.id, node);
      node.remove = () => nodes.delete(node.id);
    }
  };
  return {
    body,
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => ({ setAttribute() {} }),
    nodes
  };
}

function fakeRuntime(onLine) {
  const listeners = new Map();
  return {
    navigator: { onLine },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    fire(type) {
      this.navigator.onLine = type === "online";
      listeners.get(type)?.();
    },
    listeners
  };
}

test("the offline notice appears when the connection drops and goes when it returns", () => {
  const documentRef = fakeDom();
  const runtime = fakeRuntime(true);
  const stop = installOfflineNotice({ runtime, documentRef });
  assert.equal(documentRef.nodes.size, 0);

  runtime.fire("offline");
  const notice = documentRef.getElementById("app-offline-notice");
  assert.ok(notice);
  assert.match(notice.textContent, /offline/i);

  runtime.fire("offline");
  assert.equal(documentRef.nodes.size, 1, "never stacks a second notice");

  runtime.fire("online");
  assert.equal(documentRef.getElementById("app-offline-notice"), null);

  stop();
  assert.equal(runtime.listeners.size, 0);
});

test("a page that starts offline shows the notice straight away", () => {
  const documentRef = fakeDom();
  installOfflineNotice({ runtime: fakeRuntime(false), documentRef });
  assert.ok(documentRef.getElementById("app-offline-notice"));
});
