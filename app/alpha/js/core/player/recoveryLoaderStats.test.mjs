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

test("a zero first-byte timestamp still measures bandwidth", () => {
  const stats = createLoaderStats({ now: clock([0, 0, 1000]) });
  stats.begin();
  stats.firstByte(250);
  stats.end({ total: 250 });
  assert.equal(stats.stats.loading.first, 0);
  assert.equal(stats.stats.bwEstimate, 2000);
});

test("bandwidth scales with elapsed duration", () => {
  const fast = createLoaderStats({ now: clock([0, 0, 500]) });
  fast.begin();
  fast.firstByte(1000);
  fast.end({ total: 1000 });
  assert.equal(fast.stats.bwEstimate, 16000);

  const slow = createLoaderStats({ now: clock([0, 0, 2000]) });
  slow.begin();
  slow.firstByte(1000);
  slow.end({ total: 1000 });
  assert.equal(slow.stats.bwEstimate, 4000);
});

test("an invalid or decreasing clock cannot produce negative durations", () => {
  for (const values of [
    [100, 90, 70],
    [0, Number.NaN, 50],
    [0, Number.POSITIVE_INFINITY, 50],
    [0, -5, 50],
    [0, "50", 60]
  ]) {
    const stats = createLoaderStats({ now: clock(values) });
    stats.begin();
    stats.firstByte(10);
    stats.end({ total: 10 });
    assert.ok(stats.stats.loading.start >= 0);
    assert.ok(stats.stats.loading.first >= stats.stats.loading.start, JSON.stringify(values));
    assert.ok(stats.stats.loading.end >= stats.stats.loading.first, JSON.stringify(values));
    assert.equal(typeof stats.stats.bwEstimate, "number");
    assert.ok(Number.isFinite(stats.stats.bwEstimate));
  }
});

test("a throwing clock keeps the previous reading instead of failing", () => {
  let calls = 0;
  const stats = createLoaderStats({
    now: () => {
      calls += 1;
      if (calls > 1) throw new Error("boom");
      return 10;
    }
  });
  assert.doesNotThrow(() => {
    stats.begin();
    stats.firstByte(10);
    stats.end({ total: 10 });
  });
  assert.equal(stats.stats.loading.first, 10);
});
