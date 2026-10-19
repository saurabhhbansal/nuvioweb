// Fixture-generation gate for issue #12 (local audio/container recovery).
//
// This tool decides whether legal, reproducible audio fixtures can be produced
// with browser-native encoders only. It generates nothing in `--probe` mode; it
// records exactly what the eligible browser can do, including the sample entry
// it really emitted, because a requested MIME type is not evidence.
//
// Design constraints from docs/plans/issues/issue-12.md (unit 1a):
// - No FFmpeg, no downloaded media, no new WASM or encoder dependency.
// - One recording at a time, short fixtures, bounded output and a deadline.
// - A missing native AAC encoder is a BLOCKED result, never a skipped pass.

import { chromium } from "@playwright/test";

const MAX_PROBE_MS = 12000;
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const TONE_HZ = 440;

// Audio sample-entry fourccs we can recognise inside an MP4 `stsd` box.
const AUDIO_SAMPLE_ENTRIES = new Set([
  "mp4a",
  "Opus",
  "ac-3",
  "ec-3",
  "fLaC",
  "alac",
  "samr",
]);

function readFourcc(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return "";
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function readUint32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return NaN;
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

// Walk a bounded box list. `end` is exclusive. A box size of 1 means a 64-bit
// size; size 0 means "to end of parent", which we accept only for the last box.
export function readBoxes(bytes, start = 0, end = bytes.length, depth = 0) {
  const boxes = [];
  let offset = start;
  let guard = 0;
  while (offset + 8 <= end && guard < 512) {
    guard += 1;
    const size = readUint32(bytes, offset);
    const type = readFourcc(bytes, offset + 4);
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;
    let boxSize = size;
    let headerSize = 8;
    if (size === 1) {
      const high = readUint32(bytes, offset + 8);
      const low = readUint32(bytes, offset + 12);
      boxSize = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      boxSize = end - offset;
    }
    if (
      !Number.isFinite(boxSize) ||
      boxSize < headerSize ||
      offset + boxSize > end
    )
      break;
    const payloadStart = offset + headerSize;
    const payloadEnd = offset + boxSize;
    const box = {
      type,
      size: boxSize,
      offset,
      payloadStart,
      payloadEnd,
      depth,
    };
    if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) {
      box.children = readBoxes(bytes, payloadStart, payloadEnd, depth + 1);
    }
    boxes.push(box);
    offset = payloadEnd;
  }
  return boxes;
}

function findBoxes(boxes, type, found = []) {
  for (const box of boxes) {
    if (box.type === type) found.push(box);
    if (box.children) findBoxes(box.children, type, found);
  }
  return found;
}

// The `stsd` payload is version+flags(4), entry_count(4), then entries of
// size(4)+fourcc(4)+..., so the first entry fourcc starts 8 bytes in.
export function readAudioSampleEntries(bytes) {
  const boxes = readBoxes(bytes);
  const entries = [];
  for (const stsd of findBoxes(boxes, "stsd")) {
    const count = readUint32(bytes, stsd.payloadStart + 4);
    let offset = stsd.payloadStart + 8;
    for (
      let index = 0;
      index < Math.min(Number.isFinite(count) ? count : 0, 32);
      index += 1
    ) {
      const size = readUint32(bytes, offset);
      const fourcc = readFourcc(bytes, offset + 4);
      if (!Number.isFinite(size) || size < 8 || offset + size > stsd.payloadEnd)
        break;
      entries.push({
        fourcc,
        size,
        audio: AUDIO_SAMPLE_ENTRIES.has(fourcc),
        // Sample entries carry the decoder configuration in `esds` (mp4a) or
        // `dOps` (Opus); record only the first few bytes so the report stays
        // bounded and contains no media.
        // size(4)+fourcc(4) then the 8 fixed sample-entry bytes precede children.
        configBytes: readDecoderConfig(
          bytes,
          offset + 16,
          offset + size,
          fourcc,
        ),
      });
      offset += size;
    }
  }
  return entries;
}

