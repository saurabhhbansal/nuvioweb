import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_AVAILABILITY_MESSAGES,
  describeAudioTrackAvailability
} from "./audioTrackAvailability.js";

test("two or more listed tracks are switchable with no explanation", () => {
  for (const playbackEngine of ["hls.js", "dash.js", "native-file"]) {
    assert.deepEqual(
      describeAudioTrackAvailability({ playbackEngine, nativeTrackListAvailable: true, trackCount: 3 }),
      { kind: "switchable", message: "" }
    );
  }
});

test("a single listed track says the source has only one", () => {
  assert.deepEqual(describeAudioTrackAvailability({ playbackEngine: "hls.js", trackCount: 1 }), {
    kind: "single",
    message: AUDIO_AVAILABILITY_MESSAGES.single
  });
});

test("a single file in a browser without audioTracks says the browser cannot switch", () => {
  const result = describeAudioTrackAvailability({
    playbackEngine: "native-file",
    nativeTrackListAvailable: false,
    trackCount: 0
  });
  assert.equal(result.kind, "browser-cannot-list");
  assert.match(result.message, /can't list or switch the audio tracks inside a single video file/);
  assert.match(result.message, /external player/);
});

test("a single file in a browser with audioTracks but none listed says none", () => {
  assert.equal(
    describeAudioTrackAvailability({
      playbackEngine: "native-file",
      nativeTrackListAvailable: true,
      trackCount: 0
    }).kind,
    "none"
  );
});

test("adaptive streams without alternate audio do not blame the browser", () => {
  for (const playbackEngine of ["hls.js", "dash.js", "native-hls", "native-dash"]) {
    for (const nativeTrackListAvailable of [false, true]) {
      const result = describeAudioTrackAvailability({
        playbackEngine,
        nativeTrackListAvailable,
        trackCount: 0
      });
      assert.equal(result.kind, "adaptive-none");
      assert.doesNotMatch(result.message, /browser/);
    }
  }
});

test("a manifest URL counts as adaptive before or after an engine is attached", () => {
  for (const playbackEngine of ["none", "native-file"]) {
    assert.equal(
      describeAudioTrackAvailability({ playbackEngine, adaptiveSource: true, trackCount: 0 }).kind,
      "adaptive-none"
    );
  }
});

test("an adaptive manifest still loading reports loading before anything else", () => {
  assert.equal(
    describeAudioTrackAvailability({ playbackEngine: "hls.js", trackCount: 0, loading: true }).kind,
    "loading"
  );
});

test("missing or junk input falls back to the browser explanation", () => {
  assert.equal(describeAudioTrackAvailability().kind, "browser-cannot-list");
  assert.equal(describeAudioTrackAvailability({ trackCount: "x" }).kind, "browser-cannot-list");
});
