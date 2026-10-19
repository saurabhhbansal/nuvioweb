import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateUpstreamState } from "./check-upstream-state.mjs";

const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/upstream-watch/state-valid.json", import.meta.url), "utf8"));

function clone() {
  return structuredClone(fixture);
}

async function buildRoot(state) {
  const root = await mkdtemp(path.join(tmpdir(), "nuvioweb-upstream-"));
  const filePaths = new Set([
    ...state.import.provenance,
    state.licenseBaseline.audit,
    ...state.licenseBaseline.requiredPaths.map((entry) => entry.path)
  ]);
  for (const filePath of filePaths) {
    const absolute = path.join(root, filePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `fixture ${filePath}\n`);
  }
  await mkdir(path.join(root, state.import.destination), { recursive: true });
  const licensePath = path.join(root, state.licenseBaseline.rootPath);
  const digest = createHash("sha256").update(await readFile(licensePath)).digest("hex");
  state.licenseBaseline.rootSha256 = digest;
  return root;
}

async function run(mutate = () => {}) {
  const state = clone();
  const root = await buildRoot(state);
  try {
    mutate(state, root);
    return await validateUpstreamState(state, { root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function codes(result) {
  return result.errors.map((error) => error.code);
}

test("the reviewed state fixture validates", async () => {
  const result = await run();
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("unsupported schema versions and unknown top-level fields are rejected", async () => {
  assert.ok(codes(await run((state) => (state.schemaVersion = 2))).includes("SCHEMA_VERSION"));
  assert.ok(codes(await run((state) => (state.unexpected = true))).includes("UNKNOWN_FIELD"));
});

test("source identity, repository, reference and enabled-count rules are enforced", async () => {
  assert.ok(codes(await run((state) => (state.sources[1].id = state.sources[0].id))).includes("DUPLICATE_SOURCE_ID"));
  assert.ok(codes(await run((state) => (state.sources[0].repository = "https://example.com/alphasquare404/NuvioWeb"))).includes("SOURCE_REPOSITORY"));
  assert.ok(codes(await run((state) => (state.sources[0].ref = "bad ref"))).includes("SOURCE_REF"));
  assert.ok(codes(await run((state) => (state.sources[1].enabled = true))).includes("ENABLED_SOURCE_COUNT"));
  assert.ok(codes(await run((state) => (state.sources[0].enabled = false))).includes("ENABLED_SOURCE_COUNT"));
});

test("import identity, destination and provenance paths are checked", async () => {
  assert.ok(codes(await run((state) => (state.import.sourceId = "missing"))).includes("IMPORT_SOURCE"));
  assert.ok(codes(await run((state) => (state.import.commit = "nope"))).includes("SHA"));
  assert.ok(codes(await run((state) => (state.import.destination = "outside/alpha"))).includes("IMPORT_DESTINATION"));
  assert.ok(codes(await run((state) => (state.import.provenance = ["../outside.md"]))).includes("PATH_ESCAPE"));
  assert.ok(codes(await run((state) => (state.import.provenance = ["docs/missing.md"]))).includes("MISSING_PATH"));
  assert.ok(codes(await run((state) => (state.reviewedThroughSha = "short"))).includes("SHA"));
});

test("license baseline paths and the root digest are verified", async () => {
  assert.ok(codes(await run((state) => (state.licenseBaseline.rootSha256 = "0".repeat(64)))).includes("LICENSE_DIGEST_MISMATCH"));
  assert.ok(codes(await run((state) => (state.licenseBaseline.requiredPaths[0].path = "app/alpha/MISSING-LICENSE"))).includes("MISSING_PATH"));
  assert.ok(codes(await run((state) => (state.licenseBaseline.requiredPaths.push({ ...state.licenseBaseline.requiredPaths[0] })))).includes("DUPLICATE_LICENSE_PATH"));
  assert.ok(codes(await run((state) => (state.licenseBaseline.requiredPaths[0].blob = "zz"))).includes("SHA"));
});

test("a symlinked evidence path is rejected", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nuvioweb-upstream-link-"));
  const outside = await mkdtemp(path.join(tmpdir(), "nuvioweb-upstream-outside-"));
  const state = clone();
  try {
    await mkdir(path.join(root, "app/alpha"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(outside, "license"), "outside\n");
    await symlink(path.join(outside, "license"), path.join(root, "app/alpha/LICENSE"));
    await writeFile(path.join(root, "UPSTREAM_SOURCES.md"), "provenance\n");
    await writeFile(path.join(root, "docs/UPSTREAM_LICENSE_AUDIT.md"), "audit\n");
    for (const entry of state.licenseBaseline.requiredPaths.slice(1)) {
      const absolute = path.join(root, entry.path);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, "fixture\n");
    }
    const result = await validateUpstreamState(state, { root });
    assert.ok(codes(result).includes("SYMLINK_PATH"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("decision and port evidence must be complete and local paths must exist", async () => {
  assert.ok(
    codes(
      await run((state) => {
        state.decisions = [{ id: "decision-1", from: "a".repeat(40), to: "b".repeat(40), disposition: "maybe", rationale: "reason", evidence: [] }];
      })
    ).includes("DECISION_DISPOSITION")
  );
  assert.ok(
    codes(
      await run((state) => {
        state.ports = [
          {
            id: "port-1",
            upstreamSha: "a".repeat(40),
            upstreamPath: "js/example.js",
            localPath: "app/alpha/js/example.js",
            pr: 1,
            commit: "b".repeat(40),
            attribution: "example",
            tests: ["node --test example.test.mjs"],
            limits: "none"
          }
        ];
      })
    ).includes("MISSING_PATH")
  );
});

test("limits cannot exceed the implementation hard ceilings", async () => {
  assert.ok(codes(await run((state) => (state.limits.collectorRequests = 41))).includes("LIMIT_ABOVE_CEILING"));
  assert.ok(codes(await run((state) => (state.limits.publisherRequests = 0))).includes("LIMIT_VALUE"));
  assert.ok(codes(await run((state) => delete state.limits.reportBytes)).includes("LIMIT_VALUE"));
  assert.ok(codes(await run((state) => (state.limits.enabledSources = 2))).includes("LIMIT_ENABLED_SOURCES"));
});

test("the enabled source must match the import source and refs must be valid", async () => {
  assert.ok(
    codes(
      await run((state) => {
        state.sources[0].enabled = false;
        state.sources[1].enabled = true;
      })
    ).includes("ENABLED_SOURCE_MISMATCH")
  );
  assert.ok(codes(await run((state) => (state.sources[0].ref = "bad..ref"))).includes("SOURCE_REF"));
  assert.ok(codes(await run((state) => (state.import.tag = "bad//tag"))).includes("IMPORT_TAG"));
});

test("duplicate release ids and malformed evidence are rejected", async () => {
  assert.ok(
    codes(
      await run((state) => {
        state.observationBaseline = {
          tags: {},
          releases: [
            { id: 1, tagName: "v1" },
            { id: 1, tagName: "v2" }
          ]
        };
      })
    ).includes("DUPLICATE_RELEASE_ID")
  );
  assert.ok(
    codes(
      await run((state) => {
        state.decisions = [{ id: "decision-1", from: "a".repeat(40), to: "b".repeat(40), disposition: "deferred", rationale: "reason", evidence: [] }];
      })
    ).includes("DECISION_EVIDENCE")
  );
  assert.ok(
    codes(
      await run((state) => {
        state.ports = [
          {
            id: "port-1",
            upstreamSha: "a".repeat(40),
            upstreamPath: "js/example.js",
            localPath: "app/alpha/LICENSE",
            pr: 1,
            commit: "b".repeat(40),
            attribution: "example",
            tests: [null],
            limits: "none"
          }
        ];
      })
    ).includes("PORT_TESTS")
  );
});
