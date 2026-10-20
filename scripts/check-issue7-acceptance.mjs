#!/usr/bin/env node
// Fail-closed acceptance gate for issue #7.
//
// `--validate` answers only "is this receipt structurally honest?"; it can exit 0
// for a blocked parent. The default mode is the closure gate: it exits 2 while
// any mapped criterion is unmet and 0 only when the original contract is fully
// evidenced.
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_ORIGINAL_CRITERIA = [
  {
    id: "O1",
    original_text: "Existing Nuvio account is the only user login",
    criteria: ["A1", "A4", "A6", "A7", "A8"]
  },
  {
    id: "O2",
    original_text: "Profiles/addons/watch history synchronize as tested",
    criteria: ["A2", "A3", "A5"]
  },
  {
    id: "O3",
    original_text: "No cross-account library or session leakage",
    criteria: ["A3", "A4", "A6", "A7", "A8"]
  }
];

export const EXPECTED_CRITERIA = {
  A1: { original_ids: ["O1"], required_kinds: ["synthetic", "live"] },
  A2: { original_ids: ["O2"], required_kinds: ["synthetic", "live"] },
  A3: { original_ids: ["O3", "O2"], required_kinds: ["synthetic", "live"] },
  A4: { original_ids: ["O1", "O3"], required_kinds: ["synthetic"] },
  A5: { original_ids: ["O2"], required_kinds: ["synthetic"] },
  A6: { original_ids: ["O1", "O3"], required_kinds: ["synthetic"] },
  A7: { original_ids: ["O1", "O3"], required_kinds: ["synthetic", "review"] },
  A8: { original_ids: ["O1", "O3"], required_kinds: ["live", "review"] }
};

const CRITERION_IDS = Object.keys(EXPECTED_CRITERIA);
const KIND_VALUES = new Set(["synthetic", "live", "review"]);
const OBSERVATION_STATUSES = new Set(["pass", "fail", "unverified", "blocked"]);
const CRITERION_STATUSES = new Set(["pass", "partial", "fail", "blocked", "unverified", "not-run"]);
const RESOLUTION_STATES = new Set(["open", "resolved", "blocked", "not-required"]);
const CHILD_STATES = new Set(["open", "blocked", "closed", "resolved"]);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SECRET_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/,
  /\bsk-[A-Za-z0-9]{20,}/
];

function isNonEmptyString(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// A result such as "1396/1396 pass" mentions no asserted property, only activity.
export function isCountOnlyResult(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || !/\d/.test(text)) return false;
  const stripped = text
    .replace(/\b\d+(?:\.\d+)?(?:ms|s|secs?|seconds?|mins?|minutes?|h|hours?)\b/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\b(tests?|cases?|pass|passed|all|of|and|with|zero|skips?|s|ms|sec|secs|seconds?|mins?|minutes?|hours?)\b/g, "")
    .replace(/[^a-z]/g, "");
  return stripped.length === 0;
}

function artifactProblem(root, artifact) {
  if (!isNonEmptyString(artifact)) return "artifact is missing";
  if (isAbsolute(artifact)) return "artifact must be a repository-relative path";
  const target = resolve(root, artifact);
  const inside = relative(root, target);
  if (inside === ".." || inside.startsWith(".." + sep)) return "artifact escapes the repository";
  if (!existsSync(target)) return `artifact does not exist: ${artifact}`;
  try {
    if (!statSync(target).isFile() || statSync(target).size < 3) {
      return `artifact is empty or not a file: ${artifact}`;
    }
  } catch {
    return `artifact is unreadable: ${artifact}`;
  }
  return null;
}

function receiptContext(receipt) {
  return {
    criteria: Array.isArray(receipt?.criteria) ? receipt.criteria : [],
    childStates: new Map(
      (Array.isArray(receipt?.ledger?.children) ? receipt.ledger.children : [])
        .filter((child) => isNonEmptyString(child?.key))
        .map((child) => [child.key, child.state])
    )
  };
}

function isResolutionEligible(criterion, resolution, context, seen = new Set()) {
  if (!isPlainObject(resolution) || resolution.state !== "resolved") return false;
  const resolver = resolution.resolved_by;
  if (!isNonEmptyString(resolver) || resolver === criterion.id) return false;
  if (context.childStates?.has(resolver)) {
    return ["closed", "resolved"].includes(context.childStates.get(resolver));
  }
  const target = (context.criteria || []).find((entry) => entry?.id === resolver);
  if (!target) return false;
  if (seen.has(target.id)) return false;
  return deriveCriterionStatus(target, context, new Set(seen)) === "pass";
}

