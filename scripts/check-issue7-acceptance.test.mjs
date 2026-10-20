import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  deriveCriterionStatus,
  deriveUnmetIds,
  evaluateClosure,
  isCountOnlyResult,
  validateReceipt
} from "./check-issue7-acceptance.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const receiptPath = "docs/evidence/issue7-acceptance.json";
const committed = () => JSON.parse(readFileSync(`${root}${receiptPath}`, "utf8"));
const criterion = (receipt, id) => receipt.criteria.find((entry) => entry.id === id);

function mutated(change) {
  const receipt = committed();
  change(receipt);
  return validateReceipt(receipt, { root });
}

function hasError(errors, fragment) {
  return errors.some((error) => error.includes(fragment));
}

test("the committed blocked receipt is structurally valid and reports the real unmet set", () => {
  const receipt = committed();
  const result = validateReceipt(receipt, { root });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unmet_ids, ["A1", "A2", "A3", "A5", "A6", "A7", "A8"]);
  assert.equal(evaluateClosure(receipt, { root }).met, false);
});

test("schema CLI exits 0 for the honest blocked receipt and full closure exits 2", () => {
  const schema = spawnSync(process.execPath, ["scripts/check-issue7-acceptance.mjs", receiptPath, "--validate"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(schema.status, 0, schema.stderr);
  assert.match(schema.stdout, /structurally valid and honest/);
  const closure = spawnSync(process.execPath, ["scripts/check-issue7-acceptance.mjs", receiptPath], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(closure.status, 2, closure.stderr);
  assert.match(closure.stderr, /acceptance is unmet/);
});

test("a missing original criterion is rejected", () => {
  const result = mutated((receipt) => {
    receipt.original_criteria = receipt.original_criteria.filter((entry) => entry.id !== "O2");
  });
  assert.ok(hasError(result.errors, "original criterion O2 is missing"));
});

test("changing an original acceptance string is rejected", () => {
  const result = mutated((receipt) => {
    receipt.original_criteria.find((entry) => entry.id === "O2").original_text =
      "Profiles synchronize however the tests happen to pass";
  });
  assert.ok(hasError(result.errors, "original criterion O2 text changed"));
});

test("a missing criterion ID is rejected", () => {
  const result = mutated((receipt) => {
    receipt.criteria = receipt.criteria.filter((entry) => entry.id !== "A8");
  });
  assert.ok(hasError(result.errors, "criterion A8 is missing"));
});

test("narrowing required evidence kinds cannot turn a live requirement into synthetic-only", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A1").required_kinds = ["synthetic"];
  });
  assert.ok(hasError(result.errors, "A1: required_kinds cannot be narrowed"));
});

test("synthetic evidence declared as a live pass is rejected by derived status", () => {
  const result = mutated((receipt) => {
    const row = criterion(receipt, "A8");
    row.status = "pass";
    row.observations = [{
      kind: "synthetic",
      status: "pass",
      commit: "f30c79f6045786c821047532104c90aa65b861cc",
      deployment: null,
      command_or_observation: "npx playwright test tests/browser/identity-sync.spec.mjs --project=chromium",
      assertion: "A synthetic fixture would prove the observed browser orchestration.",
      result: "Synthetic browser case passes.",
      artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
      limitations: "Synthetic only."
    }];
  });
  assert.ok(hasError(result.errors, "A8: declared status pass contradicts observations"));
});

test("an unresolved failed observation keeps the criterion failing", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A3").status = "pass";
  });
  assert.ok(hasError(result.errors, "A3: declared status pass contradicts observations (fail)"));
  assert.equal(deriveCriterionStatus(criterion(committed(), "A3")), "fail");
});

test("a resolved failure must name a real criterion or child", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A3").resolution = {
      state: "resolved",
      resolved_by: "A99",
      reference: "docs/evidence/issue7-fixture-closure-2026-10-20.json"
    };
  });
  assert.ok(hasError(result.errors, "resolved_by references an unknown criterion/child: A99"));
});

