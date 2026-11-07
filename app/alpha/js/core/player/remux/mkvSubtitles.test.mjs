import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createMemorySource } from "./byteSource.js";
import { openMatroska } from "./mkvDemuxer.js";
import { createEmbeddedSubtitleLoader, listTextSubtitleTracks, subtitleText } from "./mkvSubtitles.js";

function fixture(name) {
  return new Uint8Array(
    readFileSync(new URL(`../../../../../../tests/fixtures/media/multi-audio/${name}`, import.meta.url))
  );
}

// Counts the bytes each read asks for, to show lines come from small reads.
function countingSource(bytes) {
  const inner = createMemorySource(bytes);
  const reads = [];
  return {
    reads,
    source: {
      size: inner.size,
      read(start, end, options) {
        reads.push(end - start);
        return inner.read(start, end, options);
      }
    }
  };
}

test("text subtitle tracks are listed with their language, title and line count", async () => {
  const demuxer = await openMatroska(createMemorySource(fixture("subtitles.mkv")));
  assert.deepEqual(
    listTextSubtitleTracks(demuxer).map(({ label, language, codec, lineCount }) => ({ label, language, codec, lineCount })),
    [
      { label: "English", language: "eng", codec: "srt", lineCount: 6 },
      { label: "Español", language: "spa", codec: "ass", lineCount: 6 }
    ]
  );
  // Files without subtitle tracks offer none.
  assert.deepEqual(listTextSubtitleTracks(await openMatroska(createMemorySource(fixture("multi-audio.mkv")))), []);
});

test("lines load by time window, once each, from small reads", async () => {
  const { source, reads } = countingSource(fixture("subtitles.mkv"));
  const demuxer = await openMatroska(source);
  const [english, spanish] = listTextSubtitleTracks(demuxer);
  const headerReads = reads.length;
  const loader = createEmbeddedSubtitleLoader(demuxer, english.id);
  // Line 1 ends at 1.8 s, before the window opens.
  assert.deepEqual(await loader.load(1.9, 4), [
    { start: 2, end: 2.8, text: "English line 2" },
    { start: 3, end: 3.8, text: "English line 3" }
  ]);
  // Already returned lines aren't returned again.
  assert.deepEqual(
    (await loader.load(0, 6)).map((line) => line.text),
    ["English line 0", "English line 1", "English line 4", "English line 5"]
  );
  assert.ok(reads.slice(headerReads).every((size) => size <= 64 * 1024 + 4096));
  // ASS styling is dropped, the text kept.
  const lines = await createEmbeddedSubtitleLoader(demuxer, spanish.id).load(0, 1);
  assert.deepEqual(lines, [{ start: 0, end: 0.8, text: "Línea 0 en español" }]);
});

test("cue text keeps basic styling and drops everything else", () => {
  const encode = (text) => new TextEncoder().encode(text);
  assert.equal(subtitleText(encode("<i>Hello</i> <font color=red>there</font> & co"), "srt"), "<i>Hello</i> there &amp; co");
  assert.equal(subtitleText(encode("<script>alert(1)</script>Safe"), "srt"), "Safe");
  assert.equal(subtitleText(encode("3,0,Default,,0,0,0,,{\\b1}Bold,\\Nnext"), "ass"), "Bold,\nnext");
});
