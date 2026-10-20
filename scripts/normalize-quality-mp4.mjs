import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = new URL("../tests/fixtures/media/quality/", import.meta.url);
const ffmpeg = process.env.NUVIO_FIXTURE_FFMPEG || "ffmpeg";
const ffprobe = process.env.NUVIO_FIXTURE_FFPROBE || "ffprobe";
const run = async (file, args) => (await exec(file, args, { timeout: 30000, maxBuffer: 1024 * 1024 })).stdout;
const records = [];
const packets = async url => JSON.parse(await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "sha256", "-show_entries", "packet=data_hash", "-of", "json", fileURLToPath(url)])).packets.map(x => x.data_hash);
for (const size of ["1080", "2160"]) {
  const input = new URL(`original-${size}p.mp4`, root), output = new URL(`native-${size}p.mp4`, root);
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i", fileURLToPath(input), "-map", "0:v:0", "-c:v", "copy", "-movflags", "+faststart", fileURLToPath(output)];
  await run(ffmpeg, args);
  const before = await packets(input), after = await packets(output);
  if (!before.length || JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Remux changed encoded packet bytes");
  const bytes = await readFile(output), original = await readFile(input);
  records.push({ file: `native-${size}p.mp4`, source: `original-${size}p.mp4`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), sourceSha256: createHash("sha256").update(original).digest("hex"), packetCount: before.length, packetDataHashes: after, exactEncodedPacketsPreserved: true, command: ["ffmpeg", ...args.map(x => x === fileURLToPath(input) ? `<quality>/original-${size}p.mp4` : x === fileURLToPath(output) ? `<quality>/native-${size}p.mp4` : x)] });
}
await writeFile(new URL("native-provenance.json", root), JSON.stringify({ license: "CC0-1.0", source: "scripts/normalize-quality-mp4.mjs", sourceSha256: createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex"), toolVersion: (await run(ffmpeg, ["-version"])).split("\n")[0], note: "Lossless container normalization only; original MediaRecorder and adaptive fragment files unchanged. No re-encoding/downscale. Legacy fragmented native Gecko failures remain historical observations.", files: records }, null, 2) + "\n");
console.log(JSON.stringify(records.map(({ packetDataHashes, ...entry }) => entry)));