test("a resolved failure with a missing reference artifact is rejected", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A3").resolution = {
      state: "resolved",
      resolved_by: "CH4",
      reference: "docs/evidence/does-not-exist-2026-10-20.json"
    };
  });
  assert.ok(hasError(result.errors, "artifact does not exist: docs/evidence/does-not-exist-2026-10-20.json"));
});

test("a passing observation needs an existing artifact", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].artifact = "docs/evidence/missing-artifact.json";
  });
  assert.ok(hasError(result.errors, "artifact does not exist"));
});

test("a passing observation needs a tested 40-hex revision", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].commit = null;
  });
  assert.ok(hasError(result.errors, "pass/fail needs a tested 40-hex commit"));
});

test("a live pass needs a named deployment rather than a bare assertion", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A1").observations[1].deployment = null;
  });
  assert.ok(hasError(result.errors, "a live pass needs a named deployment/service"));
});

test("a verified ledger while parent acceptance is unmet is rejected", () => {
  const result = mutated((receipt) => {
    receipt.ledger.issue7.verified = true;
  });
  assert.ok(hasError(result.errors, "ledger cannot be verified while parent acceptance is unmet"));
});

test("a test count cannot be used as a passing result", () => {
  assert.equal(isCountOnlyResult("1396/1396 pass"), true);
  assert.equal(isCountOnlyResult("57/57 tests passed"), true);
  assert.equal(isCountOnlyResult("The receiver restores the exact nonempty A key set"), false);
  const result = mutated((receipt) => {
    criterion(receipt, "A2").observations[0].result = "1396/1396 pass";
  });
  assert.ok(hasError(result.errors, "a test/activity count cannot establish a pass"));
});

test("an artifact path escaping the repository is rejected", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].artifact = "../outside.json";
  });
  assert.ok(hasError(result.errors, "artifact escapes the repository"));
});

test("an unsupported commit value is rejected even on an unverified observation", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A1").observations[2].commit = "main";
  });
  assert.ok(hasError(result.errors, "commit must be null or 40 lowercase hex characters"));
});

test("a possible credential string is rejected from evidence", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].assertion = "Observed header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature";
  });
  assert.ok(hasError(result.errors, "possible credential material in evidence"));
});

test("closure state cannot be met while criteria are unmet or the ledger is unverified", () => {
  const result = mutated((receipt) => {
    receipt.closure.state = "met";
  });
  assert.ok(hasError(result.errors, "closure cannot be met while criteria are unmet"));
  assert.ok(hasError(result.errors, "closure cannot be met while the ledger is not verified"));
});

test("the derived unmet set is evidence-derived, not copied from closure fields", () => {
  const receipt = committed();
  const childKeys = new Set(receipt.ledger.children.map((child) => child.key));
  assert.deepEqual(deriveUnmetIds(receipt, childKeys), ["A1", "A2", "A3", "A5", "A6", "A7", "A8"]);
  const artificial = structuredClone(receipt);
  artificial.criteria.find((entry) => entry.id === "A8").observations = [{
    kind: "live",
    status: "pass",
    commit: "f30c79f6045786c821047532104c90aa65b861cc",
    deployment: "fixture deployment",
    command_or_observation: "named synthetic live-shape observation",
    assertion: "This mutation must remain derived rather than trusted from the declared status.",
    result: "Mutation only.",
    artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
    limitations: "Test mutation."
  }, {
    kind: "review",
    status: "pass",
    commit: "f30c79f6045786c821047532104c90aa65b861cc",
    deployment: null,
    command_or_observation: "review mutation",
    assertion: "Review evidence is also required by the immutable mapping.",
    result: "Mutation only.",
    artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
    limitations: "Test mutation."
  }];
  assert.equal(deriveCriterionStatus(artificial.criteria.find((entry) => entry.id === "A8"), childKeys), "pass");
});
