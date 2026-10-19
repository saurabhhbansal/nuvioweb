// Fixture-generation gate for issue #12 (local audio/container recovery).
//
// This tool decides whether legal, reproducible AAC audio fixtures can be
// produced with browser-native encoders only. `--probe` generates nothing: it
// records exactly what the eligible browser can do, including the sample entry
// it really emitted, because a requested MIME type is not evidence.
//
// Constraints from docs/plans/issues/issue-12.md (unit 1a):
// - No FFmpeg, no downloaded media, no new WASM or encoder dependency.
// - One short recording, bounded memory, a real cancellation deadline.
// - A missing native AAC encoder is a BLOCKED result, never a skipped pass.

import { chromium } from "@playwright/test";

const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const MAX_TRANSFER_BYTES = 1024 * 1024;
const RECORD_MS = 700;
const PROBE_DEADLINE_MS = 30000;
const TONE_HZ = 440;
const MAX_BOX_DEPTH = 8;
const MAX_BOX_COUNT = 2048;
const MAX_DESCRIPTOR_DEPTH = 6;

const AUDIO_SAMPLE_ENTRIES = new Set([
  "mp4a",
  "Opus",
  "ac-3",
  "ec-3",
  "fLaC",
  "alac",
  "samr",
]);

// Version-0 audio sample entries carry 28 bytes of fixed audio fields after the
// 8-byte box header (reserved6 + data_ref2 + reserved8 + channels2 +
// sample_size2 + pre_defined2 + reserved2 + sample_rate4), so children start at
// entry offset 36.
const AUDIO_ENTRY_CHILD_OFFSET = 36;

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

// Bounded box walk: explicit depth and total-box budgets, so hostile or deeply
// nested input cannot exhaust the stack or burn unbounded time.
export function readBoxes(
  bytes,
  start = 0,
  end = bytes.length,
  depth = 0,
  budget = { boxes: 0 },
) {
  const boxes = [];
  if (depth > MAX_BOX_DEPTH) return boxes;
  let offset = start;
  while (offset + 8 <= end && budget.boxes < MAX_BOX_COUNT) {
    budget.boxes += 1;
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
    const box = {
      type,
      size: boxSize,
      offset,
      payloadStart: offset + headerSize,
      payloadEnd: offset + boxSize,
      depth,
    };
    if (
      ["moov", "trak", "mdia", "minf", "stbl", "edts", "udta"].includes(type)
    ) {
      box.children = readBoxes(
        bytes,
        box.payloadStart,
        box.payloadEnd,
        depth + 1,
        budget,
      );
    }
    boxes.push(box);
    offset = box.payloadEnd;
  }
  return boxes;
}

export function findBoxes(boxes, type, found = []) {
  const stack = [...boxes];
  while (stack.length) {
    const box = stack.pop();
    if (box.type === type) found.push(box);
    if (box.children) stack.push(...box.children);
  }
  return found;
}

// MPEG-4 descriptor: one tag byte, a variable-length size (1-4 bytes, 7 bits
// each), then that many payload bytes. Returns null when the chain is malformed.
export function readDescriptor(bytes, offset, end) {
  if (offset + 2 > end) return null;
  const tag = bytes[offset];
  let cursor = offset + 1;
  let size = 0;
  let lengthBytes = 0;
  while (cursor < end && lengthBytes < 4) {
    const byte = bytes[cursor];
    cursor += 1;
    lengthBytes += 1;
    size = (size << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) break;
  }
  if (!lengthBytes || cursor + size > end) return null;
  return { tag, start: cursor, end: cursor + size, lengthBytes };
}