function readDecoderConfig(bytes, start, end, fourcc) {
  const configBox = fourcc === "Opus" ? "dOps" : "esds";
  const candidates = readBoxes(bytes, start, end);
  const box = findBoxes(candidates, configBox)[0];
  if (!box) return null;
  const payload = bytes.subarray(
    box.payloadStart,
    Math.min(box.payloadEnd, box.payloadStart + 40),
  );
  return Array.from(payload.slice(0, 12));
}

// AAC AudioSpecificConfig summary for the first two bytes of an esds decoder
// specific info payload, when the box actually contains one.
export function describeAacConfig(configBytes) {
  if (!Array.isArray(configBytes) || configBytes.length < 2) return null;
  // Find the DecoderSpecificInfo tag (0x05) inside the esds payload.
  const tagIndex = configBytes.indexOf(5);
  if (tagIndex < 0 || tagIndex + 3 > configBytes.length) return null;
  const length = configBytes[tagIndex + 1];
  if (!Number.isFinite(length) || length === 0) return null;
  const first = configBytes[tagIndex + 2];
  const second = configBytes[tagIndex + 3] ?? 0;
  const audioObjectType = first >> 3;
  const samplingFrequencyIndex = ((first & 0x07) << 1) | (second >> 7);
  const channelConfiguration = (second >> 3) & 0x0f;
  const rates = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
    8000, 7350,
  ];
  return {
    audioObjectType,
    samplingFrequency: rates[samplingFrequencyIndex] ?? null,
    channelConfiguration,
  };
}

async function probePage(page) {
  return page.evaluate(
    async ({ toneHz, maxBytes }) => {
      const report = {
        userAgent: navigator.userAgent,
        audioEncoder: {
          present: typeof AudioEncoder !== "undefined",
          configs: [],
        },
        mediaRecorder: { types: [], recording: null },
        audioContextSampleRate: null,
      };
      try {
        const context = new AudioContext();
        report.audioContextSampleRate = context.sampleRate;
        await context.close();
      } catch (error) {
        report.audioContextSampleRate = `unavailable: ${String(error?.message || error)}`;
      }
      if (report.audioEncoder.present) {
        const configs = [
          { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2 },
          { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 1 },
          { codec: "opus", sampleRate: 48000, numberOfChannels: 2 },
        ];
        for (const config of configs) {
          try {
            const support = await AudioEncoder.isConfigSupported(config);
            report.audioEncoder.configs.push({
              ...config,
              supported: Boolean(support?.supported),
            });
          } catch (error) {
            report.audioEncoder.configs.push({
              ...config,
              error: String(error?.message || error),
            });
          }
        }
      }
      if (typeof MediaRecorder !== "undefined") {
        for (const mimeType of [
          "audio/mp4;codecs=mp4a.40.2",
          "audio/mp4",
          "audio/webm;codecs=opus",
        ]) {
          report.mediaRecorder.types.push({
            mimeType,
            supported: MediaRecorder.isTypeSupported(mimeType),
          });
        }
        // Record a short synthesised tone and inspect what the container really
        // carries: a requested MIME type alone is not evidence.
        try {
          const context = new AudioContext();
          const destination = context.createMediaStreamDestination();
          const oscillator = context.createOscillator();
          oscillator.frequency.value = toneHz;
          oscillator.connect(destination);
          oscillator.start();
          const chunks = [];
          const recorder = new MediaRecorder(destination.stream, {
            mimeType: "audio/mp4",
          });
          const stopped = new Promise((resolve) =>
            recorder.addEventListener("stop", resolve, { once: true }),
          );
          recorder.addEventListener("dataavailable", (event) => {
            if (event.data?.size) chunks.push(event.data);
          });
          recorder.start(100);
          await new Promise((resolve) => setTimeout(resolve, 700));
          if (recorder.state !== "inactive") recorder.stop();
          await stopped;
          oscillator.stop();
          await context.close();
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          report.mediaRecorder.recording = {
            requestedMimeType: "audio/mp4",
            actualMimeType: recorder.mimeType || "",
            bytes: bytes.length,
            withinByteLimit: bytes.length <= maxBytes,
            base64:
              bytes.length && bytes.length <= maxBytes
                ? btoa(String.fromCharCode(...bytes.subarray(0, 4096)))
                : "",
            truncatedForTransfer: bytes.length > 4096,
          };
        } catch (error) {
          report.mediaRecorder.recording = {
            error: String(error?.message || error),
          };
        }
      }
      return report;
    },
    { toneHz: TONE_HZ, maxBytes: MAX_RECORD_BYTES },
  );
}

