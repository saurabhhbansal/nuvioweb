import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { boxes, packageQualityFixture } from "./quality-fixture-packaging.mjs";

// Test fixtures only: canonical fragment timing, never transcoding user media.
// Original MediaRecorder fixtures and their recorded source hashes stay intact.
const exec = promisify(execFile);
const root = new URL("../tests/fixtures/media/quality/", import.meta.url);
const ffmpeg = process.env.NUVIO_FIXTURE_FFMPEG || "ffmpeg";
const ffprobe = process.env.NUVIO_FIXTURE_FFPROBE || "ffprobe";
const run = async (file, args) => (await exec(file, args, { timeout: 30000, maxBuffer: 1024 * 1024 })).stdout;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const packetHashes = async url => JSON.parse(await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "sha256", "-show_entries", "packet=data_hash", "-of", "json", fileURLToPath(url)])).packets.map(packet => packet.data_hash);
const payload = bytes => Buffer.concat(boxes(bytes).filter(box => box.type === "mdat").map(box => bytes.subarray(box.start + 8, box.end)));
const originalProvenance = JSON.parse(await readFile(new URL("provenance.json", root), "utf8"));
const records = [];
for (const size of ["1080", "2160"]) {
  const directory = `canonical${size}p`;
  const input = new URL(`original-${size}p.mp4`, root);
  const output = new URL(`${directory}/normalized.mp4`, root);
  const source = originalProvenance.files.find(entry => entry.file === `original-${size}p.mp4`);
  const original = await readFile(input);
  if (hash(original) !== source.sha256) throw new Error("Original fixture hash mismatch");
  await mkdir(new URL(`${directory}/`, root), { recursive: true });
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i", fileURLToPath(input), "-map", "0:v:0", "-c:v", "copy", "-movflags", "+empty_moov+default_base_moof+frag_keyframe", fileURLToPath(output)];
  await run(ffmpeg, args);
  const before = await packetHashes(input), after = await packetHashes(output);
  const canonical = await readFile(output);
  if (!before.length || JSON.stringify(before) !== JSON.stringify(after) || !payload(canonical).equals(payload(original))) throw new Error("Canonical fragments changed encoded video samples");
  const probe = JSON.parse(await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=duration", "-of", "json", fileURLToPath(output)]));
  const stream = probe.streams[0];
  const duration = Number(probe.format.duration);
  if (stream.codec_name !== "h264" || stream.width !== source.observed.width || stream.height !== source.observed.height) throw new Error("Canonical source dimensions/codec changed");
  const packaged = packageQualityFixture(canonical, { width: stream.width, height: stream.height, duration });
  const files = [];
  for (const [name, bytes] of packaged.files) {
    await writeFile(new URL(`${directory}/${name}`, root), bytes, { flag: "wx" });
    files.push({ file: `${directory}/${name}`, bytes: bytes.length, sha256: hash(bytes) });
  }
  records.push({ directory, source: source.file, sourceSha256: source.sha256, canonicalFile: `${directory}/normalized.mp4`, canonicalSha256: hash(canonical), canonicalBytes: canonical.length, codec: packaged.codec, width: packaged.width, height: packaged.height, duration, durationBasis: "ffprobe canonical format.duration", packetCount: before.length, packetDataHashes: after, exactEncodedPacketsPreserved: true, exactMdatPayloadPreserved: true, packaged: files, command: ["ffmpeg", ...args.map(arg => arg === fileURLToPath(input) ? `<quality>/${source.file}` : arg === fileURLToPath(output) ? `<quality>/${directory}/normalized.mp4` : arg)] });
}
await writeFile(new URL("adaptive-provenance.json", root), JSON.stringify({ license: "CC0-1.0", source: "scripts/normalize-quality-adaptive.mjs", sourceSha256: hash(await readFile(new URL(import.meta.url))), packagingSource: "scripts/quality-fixture-packaging.mjs", packagingSourceSha256: hash(await readFile(new URL("./quality-fixture-packaging.mjs", import.meta.url))), toolVersion: (await run(ffmpeg, ["-version"])).split("\n")[0], note: "Lossless fragment/header timing normalization only. Original MediaRecorder files and legacy adaptive paths are unchanged. WebKit legacy MSE buffered gaps remain a historical failure; canonical fragments preserve the exact encoded packet sequence and dimensions, not a general container-support claim.", files: records }, null, 2) + "\n");
console.log(JSON.stringify(records.map(({ packetDataHashes, ...entry }) => entry)));
