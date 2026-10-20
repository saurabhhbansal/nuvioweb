import test from "node:test";
import assert from "node:assert/strict";
import { engineLaunchOptions } from "./engine-launch-options.mjs";

test("stock CI launch remains stock, and no sandbox-bypass flags are added", () => {
  assert.deepEqual(engineLaunchOptions("webkit", {}), {});
  assert.deepEqual(engineLaunchOptions("firefox", {}), {});
  assert.deepEqual(engineLaunchOptions("chromium", {}), {});
});

test("private launch changes only child environment and explicit executable", () => {
  const env = { PATH: "/bin", NUVIO_ENGINE_TOOL_ROOT: "/test/private", NUVIO_WEBKIT_ROOT: "/test/webkit", NUVIO_WEBKIT_EXECUTABLE: "/test/webkit/bin/MiniBrowser", NUVIO_FIREFOX_EXECUTABLE: "/test/gecko/firefox" };
  const before = { ...env };
  const options = engineLaunchOptions("webkit", env);
  assert.deepEqual(env, before);
  assert.equal(options.executablePath, env.NUVIO_WEBKIT_EXECUTABLE);
  assert.equal(options.env.HOME, "/test/private/home");
  assert(options.env.LD_LIBRARY_PATH.startsWith("/test/webkit/lib:/test/webkit/sys/lib:"));
  assert.equal(options.env.WEBKIT_EXEC_PATH, "/test/webkit/bin");
  assert.equal(options.args, undefined);
  const gecko = engineLaunchOptions("firefox", env);
  assert.equal(gecko.executablePath, env.NUVIO_FIREFOX_EXECUTABLE);
  assert.equal(gecko.env.WEBKIT_EXEC_PATH, undefined);
  assert.equal(gecko.env.LD_LIBRARY_PATH.includes("/test/webkit"), false);
});
