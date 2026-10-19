// Read-only upstream collector for issue #23. Performs GET requests only,
// validates the reviewed state first and never imports, writes to upstream
// refs, opens PRs or executes upstream code. Tests inject fetch and clock.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUpstreamState, REPO_ROOT } from "./check-upstream-state.mjs";

export const COLLECTOR_LIMITS = Object.freeze({
  requests: 40,
  perRequestMs: 10000,
  collectorMs: 180000,
  responseBytes: 2 * 1024 * 1024,
  commitDetails: 200,
  tagEntries: 100,
  releaseEntries: 100,
  treeEntries: 5000,
  reportBytes: 48 * 1024
});

const SHA40 = /^[a-f0-9]{40}$/;
const REPO_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export class CollectorError extends Error {
  constructor(code, { retryable = false } = {}) {
    super(code);
    this.name = "CollectorError";
    this.code = code;
    this.retryable = retryable;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repositoryPath(repository) {
  const match = REPO_PATTERN.exec(repository);
  if (!match) throw new CollectorError("state-invalid");
  return `${match[1]}/${match[2]}`;
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new CollectorError("response-too-large");
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new CollectorError("response-too-large");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new CollectorError("response-too-large");
  return text;
}

function createApi({ repository, fetchImpl, now, deadline, limits }) {
  let requests = 0;
  let bytes = 0;
  const urls = [];
  async function get(pathname) {
    if (requests >= limits.requests) throw new CollectorError("budget-requests");
    if (now() > deadline) throw new CollectorError("timeout");
    requests += 1;
    const url = `https://api.github.com${pathname}`;
    urls.push(url);
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "nuvioweb-upstream-watch"
        },
        signal: AbortSignal.timeout(Math.min(limits.perRequestMs, Math.max(1, deadline - now())))
      });
    } catch (error) {
      throw new CollectorError(error?.name === "AbortError" || error?.name === "TimeoutError" ? "timeout" : "network");
    }
    if (!response || typeof response.status !== "number") throw new CollectorError("network");
    if (response.status !== 200) throw new CollectorError(`http-${response.status}`, { retryable: [429, 500, 502, 503, 504].includes(response.status) });
    const text = await readBounded(response, limits.responseBytes);
    bytes += new TextEncoder().encode(text).length;
    try {
      return JSON.parse(text);
    } catch {
      throw new CollectorError("malformed-json");
    }
  }
  return { get, stats: () => ({ requests, bytes }), urls };
}

async function resolveRef(api, repository, ref) {
  const data = await api.get(`/repos/${repository}/commits/${encodeURIComponent(ref)}`);
  if (!data || typeof data.sha !== "string" || !SHA40.test(data.sha)) throw new CollectorError("invalid-ref-response");
  return data.sha;
}

function mapRelationship(status) {
  if (["identical", "ahead", "behind", "diverged"].includes(status)) return status;
  return "unknown";
}

async function compareRefs(api, repository, base, head, limits) {
  const commits = [];
  let relation = "unknown";
  let aheadBy;
  let behindBy;
  let complete = true;
  for (let page = 1; page <= 2; page += 1) {
    const data = await api.get(`/repos/${repository}/compare/${base}...${head}?per_page=100&page=${page}`);
    if (!data || typeof data !== "object") throw new CollectorError("invalid-compare-response");
    relation = mapRelationship(data.status);
    aheadBy = Number.isInteger(data.ahead_by) ? data.ahead_by : aheadBy;
    behindBy = Number.isInteger(data.behind_by) ? data.behind_by : behindBy;
    const pageCommits = Array.isArray(data.commits) ? data.commits : [];
    for (const commit of pageCommits) {
      if (typeof commit?.sha === "string" && SHA40.test(commit.sha)) commits.push(commit.sha);
    }
    if (pageCommits.length < 100) break;
    if (page === 2) complete = false;
  }
  return {
    relationship: relation,
    aheadBy,
    behindBy,
    complete,
    commits: [...new Set(commits)].slice(0, limits.commitDetails)
  };
}

