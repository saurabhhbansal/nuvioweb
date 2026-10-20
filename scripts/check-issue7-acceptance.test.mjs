import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  contractProblem,
  deriveCriterionStatus,
  deriveUnmetIds,
  evaluateClosure,
  isCountOnlyResult,
  progressLedgerProblem,
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

function withTempRoot(run) {
  const directory = mkdtempSync(join(tmpdir(), "issue7-gate-"));
  try {
    mkdirSync(join(directory, "docs"), { recursive: true });
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the committed blocked receipt is structurally valid and reports the real unmet set", () => {
  const receipt = committed();
  const result = validateReceipt(receipt, { root });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unmet_ids, ["A2", "A3", "A5", "A8"]);
  assert.equal(evaluateClosure(receipt, { root }).met, false);
});

test("schema CLI exits 0 for the honest blocked receipt and full closure exits 2", () => {
  const schema = spawnSync(process.execPath, ["scripts/check-issue7-acceptance.mjs", receiptPath, "--validate"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(schema.status, 0, schema.stderr);
  assert.match(schema.stdout, /internally consistent/);
  const closure = spawnSync(process.execPath, ["scripts/check-issue7-acceptance.mjs", receiptPath], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(closure.status, 2, closure.stderr);
  assert.match(closure.stderr, /acceptance is unmet/);
});

test("a structurally invalid receipt exits 1 rather than the unmet exit 2", () => {
  withTempRoot((directory) => {
    const path = join(directory, "invalid.json");
    writeFileSync(path, "{}");
    const result = spawnSync(process.execPath, ["scripts/check-issue7-acceptance.mjs", path], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /problem\(s\)/);
  });
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
      commit: "d77a9119795890ed05eb29000cb7b7b7956be23c",
      deployment: null,
      observed_at: "2026-10-20T00:55:00Z",
      command_or_observation: "npx playwright test tests/browser/identity-sync.spec.mjs --project=chromium",
      assertion: "A synthetic fixture would prove only the observed browser orchestration.",
      result: "Synthetic browser case passes with exact keys.",
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

test("a synthetic criterion cannot resolve a live failure", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A3").resolution = {
      state: "resolved",
      resolved_by: "A4",
      reference: "docs/evidence/issue7-fixture-closure-2026-10-20.json"
    };
    criterion(receipt, "A3").status = "pass";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.ok(hasError(result.errors, "A3: only later evidence on the same criterion can resolve a failure"));
  assert.equal(deriveCriterionStatus(criterion(committed(), "A3")), "fail");
});

test("a child key cannot collide with a criterion ID", () => {
  const result = mutated((receipt) => {
    receipt.ledger.children.push({ key: "A1", issue: 999, state: "closed", scope: "fake" });
  });
  assert.ok(hasError(result.errors, "child keys cannot collide with criterion IDs"));
});

test("a later same-kind pass resolves a failure without erasing another incomplete observation", () => {
  const result = mutated((receipt) => {
    const row = criterion(receipt, "A3");
    row.observations.push({
      kind: "live",
      status: "pass",
      commit: "18d9cb75933f3eafdfa050afac94b3e6a7b73cf5",
      deployment: "nuvioweb-preview.pages.dev deployment b48de821 / revision 1f67867",
      observed_at: "2026-10-19T17:48:20Z",
      command_or_observation: "Immediate read-only B-to-A-to-B round trip after the failed post-removal switch.",
      assertion: "The later round trip completed all three Library pulls for the current account without a foreign set.",
      result: "Later live round trip completed; this is the resolving observation, not an explanation of the earlier failure.",
      artifact: "docs/evidence/identity-roundtrip-after-removal-2026-10-19.json",
      limitations: "One round trip; causality of the earlier failure remains unestablished."
    });
    row.resolution = {
      state: "resolved",
      resolved_by: "A3",
      reference: "docs/evidence/identity-roundtrip-after-removal-2026-10-19.json"
    };
    row.status = "partial";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unmet_ids, ["A2", "A3", "A5", "A8"]);
});

test("an untracked or aliased artifact cannot resolve a failure", () => {
  const untracked = mutated((receipt) => {
    const row = criterion(receipt, "A3");
    row.observations.push({
      kind: "live",
      status: "pass",
      commit: "18d9cb75933f3eafdfa050afac94b3e6a7b73cf5",
      deployment: "fixture deployment",
      observed_at: "2026-10-20T01:00:00Z",
      command_or_observation: "Untracked artifact mutation.",
      assertion: "An untracked path must not be accepted as committed evidence.",
      result: "Mutation only.",
      artifact: ".git/config",
      limitations: "Test mutation."
    });
    row.resolution = { state: "resolved", resolved_by: "A3", reference: ".git/config" };
    row.status = "pass";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.ok(hasError(untracked.errors, "artifact is not committed at HEAD"));
  const alias = mutated((receipt) => {
    const row = criterion(receipt, "A3");
    row.observations.push({
      kind: "live",
      status: "pass",
      commit: "18d9cb75933f3eafdfa050afac94b3e6a7b73cf5",
      deployment: "fixture deployment",
      observed_at: "2026-10-20T01:00:00Z",
      command_or_observation: "Aliased artifact mutation.",
      assertion: "A path alias of the failing artifact must not count as distinct evidence.",
      result: "Mutation only.",
      artifact: "docs/evidence/./identity-library-removal-switch-2026-10-19.json",
      limitations: "Test mutation."
    });
    row.resolution = {
      state: "resolved",
      resolved_by: "A3",
      reference: "docs/evidence/./identity-library-removal-switch-2026-10-19.json"
    };
    row.status = "pass";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.ok(hasError(alias.errors, "resolving artifact is the failing observation's own artifact"));
});

test("a resolving commit must be a later descendant of the failing commit", () => {
  const result = mutated((receipt) => {
    const row = criterion(receipt, "A3");
    row.observations.push({
      kind: "live",
      status: "pass",
      commit: "1f67867ebab7f426672886121d852a643a436414",
      deployment: "nuvioweb-preview.pages.dev deployment b48de821 / revision 1f67867",
      observed_at: "2026-10-19T17:48:20Z",
      command_or_observation: "Same-commit read-only rerun.",
      assertion: "A rerun at the same commit cannot be later evidence for a failure at that commit.",
      result: "Mutation only.",
      artifact: "docs/evidence/identity-roundtrip-after-removal-2026-10-19.json",
      limitations: "Test mutation."
    });
    row.resolution = {
      state: "resolved",
      resolved_by: "A3",
      reference: "docs/evidence/identity-roundtrip-after-removal-2026-10-19.json"
    };
    row.status = "pass";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.ok(hasError(result.errors, "resolving observation commit must be a later descendant"));
});

test("a synthetic artifact cannot satisfy a live observation", () => {
  const result = mutated((receipt) => {
    const row = criterion(receipt, "A8");
    row.status = "pass";
    row.observations = [{
      kind: "live",
      status: "pass",
      commit: "18d9cb75933f3eafdfa050afac94b3e6a7b73cf5",
      deployment: "self-declared fixture deployment",
      observed_at: "2026-10-20T00:55:00Z",
      command_or_observation: "A synthetic fixture artifact relabeled as live.",
      assertion: "The artifact metadata must agree that this is live evidence.",
      result: "Mutation only.",
      artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
      limitations: "Test mutation."
    }, {
      kind: "review",
      status: "pass",
      commit: "18d9cb75933f3eafdfa050afac94b3e6a7b73cf5",
      deployment: null,
      observed_at: "2026-10-20T00:55:00Z",
      command_or_observation: "review mutation",
      assertion: "Review evidence is also required by the immutable mapping.",
      result: "Mutation only.",
      artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
      limitations: "Test mutation."
    }];
  });
  assert.ok(hasError(result.errors, "artifact declares kind synthetic, not live"));
});

test("a synthetic observation must match its artifact source commit", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A2").observations[0].commit = "d77a9119795890ed05eb29000cb7b7b7956be23c";
  });
  assert.ok(hasError(result.errors, "synthetic artifact source_commit does not match the observation commit"));
});

test("malformed observations and criteria fail cleanly", () => {
  const nullObservation = mutated((receipt) => {
    criterion(receipt, "A2").observations.push(null);
  });
  assert.ok(nullObservation.errors.some(error => /^A2\.observations\[\d+\]: observation must be an object$/.test(error)));
  const badCriteria = mutated((receipt) => {
    receipt.criteria = "not-an-array";
  });
  assert.ok(hasError(badCriteria.errors, "criteria must be an array"));
});

test("a later pass of a different kind cannot resolve a live failure", () => {
  const result = mutated((receipt) => {
    const row = criterion(receipt, "A3");
    row.resolution = {
      state: "resolved",
      resolved_by: "A3",
      reference: "docs/evidence/issue7-fixture-closure-2026-10-20.json"
    };
    row.status = "pass";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.ok(hasError(result.errors, "resolved failure needs a later same-kind pass observation (live)"));
});

test("a resolved failure must reference a later same-kind pass artifact, not an earlier one", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A3").resolution = {
      state: "resolved",
      resolved_by: "A3",
      reference: "docs/evidence/identity-library-nonempty-switch-2026-10-19.json"
    };
    criterion(receipt, "A3").status = "pass";
    receipt.closure.unmet_ids = deriveUnmetIds(receipt);
  });
  assert.ok(hasError(result.errors, "resolved failure needs a later same-kind pass observation (live)"));
});

test("a resolved failure must reference an existing artifact", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A3").resolution = {
      state: "resolved",
      resolved_by: "A3",
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

test("a passing observation needs a tested, existing and reachable commit", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].commit = null;
  });
  assert.ok(hasError(result.errors, "needs an existing tested 40-hex commit"));
  const zero = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].commit = "0".repeat(40);
  });
  assert.ok(hasError(zero.errors, "commit does not exist in the repository"));
});

