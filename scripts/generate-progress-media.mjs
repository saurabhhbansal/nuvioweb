import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// Original procedural rectangles and sine tone; no network or third-party media.
const directory = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL("../tests/fixtures/media/identity-progress/", import.meta.url));
await mkdir(directory, { recursive: true });
const file = "original-progress-vp8-opus.webm";
const destination = join(directory, file);
if (existsSync(destination) || existsSync(join(directory, "provenance.json"))) throw new Error("Use an empty fixture output directory");
const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-f", "lavfi", "-i", "color=c=0x142033:s=160x90:r=5:d=120", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=120", "-vf", "drawbox=x=20:y=20:w=60:h=40:color=0x81d4fa:t=fill", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-threads", "2", "-b:v", "48000", "-c:a", "libopus", "-b:a", "16000", "-t", "120", destination];
execFileSync("ffmpeg", args, { timeout: 90000, stdio: ["ignore", "ignore", "pipe"] });
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type,width,height", "-of", "json", destination], { timeout: 10000, encoding: "utf8" }));
const duration = Number(probe.format?.duration);
const bytes = await readFile(destination);
if (!Number.isFinite(duration) || duration < 119 || duration > 121 || bytes.length > 2 * 1024 * 1024) throw new Error("Generated fixture violates duration/size bounds");
const version = execFileSync("ffmpeg", ["-version"], { timeout: 10000, encoding: "utf8" }).split(/\r?\n/)[0];
await writeFile(join(directory, "provenance.json"), JSON.stringify({ file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, license: "CC0-1.0", source: "scripts/generate-progress-media.mjs", generator: version, content: "Original constant background/rectangle and 440Hz sine tone; no third-party media or account data", measuredDurationSeconds: duration, streams: probe.streams, limits: "Encoding bytes depend on tool version; regenerate in an empty directory. Browser duration/seek and live app progress propagation require independent observation." }, null, 2) + "\n");
console.log(JSON.stringify({ bytes: bytes.length, durationSeconds: duration, license: "CC0-1.0" }));
