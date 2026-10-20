import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";

export const CASES = Object.freeze([
  { id: "h264-2160", encoder: "libx264", format: "mp4", codec: "avc1", fps: 24, seconds: 2, pixelFormat: "yuv420p", options: ["-preset", "ultrafast", "-crf", "28", "-g", "24"] },
  { id: "hevc-2160", encoder: "libx265", format: "mp4", codec: "hvc1", fps: 24, seconds: 2, pixelFormat: "yuv420p", options: ["-preset", "ultrafast", "-crf", "28", "-tag:v", "hvc1", "-x265-params", "pools=2:frame-threads=1:log-level=error"] },
  { id: "vp9-2160", encoder: "libvpx-vp9", format: "webm", codec: "vp9", fps: 24, seconds: 2, pixelFormat: "yuv420p", options: ["-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "40", "-b:v", "0"] },
  { id: "av1-2160", encoder: "libaom-av1", format: "mp4", codec: "av01", fps: 24, seconds: 2, pixelFormat: "yuv420p", options: ["-cpu-used", "8", "-row-mt", "1", "-crf", "42", "-b:v", "0"] },
  { id: "h264-2160-60", encoder: "libx264", format: "mp4", codec: "avc1", fps: 60, seconds: 12, pixelFormat: "yuv420p", options: ["-preset", "ultrafast", "-b:v", "25M", "-minrate", "25M", "-maxrate", "25M", "-bufsize", "25M", "-x264-params", "nal-hrd=cbr:filler=1", "-g", "60"] },
  { id: "hdr10-hevc-2160", encoder: "libx265", format: "mp4", codec: "hvc1", fps: 24, seconds: 2, pixelFormat: "yuv420p10le", transfer: "smpte2084", options: ["-preset", "ultrafast", "-crf", "30", "-tag:v", "hvc1", "-x265-params", "pools=2:frame-threads=1:log-level=error:hdr10=1:master-display=G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(10000000,1):max-cll=1000,400"] },
  { id: "hlg-hevc-2160", encoder: "libx265", format: "mp4", codec: "hvc1", fps: 24, seconds: 2, pixelFormat: "yuv420p10le", transfer: "arib-std-b67", options: ["-preset", "ultrafast", "-crf", "30", "-tag:v", "hvc1", "-x265-params", "pools=2:frame-threads=1:log-level=error"] },
  { id: "pq-vp9-2160", encoder: "libvpx-vp9", format: "webm", codec: "vp9", fps: 24, seconds: 2, pixelFormat: "yuv420p10le", transfer: "smpte2084", options: ["-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "40", "-b:v", "0"] },
  { id: "hlg-vp9-2160", encoder: "libvpx-vp9", format: "webm", codec: "vp9", fps: 24, seconds: 2, pixelFormat: "yuv420p10le", transfer: "arib-std-b67", options: ["-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-crf", "40", "-b:v", "0"] }
]);

export function encodingArgs(entry, output) {
  if (!CASES.includes(entry)) throw new Error("Unknown fixed fixture case");
  const filter = entry.transfer
    // Original moving SDR pattern -> linear light, amplify linear RGB, then
    // encode BT.2020 PQ/HLG. Synthetic signal, not a mastered/displayed film.
    ? `zscale=pin=bt709:tin=bt709:min=bt709:rin=limited:p=bt709:t=linear:m=gbr:r=full:npl=100,format=gbrpf32le,colorchannelmixer=rr=2:gg=2:bb=2,colorchannelmixer=rr=2:gg=2:bb=2,zscale=pin=bt709:tin=linear:min=gbr:rin=full:p=bt2020:t=${entry.transfer}:m=bt2020nc:r=limited:npl=100,format=${entry.pixelFormat}`
    : `format=${entry.pixelFormat}`;
  return ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-f", "lavfi", "-i", `testsrc2=size=3840x2160:rate=${entry.fps}`, "-t", String(entry.seconds), "-fs", "67108864", "-an", "-vf", filter, "-filter_threads", "2", "-c:v", entry.encoder, "-threads", "2", ...entry.options,
    ...(entry.transfer ? ["-color_primaries", "bt2020", "-color_trc", entry.transfer, "-colorspace", "bt2020nc"] : ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]),
    ...(entry.format === "mp4" ? ["-movflags", "+faststart"] : []), output];
}

export function parseRange(value, length) {
  if (value === undefined) return { start: 0, end: length - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count < 1) return null;
    start = Math.max(0, length - count); end = length - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : length - 1;
  }
  if (![start, end].every(Number.isSafeInteger) || start < 0 || start >= length || end < start) return null;
  return { start, end: Math.min(end, length - 1), status: 206 };
}

export async function loadFixtureInventory(directory) {
  const root = await realpath(directory);
  const manifest = JSON.parse(await readFile(resolve(root, "provenance.json"), "utf8"));
  if (manifest.license !== "CC0-1.0" || !Array.isArray(manifest.files) || manifest.files.length > 64) throw new Error("Invalid fixture inventory");
  const files = new Map();
  let total = 0;
  for (const entry of manifest.files) {
    if (!/^[a-z0-9][a-z0-9./_-]{0,120}$/.test(entry.file) || entry.file.split("/").includes("..") || files.has(entry.file)) throw new Error("Unsafe/duplicate fixture path");
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 64 * 1024 * 1024) throw new Error("Fixture size cap");
    total += entry.bytes;
    if (total > 256 * 1024 * 1024) throw new Error("Inventory size cap");
    const path = await realpath(resolve(root, entry.file));
    if (!path.startsWith(root + sep)) throw new Error("Escaping fixture path");
    const bytes = await readFile(path);
    if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Fixture integrity mismatch");
    files.set(entry.file, { ...entry, bytes });
  }
  return { manifest, files };
}

export function contentTypeFor(file) {
  if (file.endsWith(".mp4") || file.endsWith(".m4s")) return "video/mp4";
  if (file.endsWith(".webm")) return "video/webm";
  if (file.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (file.endsWith(".mpd")) return "application/dash+xml";
  return "application/octet-stream";
}
