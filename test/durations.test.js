import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, parseBounded, parseInterval, parseDurations, MAX_SECONDS } from "../mods/friday/core/durations.js";

test("durations parse to seconds", () => {
  const cases = [["30s", 30], ["5m", 300], ["1h 30m", 5400], ["1.5h", 5400], ["1h30m", 5400], [" 2m ", 120], ["0s", 0]];
  for (const [text, seconds] of cases) assert.equal(parseDuration(text), seconds, text);
});

test("durations reject anything else", () => {
  for (const text of ["abc", "", "5", "m", "5x", "1h 30", "1..5h", "-5m", "5 m", "1e3h", ".", "   ", null, 5, undefined]) {
    assert.equal(parseDuration(text), null, String(text));
  }
});

test("bounded durations are at most a day", () => {
  assert.equal(parseBounded("24h"), MAX_SECONDS);
  assert.equal(parseBounded("25h"), null);
  assert.equal(parseBounded("999999999h"), null);
  assert.equal(parseBounded("nope"), null);
});

test("intervals are above zero and at most a day", () => {
  assert.equal(parseInterval("5m"), 300);
  assert.equal(parseInterval("24h"), MAX_SECONDS);
  for (const bad of ["0s", "25h", "999999999h", "five"]) assert.equal(parseInterval(bad), null, bad);
});

test("a list of durations is all valid or null", () => {
  assert.deepEqual(parseDurations(["15m", "5m"]), [900, 300]);
  assert.deepEqual(parseDurations([]), []);
  assert.equal(parseDurations(["5m", "25h"]), null);
  assert.equal(parseDurations("5m"), null);
});
