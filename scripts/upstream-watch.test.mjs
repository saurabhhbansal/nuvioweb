import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collectUpstreamReport, COLLECTOR_LIMITS } from "./upstream-watch.mjs";

const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/upstream-watch/state-valid.json", import.meta.url), "utf8"));
const IMPORT = fixture.import.commit;
const OBSERVED = "b".repeat(40);
const OTHER = "c".repeat(40);
const PROJECT = "d".repeat(40);
const STATE_SHA = "e".repeat(64);

function response(body, status = 200, text) {
  return {
    status,
    headers: { get: () => null },
    text: async () => (text !== undefined ? text : JSON.stringify(body))
  };
}

function makeFetch(routes) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.github.com");
    const key = `${parsed.pathname}${parsed.search}`;
    for (const [prefix, handler] of routes) {
      if (key === prefix || key.startsWith(prefix)) {
        if (handler instanceof Error) throw handler;
        if (typeof handler === "function") return handler(parsed);
        if (handler && typeof handler === "object" && handler.headers && typeof handler.text === "function") return handler;
        if (handler.status && handler.text !== undefined) return response(handler.body, handler.status, handler.text);
        return response(handler);
      }
    }
    throw new Error(`UNEXPECTED_REQUEST ${key}`);
  };
  impl.calls = calls;
  return impl;
}

function compareBody(status, { ahead = 0, behind = 0, commits = [] } = {}) {
  return {
    status,
    ahead_by: ahead,
    behind_by: behind,
    total_commits: commits.length,
    commits: commits.map((sha) => ({ sha }))
  };
}

function treeBody(entries, truncated = false) {
  return { truncated, tree: entries.map(([filePath, blob]) => ({ type: "blob", path: filePath, sha: blob, mode: "100644" })) };
}

const baseEntries = fixture.licenseBaseline.requiredPaths.map((entry) => [entry.upstreamPath, entry.blob]);

function defaultRoutes() {
  return [
    [`/repos/alphasquare404/NuvioWeb/commits/web`, { sha: OBSERVED }],
    [`/repos/alphasquare404/NuvioWeb/compare/`, compareBody("identical")],
    [`/repos/alphasquare404/NuvioWeb/git/trees/${fixture.import.tree}`, treeBody(baseEntries)],
    [`/repos/alphasquare404/NuvioWeb/git/trees/${OBSERVED}`, treeBody(baseEntries)],
    [`/repos/alphasquare404/NuvioWeb/tags`, []],
    [`/repos/alphasquare404/NuvioWeb/releases`, []]
  ];
}

async function buildRoot(state) {
  const root = await mkdtemp(path.join(tmpdir(), "nuvioweb-watch-"));
  const files = new Set([...state.import.provenance, state.licenseBaseline.audit, ...state.licenseBaseline.requiredPaths.map((entry) => entry.path)]);
  for (const filePath of files) {
    const absolute = path.join(root, filePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `fixture ${filePath}\n`);
  }
  await mkdir(path.join(root, state.import.destination), { recursive: true });
  state.licenseBaseline.rootSha256 = createHash("sha256").update(await readFile(path.join(root, state.licenseBaseline.rootPath))).digest("hex");
  return root;
}

async function run({ mutate = () => {}, routes = defaultRoutes(), limits } = {}) {
  const state = structuredClone(fixture);
  mutate(state);
  const root = await buildRoot(state);
  try {
    const fetchImpl = makeFetch(routes);
    const { report } = await collectUpstreamReport({
      state,
      stateSha256: STATE_SHA,
      projectSha: PROJECT,
      fetchImpl,
      now: () => 1000,
      root,
      limits
    });
    return { report, calls: fetchImpl.calls };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function codes(report) {
  return report.errors.map((error) => error.code);
}

test("identical history produces a complete report with a baseline-review finding", async () => {
  const { report, calls } = await run();
  assert.equal(report.status, "complete");
  assert.equal(report.sources[0].comparisons.importToObserved.relationship, "identical");
  assert.equal(report.sources[0].comparisons.reviewedToObserved.relationship, "identical");
  assert.equal(report.sources[0].license.status, "tracked-notices-unchanged");
  assert.equal(report.sources[0].files.total, 0);
  assert.ok(report.findings.some((finding) => finding.id === "baseline-review-required"));
  assert.equal(report.errors.length, 0);
  assert.ok(calls.every((url) => url.startsWith("https://api.github.com/repos/alphasquare404/NuvioWeb/")));
});

test("ahead history, changed files and license drift remain review-required", async () => {
  const changedEntries = baseEntries.map(([filePath, blob]) => (filePath === "LICENSE" ? [filePath, OTHER] : [filePath, blob]));
  changedEntries.push(["js/new-file.js", OTHER]);
  const { report } = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.includes("/compare/")
        ? [prefix, compareBody("ahead", { ahead: 2, commits: [OTHER, IMPORT] })]
        : prefix.includes("/git/trees/") && prefix.endsWith(OBSERVED)
          ? [prefix, treeBody(changedEntries)]
          : [prefix, handler]
    )
  });
  assert.equal(report.status, "complete");
  assert.equal(report.sources[0].comparisons.importToObserved.relationship, "ahead");
  assert.equal(report.sources[0].comparisons.importToObserved.aheadBy, 2);
  assert.ok(report.sources[0].files.total >= 2);
  assert.equal(report.sources[0].license.status, "drift-detected");
  assert.ok(report.findings.some((finding) => finding.id.startsWith("upstream-drift-")));
  assert.ok(report.findings.some((finding) => finding.kind === "license-drift"));
  assert.deepEqual(report.sources[0].parity.unresolved, ["review-required"]);
});

