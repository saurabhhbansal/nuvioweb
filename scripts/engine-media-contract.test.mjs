import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { CASES, encodingArgs, parseRange, loadFixtureInventory, validateFrameMeasurement } from "./engine-media-contract.mjs";

test("fixed original 4K encoder cases are bounded and 60fps is distinct from short controls", () => {
  assert.equal(CASES.length, 9);
  for (const entry of CASES) {
    const args = encodingArgs(entry, "/output/fixture.mp4");
    assert(args.includes(`testsrc2=size=3840x2160:rate=${entry.fps}`));
    assert(args.includes("-nostdin")); assert(args.includes("-n"));
    assert(entry.seconds <= 12); assert(entry.fps <= 60);
    assert.equal(args[args.indexOf("-threads") + 1], "2");
    assert.equal(args[args.indexOf("-t") + 1], String(entry.seconds));
  }
  assert(CASES.find(x => x.fps === 60).seconds >= 12);
  for (const transfer of ["smpte2084", "arib-std-b67"]) {
    const entry = CASES.find(x => x.transfer === transfer);
    const args = encodingArgs(entry, "/output/hdr.mp4");
    assert(args.some(x => x.includes("t=linear") && x.includes(`t=${transfer}`)));
    assert.equal(args[args.indexOf("-color_primaries") + 1], "bt2020");
  }
  assert.throws(() => encodingArgs({ id: "arbitrary", encoder: "sh" }, "out"));
});

test("missing, NaN and fractional frame evidence fail closed", () => {
  const stream = { width: 3840, height: 2160, duration: "2", avg_frame_rate: "24/1", nb_read_frames: "48" };
  const target = { seconds: 2, fps: 24 };
  assert.deepEqual(validateFrameMeasurement(stream, {}, target), { duration: 2, fps: 24, frames: 48 });
  for (const patch of [{ avg_frame_rate: "0/0" }, { nb_read_frames: "N/A" }, { nb_read_frames: "48.5" }, { duration: "N/A" }, { avg_frame_rate: "0/1" }]) assert.throws(() => validateFrameMeasurement({ ...stream, ...patch }, {}, target), /Measured fixture/);
});

test("Range parser handles bounded normal/open/suffix ranges and rejects invalid multipart", () => {
  assert.deepEqual(parseRange(undefined, 10), { start: 0, end: 9, status: 200 });
  assert.deepEqual(parseRange("bytes=2-5", 10), { start: 2, end: 5, status: 206 });
  assert.deepEqual(parseRange("bytes=2-", 10), { start: 2, end: 9, status: 206 });
  assert.deepEqual(parseRange("bytes=-3", 10), { start: 7, end: 9, status: 206 });
  assert.deepEqual(parseRange("bytes=0-99", 10), { start: 0, end: 9, status: 206 });
  for (const range of ["bytes=-", "bytes=-0", "bytes=9-2", "bytes=10-20", "bytes=0-1,4-5", "bytes=9007199254740992-", "garbage"]) assert.equal(parseRange(range, 10), null);
});

test("fixture inventory enforces rights, allowlisted relative paths, hashes, sizes and symlink containment", async t => {
  const directory = await mkdtemp(join(tmpdir(), "nuvio-engine-contract-"));
  // Verify exact owned temporary directory before cleanup.
  assert(directory.startsWith(resolve(tmpdir()) + "/nuvio-engine-contract-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "fixtures"); await mkdir(root);
  const bytes = Buffer.from("original fixture");
  const entry = { file: "sample.mp4", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  await writeFile(join(root, entry.file), bytes);
  const save = (file = entry, license = "CC0-1.0") => writeFile(join(root, "provenance.json"), JSON.stringify({ license, files: [file] }));
  await save(); assert.equal((await loadFixtureInventory(root)).files.size, 1);
  await save({ ...entry, bytes: 1 }); await assert.rejects(loadFixtureInventory(root), /Actual file size cap/);
  await save(entry, "unknown"); await assert.rejects(loadFixtureInventory(root), /Invalid fixture/);
  await save({ ...entry, file: "../secret" }); await assert.rejects(loadFixtureInventory(root), /Unsafe/);
  await save({ ...entry, bytes: 65 * 1024 * 1024 }); await assert.rejects(loadFixtureInventory(root), /size cap/);
  await save({ ...entry, sha256: "0".repeat(64) }); await assert.rejects(loadFixtureInventory(root), /integrity/);
  await writeFile(join(directory, "outside.mp4"), bytes);
  await symlink(join(directory, "outside.mp4"), join(root, "link.mp4"));
  await save({ ...entry, file: "link.mp4" }); await assert.rejects(loadFixtureInventory(root), /Escaping/);
});
