import test from "node:test";
import assert from "node:assert/strict";
import { detectDeviceCapabilities, platformHints, readinessVerdict, requestPersistentSiteData, READINESS_SAMPLES } from "./deviceCapabilities.js";

// Named injected API fixtures ONLY; none is an observed physical device.
function fixture(userAgent, supported = true) {
  class MediaSource { static isTypeSupported() { return supported; } }
  class VideoDecoder { static async isConfigSupported() { return { supported }; } }
  return {
    navigator: { userAgent, mediaCapabilities: { async decodingInfo() { return { supported, smooth: supported, powerEfficient: false }; } }, storage: { async persisted() { return false; }, async persist() { throw new Error("must be explicitly requested"); } } },
    videoElement: { canPlayType: () => supported ? "probably" : "" },
    MediaSource, VideoDecoder, AudioDecoder: VideoDecoder,
    matchMedia: (query) => ({ matches: query.includes("standard") }), secureContext: true
  };
}
for (const [name, ua, engine, platform] of [
  ["Chromium Linux synthetic", "Mozilla Linux Chrome/156.0", "Blink hint", "Linux hint"],
  ["Firefox Windows synthetic", "Mozilla Windows Firefox/156.0", "Gecko hint", "Windows hint"],
  ["Safari macOS synthetic", "Mozilla Macintosh AppleWebKit/605", "WebKit hint", "macOS hint"],
  ["iPhone branded Chrome synthetic", "Mozilla iPhone AppleWebKit/605 CriOS/156", "unknown (iOS browser branding is not engine proof)", "iOS/iPadOS hint"],
  ["Android Chromium synthetic", "Mozilla Android Chrome/156", "Blink hint", "Android hint"],
  ["Linux WebKit synthetic NOT iPhone", "Mozilla Linux AppleWebKit/605", "WebKit hint", "Linux hint"]
]) test(name, async () => {
  const report = await detectDeviceCapabilities(fixture(ua));
  assert.equal(report.engine, engine); assert.equal(report.platform, platform);
  assert.equal(report.evidence, "browser-prediction");
  assert.equal(report.observedPlayback, "not-tested"); assert.equal(report.physicalHdrOutput, "unknown");
  assert.equal(report.samples[1].mediaCapabilities.videoDecoding.supported, true);
  assert.match(readinessVerdict(report), /predicts/);
});

test("absent, rejecting, malformed and hanging APIs remain unknown, bounded and permission-free", async () => {
  const empty = await detectDeviceCapabilities({});
  assert.equal(empty.hdrDisplayQuery, "unknown");
  assert.equal(empty.samples[0].webCodecsVideo, "unknown");
  assert.match(readinessVerdict(empty), /external player/);
  const env = fixture("Linux");
  env.navigator.mediaCapabilities.decodingInfo = () => new Promise(() => {});
  env.VideoDecoder.isConfigSupported = async () => { throw new Error("denied"); };
  env.AudioDecoder = { isConfigSupported: async () => ({ supported: "yes" }) };
  env.navigator.storage.persisted = () => new Promise(() => {});
  env.matchMedia = () => { throw new Error("unavailable"); };
  const report = await detectDeviceCapabilities(env, { timeoutMs: 5 });
  assert.equal(report.samples[1].mediaCapabilities.decodingStatus, "unavailable");
  assert.equal(report.samples[0].webCodecsVideo, "unknown");
  assert.equal(report.audio.prediction, "unknown"); assert.equal(report.persistentStorage, "unknown");
});

test("negative configuration predictions do not certify browser-wide incapability", async () => {
  const report = await detectDeviceCapabilities(fixture("Android Chrome/156", false));
  assert.equal(report.samples[0].native, "not-reported");
  assert.equal(report.samples[0].mse, "predicted-unsupported");
  assert.match(readinessVerdict(report), /uncertain/);
});

test("native, MSE, MMS and video/audio decoder configurations stay separate", async () => {
  const env = fixture("iPhone");
  const video = [], audio = [], media = [];
  env.VideoDecoder = { async isConfigSupported(config) { video.push(config); return { supported: true }; } };
  env.AudioDecoder = { async isConfigSupported(config) { audio.push(config); return { supported: false }; } };
  env.ManagedMediaSource = class { static isTypeSupported() { return false; } };
  env.navigator.mediaCapabilities.decodingInfo = async (config) => { media.push(config); return { supported: false, smooth: false, powerEfficient: false }; };
  const report = await detectDeviceCapabilities(env);
  assert.equal(report.samples[0].native, "probably");
  assert.equal(report.samples[0].mse, "predicted-supported");
  assert.equal(report.samples[0].managedMedia, "predicted-unsupported");
  assert.equal(report.audio.prediction, "predicted-unsupported");
  assert.deepEqual(audio, [report.audio.configuration]);
  assert.equal(video[1].codec, "hvc1.2.4.L153.B0");
  assert.equal(media[1].video.bitrate, READINESS_SAMPLES[1].bitrate);
  assert.equal(media[1].type, "file");
  assert.equal(report.samples[3].configuration.contentType, 'video/mp4; codecs="dvhe.05.06"');
});

test("purpose-specific storage result handles denial, rejection, missing API and timeout", async () => {
  assert.equal(await requestPersistentSiteData({ persist: async () => true }), "granted");
  assert.equal(await requestPersistentSiteData({ persist: async () => false }), "not-granted");
  assert.equal(await requestPersistentSiteData({ persist: async () => { throw new Error("denied"); } }), "unknown");
  assert.equal(await requestPersistentSiteData({}), "unavailable");
  assert.equal(await requestPersistentSiteData({ persist: () => new Promise(() => {}) }, { timeoutMs: 5 }), "unknown");
});

test("tablet platform hint and notification availability never request permission", async () => {
  assert.equal(platformHints({ userAgent: "Macintosh", maxTouchPoints: 5 }).platform, "iOS/iPadOS hint");
  const env = fixture("Linux");
  env.Notification = class { static permission = "denied"; static requestPermission() { assert.fail("no permission request"); } };
  const report = await detectDeviceCapabilities(env);
  assert.equal(report.features.notifications, true); assert.equal(report.notificationPermission, "denied");
});
