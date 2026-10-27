// Plays one progressive file through Media Source Extensions with a chosen
// audio track: demux -> fMP4 (codecs untouched) -> one SourceBuffer for video,
// one for audio. Seeking re-reads from the nearest keyframe; switching audio
// swaps only the audio SourceBuffer.

import { createTrackWriter } from "./trackWriter.js";

const BUFFER_AHEAD_SECONDS = 30;
const BUFFER_BEHIND_SECONDS = 20;
const IN_RANGE_TOLERANCE = 0.3;

function mediaSourceConstructor() {
  return globalThis.ManagedMediaSource || globalThis.MediaSource || null;
}

function once(target, eventName, { timeoutMs = 0, errorEvent = "" } = {}) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      if (errorEvent) target.removeEventListener(errorEvent, onError);
      if (timer) clearTimeout(timer);
    };
    const onEvent = (event) => {
      cleanup();
      resolve(event);
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${errorEvent} while waiting for ${eventName}`));
    };
    target.addEventListener(eventName, onEvent);
    if (errorEvent) target.addEventListener(errorEvent, onError);
    if (timeoutMs) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${eventName}`));
      }, timeoutMs);
    }
  });
}

function isAbort(error) {
  return error?.name === "AbortError" || error?.name === "RemuxStale";
}

class StaleError extends Error {
  constructor() {
    super("stale");
    this.name = "RemuxStale";
  }
}

export function canRemuxInThisBrowser() {
  const MediaSourceCtor = mediaSourceConstructor();
  return Boolean(MediaSourceCtor && typeof MediaSourceCtor.isTypeSupported === "function");
}

export function isRemuxTrackPlayable(track) {
  const MediaSourceCtor = mediaSourceConstructor();
  if (!MediaSourceCtor || !track?.sampleEntry || track.unsupportedReason) return false;
  try {
    return MediaSourceCtor.isTypeSupported(`${track.kind}/mp4; codecs="${track.codec}"`);
  } catch (_) {
    return false;
  }
}

export class RemuxSession {
  constructor({ video, demuxer, videoTrack, audioTrack, onFatal = () => {} }) {
    this.video = video;
    this.demuxer = demuxer;
    this.videoTrack = videoTrack || null;
    this.audioTrack = audioTrack;
    this.onFatal = onFatal;
    this.generation = 0;
    this.destroyed = false;
    this.fatal = false;
    this.controller = null;
    this.op = Promise.resolve();
    this.readerDone = false;
    this.lastVideoDts = null;
    this.wakeListeners = new Set();
    this.stats = { appendedSegments: 0, restarts: 0, audioSwitches: 0 };
    this.handleSeeking = () => this.onSeeking();
    this.handleWake = () => this.wake();
    this.handleError = (event) => {
      if (event.target !== this.video || this.destroyed) return;
      // Keep the player's own failure handling (source fallback, startup
      // error) out of it: this session falls back to the plain file instead.
      event.stopPropagation();
      this.fail(new Error(`Media element error ${this.video.error?.code || ""} during remux`));
    };
  }

  async start({ startTime = 0, autoplay = false } = {}) {
    const MediaSourceCtor = mediaSourceConstructor();
    if (!MediaSourceCtor) throw new Error("MediaSource unavailable");
    this.mediaSource = new MediaSourceCtor();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    globalThis.addEventListener?.("error", this.handleError, true);
    if (globalThis.ManagedMediaSource && MediaSourceCtor === globalThis.ManagedMediaSource) {
      this.video.disableRemotePlayback = true;
    }
    this.video.removeAttribute("src");
    Array.from(this.video.querySelectorAll?.("source") || []).forEach((node) => node.remove());
    this.video.src = this.objectUrl;
    await once(this.mediaSource, "sourceopen", { timeoutMs: 15000 });
    if (this.destroyed) return;
    if (this.demuxer.durationSeconds > 0) {
      this.mediaSource.duration = this.demuxer.durationSeconds;
    }
    if (this.videoTrack) {
      this.videoWriter = createTrackWriter(this.videoTrack, this.demuxer);
      this.videoBuffer = this.mediaSource.addSourceBuffer(this.videoWriter.mime);
      this.videoBuffer.mode = "segments";
    }
    this.audioWriter = createTrackWriter(this.audioTrack, this.demuxer);
    this.audioBuffer = this.mediaSource.addSourceBuffer(this.audioWriter.mime);
    this.audioBuffer.mode = "segments";
    if (this.videoBuffer) await this.enqueue(() => this.appendNow(this.videoBuffer, this.videoWriter.init));
    await this.enqueue(() => this.appendNow(this.audioBuffer, this.audioWriter.init));
    this.applyShift(this.audioBuffer, this.audioWriter);

    this.video.addEventListener("seeking", this.handleSeeking);
    this.video.addEventListener("timeupdate", this.handleWake);
    this.video.addEventListener("playing", this.handleWake);
    this.video.currentTime = startTime;
    this.run(startTime);
    if (autoplay) {
      this.video.play()?.catch?.(() => {});
    }
  }

