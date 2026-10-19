import test from "node:test";
import assert from "node:assert/strict";

import {
  AUDIO_SELECTION_REASONS,
  AUDIO_TRACK_DECODE_SUPPORT,
  AUDIO_TRACK_METADATA_EVIDENCE,
  AUDIO_TRACK_ROLES,
  AUDIO_TRACK_SELECTABILITY,
  createAudioSelectionTracker,
  normalizeAudioRole,
  normalizeEngineAudioTracks,
  resolveAudioSelectionRequest,
  summarizeAudioTracks
} from "./browserAudioTracks.js";

const hlsTracks = [
  {
    id: "AUDIO::aac::English",
    index: 0,
    label: "English",
    language: "en",
    selected: true,
    engine: "hls.js",
    raw: {
      id: 0,
      name: "English",
      lang: "en",
      attrs: {
        CHANNELS: "2",
        CHARACTERISTICS: "public.accessibility.describes-video",
        CODECS: "mp4a.40.2"
      }
    }
  },
  {
    id: "AUDIO::aac::Commentary",
    index: 1,
    label: "Commentary",
    language: "en",
    selected: false,
    engine: "hls.js",
    raw: {
      id: 1,
      name: "Commentary",
      lang: "en",
      attrs: { CHANNELS: "6", CHARACTERISTICS: "public.accessibility.transcribes-spoken-dialog" }
    }
  }
];

test("HLS wrapper tracks are normalized with raw metadata and explicit evidence", () => {
  const normalized = normalizeEngineAudioTracks({
    engine: "hls.js",
    generation: 7,
    tracks: hlsTracks,
    selectedIndex: 0
  });
  assert.equal(normalized.generation, 7);
  assert.equal(normalized.engine, "hls.js");
  assert.equal(normalized.selectedKey, normalized.tracks[0].key);
  const [english, commentary] = normalized.tracks;
  assert.equal(english.index, 0);
  assert.equal(english.language, "en");
  assert.equal(english.codec, "mp4a.40.2");
  assert.equal(english.channels, 2);
  assert.equal(english.role, AUDIO_TRACK_ROLES.AUDIO_DESCRIPTION);
  assert.equal(english.selected, true);
  assert.equal(english.selectability, AUDIO_TRACK_SELECTABILITY.AVAILABLE);
  assert.equal(english.decodeSupport, AUDIO_TRACK_DECODE_SUPPORT.UNKNOWN);
  assert.equal(english.metadataEvidence, AUDIO_TRACK_METADATA_EVIDENCE.ENGINE_DECLARED);
  assert.equal(commentary.channels, 6);
  assert.equal(commentary.selected, false);
  // A declared track is never described as verified or supported.
  assert.doesNotMatch(JSON.stringify(normalized), /verified|supported/i);
});

test("DASH roles and labels are read from the raw track, not the wrapper", () => {
  const normalized = normalizeEngineAudioTracks({
    engine: "dash.js",
    generation: 2,
    tracks: [
      {
        id: "dash-lang-de",
        index: 0,
        label: "wrapper-label",
        language: "",
        selected: true,
        engine: "dash.js",
        raw: {
          id: "audio-de",
          lang: "de",
          labels: [{ text: "Deutsch" }],
          roles: [{ value: "main" }],
          codec: "audio/mp4;codecs=mp4a.40.2",
          channels: 2
        }
      },
      {
        id: "dash-lang-en",
        index: 1,
        label: "English",
        language: "en",
        selected: false,
        engine: "dash.js",
        raw: { id: "audio-en", lang: "en", roles: [{ value: "commentary" }] }
      }
    ],
    selectedIndex: 0
  });
  assert.equal(normalized.tracks[0].label, "Deutsch");
  assert.equal(normalized.tracks[0].language, "de");
  assert.equal(normalized.tracks[0].role, AUDIO_TRACK_ROLES.MAIN);
  assert.equal(normalized.tracks[0].channels, 2);
  assert.equal(normalized.tracks[1].role, AUDIO_TRACK_ROLES.COMMENTARY);
  assert.equal(normalized.tracks[1].channels, null);
});