function decodeBase64(base64) {
  const binary = Buffer.from(base64, "base64");
  return new Uint8Array(binary);
}

export function summarizeProbe(report) {
  const entries = report?.mediaRecorder?.recording?.base64
    ? readAudioSampleEntries(
        decodeBase64(report.mediaRecorder.recording.base64),
      )
    : [];
  const audioEntries = entries.filter((entry) => entry.audio);
  const aacEntry =
    audioEntries.find((entry) => entry.fourcc === "mp4a") || null;
  const aacConfig = aacEntry ? describeAacConfig(aacEntry.configBytes) : null;
  const audioEncoderAac = (report?.audioEncoder?.configs || []).find(
    (config) => config.codec === "mp4a.40.2" && config.supported,
  );
  const status = aacEntry && aacConfig ? "supported" : "blocked";
  const reasons = [];
  if (status === "blocked") {
    if (!report?.audioEncoder?.present)
      reasons.push("WebCodecs AudioEncoder is not exposed");
    else if (!audioEncoderAac)
      reasons.push("AudioEncoder reports no supported AAC-LC configuration");
    if (!audioEntries.length)
      reasons.push(
        "the MediaRecorder output carried no recognisable audio sample entry",
      );
    else if (!aacEntry)
      reasons.push(
        `the MediaRecorder output carried ${audioEntries.map((entry) => entry.fourcc).join(",")} rather than mp4a`,
      );
    else if (!aacConfig)
      reasons.push(
        "the audio sample entry had no parseable AAC AudioSpecificConfig",
      );
  }
  return {
    status,
    reasons,
    toneHz: TONE_HZ,
    audioEncoderAac,
    mediaRecorderTypes: report?.mediaRecorder?.types || [],
    sampleEntries: entries.map((entry) => entry.fourcc),
    aacConfig,
    recording:
      Number(report?.mediaRecorder?.recording?.bytes) > 0
        ? {
            requestedMimeType: report.mediaRecorder.recording.requestedMimeType,
            actualMimeType: report.mediaRecorder.recording.actualMimeType,
            bytes: report.mediaRecorder.recording.bytes,
            withinByteLimit: report.mediaRecorder.recording.withinByteLimit,
          }
        : null,
  };
}

export async function probe({ browser = null } = {}) {
  const ownBrowser = !browser;
  const instance = browser || (await chromium.launch());
  try {
    const page = await instance.newPage();
    const report = await probePage(page);
    return {
      ...summarizeProbe(report),
      environment: {
        browserVersion: instance.version ? instance.version() : "unknown",
        userAgent: report.userAgent || "unknown",
      },
    };
  } finally {
    if (ownBrowser) await instance.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--probe")) {
    console.error(
      "Usage: node scripts/generate-audio-recovery-media.mjs --probe [--json <path>]",
    );
    console.error(
      "Unit 1a only probes native AAC encoding; it generates no fixture.",
    );
    process.exitCode = 2;
    return;
  }
  const jsonIndex = args.indexOf("--json");
  const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
  const deadline = setTimeout(() => {
    console.error("Probe exceeded its 30-second deadline.");
    process.exitCode = 3;
  }, 30000);
  deadline.unref?.();
  let result;
  try {
    result = await probe();
  } finally {
    clearTimeout(deadline);
  }
  const summary = {
    unit: "issue-12/1a",
    probe: "native-aac-encoding",
    ...result,
    limits: [
      "Probe only: no fixture was generated and no media was downloaded.",
      "One short synthesised tone in a headless browser; audibility is not measured.",
      `Recording bounded to ${MAX_PROBE_MS} ms of wall-clock work and ${MAX_RECORD_BYTES} bytes.`,
    ],
  };
  if (jsonPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "blocked") {
    console.log(
      "RESULT: BLOCKED — native AAC encoding is unavailable in this browser; the AAC fixture chain stays blocked.",
    );
  } else {
    console.log(
      "RESULT: SUPPORTED — native AAC-LC encoding produced an inspectable mp4a configuration.",
    );
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