// Extract the DecoderSpecificInfo (tag 0x05) from an esds descriptor chain,
// following ES_Descriptor (0x03) and DecoderConfigDescriptor (0x04) nesting.
export function readEsdsDecoderConfig(bytes, start, end) {
  const tags = [];
  let asc = null;
  const visit = (offset, limit, depth) => {
    if (depth > MAX_DESCRIPTOR_DEPTH) return;
    let cursor = offset;
    let guard = 0;
    while (cursor < limit && guard < 64) {
      guard += 1;
      const descriptor = readDescriptor(bytes, cursor, limit);
      if (!descriptor) return;
      tags.push(descriptor.tag);
      if (descriptor.tag === 0x05) {
        asc = bytes.subarray(descriptor.start, descriptor.end);
        return;
      }
      if (descriptor.tag === 0x03) {
        // ES_ID(2) + flags(1) precede nested descriptors; optional fields follow.
        const flags = bytes[descriptor.start + 2] ?? 0;
        let nested = descriptor.start + 3;
        if (flags & 0x80) nested += 2;
        if (flags & 0x40) nested += 1 + (bytes[nested] ?? 0);
        if (flags & 0x20) nested += 2;
        visit(nested, descriptor.end, depth + 1);
      } else if (descriptor.tag === 0x04) {
        // objectTypeIndication(1) + streamType(1) + bufferSizeDB(3) +
        // maxBitrate(4) + avgBitrate(4) precede nested descriptors.
        visit(descriptor.start + 13, descriptor.end, depth + 1);
      } else {
        visit(descriptor.start, descriptor.end, depth + 1);
      }
      cursor = descriptor.end;
    }
  };
  visit(start, end, 0);
  return { asc, tags };
}

function readOpusConfig(bytes, start, end) {
  const box = findBoxes(readBoxes(bytes, start, end), "dOps")[0];
  if (!box) return null;
  return bytes.subarray(
    box.payloadStart,
    Math.min(box.payloadEnd, box.payloadStart + 16),
  );
}

export function readAudioSampleEntries(bytes) {
  const entries = [];
  for (const stsd of findBoxes(readBoxes(bytes), "stsd")) {
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
      const audio = AUDIO_SAMPLE_ENTRIES.has(fourcc);
      const entry = {
        fourcc,
        size,
        audio,
        decoderConfig: null,
        descriptors: [],
      };
      if (audio && size >= AUDIO_ENTRY_CHILD_OFFSET) {
        const childStart = offset + AUDIO_ENTRY_CHILD_OFFSET;
        const childEnd = offset + size;
        if (fourcc === "mp4a") {
          const esds = findBoxes(
            readBoxes(bytes, childStart, childEnd),
            "esds",
          )[0];
          if (esds) {
            const parsed = readEsdsDecoderConfig(
              bytes,
              esds.payloadStart + 4,
              esds.payloadEnd,
            );
            entry.decoderConfig = parsed.asc ? Array.from(parsed.asc) : null;
            entry.descriptors = parsed.tags;
          }
        } else {
          const config = readOpusConfig(bytes, childStart, childEnd);
          entry.decoderConfig = config ? Array.from(config) : null;
        }
      }
      entries.push(entry);
      offset += size;
    }
  }
  return entries;
}

const AAC_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350,
];

// Parse an AudioSpecificConfig and reject anything that is not a complete,
// supported AAC-LC (or explicit-SBR) configuration. Reserved or truncated
// values must not be reported as valid.
export function describeAacConfig(ascBytes) {
  if (!Array.isArray(ascBytes) || ascBytes.length < 2) return null;
  let bitOffset = 0;
  const totalBits = ascBytes.length * 8;
  const readBits = (count) => {
    if (bitOffset + count > totalBits) return null;
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const byte = ascBytes[(bitOffset + index) >> 3];
      const bit = (byte >> (7 - ((bitOffset + index) & 7))) & 1;
      value = (value << 1) | bit;
    }
    bitOffset += count;
    return value;
  };
  const audioObjectType = readBits(5);
  if (
    audioObjectType === null ||
    audioObjectType === 0 ||
    audioObjectType === 31
  )
    return null;
  const samplingFrequencyIndex = readBits(4);
  if (samplingFrequencyIndex === null) return null;
  let samplingFrequency = AAC_SAMPLE_RATES[samplingFrequencyIndex] ?? null;
  if (samplingFrequencyIndex === 15) {
    const explicit = readBits(24);
    if (explicit === null || explicit <= 0) return null;
    samplingFrequency = explicit;
  } else if (samplingFrequencyIndex > 12) {
    return null;
  }
  const channelConfiguration = readBits(4);
  if (
    channelConfiguration === null ||
    channelConfiguration < 1 ||
    channelConfiguration > 7
  ) {
    return null;
  }
  // Allow AAC-LC and the explicit HE-AAC/SBR signalling object types only.
  if (![2, 5, 29].includes(audioObjectType)) return null;
  if (!samplingFrequency) return null;
  return {
    audioObjectType,
    samplingFrequency,
    channelConfiguration,
    bitsConsumed: bitOffset,
  };
}