test("duplicate engine identities fail closed instead of selecting the wrong rendition", () => {
  const duplicate = normalizeEngineAudioTracks({
    engine: "hls.js",
    generation: 3,
    tracks: [
      { id: "same", index: 0, selected: true, raw: { id: "same", name: "A" } },
      { id: "same", index: 1, selected: false, raw: { id: "same", name: "B" } }
    ],
    selectedIndex: 0
  });
  assert.equal(duplicate.ambiguousCount, 2);
  assert.equal(duplicate.availableCount, 0);
  for (const track of duplicate.tracks) {
    assert.equal(track.ambiguous, true);
    assert.equal(track.selectability, AUDIO_TRACK_SELECTABILITY.UNAVAILABLE);
  }
  const selection = resolveAudioSelectionRequest({
    generation: 3,
    trackKey: duplicate.tracks[0].key,
    tracks: duplicate.tracks,
    currentGeneration: 3
  });
  assert.equal(selection.ok, false);
  assert.equal(selection.reason, AUDIO_SELECTION_REASONS.AMBIGUOUS_IDENTITY);
});

test("a missing track API reports unavailable rather than inventing tracks", () => {
  const normalized = normalizeEngineAudioTracks({
    engine: "native-file",
    generation: 1,
    tracks: [],
    selectedIndex: -1
  });
  assert.equal(normalized.trackCount, 0);
  assert.equal(normalized.selectedKey, null);
  assert.deepEqual(normalized.tracks, []);
});

test("predictions stay predictions", () => {
  const normalized = normalizeEngineAudioTracks({
    engine: "hls.js",
    generation: 4,
    tracks: [{ id: "A", index: 0, selected: true, raw: { id: "A", lang: "en" } }],
    selectedIndex: 0,
    decodePredictions: { "hls.js:A": "probably" }
  });
  assert.equal(normalized.tracks[0].decodeSupport, AUDIO_TRACK_DECODE_SUPPORT.PREDICTED);
  assert.equal(normalized.predictedCount, 1);
  const notReported = normalizeEngineAudioTracks({
    engine: "hls.js",
    generation: 4,
    tracks: [{ id: "A", index: 0, selected: true, raw: { id: "A" } }],
    selectedIndex: 0,
    decodePredictions: { "hls.js:A": "not-reported" }
  });
  assert.equal(notReported.tracks[0].decodeSupport, AUDIO_TRACK_DECODE_SUPPORT.NOT_REPORTED);
});

test("role normalization follows declared characteristics and roles only", () => {
  assert.equal(
    normalizeAudioRole({ characteristics: "public.accessibility.describes-video" }),
    AUDIO_TRACK_ROLES.AUDIO_DESCRIPTION
  );
  assert.equal(
    normalizeAudioRole({ roles: [{ value: "commentary" }] }),
    AUDIO_TRACK_ROLES.COMMENTARY
  );
  assert.equal(normalizeAudioRole({ roles: ["main"] }), AUDIO_TRACK_ROLES.MAIN);
  assert.equal(normalizeAudioRole({ roles: ["alternate"] }), AUDIO_TRACK_ROLES.ALTERNATE);
  assert.equal(normalizeAudioRole({}), AUDIO_TRACK_ROLES.UNKNOWN);
  // Arbitrary text is not a role.
  assert.equal(normalizeAudioRole({ characteristics: "English 5.1" }), AUDIO_TRACK_ROLES.UNKNOWN);
});

