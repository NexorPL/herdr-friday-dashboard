import { test } from "node:test";
import assert from "node:assert/strict";
import { testAddress, saveAddress } from "../mods/friday/core/calendarform.js";

// What Settings > Calendar's Test, Save address and Remove do, with fakes for the file and the
// network. Every path must end in a message the dialog shows, and none may quote the address.
const URL_SECRET = "https://calendar.example.org/private-SECRETTOKEN123/basic.ics";
const leaks = (said) => JSON.stringify(said).includes("SECRETTOKEN123") || JSON.stringify(said).includes("calendar.example.org");

function recorder() {
  const said = [];
  return { said, say: (text, state) => said.push({ text, state }), last: () => said.at(-1) };
}

const runTest = (over) => {
  const r = recorder();
  return testAddress({ typed: URL_SECRET, readSecret: async () => null, fetchFeed: async () => ({ ok: true, value: { meetings: [1, 2] } }), say: r.say, ...over }).then(() => r);
};

test("Test with a working address ends in OK and the meeting count", async () => {
  let asked = null;
  const r = await runTest({ fetchFeed: async (url) => { asked = url; return { ok: true, value: { meetings: [1, 2] } }; } });
  assert.equal(asked, URL_SECRET);
  assert.deepEqual(r.said, [{ text: "OK, 2 meetings today and tomorrow.", state: "ok" }]);
});

test("Test with an empty box uses the stored address, and says so when there is none", async () => {
  let asked = null;
  const stored = await runTest({ typed: "", readSecret: async () => URL_SECRET, fetchFeed: async (url) => { asked = url; return { ok: true, value: { meetings: [] } }; } });
  assert.equal(asked, URL_SECRET);
  assert.deepEqual(stored.last(), { text: "OK, 0 meetings today and tomorrow.", state: "ok" });
  assert.deepEqual((await runTest({ typed: "" })).last(), { text: "No address yet.", state: "error" });
});

test("Test failures end in an error message that never quotes the address", async () => {
  const cases = [
    [{ fetchFeed: async () => ({ ok: false, status: 401, message: "calendar: HTTP 401" }) }, "calendar: address rejected"],
    [{ fetchFeed: async () => ({ ok: false, status: 404, message: "calendar: HTTP 404" }) }, "calendar: HTTP 404"],
    [{ fetchFeed: async () => { throw new Error(`fetching ${URL_SECRET} failed`); } }, "calendar: the test failed"],
    [{ typed: "", readSecret: async () => { throw new Error(URL_SECRET); } }, "calendar: the test failed"],
    [{ fetchFeed: async () => ({ ok: true, value: null }) }, "calendar: the test failed"],
    [{ typed: "http://calendar.example.org/private-SECRETTOKEN123" }, "calendar: the address must start with https://"],
  ];
  for (const [over, text] of cases) {
    const r = await runTest(over);
    assert.deepEqual(r.last(), { text, state: "error" });
    assert.equal(leaks(r.said), false);
  }
});

test("Save address says Saved only after secrets.json was written, then clears the box", async () => {
  const r = recorder();
  const order = [];
  let finish;
  const written = new Promise((resolve) => { finish = resolve; });
  const done = saveAddress({
    typed: URL_SECRET,
    remove: false,
    saveSecret: async (value) => { order.push(["write", value === URL_SECRET]); await written; },
    saved: () => order.push(["saved"]),
    say: r.say,
  });
  await Promise.resolve();
  assert.deepEqual(r.said, []); // nothing claimed before the write finished
  finish();
  await done;
  assert.deepEqual(r.said, [{ text: "Address saved (written to secrets.json).", state: "ok" }]);
  assert.deepEqual(order, [["write", true], ["saved"]]);
  assert.equal(leaks(r.said), false);
});

test("Save address refuses an empty or bad box without writing, and a failed write says so", async () => {
  for (const [typed, text] of [["", "Paste the address first."], ["not an address", "calendar: the address must start with https://"]]) {
    const r = recorder();
    let wrote = false;
    await saveAddress({ typed, remove: false, saveSecret: async () => { wrote = true; }, saved: () => {}, say: r.say });
    assert.deepEqual(r.said, [{ text, state: "error" }]);
    assert.equal(wrote, false);
  }
  const r = recorder();
  let saved = false;
  await saveAddress({ typed: URL_SECRET, remove: false, saveSecret: async () => { throw new Error(URL_SECRET); }, saved: () => { saved = true; }, say: r.say });
  assert.deepEqual(r.said, [{ text: "Could not save secrets.json. Try again.", state: "error" }]);
  assert.equal(saved, false);
  assert.equal(leaks(r.said), false);
});

test("Remove writes an empty address and says so", async () => {
  const r = recorder();
  let value = null;
  await saveAddress({ typed: "", remove: true, saveSecret: async (v) => { value = v; }, saved: () => {}, say: r.say });
  assert.equal(value, "");
  assert.deepEqual(r.said, [{ text: "Address removed.", state: "ok" }]);
});