// In-page helper: transfer only ftyp+moov so a large recording cannot erase the
// initialization data, and report explicitly when inspection is incomplete.
const PAGE_TRANSFER = `
  function readU32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function transferInit(bytes, maxBytes) {
    let offset = 0;
    const parts = [];
    let transferred = 0;
    let complete = true;
    while (offset + 8 <= bytes.length) {
      const size = readU32(bytes, offset);
      if (!size || size < 8 || offset + size > bytes.length) { complete = false; break; }
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === "ftyp" || type === "moov") {
        if (transferred + size > maxBytes) { complete = false; break; }
        parts.push(bytes.subarray(offset, offset + size));
        transferred += size;
      }
      offset += size;
    }
    const out = new Uint8Array(transferred);
    let cursor = 0;
    for (const part of parts) { out.set(part, cursor); cursor += part.length; }
    let binary = "";
    for (let index = 0; index < out.length; index += 1) binary += String.fromCharCode(out[index]);
    return { base64: btoa(binary), transferred, complete, totalBytes: bytes.length };
  }
`;

async function probePage(
  page,
  { toneHz, maxRecordBytes, maxTransferBytes, recordMs },
) {
  return page.evaluate(
    async ({
      transferSource,
      toneHz,
      maxRecordBytes,
      maxTransferBytes,
      recordMs,
    }) => {
      const transferInit = new Function(
        `${transferSource}; return transferInit;`,
      )();
      const report = {
        userAgent: navigator.userAgent,
        audioEncoder: {
          present: typeof AudioEncoder !== "undefined",
          configs: [],
          encodeAttempt: null,
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
        // Exercise a reported AAC configuration instead of trusting the query.
        const aacConfig = report.audioEncoder.configs.find(
          (config) => config.codec === "mp4a.40.2" && config.supported,
        );
        if (aacConfig) {
          try {
            const chunks = [];
            const encoder = new AudioEncoder({
              output: (chunk) => chunks.push(chunk.byteLength),
              error: (error) => {
                report.audioEncoder.encodeAttempt = {
                  error: String(error?.message || error),
                };
              },
            });
            encoder.configure(aacConfig);
            const frames = Math.max(1, Math.round(aacConfig.sampleRate * 0.02));
            const data = new Float32Array(frames * aacConfig.numberOfChannels);
            for (let index = 0; index < frames; index += 1) {
              const sample =
                Math.sin(
                  (2 * Math.PI * toneHz * index) / aacConfig.sampleRate,
                ) * 0.2;
              for (
                let channel = 0;
                channel < aacConfig.numberOfChannels;
                channel += 1
              ) {
                data[index * aacConfig.numberOfChannels + channel] = sample;
              }
            }
            encoder.encode(
              new AudioData({
                format: "f32-planar",
                sampleRate: aacConfig.sampleRate,
                numberOfFrames: frames,
                numberOfChannels: aacConfig.numberOfChannels,
                timestamp: 0,
                data,
              }),
            );
            await encoder.flush();
            encoder.close();
            report.audioEncoder.encodeAttempt = {
              ...report.audioEncoder.encodeAttempt,
              chunks: chunks.length,
              bytes: chunks.reduce((sum, size) => sum + size, 0),
            };
          } catch (error) {
            report.audioEncoder.encodeAttempt = {
              error: String(error?.message || error),
            };
          }
        }
      }

      if (typeof MediaRecorder === "undefined") {
        report.mediaRecorder.recording = {
          capability: "unavailable",
          error: "MediaRecorder is undefined",
        };
        return report;
      }
      const candidates = [
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
      ];
      for (const mimeType of candidates) {
        report.mediaRecorder.types.push({
          mimeType,
          supported: MediaRecorder.isTypeSupported(mimeType),
        });
      }
      // Prefer an explicitly AAC-typed recording when the browser reports it,
      // otherwise use the generic container so the real sample entry is visible.
      const chosenMime = report.mediaRecorder.types[0].supported
        ? candidates[0]
        : "audio/mp4";

      let context = null;
      let recorder = null;
      try {
        context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = toneHz;
        oscillator.connect(destination);
        oscillator.start();
        const chunks = [];
        let retained = 0;
        let byteLimitExceeded = false;
        recorder = new MediaRecorder(destination.stream, {
          mimeType: chosenMime,
        });
        const stopped = new Promise((resolve) =>
          recorder.addEventListener("stop", resolve, { once: true }),
        );
        recorder.addEventListener("dataavailable", (event) => {
          if (!event.data?.size) return;
          if (retained + event.data.size > maxRecordBytes) {
            byteLimitExceeded = true;
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
          retained += event.data.size;
          chunks.push(event.data);
        });
        recorder.start(100);
        await new Promise((resolve) => setTimeout(resolve, recordMs));
        if (recorder.state !== "inactive") recorder.stop();
        await stopped;
        oscillator.stop();
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const transfer = transferInit(bytes, maxTransferBytes);
        report.mediaRecorder.recording = {
          requestedMimeType: chosenMime,
          actualMimeType: recorder.mimeType || "",
          bytes: bytes.length,
          byteLimitExceeded,
          transfer: {
            transferred: transfer.transferred,
            totalBytes: transfer.totalBytes,
            complete: transfer.complete,
            base64: transfer.base64,
          },
        };
      } catch (error) {
        const name = String(error?.name || "");
        const expected = [
          "NotSupportedError",
          "InvalidStateError",
          "AbortError",
        ].includes(name);
        report.mediaRecorder.recording = {
          capability: expected ? "unsupported" : "error",
          error: String(error?.message || error),
          errorName: name,
        };
      } finally {
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch (_) {
          /* nothing to stop */
        }
        try {
          if (context) await context.close();
        } catch (_) {
          /* already closed */
        }
      }
      return report;
    },
    {
      transferSource: PAGE_TRANSFER,
      toneHz,
      maxRecordBytes,
      maxTransferBytes,
      recordMs,
    },
  );
}

function decodeBase64(base64) {
  return new Uint8Array(Buffer.from(String(base64 || ""), "base64"));
}

export function summarizeProbe(report) {
  const recording = report?.mediaRecorder?.recording || null;
  const transfer = recording?.transfer || null;
  const entries = transfer?.base64
    ? readAudioSampleEntries(decodeBase64(transfer.base64))
    : [];
  const audioEntries = entries.filter((entry) => entry.audio);
  const aacEntry =
    audioEntries.find((entry) => entry.fourcc === "mp4a") || null;
  const aacConfig = aacEntry ? describeAacConfig(aacEntry.decoderConfig) : null;
  const encoderAttempt = report?.audioEncoder?.encodeAttempt || null;
  const audioEncoderAac = (report?.audioEncoder?.configs || []).find(
    (config) => config.codec === "mp4a.40.2" && config.supported,
  );
  // Incomplete initialization transfer means the evidence is not trustworthy.
  const transferComplete = transfer ? transfer.complete : false;
  const status =
    aacEntry && aacConfig && transferComplete ? "supported" : "blocked";
  const reasons = [];
  if (status === "blocked") {
    if (!report?.audioEncoder?.present) {
      reasons.push(
        "WebCodecs AudioEncoder is not exposed, so no AAC encode path was exercised",
      );
    } else if (!audioEncoderAac) {
      reasons.push("AudioEncoder reports no supported AAC-LC configuration");
    } else if (!encoderAttempt || !encoderAttempt.chunks) {
      reasons.push(
        "AudioEncoder reported AAC support but the encode attempt produced no chunk",
      );
    }
    if (recording?.capability === "error") {
      reasons.push(
        `the recording attempt failed unexpectedly: ${recording.errorName || "error"} ${recording.error || ""}`.trim(),
      );
    } else if (recording?.byteLimitExceeded) {
      reasons.push(
        "the recording exceeded the retained-byte bound and was stopped",
      );
    } else if (!audioEntries.length) {
      reasons.push(
        "the recorded container carried no recognisable audio sample entry",
      );
    } else if (!aacEntry) {
      reasons.push(
        `the recorded container carried ${audioEntries.map((entry) => entry.fourcc).join(",")} rather than mp4a`,
      );
    } else if (!aacEntry.decoderConfig) {
      reasons.push(
        "the mp4a sample entry carried no DecoderSpecificInfo (esds tag 0x05)",
      );
    } else if (!aacConfig) {
      reasons.push(
        "the AudioSpecificConfig is invalid or an unsupported AAC configuration",
      );
    }
    if (transfer && !transfer.complete) {
      reasons.push(
        "initialization data exceeded the transfer bound, so inspection is incomplete",
      );
    }
  }
  return {
    status,
    reasons,
    toneHz: TONE_HZ,
    audioEncoder: {
      present: Boolean(report?.audioEncoder?.present),
      aacConfigSupported: Boolean(audioEncoderAac),
      encodeAttempt: encoderAttempt,
    },
    mediaRecorderTypes: report?.mediaRecorder?.types || [],
    sampleEntries: entries.map((entry) => ({
      fourcc: entry.fourcc,
      size: entry.size,
      audio: entry.audio,
    })),
    aacConfig,
    recording: recording
      ? {
          requestedMimeType: recording.requestedMimeType,
          actualMimeType: recording.actualMimeType,
          bytes: recording.bytes,
          byteLimitExceeded: Boolean(recording.byteLimitExceeded),
          inspection: transfer
            ? {
                transferred: transfer.transferred,
                totalBytes: transfer.totalBytes,
                complete: transfer.complete,
              }
            : null,
        }
      : null,
  };
}

class ProbeDeadlineError extends Error {}

export async function probe({ browser = null } = {}) {
  const ownBrowser = !browser;
  const instance = browser || (await chromium.launch());
  let timer = null;
  try {
    const page = await instance.newPage();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new ProbeDeadlineError("probe deadline exceeded")),
        PROBE_DEADLINE_MS,
      );
    });
    let report;
    try {
      report = await Promise.race([
        probePage(page, {
          toneHz: TONE_HZ,
          maxRecordBytes: MAX_RECORD_BYTES,
          maxTransferBytes: MAX_TRANSFER_BYTES,
          recordMs: RECORD_MS,
        }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
    const summary = summarizeProbe(report);
    if (
      summary.reasons.some((reason) => reason.includes("failed unexpectedly"))
    ) {
      throw new Error(
        `probe failed unexpectedly: ${summary.reasons.join("; ")}`,
      );
    }
    return {
      ...summary,
      environment: {
        browserVersion: instance.version ? instance.version() : "unknown",
        userAgent: report?.userAgent || "unknown",
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
  const summary = {
    unit: "issue-12/1a",
    probe: "native-aac-encoding",
    ...(await probe()),
    limits: [
      "Probe only: no fixture was generated and no media was downloaded.",
      "One short synthesised tone in a headless browser; audibility is not measured.",
      `Recording retained at most ${MAX_RECORD_BYTES} bytes for ${RECORD_MS} ms; initialization transfer bounded to ${MAX_TRANSFER_BYTES} bytes.`,
      "A BLOCKED result describes this browser and this recording path, not every browser.",
    ],
  };
  if (jsonPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "blocked") {
    console.log(
      "RESULT: BLOCKED — this browser recorded no inspectable AAC-LC sample entry on the tested path; the AAC fixture chain stays blocked.",
    );
  } else {
    console.log(
      "RESULT: SUPPORTED — native AAC-LC recording produced an inspectable mp4a configuration.",
    );
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
