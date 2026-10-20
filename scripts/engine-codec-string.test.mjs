import test from "node:test";
import assert from "node:assert/strict";
import { measuredCodecString } from "./engine-codec-string.mjs";
const box = (name, data) => { const bytes = Buffer.alloc(8 + data.length); bytes.writeUInt32BE(bytes.length); bytes.write(name, 4); Buffer.from(data).copy(bytes, 8); return bytes; };
test("codec strings derive AVC/HEVC/AV1 initialization bytes without inferred levels", () => {
  const entry = codec => ({ observed: { codec } });
  assert.equal(measuredCodecString(entry("h264"), box("avcC", [1, 100, 12, 52])), "avc1.640c34");
  const hevc = [1, 1, 0x60, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 150];
  assert.equal(measuredCodecString(entry("hevc"), box("hvcC", hevc)), "hvc1.1.6.L150.90");
  assert.equal(measuredCodecString(entry("av1"), box("av1C", [0x81, 12, 0])), "av01.0.12M.08");
  assert.equal(measuredCodecString(entry("av1"), box("av1C", [0x81, 12, 64])), "av01.0.12M.10");
  assert.equal(measuredCodecString(entry("vp9"), Buffer.alloc(0)), "vp9");
});
test("missing, duplicate, truncated and unsupported config versions reject", () => {
  const entry = { observed: { codec: "h264" } };
  const valid = box("avcC", [1, 100, 12, 52]);
  assert.throws(() => measuredCodecString(entry, Buffer.alloc(0)), /Missing/);
  assert.throws(() => measuredCodecString(entry, Buffer.concat([valid, valid])), /ambiguous/);
  assert.throws(() => measuredCodecString(entry, valid.subarray(0, 11)), /bounds/);
  assert.throws(() => measuredCodecString(entry, box("avcC", [2, 100, 12, 52])), /version/);
});
