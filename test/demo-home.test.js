import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { seed, datedLedger, DEMO_JIRA } from "../scripts/demo-home.mjs";
import { parseLedger } from "../mods/friday/core/ledger.js";

const fixture = readFileSync(new URL("./fixtures/ledger.md", import.meta.url), "utf8");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test("the demo home has the mod, fixture settings and a seeded cache, and no secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "friday-demo-"));
  const today = new Date(2026, 10, 9, 12);
  const { ledgerPath } = seed(dir, { today, env: {} });
  const files = walk(dir).map((p) => p.slice(dir.length + 1).replaceAll("\\", "/"));
  assert.ok(files.includes("mods/friday/main.js") && files.includes("mods/friday/mod.json"));
  assert.ok(files.includes("data/friday/settings.json") && files.includes("data/friday/pr-reviews.md"));
  assert.ok(!files.some((f) => /^data[/].*secret/i.test(f)), "no secrets.json");
  // The mod's own code names the secrets it reads; the data the demo seeds must not hold any.
  const everything = walk(dir).filter((p) => !p.slice(dir.length + 1).replaceAll("\\", "/").startsWith("mods/")).map((p) => readFileSync(p, "utf8")).join("\n");
  assert.ok(!/jira_token|ado_pat|ical_url|password|api[_-]?key/i.test(everything), "no secret keys anywhere");
  const settings = JSON.parse(readFileSync(join(dir, "data/friday/settings.json"), "utf8"));
  assert.deepEqual(settings, { version: 1, ledger: { path: ledgerPath }, jira: DEMO_JIRA });
  assert.equal(readFileSync(join(dir, "data/friday/favorites.md"), "utf8"), "DEMO-3\nDEMO-99\n");
  const cached = JSON.parse(readFileSync(join(dir, "shared.json"), "utf8"));
  assert.ok(cached["friday.jira"].data.issues.length > 0);
  assert.equal(cached["friday.jira"].for, `jira:${DEMO_JIRA.site}|${DEMO_JIRA.email}|scoped`);
  assert.equal(JSON.stringify(cached).includes("Basic "), false);
  const shared = JSON.parse(readFileSync(join(dir, "shared.json"), "utf8"));
  assert.equal(shared["friday.ledger"].path, ledgerPath);
  assert.equal(shared["friday.status"].ledger.for, ledgerPath);
  assert.deepEqual(shared["friday.ledger"].data.days.map((d) => d.date), ["2026-11-09", "2026-11-08", "2026-11-07"]);
});

test("the fixture days move to today and the two days before it", () => {
  const dated = datedLedger(fixture, new Date(2026, 10, 9, 12));
  const l = parseLedger(dated);
  assert.deepEqual(l.days.map((d) => d.date), ["2026-11-09", "2026-11-08", "2026-11-07"]);
  assert.deepEqual(Object.keys(l.totals), ["2026-11-09", "2026-11-08", "2026-11-07"]);
  assert.match(dated, /2026-11-09, Monday/);
  assert.equal(l.skipped, 1);
});

test("the real app home is refused", () => {
  assert.throws(() => seed(join(homedir(), ".config", "herdr-app"), { env: {} }), /real app home/);
  const dir = mkdtempSync(join(tmpdir(), "friday-demo-"));
  assert.throws(() => seed(dir, { env: { HERDR_APP_HOME: dir } }), /real app home/);
});

test("a folder that is not empty and not a demo home is refused; a demo home is reseeded", () => {
  const dir = mkdtempSync(join(tmpdir(), "friday-demo-"));
  writeFileSync(join(dir, "mine.txt"), "x");
  assert.throws(() => seed(dir, { env: {} }), /not empty/);
  const demo = mkdtempSync(join(tmpdir(), "friday-demo-"));
  seed(demo, { env: {} });
  seed(demo, { env: {} });
  assert.ok(existsSync(join(demo, "data/friday/pr-reviews.md")));
});