test("a passing observation needs a valid observed_at timestamp", () => {
  const result = mutated((receipt) => {
    delete criterion(receipt, "A4").observations[0].observed_at;
  });
  assert.ok(hasError(result.errors, "missing or invalid observed_at timestamp"));
});

test("a live pass needs a named deployment rather than a bare assertion", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A1").observations[1].deployment = null;
  });
  assert.ok(hasError(result.errors, "a live pass needs a named deployment/service"));
});

test("a verified ledger or closed status while parent acceptance is unmet is rejected", () => {
  const verified = mutated((receipt) => {
    receipt.ledger.issue7.verified = true;
  });
  assert.ok(hasError(verified.errors, "ledger cannot be verified while parent acceptance is unmet"));
  const closed = mutated((receipt) => {
    receipt.ledger.issue7.status = "closed";
  });
  assert.ok(hasError(closed.errors, "ledger cannot be verified/closed while parent acceptance is unmet"));
});

test("closure state cannot be met while criteria are unmet or the ledger is unverified", () => {
  const result = mutated((receipt) => {
    receipt.closure.state = "met";
  });
  assert.ok(hasError(result.errors, "closure cannot be met while criteria are unmet"));
  assert.ok(hasError(result.errors, "closure cannot be met while the ledger is not verified"));
});