for (const relationship of ["behind", "diverged"]) {
  test(`${relationship} history is reported without compatibility claims`, async () => {
    const { report } = await run({
      routes: defaultRoutes().map(([prefix, handler]) => (prefix.includes("/compare/") ? [prefix, compareBody(relationship)] : [prefix, handler]))
    });
    assert.equal(report.sources[0].comparisons.importToObserved.relationship, relationship);
    assert.ok(report.findings.every((finding) => finding.kind === "unclassified" || finding.kind === "license-drift"));
  });
}

test("approved tag and release baselines produce added, removed and retargeted records", async () => {
  const { report } = await run({
    mutate: (state) => {
      state.observationBaseline = {
        tags: { "v0.1.0": IMPORT, old: OTHER },
        releases: [{ id: 1, tagName: "v0.1.0" }]
      };
    },
    routes: defaultRoutes().map(([prefix, handler]) => {
      if (prefix.endsWith("/tags")) {
        return [prefix, [{ name: "v0.1.0", commit: { sha: IMPORT } }, { name: "new", commit: { sha: OTHER } }]];
      }
      if (prefix.endsWith("/releases")) {
        return [prefix, [{ id: 1, tag_name: "v0.1.0-renamed" }, { id: 2, tag_name: "new" }]];
      }
      return [prefix, handler];
    })
  });
  assert.deepEqual(report.sources[0].tags.added, ["new"]);
  assert.deepEqual(report.sources[0].tags.removed, ["old"]);
  assert.deepEqual(report.sources[0].releases.changed, [1]);
  assert.deepEqual(report.sources[0].releases.added, [{ id: 2, tagName: "new" }]);
  assert.ok(!report.findings.some((finding) => finding.id === "baseline-review-required"));
});

test("a retargeted tag is reported with both targets", async () => {
  const { report } = await run({
    mutate: (state) => {
      state.observationBaseline = { tags: { "v0.1.0": IMPORT }, releases: [] };
    },
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.endsWith("/tags") ? [prefix, [{ name: "v0.1.0", commit: { sha: OTHER } }]] : [prefix, handler]
    )
  });
  assert.deepEqual(report.sources[0].tags.retargeted, [{ name: "v0.1.0", from: IMPORT, to: OTHER }]);
});

test("a truncated tree produces a partial report, not a clean one", async () => {
  const { report } = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.endsWith(OBSERVED) && prefix.includes("/git/trees/") ? [prefix, { truncated: true, tree: [] }] : [prefix, handler]
    )
  });
  assert.equal(report.status, "partial");
  assert.ok(codes(report).includes("tree-truncated"));
  assert.equal(report.sources[0].license.status, "unknown");
});

test("malformed JSON and oversized responses fail closed", async () => {
  const malformed = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.includes("/compare/") ? [prefix, { status: 200, text: "{" }] : [prefix, handler]
    )
  });
  assert.equal(malformed.report.status, "partial");
  assert.ok(codes(malformed.report).includes("malformed-json"));

  const oversized = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.includes("/compare/") ? [prefix, { status: 200, text: "x".repeat(COLLECTOR_LIMITS.responseBytes + 1) }] : [prefix, handler]
    )
  });
  assert.equal(oversized.report.status, "partial");
  assert.ok(codes(oversized.report).includes("response-too-large"));
});

test("HTTP, network and timeout failures are categorized", async () => {
  const unauthorized = await run({
    routes: defaultRoutes().map(([prefix, handler]) => (prefix.includes("/compare/") ? [prefix, { status: 401, body: {}, text: "{}" }] : [prefix, handler]))
  });
  assert.ok(codes(unauthorized.report).includes("http-401"));

  const limited = await run({
    routes: defaultRoutes().map(([prefix, handler]) => (prefix.includes("/compare/") ? [prefix, { status: 429, body: {}, text: "{}" }] : [prefix, handler]))
  });
  assert.ok(codes(limited.report).includes("http-429"));
  assert.equal(limited.report.errors.find((error) => error.code === "http-429").retryable, true);

  const network = await run({
    routes: defaultRoutes().map(([prefix, handler]) => (prefix.includes("/compare/") ? [prefix, new TypeError("fetch failed")] : [prefix, handler]))
  });
  assert.ok(codes(network.report).includes("network"));

  const timeout = await run({
    routes: defaultRoutes().map(([prefix, handler]) => (prefix.includes("/compare/") ? [prefix, Object.assign(new Error("aborted"), { name: "AbortError" })] : [prefix, handler]))
  });
  assert.ok(codes(timeout.report).includes("timeout"));
});

