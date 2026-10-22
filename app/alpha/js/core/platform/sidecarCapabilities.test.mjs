import test from "node:test";
import assert from "node:assert/strict";
import {
  getSidecarCapabilities,
  requireSidecarCapability,
  sidecarUnavailableMessage
} from "./sidecarCapabilities.js";

test("only explicit public true flags permit fixed sidecar attempts; native media stays unsupported", () => {
  const flags = [
    "NUVIO_ENABLE_TRAKT_BRIDGE",
    "NUVIO_ENABLE_DEBRID_BRIDGE",
    "NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE"
  ];
  for (const value of [undefined, null, false, true, 1, "1", "TRUE", "", "false"]) {
    const runtime = { __NUVIO_ENV__: Object.fromEntries(flags.map((key) => [key, value])) };
    assert.deepEqual(getSidecarCapabilities(runtime), {
      traktAuth: false,
      traktBridge: false,
      debrid: false,
      externalReturn: false,
      nativeMedia: false
    });
  }
  assert.deepEqual(
    getSidecarCapabilities({
      __NUVIO_ENV__: Object.fromEntries(flags.map((key) => [key, "true"]))
    }),
    {
      traktAuth: true,
      traktBridge: true,
      debrid: true,
      externalReturn: true,
      nativeMedia: false
    }
  );
  const inherited = Object.create({ NUVIO_ENABLE_TRAKT_BRIDGE: "true", TRAKT_CLIENT_ID: "inherited" });
  assert.equal(getSidecarCapabilities({ __NUVIO_ENV__: inherited }).traktAuth, false);
});

test("a public Trakt client id alone permits direct browser sign-in, without the bridge", () => {
  const direct = getSidecarCapabilities({ __NUVIO_ENV__: { TRAKT_CLIENT_ID: "public-client" } });
  assert.equal(direct.traktAuth, true);
  assert.equal(direct.traktBridge, false);
  for (const value of ["", "   ", undefined, null]) {
    assert.equal(getSidecarCapabilities({ __NUVIO_ENV__: { TRAKT_CLIENT_ID: value } }).traktAuth, false);
  }
  const bridged = getSidecarCapabilities({
    __NUVIO_ENV__: { TRAKT_CLIENT_ID: "public-client", NUVIO_ENABLE_TRAKT_BRIDGE: "true" }
  });
  assert.equal(bridged.traktBridge, true);
});

test("unavailable guards produce bounded actionable messages without configuration or credential echoes", () => {
  const runtime = {
    __NUVIO_ENV__: { NUVIO_ENABLE_TRAKT_BRIDGE: "https://secret.invalid?token=synthetic-private" }
  };
  for (const name of [
    "traktAuth",
    "debrid",
    "externalReturn",
    "nativeMedia",
    "unknown",
    "__proto__"
  ]) {
    assert.throws(
      () => requireSidecarCapability(name, runtime),
      (error) => {
        assert.equal(error.code, "SIDECAR_UNAVAILABLE");
        assert.doesNotMatch(error.message, /synthetic-private|https:/);
        return true;
      }
    );
  }
  assert.match(sidecarUnavailableMessage("externalReturn"), /manually/);
  assert.doesNotThrow(() =>
    requireSidecarCapability("debrid", { __NUVIO_ENV__: { NUVIO_ENABLE_DEBRID_BRIDGE: "true" } })
  );
});
