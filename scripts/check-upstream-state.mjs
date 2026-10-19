// Validates docs/upstream/state.json, the PR-reviewed upstream provenance
// checkpoint. Pure local checks: no network, no dependency install. Evidence
// paths must stay inside the repository, must not be symlinks and must exist.
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const HARD_LIMITS = Object.freeze({
  enabledSources: 1,
  collectorRequests: 40,
  publisherRequests: 12,
  commitDetails: 200,
  tagEntries: 100,
  releaseEntries: 100,
  treeEntries: 5000,
  responseBytes: 2097152,
  collectorMs: 180000,
  requestMs: 10000,
  reportBytes: 49152,
  commentBytes: 61440
});

const TOP_LEVEL_KEYS = new Set(["schemaVersion", "sources", "import", "reviewedThroughSha", "licenseBaseline", "decisions", "ports", "tracking", "limits"]);
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{1,31}$/;
const REPOSITORY = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TRACKING_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF = /^[A-Za-z0-9._/-]{1,128}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PORT_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const DECISION_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const REUSE_BOUNDARIES = new Set(["primary-import", "reference-only", "reference-only-agpl-no-code"]);
const DISPOSITIONS = new Set(["ported", "deferred", "rejected", "native-only", "browser-no-op"]);

function push(errors, code, at, message) {
  errors.push({ code, path: at, message: message || code });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(errors, value, at, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) push(errors, "UNKNOWN_FIELD", `${at}.${key}`);
  }
}