async function readTree(api, repository, sha, limits) {
  const data = await api.get(`/repos/${repository}/git/trees/${sha}?recursive=1`);
  if (!data || !Array.isArray(data.tree)) throw new CollectorError("invalid-tree-response");
  if (data.truncated === true) throw new CollectorError("tree-truncated");
  if (data.tree.length > limits.treeEntries) throw new CollectorError("tree-too-large");
  const tree = new Map();
  for (const entry of data.tree) {
    if (entry?.type === "blob" && typeof entry.path === "string" && typeof entry.sha === "string" && SHA40.test(entry.sha)) {
      tree.set(entry.path, { blob: entry.sha, mode: entry.mode });
    }
  }
  return tree;
}

async function readTags(api, repository, limits) {
  const data = await api.get(`/repos/${repository}/tags?per_page=100`);
  if (!Array.isArray(data)) throw new CollectorError("invalid-tags-response");
  const tags = new Map();
  for (const entry of data) {
    if (typeof entry?.name === "string" && typeof entry.commit?.sha === "string" && SHA40.test(entry.commit.sha)) {
      tags.set(entry.name, entry.commit.sha);
    }
  }
  return { tags, overflow: data.length >= limits.tagEntries };
}

async function readReleases(api, repository, limits) {
  const data = await api.get(`/repos/${repository}/releases?per_page=100`);
  if (!Array.isArray(data)) throw new CollectorError("invalid-releases-response");
  const releases = [];
  for (const entry of data) {
    if (Number.isInteger(entry?.id) && typeof entry?.tag_name === "string") releases.push({ id: entry.id, tagName: entry.tag_name });
  }
  return { releases, overflow: data.length >= limits.releaseEntries };
}

function baselineTags(state) {
  return state.observationBaseline?.tags && typeof state.observationBaseline.tags === "object" ? state.observationBaseline.tags : null;
}

function baselineReleases(state) {
  return Array.isArray(state.observationBaseline?.releases) ? state.observationBaseline.releases : null;
}

function tagComparison(baseline, observed) {
  if (!baseline) return { added: [], removed: [], retargeted: [] };
  const added = [];
  const removed = [];
  const retargeted = [];
  for (const [name, sha] of observed) {
    if (!(name in baseline)) added.push(name);
    else if (baseline[name] !== sha) retargeted.push({ name, from: baseline[name], to: sha });
  }
  for (const name of Object.keys(baseline)) {
    if (!observed.has(name)) removed.push(name);
  }
  return { added: added.slice(0, 100), removed: removed.slice(0, 100), retargeted: retargeted.slice(0, 100) };
}

function releaseComparison(baseline, observed) {
  if (!baseline) return { added: [], removed: [], changed: [] };
  const baselineById = new Map(baseline.map((entry) => [entry.id, entry]));
  const observedById = new Map(observed.map((entry) => [entry.id, entry]));
  const added = observed.filter((entry) => !baselineById.has(entry.id)).map((entry) => entry.id).slice(0, 100);
  const removed = baseline.filter((entry) => !observedById.has(entry.id)).map((entry) => entry.id).slice(0, 100);
  const changed = observed
    .filter((entry) => baselineById.has(entry.id) && baselineById.get(entry.id).tagName !== entry.tagName)
    .map((entry) => entry.id)
    .slice(0, 100);
  return { added, removed, changed };
}

function licenseComparison(state, observedTree) {
  const required = state.licenseBaseline.requiredPaths;
  const changed = [];
  if (!observedTree) return { status: "unknown", findings: [], changed };
  for (const entry of required) {
    const observed = observedTree.get(entry.upstreamPath);
    if (!observed) changed.push(`${entry.upstreamPath}:missing`);
    else if (observed.blob !== entry.blob) changed.push(`${entry.upstreamPath}:blob-changed`);
  }
  return { status: changed.length ? "drift-detected" : "tracked-notices-unchanged", findings: changed.slice(0, 100), changed };
}

