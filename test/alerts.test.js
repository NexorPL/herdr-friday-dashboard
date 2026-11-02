import { test } from "node:test";
import assert from "node:assert/strict";
import { dueAlerts, claimAlerts, alertText, alertKey, offsetMinutes, LATE_MS, KEEP_MS } from "../mods/friday/core/alerts.js";
import { updateJson } from "../mods/friday/core/datafile.js";

const START = Date.UTC(2026, 10, 4, 13, 30); // 14:30 at +01:00
const meeting = (uid, start = START, extra = {}) => ({ uid, occurrence: start, start, end: start + 30 * 60_000, all_day: false, title: `Meeting ${uid}`, join_kind: null, ...extra });
const at = (min, sec = 0) => START - min * 60_000 + sec * 1000;
const keys = (due) => due.map((d) => [d.meeting.uid, d.offsetMin]);

test("offsets become whole minutes, largest first, without repeats", () => {
  assert.deepEqual(offsetMinutes([300, 900, 600, 300, 30]), [15, 10, 5, 0]);
});

test("an alert is due from its time until a minute later, per offset", () => {
  const m = [meeting("a")];
  const offsets = [900, 600, 300]; // 15, 10, 5 minutes (R06)
  assert.deepEqual(keys(dueAlerts(m, offsets, {}, at(16))), []);
  assert.deepEqual(keys(dueAlerts(m, offsets, {}, at(15))), [["a", 15]]);
  assert.deepEqual(keys(dueAlerts(m, offsets, {}, at(15, 59))), [["a", 15]]);
  assert.deepEqual(keys(dueAlerts(m, offsets, {}, at(14, 30))), [], "15 is more than a minute late, 10 is not yet");
  assert.deepEqual(keys(dueAlerts(m, offsets, {}, at(10, 30))), [["a", 10]]);
  assert.deepEqual(keys(dueAlerts(m, offsets, {}, at(5))), [["a", 5]]);
});

test("a restart inside the window still alerts once; a wake after it drops the alert (R11)", () => {
  const m = [meeting("a")];
  assert.equal(dueAlerts(m, [300], {}, at(5, LATE_MS / 1000)).length, 1, "exactly 60 s late is still sent");
  assert.equal(dueAlerts(m, [300], {}, at(5, 61)).length, 0, "61 s late is dropped");
  assert.equal(dueAlerts(m, [300], {}, at(2)).length, 0, "the computer woke 3 minutes late");
});

test("sent alerts are not due again, other occurrences and offsets are", () => {
  const a = meeting("a");
  const sent = { [alertKey(a, 5)]: 1 };
  assert.deepEqual(dueAlerts([a], [300], sent, at(5)), []);
  assert.equal(dueAlerts([a], [600, 300], sent, at(5)).length, 0, "10 is not due at 5");
  const nextWeek = meeting("a", START + 7 * 86_400_000);
  assert.equal(dueAlerts([nextWeek], [300], sent, at(5) + 7 * 86_400_000).length, 1, "same uid, another occurrence");
});

test("all-day events get no alert", () => {
  const allDay = meeting("w", START, { all_day: true });
  assert.deepEqual(dueAlerts([allDay], [300], {}, at(5)), []);
});

test("an offset of 0 alerts at the start", () => {
  assert.equal(dueAlerts([meeting("a")], [0], {}, START).length, 1);
});

test("claiming records the keys, keeps recent entries and prunes old ones", () => {
  const now = START;
  const old = { version: 1, sent: { "x|2026-10-01T00:00:00.000Z|5": now - KEEP_MS - 1, "y|2026-11-04T00:00:00.000Z|5": now - 1000 } };
  const due = dueAlerts([meeting("a")], [300], {}, at(5));
  const { next, claimed } = claimAlerts(old, due, now);
  assert.equal(claimed.length, 1);
  assert.deepEqual(Object.keys(next.sent).sort(), ["a|2026-11-04T13:30:00.000Z|5", "y|2026-11-04T00:00:00.000Z|5"]);
  assert.equal(next.version, 1);
  assert.deepEqual(claimAlerts(next, due, now).claimed, [], "already there: nothing to send");
  assert.deepEqual(claimAlerts(null, due, now).claimed.length, 1);
  assert.deepEqual(claimAlerts({ sent: "broken" }, due, now).claimed.length, 1);
});

// Two copies find the same alert in the same millisecond and write identical text: with
// compare-and-swap and no "my write landed" shortcut, one toast.
test("two copies racing for one alert: exactly one wins", async () => {
  let file = null;
  const io = {
    read: async () => { await Promise.resolve(); return file; },
    write: async (_p, text, expected) => {
      await Promise.resolve();
      if (expected !== file) throw new Error("The file changed outside Herdr");
      file = text;
    },
  };
  const due = dueAlerts([meeting("a")], [300], {}, at(5));
  const copy = async () => {
    let won = [];
    await updateJson(io, "alerts.json", (raw) => {
      const r = claimAlerts(raw, due, at(5));
      won = r.claimed;
      return r.next;
    }, Date.now(), false);
    return won;
  };
  const [a, b] = await Promise.all([copy(), copy()]);
  assert.equal(a.length + b.length, 1);
  assert.equal(Object.keys(JSON.parse(file).sent).length, 1);
});

test("the toast says how soon, when, and Teams or Meet", () => {
  const m = meeting("a", START, { title: "Standup", join_kind: "Teams" });
  assert.deepEqual(alertText(m, 5, 60), { title: "In 5m: Standup", body: "14:30–15:00 · Teams" });
  assert.deepEqual(alertText({ ...m, join_kind: null }, 0, 60), { title: "Now: Standup", body: "14:30–15:00" });
  assert.equal(alertText(m, 60, 60).title, "In 1h: Standup");
  assert.equal(alertText(m, 90, 60).title, "In 1h 30m: Standup");
});