test("a test count cannot be used as a passing result", () => {
  assert.equal(isCountOnlyResult("1396/1396 pass"), true);
  assert.equal(isCountOnlyResult("57/57 tests passed"), true);
  assert.equal(isCountOnlyResult("13 passed, 40.3s"), true);
  assert.equal(isCountOnlyResult("13 passed in 40.3s"), true);
  assert.equal(isCountOnlyResult("1396 specs green"), true);
  assert.equal(isCountOnlyResult("All 1396 tests succeeded"), true);
  assert.equal(isCountOnlyResult("1396 checks passed"), true);
  assert.equal(isCountOnlyResult("13/13 scenarios ok"), true);
  assert.equal(isCountOnlyResult("13 passed in 40.3s; receiver restored the exact nonempty A key set"), false);
  const result = mutated((receipt) => {
    criterion(receipt, "A2").observations[0].result = "1396/1396 pass";
  });
  assert.ok(hasError(result.errors, "a test/activity count or bare label cannot establish a pass"));
});

test("a bare pass label is not a passing result", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A2").observations[0].result = "passed";
  });
  assert.ok(hasError(result.errors, "a test/activity count or bare label cannot establish a pass"));
});

test("an artifact path escaping the repository is rejected", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A4").observations[0].artifact = "../outside.json";
  });
  assert.ok(hasError(result.errors, "artifact escapes the repository"));
});