function resolutionProblem(root, criterion, context) {
  const resolution = criterion.resolution;
  const failing = (criterion.observations || []).filter((item) => item?.status === "fail");
  if (!failing.length && !resolution) return null;
  if (!isPlainObject(resolution)) return "failure observation has no resolution record";
  if (!RESOLUTION_STATES.has(resolution.state)) return "resolution state is invalid";
  if (resolution.state !== "resolved") return null;
  if (!isNonEmptyString(resolution.resolved_by)) return "resolved failure has no resolved_by";
  if (resolution.resolved_by === criterion.id) {
    return "a criterion cannot resolve its own failure without later evidence";
  }
  if (failing.some((observation) => observation.artifact === resolution.reference)) {
    return "resolution reference is the failing observation's own artifact";
  }
  if (!isNonEmptyString(resolution.reference)) return "resolved failure has no reference";
  if (!/^https?:\/\//.test(resolution.reference)) {
    const referenceIssue = artifactProblem(root, resolution.reference);
    if (referenceIssue) return referenceIssue;
  }
  const knownResolver = context.childStates?.has(resolution.resolved_by)
    || (context.criteria || []).some((entry) => entry?.id === resolution.resolved_by);
  if (!knownResolver) {
    return `resolved_by references an unknown criterion/child: ${resolution.resolved_by}`;
  }
  if (!isResolutionEligible(criterion, resolution, context)) {
    return `resolved_by ${resolution.resolved_by} is neither a passing criterion nor a closed child`;
  }
  return null;
}

function validateObservation(root, criterionId, observation, index) {
  const prefix = `${criterionId}.observations[${index}]`;
  const errors = [];
  if (!isPlainObject(observation)) return [`${prefix}: observation must be an object`];
  if (!KIND_VALUES.has(observation.kind)) errors.push(`${prefix}: invalid kind`);
  if (!OBSERVATION_STATUSES.has(observation.status)) errors.push(`${prefix}: invalid status`);
  for (const field of ["command_or_observation", "assertion", "result", "limitations"]) {
    if (!isNonEmptyString(observation[field])) errors.push(`${prefix}: missing ${field}`);
  }
  if (observation.status === "pass" && !isNonEmptyString(observation.assertion, 20)) {
    errors.push(`${prefix}: a pass needs a substantive assertion, not a label`);
  }
  if (observation.status === "pass" && isCountOnlyResult(observation.result)) {
    errors.push(`${prefix}: a test/activity count cannot establish a pass`);
  }
  if (observation.status === "pass" && isCountOnlyResult(observation.command_or_observation)) {
    errors.push(`${prefix}: a test/activity count cannot establish a pass`);
  }
  if (["pass", "fail"].includes(observation.status)) {
    if (!COMMIT_PATTERN.test(String(observation.commit || ""))) {
      errors.push(`${prefix}: pass/fail needs a tested 40-hex commit`);
    }
  } else if (observation.commit != null && !COMMIT_PATTERN.test(String(observation.commit))) {
    errors.push(`${prefix}: commit must be null or 40 lowercase hex characters`);
  }
  if (observation.kind === "live" && observation.status === "pass") {
    if (!isNonEmptyString(observation.deployment)) {
      errors.push(`${prefix}: a live pass needs a named deployment/service`);
    }
  }
  const artifactIssue = artifactProblem(root, observation.artifact);
  if (artifactIssue) errors.push(`${prefix}: ${artifactIssue}`);
  const serialized = JSON.stringify(observation);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) errors.push(`${prefix}: possible credential material in evidence`);
  }
  return errors;
}

function resolvedFailure(criterion, observation, context, seen) {
  if (observation.status !== "fail") return false;
  return isResolutionEligible(criterion, criterion.resolution, context, seen);
}

export function deriveCriterionStatus(criterion, context = {}, seen = new Set()) {
  const observations = Array.isArray(criterion?.observations) ? criterion.observations : [];
  if (!observations.length) return "unverified";
  if (seen.has(criterion?.id)) return "unverified";
  const nextSeen = new Set(seen);
  nextSeen.add(criterion.id);
  const active = observations.filter((observation) => !resolvedFailure(criterion, observation, context, nextSeen));
  if (!active.length) return "unverified";
  if (active.some((observation) => observation.status === "fail")) return "fail";
  if (active.some((observation) => observation.status === "blocked")) return "blocked";
  const passingKinds = new Set(
    active.filter((observation) => observation.status === "pass").map((observation) => observation.kind)
  );
  const requiredKinds = Array.isArray(criterion?.required_kinds) ? criterion.required_kinds : [];
  const missing = requiredKinds.filter((kind) => !passingKinds.has(kind));
  if (!missing.length && active.every((observation) => observation.status === "pass")) return "pass";
  if (active.some((observation) => observation.status === "pass")) return "partial";
  return "unverified";
}

export function deriveUnmetIds(receipt, context = receiptContext(receipt)) {
  return (receipt?.criteria || [])
    .filter((criterion) => deriveCriterionStatus(criterion, context) !== "pass")
    .map((criterion) => criterion.id);
}