test("selection requests reject invalid, stale, unknown and non-selectable input", () => {
  const tracks = normalizeEngineAudioTracks({
    engine: "hls.js",
    generation: 5,
    tracks: hlsTracks,
    selectedIndex: 0
  }).tracks;
  const key = tracks[0].key;
  assert.equal(
    resolveAudioSelectionRequest({ generation: 0, trackKey: key, tracks, currentGeneration: 5 })
      .reason,
    AUDIO_SELECTION_REASONS.INVALID_REQUEST
  );
  assert.equal(
    resolveAudioSelectionRequest({ generation: 5, trackKey: 42, tracks, currentGeneration: 5 })
      .reason,
    AUDIO_SELECTION_REASONS.INVALID_REQUEST
  );
  assert.equal(
    resolveAudioSelectionRequest({ generation: 4, trackKey: key, tracks, currentGeneration: 5 })
      .reason,
    AUDIO_SELECTION_REASONS.STALE_GENERATION
  );
  assert.equal(
    resolveAudioSelectionRequest({
      generation: 5,
      trackKey: "missing",
      tracks,
      currentGeneration: 5
    }).reason,
    AUDIO_SELECTION_REASONS.UNKNOWN_TRACK
  );
  const unavailable = [
    { ...tracks[0], key: "x", selectability: AUDIO_TRACK_SELECTABILITY.UNAVAILABLE }
  ];
  assert.equal(
    resolveAudioSelectionRequest({
      generation: 5,
      trackKey: "x",
      tracks: unavailable,
      currentGeneration: 5
    }).reason,
    AUDIO_SELECTION_REASONS.NOT_SELECTABLE
  );
  const accepted = resolveAudioSelectionRequest({
    generation: 5,
    trackKey: key,
    tracks,
    currentGeneration: 5,
    pendingTrackKey: tracks[1].key
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.reason, AUDIO_SELECTION_REASONS.NONE);
  assert.equal(accepted.supersedes, tracks[1].key);
  assert.equal(accepted.track.key, key);
});

test("the selection tracker confirms, times out, rejects and supersedes", async () => {
  let time = 0;
  const timers = [];
  const tracker = createAudioSelectionTracker({
    deadlineMs: 5000,
    now: () => time,
    setTimer: (callback, ms) => {
      const handle = { callback, ms, cleared: false };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      handle.cleared = true;
    }
  });

  const first = tracker.begin({ generation: 1, trackKey: "a", previousTrackKey: "b" });
  assert.equal(tracker.getPending().trackKey, "a");
  assert.equal(first.confirm().status, "confirmed");
  assert.equal(tracker.getPending(), null);
  assert.equal(first.confirm(), null); // settles once, never twice

  const second = tracker.begin({ generation: 1, trackKey: "b" });
  assert.equal(second.reject("engine-rejected").status, "rejected");

  const superseded = tracker.begin({ generation: 1, trackKey: "c" });
  const replacement = tracker.begin({ generation: 1, trackKey: "d" });
  assert.equal(replacement.superseded, "c");
  const supersededResult = await superseded.promise;
  assert.equal(supersededResult.status, "cancelled");
  assert.equal(supersededResult.reason, AUDIO_SELECTION_REASONS.SUPERSEDED);
  assert.equal(replacement.trackKey, "d");

  // The pending deadline resolves as timed-out rather than hanging.
  const pendingTimer = timers.find((handle) => !handle.cleared && handle.ms === 5000);
  pendingTimer.callback();
  const timedOut = await replacement.promise;
  assert.equal(timedOut.status, "timed-out");
  assert.equal(timedOut.reason, AUDIO_SELECTION_REASONS.TIMEOUT);
  assert.equal(tracker.getPending(), null);

  const invalidated = tracker.begin({ generation: 2, trackKey: "e" });
  assert.equal(tracker.invalidate(), true);
  const invalidatedResult = await invalidated.promise;
  assert.equal(invalidatedResult.status, "cancelled");
  assert.equal(invalidatedResult.reason, AUDIO_SELECTION_REASONS.STALE_GENERATION);
});

test("summaries count only what is actually known", () => {
  const summary = summarizeAudioTracks([
    { selectability: "available", ambiguous: false, decodeSupport: "predicted" },
    { selectability: "unavailable", ambiguous: true, decodeSupport: "unknown" },
    { selectability: "unknown", ambiguous: false, decodeSupport: "not-reported" }
  ]);
  assert.deepEqual(summary, {
    trackCount: 3,
    availableCount: 1,
    unavailableCount: 1,
    unknownCount: 1,
    ambiguousCount: 1,
    predictedCount: 1
  });
});

test("hostile and oversized metadata is bounded without inventing values", () => {
  const normalized = normalizeEngineAudioTracks({
    engine: "hls.js",
    generation: 1,
    tracks: [
      {
        id: "x".repeat(500),
        index: 0,
        selected: true,
        raw: {
          id: "<script>alert(1)</script>",
          lang: "en".repeat(60),
          name: "<img src=x onerror=alert(1)>",
          attrs: { CHANNELS: "9".repeat(30), CODECS: "<svg>" }
        }
      }
    ],
    selectedIndex: 0
  });
  const track = normalized.tracks[0];
  // Overlong values are rejected outright rather than truncated into a claim.
  assert.equal(track.language, null);
  assert.equal(track.codec, null);
  assert.equal(track.channels, null);
  // Short injection-shaped labels are kept as plain text; the screen escapes
  // them. The internal key never carries markup characters.
  assert.ok(track.label === null || track.label.length <= 96);
  assert.doesNotMatch(track.key, /[<>"']/);
  assert.doesNotMatch(normalized.selectedKey, /[<>"']/);
  const serialized = JSON.stringify(normalized);
  const hasControlCharacter = Array.from(serialized).some(
    (character) => character.charCodeAt(0) < 32 && character !== "\n"
  );
  assert.equal(hasControlCharacter, false);
});
