import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJson, readJson, updateJson, copyAside, stamp, NewerVersionError } from "../mods/friday/core/datafile.js";

/** A fake data folder with writeTextFile's compare-and-swap rule. */
function fakeIo(files = {}, { failWrites = 0, interfere = null } = {}) {
  let failures = failWrites;
  return {
    files,
    read: async (p) => (p in files ? files[p] : null),
    write: async (p, text, expected) => {
      if (interfere) {
        const f = interfere;
        interfere = null;
        f(files);
      }
      if (failures > 0) {
        failures--;
        throw new Error("The file changed outside Herdr");
      }
      const current = p in files ? files[p] : null;
      if (current !== expected) throw new Error("The file changed outside Herdr");
      files[p] = text;
    },
  };
}

test("parseJson classifies a file", () => {
  assert.equal(parseJson(null).state, "missing");
  assert.equal(parseJson("{").state, "corrupt");
  assert.equal(parseJson("[]").state, "corrupt");
  assert.equal(parseJson("null").state, "corrupt");
  assert.equal(parseJson('{"version":0}').state, "corrupt");
  assert.equal(parseJson('{"version":"1"}').state, "corrupt");
  assert.equal(parseJson("{}").state, "ok", "a hand-written file without a version is read as version 1");
  assert.equal(parseJson('{"version":1,"a":2}').value.a, 2);
});

test("a newer version is refused and says which", () => {
  const r = parseJson('{"version":2}');
  assert.deepEqual([r.state, r.version], ["newer", 2]);
});

test("updateJson creates a missing file with version 1", async () => {
  const io = fakeIo();
  await updateJson(io, "s.json", (v) => ({ ...v, a: 1 }));
  assert.deepEqual(JSON.parse(io.files["s.json"]), { version: 1, a: 1 });
  assert.ok(io.files["s.json"].endsWith("}\n"));
});

test("updateJson leaves a newer file alone", async () => {
  const text = '{"version":2,"keep":true}';
  const io = fakeIo({ "s.json": text });
  await assert.rejects(updateJson(io, "s.json", (v) => v), NewerVersionError);
  assert.equal(io.files["s.json"], text);
  assert.deepEqual(Object.keys(io.files), ["s.json"]);
});

test("a broken file is copied aside before it is replaced", async () => {
  const io = fakeIo({ "s.json": "{ not json" });
  const now = Date.UTC(2026, 10, 2, 15, 30, 45);
  await updateJson(io, "s.json", (v) => ({ ...v, a: 1 }), now);
  assert.equal(io.files["s.json.corrupt-20261102-153045"], "{ not json");
  assert.deepEqual(JSON.parse(io.files["s.json"]), { version: 1, a: 1 });
});

test("the stamp is UTC and sortable", () => {
  assert.equal(stamp(Date.UTC(2026, 0, 5, 3, 4, 5)), "20260105-030405");
});

test("copyAside returns the path it wrote", async () => {
  const io = fakeIo();
  const p = await copyAside(io, "x/s.json", "bad", Date.UTC(2026, 10, 2));
  assert.equal(p, "x/s.json.corrupt-20261102-000000");
  assert.equal(io.files[p], "bad");
});

test("a rejected write is retried once against a fresh read", async () => {
  const io = fakeIo({ "s.json": '{"version":1,"a":1}' }, { interfere: (f) => (f["s.json"] = '{"version":1,"a":1,"b":2}') });
  const next = await updateJson(io, "s.json", (v) => ({ ...v, c: 3 }));
  assert.deepEqual(next, { version: 1, a: 1, b: 2, c: 3 }, "the outside change is kept and the one change is applied again");
  assert.deepEqual(JSON.parse(io.files["s.json"]), next);
});

test("two rejected writes in a row throw", async () => {
  const io = fakeIo({ "s.json": '{"version":1}' }, { failWrites: 2 });
  await assert.rejects(updateJson(io, "s.json", (v) => ({ ...v, a: 1 })), /changed outside/);
  assert.equal(io.files["s.json"], '{"version":1}');
});

test("a rejection after the write landed counts as done", async () => {
  const io = fakeIo({ "s.json": '{"version":1}' });
  const real = io.write;
  io.write = async (p, text, expected) => {
    await real(p, text, expected);
    throw new Error("spurious");
  };
  const next = await updateJson(io, "s.json", (v) => ({ ...v, a: 1 }));
  assert.equal(next.a, 1);
});

test("readJson reads through io", async () => {
  const io = fakeIo({ "s.json": '{"version":1,"a":1}' });
  assert.equal((await readJson(io, "s.json")).value.a, 1);
  assert.equal((await readJson(io, "none.json")).state, "missing");
});
