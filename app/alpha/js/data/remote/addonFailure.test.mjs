import assert from "node:assert/strict";
import test from "node:test";
import { describeAddonFetchFailure } from "./addonFailure.js";

const network = "Could not reach the add-on server";
const invalidJson = "invalid JSON response";
const invalidManifest = "add-on manifest is not valid";

test("engine-specific network and CORS failures become one reachable message", () => {
  for (const message of [
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "Network request failed",
    "net::ERR_NETWORK_ACCESS_DENIED"
  ]) {
    const described = describeAddonFetchFailure({ status: "error", message, code: null });
    assert.match(described, new RegExp(network, "i"), message);
    assert.doesNotMatch(described, new RegExp(message.slice(0, 12), "i"));
  }
});

test("engine-specific JSON parse failures become one invalid-JSON message", () => {
  for (const message of [
    "Unexpected token '<', \"<html>\"... is not valid JSON",
    "JSON.parse: unexpected character at line 1 column 1 of the JSON data",
    "Unexpected end of JSON input"
  ]) {
    assert.match(describeAddonFetchFailure({ status: "error", message, code: null }), new RegExp(invalidJson, "i"));
  }
});

test("manifest shape TypeErrors become one invalid-manifest message", () => {
  for (const message of [
    "addon.types.map is not a function",
    "Cannot read properties of undefined (reading 'map')"
  ]) {
    assert.match(describeAddonFetchFailure({ status: "error", message, code: null }), new RegExp(invalidManifest, "i"));
  }
});

test("provider HTTP errors keep their provider status text", () => {
  const result = { status: "error", message: "Fixture provider unavailable", code: 503 };
  assert.equal(describeAddonFetchFailure(result), "Fixture provider unavailable");
});

test("unknown messages are preserved rather than swallowed", () => {
  assert.equal(describeAddonFetchFailure({ status: "error", message: "Provider said no", code: null }), "Provider said no");
});

test("success, empty and non-string inputs produce no secret or raw internals", () => {
  assert.equal(describeAddonFetchFailure({ status: "success", data: {} }), "");
  assert.match(describeAddonFetchFailure({ status: "error", message: undefined, code: null }), /Unable to add/i);
  assert.doesNotMatch(describeAddonFetchFailure({ status: "error", message: { url: "https://secret.example/?token=x" }, code: null }), /secret|token/i);
});
