import test from "node:test";
import assert from "node:assert/strict";

import { createLoaderStats } from "./recoveryLoaderStats.js";

function clock(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

test("stats start in the pinned hls.js shape with buffering.first present", () => {
  const { stats } = createLoaderStats({ now: () => 0 });
  for (const key of ["aborted", "loaded", "retry", "total", "chunkCount", "bwEstimate"]) {
    assert.ok(key in stats, key);
  }
  assert.deepEqual(Object.keys(stats.loading).sort(), ["end", "first", "start"]);
  assert.deepEqual(Object.keys(stats.parsing).sort(), ["end", "start"]);
  assert.deepEqual(Object.keys(stats.buffering).sort(), ["end", "first", "start"]);
  assert.equal(stats.aborted, false);
  assert.equal(stats.loaded, 0);
});

test("timings are monotonic and the first byte opens buffering", () => {
  const stats = createLoaderStats({ now: clock([100, 150, 200, 260]) }).begin();
  const owner = createLoaderStats({ now: clock([100, 150, 200, 260]) });
  const live = owner.begin();
  owner.stats.loading.start = stats.loading.start;
  owner.firstByte(10);
  owner.chunk(90);
  owner.end({ total: 100 });
  assert.equal(owner.stats.loading.start, 100);
  assert.equal(owner.stats.loading.first, 150);
  assert.equal(owner.stats.loading.end, 260);
  assert.equal(owner.stats.buffering.start, 150);
  assert.equal(owner.stats.buffering.first, 150);
  assert.equal(owner.stats.buffering.end, 260);
  assert.equal(owner.stats.chunkCount, 2);
  assert.equal(owner.stats.loaded, 100);
  assert.equal(owner.stats.total, 100);
  assert.ok(owner.stats.loading.first >= owner.stats.loading.start);
  assert.ok(owner.stats.loading.end >= owner.stats.loading.first);
  assert.ok(live.loading.start >= 0);
});

test("bandwidth uses elapsed time rather than a fixed divisor", () => {
  const stats = createLoaderStats({ now: clock([0, 1000, 2000]) });
  stats.begin();
  stats.firstByte(250);
  stats.end({ total: 250 });
  // 250 bytes over 1000 ms is 2000 bits/s.
  assert.equal(stats.stats.bwEstimate, 2000);
});

test("only finite positive chunk sizes are counted", () => {
  const stats = createLoaderStats({ now: () => 0 });
  stats.begin();
  stats.firstByte(10);
  for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
    stats.chunk(value);
  }
  assert.equal(stats.stats.loaded, 10);
  assert.equal(stats.stats.chunkCount, 1);
});

test("failure ends timing without marking the request aborted", () => {
  const stats = createLoaderStats({ now: clock([0, 10, 20]) });
  stats.begin();
  stats.firstByte(5);
  stats.fail();
  assert.equal(stats.stats.aborted, false);
  assert.equal(stats.stats.loading.end, 20);
});

test("abort is an explicit flag on top of the failure timings", () => {
  const stats = createLoaderStats({ now: clock([0, 5, 9]) });
  stats.begin();
  stats.firstByte(1);
  stats.abort();
  assert.equal(stats.stats.aborted, true);
  assert.equal(stats.stats.loading.end, 9);
});

test("parsing timestamps are recorded independently", () => {
  const stats = createLoaderStats({ now: clock([1, 2, 3, 4]) });
  stats.begin();
  stats.parseStart();
  stats.parseEnd();
  assert.ok(stats.stats.parsing.start > 0);
  assert.ok(stats.stats.parsing.end >= stats.stats.parsing.start);
});
