import assert from "node:assert/strict";
import test from "node:test";

import { isAudioTrackCodecDecodable } from "./audioTrackCodecMetadata.js";

const none = { isTypeSupported: () => false, canPlayType: () => "" };

test("common codecs and tracks without codec info always count as decodable", () => {
  for (const track of [{ audioCodec: "mp4a.40.2" }, { codec: "opus" }, { label: "English" }, {}]) {
    assert.equal(isAudioTrackCodecDecodable(track, none), true);
  }
});

test("surround codecs the browser rejects are reported as not decodable", () => {
  for (const track of [
    { audioCodec: "ac-3" },
    { codecs: "ec-3" },
    { raw: { audioCodec: "dtsc" } },
    { codec: "TrueHD" }
  ]) {
    assert.equal(isAudioTrackCodecDecodable(track, none), false, JSON.stringify(track));
  }
});

test("either probe accepting the codec makes it decodable", () => {
  const eac3 = (mime) => mime.includes('"ec-3"');
  assert.equal(isAudioTrackCodecDecodable({ audioCodec: "ec-3" }, { isTypeSupported: eac3 }), true);
  assert.equal(
    isAudioTrackCodecDecodable({ audioCodec: "ac-3" }, { canPlayType: () => "maybe" }),
    true
  );
});

test("no probes at all never hides a track", () => {
  assert.equal(isAudioTrackCodecDecodable({ audioCodec: "ac-3" }), true);
});

test("a probe that throws counts as rejecting the codec", () => {
  assert.equal(
    isAudioTrackCodecDecodable({ audioCodec: "ac-3" }, { isTypeSupported: () => { throw new Error("x"); } }),
    false
  );
});