  get bufferedAheadSeconds() {
    const time = Number(this.video.currentTime || 0);
    const buffers = [this.videoBuffer, this.audioBuffer].filter(Boolean);
    let ahead = Infinity;
    for (const buffer of buffers) {
      let found = 0;
      try {
        for (let index = 0; index < buffer.buffered.length; index += 1) {
          if (buffer.buffered.start(index) <= time + IN_RANGE_TOLERANCE && buffer.buffered.end(index) > time) {
            found = buffer.buffered.end(index) - time;
          }
        }
      } catch (_) {
        found = 0;
      }
      ahead = Math.min(ahead, found);
    }
    return Number.isFinite(ahead) ? ahead : 0;
  }

  isBuffered(time) {
    return [this.videoBuffer, this.audioBuffer].filter(Boolean).every((buffer) => {
      try {
        for (let index = 0; index < buffer.buffered.length; index += 1) {
          if (buffer.buffered.start(index) <= time + IN_RANGE_TOLERANCE && buffer.buffered.end(index) > time + 0.5) return true;
        }
      } catch (_) {
        return false;
      }
      return false;
    });
  }

  wake() {
    for (const resolve of this.wakeListeners) resolve();
    this.wakeListeners.clear();
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wakeListeners.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakeListeners.add(done);
    });
  }

  enqueue(task) {
    const next = this.op.then(task, task);
    this.op = next.catch(() => {});
    return next;
  }

  async appendNow(buffer, bytes) {
    if (this.destroyed) throw new StaleError();
    for (let attempt = 0; ; attempt += 1) {
      try {
        buffer.appendBuffer(bytes);
        await once(buffer, "updateend", { errorEvent: "error" });
        this.stats.appendedSegments += 1;
        return;
      } catch (error) {
        if (error?.name !== "QuotaExceededError" || attempt >= 6) throw error;
        await this.evict(buffer, true);
        await this.sleep(500);
      }
    }
  }

  async removeNow(buffer, start, end) {
    if (end <= start || buffer.updating) return;
    buffer.remove(start, end);
    await once(buffer, "updateend", { errorEvent: "error" });
  }

  async evict(buffer, aggressive = false) {
    const time = Number(this.video.currentTime || 0);
    const keepBehind = aggressive ? 2 : 10;
    try {
      if (buffer.buffered.length && time - buffer.buffered.start(0) > (aggressive ? keepBehind : BUFFER_BEHIND_SECONDS)) {
        await this.removeNow(buffer, buffer.buffered.start(0), time - keepBehind);
      }
      if (aggressive && buffer.buffered.length) {
        const end = buffer.buffered.end(buffer.buffered.length - 1);
        if (end > time + BUFFER_AHEAD_SECONDS) await this.removeNow(buffer, time + BUFFER_AHEAD_SECONDS, end);
      }
    } catch (_) {
      // Eviction is best effort.
    }
  }

  applyShift(buffer, writer) {
    if (!buffer || !writer.shiftKnown) return;
    const offset = -writer.presentationShift;
    if (buffer.timestampOffset !== offset && !buffer.updating) buffer.timestampOffset = offset;
  }

  async appendSegments(buffer, writer, segments, generation) {
    for (const segment of segments) {
      if (generation !== this.generation) throw new StaleError();
      await this.enqueue(async () => {
        if (generation !== this.generation) throw new StaleError();
        this.applyShift(buffer, writer);
        await this.evict(buffer);
        await this.appendNow(buffer, segment.bytes);
      });
      if (buffer === this.videoBuffer) this.lastVideoDts = segment.lastDts;
    }
  }

  async run(startTime, { skipVideoThroughDts = null } = {}) {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.readerDone = false;
    this.videoWriter?.reset({ skipThroughDts: skipVideoThroughDts });
    this.audioWriter.reset();
    const trackIds = [this.videoTrack?.id, this.audioTrack.id].filter((id) => id !== undefined && id !== null);
    try {
      const reader = this.demuxer.createReader({ trackIds, startTime, signal: controller.signal });
      for await (const batch of reader) {
        if (generation !== this.generation) return;
        for (const { track, samples } of batch) {
          const isVideo = this.videoTrack && track.id === this.videoTrack.id;
          const writer = isVideo ? this.videoWriter : this.audioWriter;
          const buffer = isVideo ? this.videoBuffer : this.audioBuffer;
          await this.appendSegments(buffer, writer, writer.push(samples), generation);
        }
        while (generation === this.generation && !this.destroyed && this.bufferedAheadSeconds >= BUFFER_AHEAD_SECONDS) {
          await this.sleep(1000);
        }
      }
      if (generation !== this.generation) return;
      if (this.videoWriter) await this.appendSegments(this.videoBuffer, this.videoWriter, this.videoWriter.flush(), generation);
      await this.appendSegments(this.audioBuffer, this.audioWriter, this.audioWriter.flush(), generation);
      this.readerDone = true;
      await this.enqueue(() => {
        if (generation === this.generation && this.mediaSource.readyState === "open" && !this.videoBuffer?.updating && !this.audioBuffer.updating) {
          this.mediaSource.endOfStream();
        }
      });
    } catch (error) {
      if (isAbort(error) || generation !== this.generation || this.destroyed) return;
      this.fail(error);
    }
  }

  async resetBuffersFor(buffers) {
    await this.enqueue(async () => {
      for (const buffer of buffers) {
        if (!buffer) continue;
        if (this.mediaSource.readyState === "open") buffer.abort();
      }
    });
  }

  onSeeking() {
    if (this.destroyed || this.fatal) return;
    const time = Number(this.video.currentTime || 0);
    if (this.isBuffered(time)) {
      this.wake();
      return;
    }
    this.stats.restarts += 1;
    this.generation += 1;
    this.controller?.abort();
    this.wake();
    this.resetBuffersFor([this.videoBuffer, this.audioBuffer])
      .then(() => this.run(time))
      .catch((error) => this.fail(error));
  }

  /** Swaps the audio track; video keeps playing from what is already buffered. */
  async switchAudio(audioTrack) {
    if (this.destroyed || this.fatal || audioTrack === this.audioTrack) return;
    this.stats.audioSwitches += 1;
    this.generation += 1;
    this.controller?.abort();
    this.wake();
    const writer = createTrackWriter(audioTrack, this.demuxer);
    const previousMime = this.audioWriter.mime;
    await this.enqueue(async () => {
      if (this.mediaSource.readyState === "open") this.audioBuffer.abort();
      await this.removeNow(this.audioBuffer, 0, Infinity);
      if (writer.mime !== previousMime) {
        if (typeof this.audioBuffer.changeType !== "function") throw new Error("SourceBuffer.changeType unavailable");
        this.audioBuffer.changeType(writer.mime);
      }
      this.audioBuffer.timestampOffset = 0;
      await this.appendNow(this.audioBuffer, writer.init);
    });
    this.audioTrack = audioTrack;
    this.audioWriter = writer;
    const time = Number(this.video.currentTime || 0);
    this.run(time, { skipVideoThroughDts: this.lastVideoDts });
  }

  fail(error) {
    if (this.fatal || this.destroyed) return;
    this.fatal = true;
    this.generation += 1;
    this.controller?.abort();
    this.onFatal(error);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.controller?.abort();
    this.wake();
    globalThis.removeEventListener?.("error", this.handleError, true);
    this.video.removeEventListener("seeking", this.handleSeeking);
    this.video.removeEventListener("timeupdate", this.handleWake);
    this.video.removeEventListener("playing", this.handleWake);
    if (this.objectUrl) {
      try {
        URL.revokeObjectURL(this.objectUrl);
      } catch (_) {
        // Already revoked.
      }
    }
  }
}