async function checkRepoPath(root, relative, errors, at, kind = "file") {
  if (typeof relative !== "string" || !relative.trim()) {
    push(errors, "INVALID_PATH", at);
    return null;
  }
  if (path.isAbsolute(relative)) {
    push(errors, "ABSOLUTE_PATH", at);
    return null;
  }
  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`) || normalized.split(path.sep).includes("..")) {
    push(errors, "PATH_ESCAPE", at);
    return null;
  }
  const absolute = path.join(root, normalized);
  let info;
  try {
    info = await lstat(absolute);
  } catch {
    push(errors, "MISSING_PATH", at);
    return null;
  }
  if (info.isSymbolicLink()) {
    push(errors, "SYMLINK_PATH", at);
    return null;
  }
  let real;
  let realRoot;
  try {
    real = await realpath(absolute);
    realRoot = await realpath(root);
  } catch {
    push(errors, "MISSING_PATH", at);
    return null;
  }
  const relativeToRoot = path.relative(realRoot, real);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    push(errors, "PATH_ESCAPE", at);
    return null;
  }
  if (kind === "file" && !info.isFile()) push(errors, "NOT_A_FILE", at);
  if (kind === "directory" && !info.isDirectory()) push(errors, "NOT_A_DIRECTORY", at);
  return real;
}

function validateSources(state, errors) {
  if (!Array.isArray(state.sources) || state.sources.length === 0 || state.sources.length > 8) {
    push(errors, "SOURCES", "sources");
    return { ids: new Set(), enabled: [] };
  }
  const ids = new Set();
  const enabled = [];
  state.sources.forEach((source, index) => {
    const at = `sources[${index}]`;
    if (!isPlainObject(source)) {
      push(errors, "SOURCE", at);
      return;
    }
    checkKeys(errors, source, at, new Set(["id", "repository", "ref", "enabled", "reuseBoundary"]));
    if (typeof source.id !== "string" || !SOURCE_ID.test(source.id)) push(errors, "SOURCE_ID", `${at}.id`);
    else if (ids.has(source.id)) push(errors, "DUPLICATE_SOURCE_ID", `${at}.id`);
    else ids.add(source.id);
    if (typeof source.repository !== "string" || !REPOSITORY.test(source.repository)) push(errors, "SOURCE_REPOSITORY", `${at}.repository`);
    if (typeof source.ref !== "string" || !REF.test(source.ref)) push(errors, "SOURCE_REF", `${at}.ref`);
    if (typeof source.enabled !== "boolean") push(errors, "SOURCE_ENABLED", `${at}.enabled`);
    if (typeof source.reuseBoundary !== "string" || !REUSE_BOUNDARIES.has(source.reuseBoundary)) push(errors, "SOURCE_BOUNDARY", `${at}.reuseBoundary`);
    if (source.enabled === true) enabled.push(source.id);
  });
  if (enabled.length !== HARD_LIMITS.enabledSources) push(errors, "ENABLED_SOURCE_COUNT", "sources");
  return { ids, enabled };
}

async function validateImport(state, errors, root, sourceIds) {
  const value = state.import;
  if (!isPlainObject(value)) {
    push(errors, "IMPORT", "import");
    return;
  }
  checkKeys(errors, value, "import", new Set(["sourceId", "commit", "tree", "destination", "importCommit", "tag", "provenance"]));
  if (typeof value.sourceId !== "string" || !sourceIds.has(value.sourceId)) push(errors, "IMPORT_SOURCE", "import.sourceId");
  if (typeof value.commit !== "string" || !SHA40.test(value.commit)) push(errors, "SHA", "import.commit");
  if (typeof value.tree !== "string" || !SHA40.test(value.tree)) push(errors, "SHA", "import.tree");
  if (typeof value.importCommit !== "string" || !SHA40.test(value.importCommit)) push(errors, "SHA", "import.importCommit");
  if (typeof value.tag !== "string" || !REF.test(value.tag)) push(errors, "IMPORT_TAG", "import.tag");
  if (typeof value.destination !== "string" || !value.destination.startsWith("app/")) push(errors, "IMPORT_DESTINATION", "import.destination");
  else await checkRepoPath(root, value.destination, errors, "import.destination", "directory");
  if (!Array.isArray(value.provenance) || value.provenance.length === 0 || value.provenance.length > 5) {
    push(errors, "IMPORT_PROVENANCE", "import.provenance");
  } else {
    for (let index = 0; index < value.provenance.length; index += 1) {
      await checkRepoPath(root, value.provenance[index], errors, `import.provenance[${index}]`, "file");
    }
  }
}

async function validateLicenseBaseline(state, errors, root) {
  const value = state.licenseBaseline;
  if (!isPlainObject(value)) {
    push(errors, "LICENSE_BASELINE", "licenseBaseline");
    return;
  }
  checkKeys(errors, value, "licenseBaseline", new Set(["audit", "rootPath", "rootSha256", "requiredPaths"]));
  await checkRepoPath(root, value.audit, errors, "licenseBaseline.audit", "file");
  const rootFile = await checkRepoPath(root, value.rootPath, errors, "licenseBaseline.rootPath", "file");
  if (typeof value.rootSha256 !== "string" || !SHA256.test(value.rootSha256)) {
    push(errors, "SHA256", "licenseBaseline.rootSha256");
  } else if (rootFile) {
    const digest = createHash("sha256").update(await readFile(rootFile)).digest("hex");
    if (digest !== value.rootSha256) push(errors, "LICENSE_DIGEST_MISMATCH", "licenseBaseline.rootSha256");
  }
  if (!Array.isArray(value.requiredPaths) || value.requiredPaths.length === 0 || value.requiredPaths.length > 20) {
    push(errors, "LICENSE_PATHS", "licenseBaseline.requiredPaths");
    return;
  }
  const seen = new Set();
  for (let index = 0; index < value.requiredPaths.length; index += 1) {
    const entry = value.requiredPaths[index];
    const at = `licenseBaseline.requiredPaths[${index}]`;
    if (!isPlainObject(entry)) {
      push(errors, "LICENSE_PATH", at);
      continue;
    }
    checkKeys(errors, entry, at, new Set(["path", "upstreamPath", "blob"]));
    if (typeof entry.path !== "string" || seen.has(entry.path)) push(errors, "DUPLICATE_LICENSE_PATH", `${at}.path`);
    else seen.add(entry.path);
    await checkRepoPath(root, entry.path, errors, `${at}.path`, "file");
    if (typeof entry.upstreamPath !== "string" || !entry.upstreamPath || path.isAbsolute(entry.upstreamPath) || entry.upstreamPath.split("/").includes("..")) {
      push(errors, "UPSTREAM_PATH", `${at}.upstreamPath`);
    }
    if (typeof entry.blob !== "string" || !SHA40.test(entry.blob)) push(errors, "SHA", `${at}.blob`);
  }
}

async function validateDecisions(state, errors, root) {
  if (!Array.isArray(state.decisions) || state.decisions.length > 100) {
    push(errors, "DECISIONS", "decisions");
    return;
  }
  const ids = new Set();
  for (let index = 0; index < state.decisions.length; index += 1) {
    const entry = state.decisions[index];
    const at = `decisions[${index}]`;
    if (!isPlainObject(entry)) {
      push(errors, "DECISION", at);
      continue;
    }
    checkKeys(errors, entry, at, new Set(["id", "from", "to", "disposition", "rationale", "evidence"]));
    if (typeof entry.id !== "string" || !DECISION_ID.test(entry.id) || ids.has(entry.id)) push(errors, "DECISION_ID", `${at}.id`);
    else ids.add(entry.id);
    if (typeof entry.from !== "string" || !SHA40.test(entry.from)) push(errors, "SHA", `${at}.from`);
    if (typeof entry.to !== "string" || !SHA40.test(entry.to)) push(errors, "SHA", `${at}.to`);
    if (typeof entry.disposition !== "string" || !DISPOSITIONS.has(entry.disposition)) push(errors, "DECISION_DISPOSITION", `${at}.disposition`);
    if (typeof entry.rationale !== "string" || entry.rationale.trim().length < 3 || entry.rationale.length > 500) push(errors, "DECISION_RATIONALE", `${at}.rationale`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length > 10) {
      push(errors, "DECISION_EVIDENCE", `${at}.evidence`);
      continue;
    }
    for (let evidenceIndex = 0; evidenceIndex < entry.evidence.length; evidenceIndex += 1) {
      const link = entry.evidence[evidenceIndex];
      if (typeof link !== "string" || (!/^https:\/\//.test(link) && !/^[\w./-]+$/.test(link))) push(errors, "DECISION_EVIDENCE", `${at}.evidence[${evidenceIndex}]`);
      else if (!/^https:\/\//.test(link)) await checkRepoPath(root, link, errors, `${at}.evidence[${evidenceIndex}]`, "file");
    }
  }
}

async function validatePorts(state, errors, root) {
  if (!Array.isArray(state.ports) || state.ports.length > 100) {
    push(errors, "PORTS", "ports");
    return;
  }
  const ids = new Set();
  for (let index = 0; index < state.ports.length; index += 1) {
    const entry = state.ports[index];
    const at = `ports[${index}]`;
    if (!isPlainObject(entry)) {
      push(errors, "PORT", at);
      continue;
    }
    checkKeys(errors, entry, at, new Set(["id", "upstreamSha", "upstreamPath", "localPath", "pr", "commit", "attribution", "tests", "limits"]));
    if (typeof entry.id !== "string" || !PORT_ID.test(entry.id) || ids.has(entry.id)) push(errors, "PORT_ID", `${at}.id`);
    else ids.add(entry.id);
    if (typeof entry.upstreamSha !== "string" || !SHA40.test(entry.upstreamSha)) push(errors, "SHA", `${at}.upstreamSha`);
    if (typeof entry.upstreamPath !== "string" || !entry.upstreamPath || path.isAbsolute(entry.upstreamPath) || entry.upstreamPath.split("/").includes("..")) {
      push(errors, "UPSTREAM_PATH", `${at}.upstreamPath`);
    }
    await checkRepoPath(root, entry.localPath, errors, `${at}.localPath`, "any");
    if (!Number.isInteger(entry.pr) || entry.pr < 1) push(errors, "PORT_PR", `${at}.pr`);
    if (typeof entry.commit !== "string" || !SHA40.test(entry.commit)) push(errors, "SHA", `${at}.commit`);
    if (typeof entry.attribution !== "string" || entry.attribution.trim().length < 3 || entry.attribution.length > 300) push(errors, "PORT_ATTRIBUTION", `${at}.attribution`);
    if (!Array.isArray(entry.tests) || entry.tests.length === 0 || entry.tests.length > 20) push(errors, "PORT_TESTS", `${at}.tests`);
    if (typeof entry.limits !== "string" || entry.limits.length > 500) push(errors, "PORT_LIMITS", `${at}.limits`);
  }
}

function validateTracking(state, errors) {
  const value = state.tracking;
  if (!isPlainObject(value)) {
    push(errors, "TRACKING", "tracking");
    return;
  }
  checkKeys(errors, value, "tracking", new Set(["repository", "issue", "comment"]));
  if (typeof value.repository !== "string" || !TRACKING_REPOSITORY.test(value.repository)) push(errors, "TRACKING_REPOSITORY", "tracking.repository");
  for (const key of ["issue", "comment"]) {
    if (value[key] != null && (!Number.isInteger(value[key]) || value[key] < 1)) push(errors, "TRACKING_ID", `tracking.${key}`);
  }
}

function validateLimits(state, errors, enabledCount) {
  const value = state.limits;
  if (!isPlainObject(value)) {
    push(errors, "LIMITS", "limits");
    return;
  }
  checkKeys(errors, value, "limits", new Set(Object.keys(HARD_LIMITS)));
  for (const [key, ceiling] of Object.entries(HARD_LIMITS)) {
    if (!Number.isInteger(value[key]) || value[key] < 1) push(errors, "LIMIT_VALUE", `limits.${key}`);
    else if (value[key] > ceiling) push(errors, "LIMIT_ABOVE_CEILING", `limits.${key}`);
  }
  if (value.enabledSources !== enabledCount) push(errors, "LIMIT_ENABLED_SOURCES", "limits.enabledSources");
}

export async function validateUpstreamState(state, { root = REPO_ROOT } = {}) {
  const errors = [];
  if (!isPlainObject(state)) {
    push(errors, "STATE", "$");
    return { ok: false, errors };
  }
  checkKeys(errors, state, "$", TOP_LEVEL_KEYS);
  if (state.schemaVersion !== 1) push(errors, "SCHEMA_VERSION", "schemaVersion");
  const { ids } = validateSources(state, errors);
  await validateImport(state, errors, root, ids);
  if (typeof state.reviewedThroughSha !== "string" || !SHA40.test(state.reviewedThroughSha)) push(errors, "SHA", "reviewedThroughSha");
  await validateLicenseBaseline(state, errors, root);
  await validateDecisions(state, errors, root);
  await validatePorts(state, errors, root);
  validateTracking(state, errors);
  const enabledCount = Array.isArray(state.sources) ? state.sources.filter((source) => source?.enabled === true).length : 0;
  validateLimits(state, errors, enabledCount);
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const statePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(REPO_ROOT, "docs/upstream/state.json");
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const result = await validateUpstreamState(state);
    console.log(JSON.stringify({ ok: result.ok, errorCount: result.errors.length, errors: result.errors }, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error(JSON.stringify({ ok: false, errorCount: 1, errors: [{ code: "STATE_READ_FAILED", path: "$", message: "STATE_READ_FAILED" }] }, null, 2));
    process.exitCode = 1;
  }
}
