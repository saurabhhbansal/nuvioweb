import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { boxes, packageQualityFixture } from "./quality-fixture-packaging.mjs";
const root = new URL("../tests/fixtures/media/quality/", import.meta.url);
const provenance = JSON.parse(
  await readFile(new URL("provenance.json", root), "utf8"),
);
for (const source of provenance.files) {
  test(`original${source.observed.width}x${source.observed.height} bytes, AVC init and manifests match provenance`, async () => {
    const bytes = await readFile(new URL(source.file, root));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      source.sha256,
    );
    const result = packageQualityFixture(bytes, source.observed);
    assert.equal(result.width, source.requestedSize[0]);
    assert.equal(result.height, source.requestedSize[1]);
    assert.equal(result.codec, source.codec);
    assert.ok(source.observed.currentTime > 0);
    assert.equal(source.observed.error, null);
    for (const file of source.packaged) {
      const actual = await readFile(new URL(file.file, root));
      assert.equal(
        createHash("sha256").update(actual).digest("hex"),
        file.sha256,
      );
      assert.deepEqual(actual, result.files.get(file.file.split("/").at(-1)));
    }
    const combined = Buffer.concat([
      result.files.get("init.mp4"),
      result.files.get("segment.m4s"),
    ]);
    const mediaEnd = boxes(bytes).find((box) => box.type === "mdat").end;
    assert.deepEqual(combined, bytes.subarray(0, mediaEnd));
    assert.match(
      result.files.get("stream.m3u8").toString(),
      /#EXT-X-MAP:URI="init.mp4"/,
    );
    assert.match(
      result.files.get("manifest.mpd").toString(),
      new RegExp(`width="${result.width}" height="${result.height}"`),
    );
  });
}
test("fixed-format packaging rejects truncation, absolute addressing and unobserved dimensions", async () => {
  const source = provenance.files[0];
  const bytes = await readFile(new URL(source.file, root));
  assert.throws(() => boxes(Buffer.from([0, 0, 0])), /Truncated/);
  const badLength = Buffer.from(bytes);
  badLength.writeUInt32BE(0, 0);
  assert.throws(() => boxes(badLength), /length/);
  assert.throws(
    () => packageQualityFixture(bytes, { ...source.observed, width: 640 }),
    /dimensions/,
  );
  assert.throws(
    () =>
      packageQualityFixture(bytes, { ...source.observed, duration: Infinity }),
    /dimensions/,
  );
  const absolute = Buffer.from(bytes);
  const position = absolute.indexOf(Buffer.from("tfhd"));
  absolute.writeUInt32BE(0x000001, position + 4);
  assert.throws(
    () => packageQualityFixture(absolute, source.observed),
    /relative/,
  );
});

test("canonical native MP4s retain the original encoded samples and public provenance", async () => {
  const native = JSON.parse(await readFile(new URL("native-provenance.json", root), "utf8"));
  assert.equal(native.license, "CC0-1.0");
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash(await readFile(new URL(`../${native.source}`, import.meta.url))), native.sourceSha256);
  for (const entry of native.files) {
    const canonical = await readFile(new URL(entry.file, root));
    const original = await readFile(new URL(entry.source, root));
    assert.equal(hash(canonical), entry.sha256);
    assert.equal(hash(original), entry.sourceSha256);
    const mdat = bytes => boxes(bytes).filter(box => box.type === "mdat").map(box => bytes.subarray(box.start + 8, box.end));
    // FFmpeg packet hashes from executed remux plus byte-identical AVC payload.
    assert.deepEqual(Buffer.concat(mdat(canonical)), Buffer.concat(mdat(original)));
    assert.equal(entry.packetCount, entry.packetDataHashes.length);
    assert(entry.exactEncodedPacketsPreserved);
  }
});

test("quality provenance identifies the exact generator and bounded packager source", async () => {
  for (const [path, expected] of [
    [provenance.source, provenance.sourceSha256],
    [provenance.packagingSource, provenance.packagingSourceSha256],
  ]) {
    assert.ok(expected);
    const source = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), expected);
  }
});