test("the request budget and an unstable ref are reported", async () => {
  const budget = await run({ limits: { ...COLLECTOR_LIMITS, requests: 1 } });
  assert.equal(budget.report.status, "partial");
  assert.ok(codes(budget.report).includes("budget-requests"));

  let resolves = 0;
  const unstable = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.endsWith("/commits/web")
        ? [prefix, () => {
            resolves += 1;
            return response({ sha: resolves === 1 ? OBSERVED : OTHER });
          }]
        : [prefix, handler]
    )
  });
  assert.ok(codes(unstable.report).includes("unstable-ref"));
  assert.equal(unstable.report.status, "partial");
});

test("tag inventory overflow is partial and an unresolved ref is an error", async () => {
  const manyTags = Array.from({ length: 100 }, (_, index) => ({ name: `v0.0.${index}`, commit: { sha: IMPORT } }));
  const overflow = await run({
    routes: defaultRoutes().map(([prefix, handler]) => (prefix.endsWith("/tags") ? [prefix, manyTags] : [prefix, handler]))
  });
  assert.equal(overflow.report.status, "partial");
  assert.ok(codes(overflow.report).includes("tag-overflow"));

  const missing = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.endsWith("/commits/web") ? [prefix, { status: 404, body: {}, text: "{}" }] : [prefix, handler]
    )
  });
  assert.equal(missing.report.status, "error");
  assert.ok(codes(missing.report).includes("http-404"));
  assert.equal(missing.report.sources[0].refs.observed, null);
});

test("malformed comparison data cannot produce a complete report", async () => {
  const { report } = await run({
    routes: defaultRoutes().map(([prefix, handler]) => (prefix.includes("/compare/") ? [prefix, {}] : [prefix, handler]))
  });
  assert.equal(report.status, "partial");
  assert.ok(codes(report).includes("invalid-compare-response"));
});

test("validated state limits are applied without caller overrides", async () => {
  const { report } = await run({
    mutate: (state) => {
      state.limits.collectorRequests = 1;
    }
  });
  assert.equal(report.status, "partial");
  assert.ok(codes(report).includes("budget-requests"));
});

test("newly added licensing inventory is drift, not unchanged", async () => {
  const entries = [...baseEntries, ["vendor/NEW-LICENSE", OTHER]];
  const { report } = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.includes("/git/trees/") && prefix.endsWith(OBSERVED) ? [prefix, treeBody(entries)] : [prefix, handler]
    )
  });
  assert.equal(report.sources[0].license.status, "drift-detected");
  assert.ok(report.sources[0].license.findings.includes("added:vendor/NEW-LICENSE"));
  assert.ok(report.findings.some((finding) => finding.kind === "license-drift"));
});

test("equivalent tag inventories produce the same fingerprint", async () => {
  const baseline = { tags: { alpha: IMPORT, beta: OTHER }, releases: [] };
  const first = await run({
    mutate: (state) => {
      state.observationBaseline = baseline;
    },
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.endsWith("/tags") ? [prefix, [{ name: "alpha", commit: { sha: IMPORT } }, { name: "beta", commit: { sha: OTHER } }]] : [prefix, handler]
    )
  });
  const second = await run({
    mutate: (state) => {
      state.observationBaseline = baseline;
    },
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.endsWith("/tags") ? [prefix, [{ name: "beta", commit: { sha: OTHER } }, { name: "alpha", commit: { sha: IMPORT } }]] : [prefix, handler]
    )
  });
  assert.equal(first.report.fingerprint, second.report.fingerprint);
});

test("the report writer rejects a symlinked output path", async () => {
  const { assertSafeReportPath } = await import("./upstream-watch.mjs");
  const { mkdtemp, symlink } = await import("node:fs/promises");
  const root = await mkdtemp(path.join(tmpdir(), "nuvioweb-report-"));
  const outside = await mkdtemp(path.join(tmpdir(), "nuvioweb-report-outside-"));
  try {
    await symlink(outside, path.join(root, "link"), "dir");
    await assert.rejects(assertSafeReportPath(path.join(root, "link", "report.json"), root), /report-path-rejected/);
    const safe = await assertSafeReportPath(path.join(root, "nested", "report.json"), root);
    assert.equal(safe, path.join(root, "nested", "report.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a declared oversized content length fails before reading the body", async () => {
  const { report } = await run({
    routes: defaultRoutes().map(([prefix, handler]) =>
      prefix.includes("/compare/")
        ? [prefix, { status: 200, headers: { get: (name) => (name === "content-length" ? String(COLLECTOR_LIMITS.responseBytes + 1) : null) }, text: async () => "{}" }]
        : [prefix, handler]
    )
  });
  assert.equal(report.status, "partial");
  assert.ok(codes(report).includes("response-too-large"));
});