function progressLedgerProblem(root, receipt) {
  const path = resolve(root, "docs/PROGRESS.json");
  if (!existsSync(path)) return "docs/PROGRESS.json is missing";
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return "docs/PROGRESS.json is not valid JSON";
  }
  const ticket = (ledger.tickets || []).find((entry) => entry.number === 7);
  if (!ticket) return "docs/PROGRESS.json has no #7 ticket";
  const derivedMet = receipt?.closure?.state === "met" && deriveUnmetIds(receipt).length === 0;
  if (!derivedMet && ticket.status === "verified") {
    return "docs/PROGRESS.json marks #7 verified while acceptance is unmet";
  }
  return null;
}

export function validateReceipt(receipt, { root = process.cwd() } = {}) {
  const errors = [];
  if (!isPlainObject(receipt)) return { errors: ["receipt must be a JSON object"], unmet_ids: CRITERION_IDS };
  if (receipt.schema_version !== 1) errors.push("schema_version must be 1");
  if (receipt.issue !== 7) errors.push("receipt must describe issue 7");
  if (receipt.repository !== "saurabhbansal/nuvioweb") errors.push("repository must be saurabhbansal/nuvioweb");
  if (!isNonEmptyString(receipt.as_of)) errors.push("as_of is missing");
  if (!COMMIT_PATTERN.test(String(receipt.source_commit || ""))) {
    errors.push("source_commit must be a 40-hex tested source revision");
  }

  const original = Array.isArray(receipt.original_criteria) ? receipt.original_criteria : [];
  if (original.length !== EXPECTED_ORIGINAL_CRITERIA.length) {
    errors.push("original_criteria must contain exactly O1, O2 and O3");
  }
  for (const expected of EXPECTED_ORIGINAL_CRITERIA) {
    const actual = original.find((entry) => entry?.id === expected.id);
    if (!actual) {
      errors.push(`original criterion ${expected.id} is missing`);
      continue;
    }
    if (actual.original_text !== expected.original_text) {
      errors.push(`original criterion ${expected.id} text changed`);
    }
    if (!sameStringSet(actual.criteria, expected.criteria)) {
      errors.push(`original criterion ${expected.id} mapping changed`);
    }
  }

  const ledgerChildren = Array.isArray(receipt.ledger?.children) ? receipt.ledger.children : [];
  const childKeys = new Set(ledgerChildren.map((child) => child?.key).filter((key) => isNonEmptyString(key)));
  const context = receiptContext(receipt);
  const seenChildKeys = new Set();
  for (const [index, child] of ledgerChildren.entries()) {
    const prefix = `ledger.children[${index}]`;
    if (!isPlainObject(child)) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }
    if (!isNonEmptyString(child.key)) errors.push(`${prefix}: missing key`);
    else if (seenChildKeys.has(child.key)) errors.push(`${prefix}: duplicate child key ${child.key}`);
    else seenChildKeys.add(child.key);
    if (!Number.isInteger(child.issue) || child.issue <= 0) errors.push(`${prefix}: missing real issue number`);
    if (!CHILD_STATES.has(child.state)) errors.push(`${prefix}: invalid child state`);
    if (!isNonEmptyString(child.scope)) errors.push(`${prefix}: missing scope`);
  }

  const criteria = Array.isArray(receipt.criteria) ? receipt.criteria : [];
  const ids = criteria.map((criterion) => criterion?.id);
  if (new Set(ids).size !== ids.length) errors.push("criteria contain duplicate IDs");
  for (const id of CRITERION_IDS) {
    if (!ids.includes(id)) errors.push(`criterion ${id} is missing`);
  }
  for (const id of ids) {
    if (id != null && !CRITERION_IDS.includes(id)) errors.push(`unknown criterion ${id}`);
  }

  const ledgerIssue7 = receipt.ledger?.issue7;
  if (!isPlainObject(ledgerIssue7)) {
    errors.push("ledger.issue7 is missing");
  } else {
    if (!isNonEmptyString(ledgerIssue7.status)) errors.push("ledger.issue7.status is missing");
    if (typeof ledgerIssue7.verified !== "boolean") errors.push("ledger.issue7.verified must be boolean");
    if (typeof ledgerIssue7.parent_open !== "boolean") errors.push("ledger.issue7.parent_open must be boolean");
  }

  for (const criterion of criteria) {
    if (!isPlainObject(criterion)) {
      errors.push("criterion must be an object");
      continue;
    }
    const expected = EXPECTED_CRITERIA[criterion.id];
    if (!expected) continue;
    if (!sameStringSet(criterion.original_ids, expected.original_ids)) {
      errors.push(`${criterion.id}: original_ids do not match the immutable mapping`);
    }
    if (!sameStringSet(criterion.required_kinds, expected.required_kinds)) {
      errors.push(`${criterion.id}: required_kinds cannot be narrowed from the acceptance manifest`);
    }
    if (!CRITERION_STATUSES.has(criterion.status)) errors.push(`${criterion.id}: invalid status`);
    if (!isNonEmptyString(criterion.gate_owner)) errors.push(`${criterion.id}: missing gate_owner`);
    if (!isNonEmptyString(criterion.result)) errors.push(`${criterion.id}: missing current result summary`);
    if (!Array.isArray(criterion.linked_children) || !criterion.linked_children.length) {
      errors.push(`${criterion.id}: missing linked child`);
    } else {
      for (const key of criterion.linked_children) {
        if (!childKeys.has(key)) errors.push(`${criterion.id}: linked child ${key} is not in ledger.children`);
      }
    }
    if (!Array.isArray(criterion.observations) || !criterion.observations.length) {
      errors.push(`${criterion.id}: at least one observation is required`);
      continue;
    }
    for (const [index, observation] of criterion.observations.entries()) {
      errors.push(...validateObservation(root, criterion.id, observation, index));
    }
    const resolutionIssue = resolutionProblem(root, criterion, context);
    if (resolutionIssue) errors.push(`${criterion.id}: ${resolutionIssue}`);
    const derived = deriveCriterionStatus(criterion, context);
    if (criterion.status !== derived) {
      errors.push(`${criterion.id}: declared status ${criterion.status} contradicts observations (${derived})`);
    }
  }

  const unmet = deriveUnmetIds(receipt, context);
  const closure = receipt.closure;
  if (!isPlainObject(closure)) {
    errors.push("closure is missing");
  } else {
    if (!["open", "met", "blocked"].includes(closure.state)) errors.push("closure.state is invalid");
    if (!Array.isArray(closure.unmet_ids)) errors.push("closure.unmet_ids must be an array");
    else if (!sameStringSet(closure.unmet_ids, unmet)) {
      errors.push("closure.unmet_ids does not match evidence-derived unmet criteria");
    }
    if (closure.state === "met" && unmet.length) errors.push("closure cannot be met while criteria are unmet");
    if (closure.state === "met" && ledgerIssue7 && ledgerIssue7.verified !== true) {
      errors.push("closure cannot be met while the ledger is not verified");
    }
    if (closure.state === "met" && ledgerChildren.some((child) => !["closed", "resolved"].includes(child.state))) {
      errors.push("closure cannot be met while a linked child is still open");
    }
    if (closure.state !== "met" && unmet.length === 0) {
      errors.push("closure must be met when every criterion passes");
    }
    if (closure.state !== "met" && ledgerIssue7?.verified === true) {
      errors.push("ledger cannot be verified while parent acceptance is unmet");
    }
    if (closure.state !== "met" && ledgerIssue7?.parent_open !== true) {
      errors.push("parent must be recorded open while acceptance is unmet");
    }
    if (!isNonEmptyString(closure.reason)) errors.push("closure.reason is missing");
  }

  const progressIssue = progressLedgerProblem(root, receipt);
  if (progressIssue) errors.push(progressIssue);

  return { errors, unmet_ids: unmet };
}

