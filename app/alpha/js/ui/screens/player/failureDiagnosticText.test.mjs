import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { diagnosePlaybackFailure } from "../../../core/player/failureDiagnostics.js";
import { diagnosticExplanation, diagnosticNextAction } from "./failureDiagnosticText.js";

const strings = await readFile(new URL("../../../../res/values/strings.xml", import.meta.url), "utf8");
const names = new Set(Array.from(strings.matchAll(/<string name="([^"]+)"/g), (m) => m[1]));

// Records the key asked for and answers with the fallback, like I18n does for
// a key it cannot find.
function recorder() {
  const asked = [];
  const t = (key, params, fallback) => {
    asked.push({ key, params });
    return fallback;
  };
  return { asked, t };
}

const CASES = [
  {},
  { mediaErrorCode: 3 },
  { mediaErrorCode: 1 },
  { httpStatus: 403 },
  { httpStatus: 410 },
  { httpStatus: 416 },
  { httpStatus: 500 },
  { headerRequired: true },
  { activationRejected: true },
  { responseContentType: "text/html" },
  { phase: "seek" },
  { engine: "native-file", nativePrediction: "not-reported", descriptor: { container: "matroska" } }
];

test("every diagnostic the player can show has a string key", () => {
  for (const input of CASES) {
    const diagnostic = diagnosePlaybackFailure(input);
    const { asked, t } = recorder();
    diagnosticExplanation(diagnostic, t);
    diagnosticNextAction(diagnostic, t);
    for (const { key } of asked) {
      assert.ok(names.has(key), `${key} (from ${JSON.stringify(input)}) is not in strings.xml`);
    }
  }
});

test("falls back to the report's English and passes the HTTP status", () => {
  const diagnostic = diagnosePlaybackFailure({ httpStatus: 403 });
  const { asked, t } = recorder();
  assert.equal(diagnosticExplanation(diagnostic, t), diagnostic.explanation);
  assert.deepEqual(asked[0], { key: "player_diagnostic_cause_source_access", params: [403] });
});

test("activation failures get their own advice", () => {
  const diagnostic = diagnosePlaybackFailure({ activationRejected: true });
  const { asked, t } = recorder();
  diagnosticNextAction(diagnostic, t);
  assert.equal(asked[0].key, "player_diagnostic_action_activation");
});