function changeSamples(importTree, observedTree, limits) {
  if (!importTree || !observedTree) return { total: 0, truncated: false, samples: [] };
  const changed = [];
  for (const [filePath, entry] of observedTree) {
    const previous = importTree.get(filePath);
    if (!previous || previous.blob !== entry.blob || previous.mode !== entry.mode) changed.push(filePath);
  }
  for (const filePath of importTree.keys()) {
    if (!observedTree.has(filePath)) changed.push(filePath);
  }
  const unique = [...new Set(changed)].sort();
  return { total: unique.length, truncated: unique.length > 50, samples: unique.slice(0, 50) };
}

function disabledSourceReport(source) {
  return {
    id: source.id,
    repository: source.repository,
    ref: source.ref,
    enabled: false,
    refs: { import: null, reviewed: null, observed: null },
    comparisons: { importToObserved: { relationship: "unknown", complete: false }, reviewedToObserved: { relationship: "unknown", complete: false } },
    files: { total: 0, truncated: false },
    tags: { added: [], removed: [], retargeted: [] },
    releases: { added: [], removed: [], changed: [] },
    license: { status: "unknown", findings: [] },
    parity: { matched: [], unresolved: [] }
  };
}

export async function collectUpstreamReport({ state, stateSha256, projectSha, fetchImpl = fetch, now = () => Date.now(), root = REPO_ROOT, limits = COLLECTOR_LIMITS } = {}) {
  const validation = await validateUpstreamState(state, { root });
  if (!validation.ok) throw new CollectorError("state-invalid");
  if (typeof stateSha256 !== "string" || !/^[a-f0-9]{64}$/.test(stateSha256)) throw new CollectorError("state-sha-invalid");
  if (typeof projectSha !== "string" || !SHA40.test(projectSha)) throw new CollectorError("project-sha-invalid");
  const enabled = state.sources.filter((source) => source.enabled === true);
  if (enabled.length !== 1) throw new CollectorError("state-invalid");
  const source = enabled[0];
  const repository = repositoryPath(source.repository);
  const startedAt = now();
  const api = createApi({ repository, fetchImpl, now, deadline: startedAt + limits.collectorMs, limits });
  const errors = [];
  const findings = [];
  const capsReached = [];
  const recordError = (error, operation) => {
    errors.push({ code: error instanceof CollectorError ? error.code : "collector-error", operation, retryable: error instanceof CollectorError ? error.retryable : false });
  };
  const recordCap = (cap) => {
    if (!capsReached.includes(cap)) capsReached.push(cap);
  };

  let observed = null;
  try {
    observed = await resolveRef(api, repository, source.ref);
  } catch (error) {
    recordError(error, "resolve-ref");
  }

  let importToObserved = { relationship: "unknown", complete: false };
  let reviewedToObserved = { relationship: "unknown", complete: false };
  let files = { total: 0, truncated: true, samples: [] };
  let tags = { added: [], removed: [], retargeted: [] };
  let releases = { added: [], removed: [], changed: [] };
  let license = { status: "unknown", findings: [] };

  if (observed) {
    try {
      importToObserved = await compareRefs(api, repository, state.import.commit, observed, limits);
    } catch (error) {
      recordError(error, "compare-import");
    }
    try {
      reviewedToObserved = await compareRefs(api, repository, state.reviewedThroughSha, observed, limits);
    } catch (error) {
      recordError(error, "compare-reviewed");
    }

    let importTree = null;
    let observedTree = null;
    try {
      importTree = await readTree(api, repository, state.import.tree, limits);
    } catch (error) {
      recordError(error, "tree-import");
    }
    try {
      observedTree = await readTree(api, repository, observed, limits);
    } catch (error) {
      recordError(error, "tree-observed");
    }
    if (importTree && observedTree) files = changeSamples(importTree, observedTree, limits);
    if (files.total > 50) recordCap("file-samples");
    license = licenseComparison(state, observedTree);

    try {
      const tagScan = await readTags(api, repository, limits);
      if (tagScan.overflow) {
        recordCap("tag-entries");
        errors.push({ code: "tag-overflow", operation: "tags", retryable: false });
      }
      tags = tagComparison(baselineTags(state), tagScan.tags);
    } catch (error) {
      recordError(error, "tags");
    }
    try {
      const releaseScan = await readReleases(api, repository, limits);
      if (releaseScan.overflow) {
        recordCap("release-entries");
        errors.push({ code: "release-overflow", operation: "releases", retryable: false });
      }
      releases = releaseComparison(baselineReleases(state), releaseScan.releases);
    } catch (error) {
      recordError(error, "releases");
    }

    if (!baselineTags(state) || !baselineReleases(state)) {
      findings.push({
        id: "baseline-review-required",
        kind: "unclassified",
        severity: "review",
        evidence: ["state:observationBaseline"],
        reviewRequired: true
      });
    }
    if (["ahead", "behind", "diverged"].includes(importToObserved.relationship)) {
      findings.push({
        id: `upstream-drift-${observed.slice(0, 12)}`,
        kind: "unclassified",
        severity: "review",
        evidence: [`${source.repository}/commit/${observed}`, `comparison:${importToObserved.relationship}`],
        reviewRequired: true
      });
    }
    try {
      const rechecked = await resolveRef(api, repository, source.ref);
      if (rechecked !== observed) {
        errors.push({ code: "unstable-ref", operation: "recheck-ref", retryable: true });
      }
    } catch (error) {
      recordError(error, "recheck-ref");
    }
    if (license.status === "drift-detected") {
      findings.push({
        id: `license-drift-${observed.slice(0, 12)}`,
        kind: "license-drift",
        severity: "warning",
        evidence: license.findings.slice(0, 20),
        reviewRequired: true
      });
    }
  }

  const comparisonComplete = importToObserved.complete === true && reviewedToObserved.complete === true;
  const status = !observed ? "error" : errors.length === 0 && comparisonComplete ? "complete" : "partial";
  const stats = api.stats();
  const report = {
    schemaVersion: 1,
    projectSha,
    stateSha256,
    generatedAt: new Date(now()).toISOString(),
    status,
    sources: [
      {
        id: source.id,
        repository: source.repository,
        ref: source.ref,
        enabled: true,
        refs: { import: state.import.commit, reviewed: state.reviewedThroughSha, observed },
        comparisons: { importToObserved, reviewedToObserved },
        files,
        tags,
        releases,
        license: { status: license.status, findings: license.findings },
        parity: {
          matched: [],
          unresolved: reviewedToObserved.relationship === "ahead" || reviewedToObserved.relationship === "diverged" ? ["review-required"] : []
        }
      },
      ...state.sources.filter((entry) => entry.enabled !== true).map(disabledSourceReport)
    ],
    findings,
    errors,
    limits: { requests: stats.requests, bytes: stats.bytes, truncated: capsReached.length > 0 || files.truncated === true, capsReached }
  };
  report.fingerprint = sha256(
    canonical({
      schemaVersion: report.schemaVersion,
      projectSha: report.projectSha,
      stateSha256: report.stateSha256,
      sources: report.sources,
      findings: report.findings,
      errors: report.errors
    })
  );
  if (new TextEncoder().encode(JSON.stringify(report)).length > limits.reportBytes) throw new CollectorError("report-too-large");
  return { report, urls: api.urls };
}

function parseArgs(argv) {
  const options = { state: path.join(REPO_ROOT, "docs/upstream/state.json"), report: path.join(REPO_ROOT, "dist/upstream-watch/report.json") };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--state") options.state = path.resolve(argv[++index] || "");
    else if (flag === "--report") options.report = path.resolve(argv[++index] || "");
    else if (flag === "--project-sha") options.projectSha = argv[++index];
    else throw new CollectorError("invalid-arguments");
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const distRoot = path.join(REPO_ROOT, "dist");
    if (!options.report.startsWith(distRoot + path.sep)) throw new CollectorError("report-path-rejected");
    const raw = await readFile(options.state);
    const state = JSON.parse(raw.toString("utf8"));
    const projectSha = options.projectSha || execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const { report } = await collectUpstreamReport({ state, stateSha256: sha256(raw), projectSha });
    await mkdir(path.dirname(options.report), { recursive: true });
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ status: report.status, fingerprint: report.fingerprint, findings: report.findings.length, errors: report.errors.length }, null, 2));
    process.exitCode = report.status === "complete" ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error instanceof CollectorError ? error.code : "collector-failed" }));
    process.exitCode = 1;
  }
}