export function evaluateClosure(receipt, options = {}) {
  const validation = validateReceipt(receipt, options);
  const met = validation.errors.length === 0
    && receipt?.closure?.state === "met"
    && validation.unmet_ids.length === 0
    && receipt?.ledger?.issue7?.verified === true;
  return { met, ...validation };
}

function readReceipt(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const args = process.argv.slice(2);
  const validateOnly = args.includes("--validate");
  const target = args.find((argument) => !argument.startsWith("--"))
    || "docs/evidence/issue7-acceptance.json";
  let receipt;
  try {
    receipt = readReceipt(resolve(root, target));
  } catch (error) {
    console.error(`Cannot read acceptance receipt ${target}: ${error.message}`);
    process.exitCode = 1;
  }
  if (receipt) {
    const result = validateOnly
      ? validateReceipt(receipt, { root })
      : evaluateClosure(receipt, { root });
    if (result.errors.length) {
      for (const error of result.errors) console.error(error);
      console.error(`Issue #7 acceptance receipt: ${result.errors.length} problem(s).`);
      process.exitCode = 1;
    } else if (validateOnly) {
      console.log(
        `Issue #7 acceptance receipt is structurally valid and honest: ${result.unmet_ids.length} unmet (${result.unmet_ids.join(", ")}). Schema validation only; parent remains open.`
      );
    } else if (result.met) {
      console.log("Issue #7 acceptance is fully evidenced; closure gate passes.");
    } else {
      console.error(
        `Issue #7 acceptance is unmet: ${result.unmet_ids.join(", ")}. Parent must remain open.`
      );
      process.exitCode = 2;
    }
  }
}
