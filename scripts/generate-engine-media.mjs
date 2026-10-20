import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES, encodingArgs } from "./engine-media-contract.mjs";

const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const ffmpeg = option("--ffmpeg", "ffmpeg");
const ffprobe = option("--ffprobe", "ffprobe");
const output = resolve(option("--out", ".tmp/issue10/media"));
const selected = option("--cases", CASES.map(x => x.id).join(",")).split(",");
if (selected.some(id => !CASES.some(x => x.id === id))) throw new Error("Unknown case");
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error("Refuse to overwrite a nonempty fixture directory");
const run = (command, argv, timeout = 600000) => new Promise((resolve, reject) => {
  const child = spawn(command, argv, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Bounded encoder/probe deadline")); }, timeout);
  child.stdout.on("data", bytes => { stdout = (stdout + bytes).slice(-4 * 1024 * 1024); });
  child.stderr.on("data", bytes => { stderr = (stderr + bytes).slice(-8192); });
  child.on("error", error => { clearTimeout(timer); reject(error); });
  child.on("close", code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`Tool exited ${code}: ${stderr}`)); });
});
const version = (await run(ffmpeg, ["-version"], 10000)).split("\n").slice(0, 3);
const encoders = await run(ffmpeg, ["-hide_banner", "-encoders"], 10000);
const manifest = {
  schemaVersion: 1, license: "CC0-1.0", generatedAt: new Date().toISOString(),
  content: "Original FFmpeg lavfi moving test pattern, video only; no downloaded or user content, no upscaled low-resolution input",
  hdrNote: "Synthetic linear-light amplified signal encoded to BT.2020 PQ/HLG with encoder-declared test metadata. Tags and decoded frames do not establish HDR display output or artistic mastering accuracy.",
  sourceRevision: process.env.NUVIO_SOURCE_REVISION || null,
  generatorSha256: createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex"),
  contractSha256: createHash("sha256").update(await readFile(new URL("./engine-media-contract.mjs", import.meta.url))).digest("hex"),
  tool: { ffmpeg: version, platform: process.platform, architecture: process.arch }, cases: [], files: []
};
async function inventory(file, metadata = {}) {
  const full = resolve(output, file);
  const size = (await stat(full)).size;
  if (size > 64 * 1024 * 1024) throw new Error("Generated file exceeds 64MiB cap");
  const bytes = await readFile(full);
  manifest.files.push({ file, bytes: size, sha256: createHash("sha256").update(bytes).digest("hex"), ...metadata });
}
for (const entry of CASES.filter(x => selected.includes(x.id))) {
  const file = `${entry.id}.${entry.format}`;
  if (!encoders.includes(` ${entry.encoder} `)) {
    manifest.cases.push({ id: entry.id, status: "UNAVAILABLE_ENCODER", encoder: entry.encoder, limitation: "HOST_ENVIRONMENT" });
    continue;
  }
  const argv = encodingArgs(entry, resolve(output, file));
  console.log(JSON.stringify({ phase: "encode-start", id: entry.id, target: { width: 3840, height: 2160, fps: entry.fps, seconds: entry.seconds, encoder: entry.encoder } }));
  try {
    await run(ffmpeg, argv);
    const probe = JSON.parse(await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_streams", "-show_format", "-of", "json", resolve(output, file)]));
    const s = probe.streams?.[0];
    const duration = Number(s?.duration || probe.format?.duration);
    const [num, den] = String(s?.avg_frame_rate).split("/").map(Number);
    const fps = num / den;
    if (s?.width !== 3840 || s?.height !== 2160 || !Number.isFinite(duration) || duration < entry.seconds - 0.1 || Math.abs(fps - entry.fps) > 0.01 || Number(s.nb_read_frames) < entry.fps * entry.seconds - 1) throw new Error("Measured fixture does not meet target dimensions/frame rate/count/duration");
    if (entry.transfer && (s.color_transfer !== entry.transfer || s.color_primaries !== "bt2020" || !s.pix_fmt?.includes("10"))) throw new Error("HDR encoding/color-tag verification failed");
    const observed = { codec: s.codec_name, codecTag: s.codec_tag_string, profile: s.profile, level: s.level, width: s.width, height: s.height, pixelFormat: s.pix_fmt, fps, frames: Number(s.nb_read_frames), duration, bitrate: Number(s.bit_rate || probe.format?.bit_rate), bitrateBasis: s.bit_rate ? "ffprobe-stream" : "ffprobe-container", colorPrimaries: s.color_primaries, colorTransfer: s.color_transfer, colorSpace: s.color_space, sideData: s.side_data_list || [] };
    const predictionType = `video/${entry.format}; codecs="${entry.codec}"`;
    const item = { id: entry.id, status: "GENERATED_VERIFIED", file, target: { fps: entry.fps, seconds: entry.seconds, encoder: entry.encoder }, predictionType, predictionScope: "Codec-family MIME only; actual profile/level recorded separately by ffprobe", hdr: entry.transfer || null, observed, command: [ffmpeg, ...argv.map(a => a === resolve(output, file) ? `<output>/${file}` : a)] };
    manifest.cases.push(item);
    await inventory(file, { caseId: entry.id });
    console.log(JSON.stringify({ phase: "encode-complete", id: entry.id, observed }));
  } catch (error) {
    manifest.cases.push({ id: entry.id, status: "GENERATION_FAILED", limitation: "HOST_ENVIRONMENT", message: error.message });
    console.log(JSON.stringify({ phase: "encode-failed", id: entry.id, message: error.message }));
  }
}
await writeFile(resolve(output, "provenance.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ phase: "done", inventory: relative(process.cwd(), resolve(output, "provenance.json")), generated: manifest.files.length, failed: manifest.cases.filter(x => x.status !== "GENERATED_VERIFIED").length }));
if (manifest.cases.some(x => x.status !== "GENERATED_VERIFIED")) process.exitCode = 2;