test("an unsupported commit value is rejected even on an unverified observation", () => {
  const result = mutated((receipt) => {
    criterion(receipt, "A5").observations[1].commit = "main";
  });
  assert.ok(hasError(result.errors, "commit must be null or 40 lowercase hex characters"));
});

test("a possible credential string is rejected from any receipt field", () => {
  const result = mutated((receipt) => {
    receipt.closure.reason =
      "Observed header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature";
  });
  assert.ok(hasError(result.errors, "possible credential material in the acceptance receipt"));
});

test("the committed contract file is required and cannot be silently changed", () => {
  withTempRoot((directory) => {
    assert.match(contractProblem(directory), /is missing/);
    mkdirSync(join(directory, "docs/evidence"), { recursive: true });
    const contract = JSON.parse(readFileSync(join(root, "docs/evidence/issue7-acceptance-contract.json"), "utf8"));
    writeFileSync(join(directory, "docs/evidence/issue7-acceptance-contract.json"), JSON.stringify(contract));
    assert.equal(contractProblem(directory), null);
    contract.original_criteria[1].original_text = "Profiles sync as convenient";
    writeFileSync(join(directory, "docs/evidence/issue7-acceptance-contract.json"), JSON.stringify(contract));
    assert.match(contractProblem(directory), /original criterion O2 text changed/);
  });
});

test("the progress ledger must stay in_progress while unmet and verified only when met", () => {
  withTempRoot((directory) => {
    const receipt = committed();
    writeFileSync(join(directory, "docs/PROGRESS.json"), JSON.stringify({ tickets: [{ number: 7, status: "verified" }] }));
    assert.match(progressLedgerProblem(directory, receipt), /marks #7 verified while acceptance is unmet/);
    writeFileSync(join(directory, "docs/PROGRESS.json"), JSON.stringify({ tickets: [{ number: 7, status: "pending" }] }));
    assert.match(progressLedgerProblem(directory, receipt), /must stay in_progress/);
    writeFileSync(join(directory, "docs/PROGRESS.json"), JSON.stringify({ tickets: [{ number: 7, status: "in_progress" }] }));
    assert.equal(progressLedgerProblem(directory, receipt), null);
    const metReceipt = { closure: { state: "met" }, criteria: [], ledger: { issue7: { verified: true } } };
    assert.match(progressLedgerProblem(directory, metReceipt), /must mark #7 verified when acceptance is met/);
  });
});

test("the derived unmet set is evidence-derived, not copied from closure fields", () => {
  const receipt = committed();
  assert.deepEqual(deriveUnmetIds(receipt), ["A2", "A3", "A5", "A8"]);
  const artificial = structuredClone(receipt);
  artificial.criteria.find((entry) => entry.id === "A8").observations = [{
    kind: "live",
    status: "pass",
    commit: "d77a9119795890ed05eb29000cb7b7b7956be23c",
    deployment: "fixture deployment",
    observed_at: "2026-10-20T00:55:00Z",
    command_or_observation: "named synthetic live-shape observation",
    assertion: "This mutation must remain derived rather than trusted from the declared status.",
    result: "Mutation only.",
    artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
    limitations: "Test mutation."
  }, {
    kind: "review",
    status: "pass",
    commit: "d77a9119795890ed05eb29000cb7b7b7956be23c",
    deployment: null,
    observed_at: "2026-10-20T00:55:00Z",
    command_or_observation: "review mutation",
    assertion: "Review evidence is also required by the immutable mapping.",
    result: "Mutation only.",
    artifact: "docs/evidence/issue7-fixture-closure-2026-10-20.json",
    limitations: "Test mutation."
  }];
  assert.equal(deriveCriterionStatus(artificial.criteria.find((entry) => entry.id === "A8")), "pass");
});


test("canonical repository identity is accepted and the misspelled owner rejected", () => {
  assert.equal(committed().repository, "saurabhhbansal/nuvioweb");
  const result = mutated((receipt) => { receipt.repository = "saurabhbansal/nuvioweb"; });
  assert.ok(hasError(result.errors, "repository must be saurabhhbansal/nuvioweb"));
});
