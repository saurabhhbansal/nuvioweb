import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { closureProblem, validateProgress } from "./check-progress.mjs";
import { closingReferences, scanCommits } from "./check-commit-references.mjs";
const repo = "saurabhhbansal/nuvioweb";
const complete = { number: 1, title: "Example", status: "verified", dependencies: [], completion: { pr: 27, documents: ["evidence.md"], verification: ["actual passing command"] } };
test("unsupported historical closure cannot complete an absent or unfinished roadmap ticket", () => {
  assert.ok(closureProblem(undefined, null));
  assert.ok(closureProblem({ status: "pending" }, null));
  assert.ok(closureProblem({ ...complete, completion: { pr: 27 } }, { number: 27, merged_at: "now" }));
});
test("completion requires the actual matching merged evidence PR", () => {
  assert.ok(closureProblem(complete, { number: 27, merged_at: null }));
  assert.ok(closureProblem(complete, { number: 28, merged_at: "now" }));
  assert.equal(closureProblem(complete, { number: 27, merged_at: "now" }), null);
});
test("historical closing forms from all three false closures are detected", () => {
  for (const [message, number] of [["Add XHR fallback (Resolves #12)", 12], ["feat(ui)\n\nFixes #13", 13], ["feat(profiles)\n\nCloses #15.", 15]]) assert.deepEqual(closingReferences(message, repo), [number]);
});
test("multiple and qualified local references are detected; upstream-qualified and Refs are safe", () => {
  assert.deepEqual(closingReferences(`Fixes #12, #13 and ${repo}#15`, repo), [12,13,15]);
  assert.deepEqual(closingReferences(`Resolves https://github.com/${repo}/issues/12`, repo), [12]);
  assert.deepEqual(closingReferences("Fixes alphasquare404/NuvioWeb#13\nRefs #15", repo), []);
});
test("all imported ancestry is scanned, beyond first-parent merge messages", () => {
  const root = mkdtempSync(join(tmpdir(), "nuvio-import-guard-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-b", "main"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root,"root.txt"),"baseline"); git("add", "."); git("commit", "-m", "Baseline"); const base=git("rev-parse", "HEAD");
    git("checkout", "--orphan", "upstream"); git("rm", "-rf", "."); writeFileSync(join(root,"upstream.txt"),"original"); git("add", "."); git("commit", "-m", "Upstream change: Fixes #13");
    git("checkout", "main"); git("merge", "--allow-unrelated-histories", "upstream", "-m", "Preserve original history");
    assert.deepEqual(scanCommits(base,"HEAD",repo,root).map((item)=>item.issue),[13]);
  } finally { rmSync(root,{ recursive:true,force:true }); }
});
test("ledger rejects absent documents, unknown dependencies and unverified prerequisite completions", () => {
  const errors=validateProgress({tickets:[{...complete, dependencies:[2]}, {number:2,title:"Pending",status:"pending",dependencies:[999]}]},tmpdir());
  assert.ok(errors.some((error)=>error.includes("missing evidence")));
  assert.ok(errors.some((error)=>error.includes("unverified dependency")));
  assert.ok(errors.some((error)=>error.includes("unknown dependency")));
});
