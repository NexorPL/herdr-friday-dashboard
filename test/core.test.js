import { test } from "node:test";
import assert from "node:assert/strict";
import { leaseAction, leaseValue, leaseIsMine, LEASE_TTL, RENEW_BELOW, leaseKey } from "../mods/friday/core/lease.js";
import { isDue, shouldFetch, succeeded, failed, refreshed, shouldWrite, widgetState, REWRITE_AFTER, STALE_FLOOR } from "../mods/friday/core/due.js";
import { clockText, ymd, dateText, hhmm, minutesText, reviewLine, weekdayOf } from "../mods/friday/core/format.js";
import { httpsLink, absolutePath, openCommand } from "../mods/friday/core/links.js";
import { WIDGETS, widgetById, sourcesFor, DEFAULT_SPLITS, SOURCES } from "../mods/friday/core/widgets.js";
import { checklist } from "../mods/friday/core/setup.js";

const T = Date.UTC(2026, 10, 5, 12, 0, 0);

test("a lease is claimed when free or expired, skipped when another copy holds it", () => {
  assert.equal(leaseAction(null, "a", T), "claim");
  assert.equal(leaseAction({ copy: "b", until: T - 1 }, "a", T), "claim", "expired");
  assert.equal(leaseAction({ copy: "b", until: T + 5000 }, "a", T), "skip");
  assert.equal(leaseAction({ copy: "a", until: T + LEASE_TTL }, "a", T), "hold");
  assert.equal(leaseAction({ copy: "a", until: T + RENEW_BELOW - 1 }, "a", T), "renew");
  assert.equal(leaseAction({ copy: "a", until: T + RENEW_BELOW }, "a", T), "hold");
  assert.equal(leaseAction({ copy: "a" }, "b", T), "claim", "a malformed lease is free");
});

test("a lease expires LEASE_TTL after it is written, and a lost race is seen on read-back", () => {
  const mine = leaseValue("a", T);
  assert.deepEqual(mine, { copy: "a", until: T + LEASE_TTL });
  assert.ok(leaseIsMine(mine, "a", T + 1));
  assert.ok(!leaseIsMine(mine, "a", T + LEASE_TTL), "expired");
  assert.ok(!leaseIsMine(leaseValue("b", T), "a", T), "the other copy wrote last");
  assert.ok(!leaseIsMine(null, "a", T));
  assert.equal(leaseKey("ledger"), "friday.lease.ledger");
});

test("two copies racing for one lease end with one holder", () => {
  // setShared is last-writer-wins: both claim, the later write stands, both read it back.
  let shared = null;
  const claim = (copy) => { shared = leaseValue(copy, T); };
  assert.equal(leaseAction(shared, "a", T), "claim");
  assert.equal(leaseAction(shared, "b", T), "claim");
  claim("a");
  claim("b");
  const winners = ["a", "b"].filter((c) => leaseIsMine(shared, c, T + 400));
  assert.deepEqual(winners, ["b"]);
});

test("a source is due when it was never tried, and after its interval", () => {
  assert.ok(isDue(undefined, 60, T));
  const rec = succeeded(T);
  assert.ok(!isDue(rec, 60, T + 59_999));
  assert.ok(isDue(rec, 60, T + 60_000));
});

test("backoff holds a source back, and doubles on repeated failures", () => {
  const a = failed(succeeded(T - 1000), T, 300, { status: 503, message: "x: HTTP 503" });
  assert.equal(a.backoff_wait, 600);
  assert.equal(a.backoff_until, T + 600_000);
  assert.equal(a.ok_at, T - 1000, "the last good time is kept");
  assert.ok(!isDue(a, 300, T + 599_000));
  assert.ok(isDue(a, 300, T + 600_000 + 1));
  const b = failed(a, T + 700_000, 300, { status: 429, message: "x: HTTP 429" });
  assert.equal(b.backoff_wait, 1200);
  const c = failed({ ...b, backoff_wait: 1800 }, T, 300, { status: 500, message: "m" });
  assert.equal(c.backoff_wait, 1800, "never more than 30 minutes");
  const d = failed(a, T, 300, { status: 429, retryAfterSec: 3000, message: "m" });
  assert.equal(d.backoff_wait, 3000, "Retry-After wins when longer");
});

test("a rejected token stops polling until refreshed; ordinary errors retry at the interval", () => {
  const r = failed(null, T, 60, { status: 401, message: "jira: HTTP 401" });
  assert.ok(r.rejected && !isDue(r, 60, T + 10 ** 9));
  assert.ok(isDue(refreshed(r), 60, T + 1));
  assert.equal(refreshed(r).rejected, false);
  const e = failed(null, T, 60, { message: "cannot read x" });
  assert.equal(e.backoff_until, 0);
  assert.ok(isDue(e, 60, T + 60_000));
  assert.equal(e.ok_at, null);
});

test("a record is rewritten on a change or after it has been quiet for a minute", () => {
  const ok = succeeded(T);
  assert.ok(shouldWrite(undefined, ok));
  assert.ok(!shouldWrite(ok, succeeded(T + 15_000)));
  assert.ok(shouldWrite(ok, succeeded(T + REWRITE_AFTER)));
  assert.ok(shouldWrite(ok, failed(ok, T + 1, 60, { message: "boom" })));
});

test("a widget is in one of five states", () => {
  const base = { intervalSec: 15, now: T + 1000 };
  assert.equal(widgetState({ ...base, configured: false }), "not_set_up");
  assert.equal(widgetState({ ...base, rec: undefined }), "loading");
  assert.equal(widgetState({ ...base, rec: succeeded(T) }), "ok");
  assert.equal(widgetState({ ...base, rec: failed(null, T, 15, { message: "m" }) }), "error");
  assert.equal(widgetState({ ...base, rec: failed(null, T, 60, { status: 403, message: "m" }) }), "error");
  assert.equal(widgetState({ ...base, rec: succeeded(T), now: T + STALE_FLOOR + 1 }), "stale");
  assert.equal(widgetState({ ...base, rec: succeeded(T), now: T + STALE_FLOOR }), "ok");
  assert.equal(widgetState({ intervalSec: 3 * 3600, rec: succeeded(T), now: T + 3 * 3600_000 }), "ok", "a long interval is not stale within two of them");
});

test("the clock reads HH:MM:SS and the date reads like Thu 2026-11-05", () => {
  const d = new Date(2026, 10, 5, 9, 4, 7);
  assert.equal(clockText(d), "09:04:07");
  assert.equal(ymd(d), "2026-11-05");
  assert.equal(dateText(d), "Thu 2026-11-05");
  assert.equal(hhmm(new Date(2026, 10, 5, 14, 3).getTime()), "14:03");
  assert.equal(weekdayOf("2026-11-05"), "Thu");
  assert.equal(weekdayOf("2026-02-29"), weekdayOf("2026-03-01"), "no calendar validation here; callers pass valid dates");
});

test("minutes and the review line", () => {
  assert.deepEqual([0, 35, 60, 65, 120].map(minutesText), ["0 min", "35 min", "1 h", "1 h 5 min", "2 h"]);
  assert.equal(reviewLine({ runs: 7, minutes: 35 }), "review 35 min (7 runs)");
  assert.equal(reviewLine({ runs: 1, minutes: 5 }), "review 5 min (1 run)");
  assert.equal(reviewLine(null), "review 0 min");
});

test("only plain https links are opened", () => {
  assert.equal(httpsLink("https://example.test/a?b=c#d"), "https://example.test/a?b=c#d");
  assert.equal(httpsLink("HTTPS://example.test"), "HTTPS://example.test");
  assert.equal(httpsLink("https://example.test:8443/x"), "https://example.test:8443/x");
  for (const bad of [
    "http://example.test", "file:///C:/x", "javascript:alert(1)", "ms-msdt:/id", "mailto:a@b.test",
    "//example.test", "https:/example.test", "https://", "https:///x", "https://user:pw@example.test/",
    "https://example.test/a b", "https://example.test/\n", "-a https://example.test", " https://example.test",
    "https://exa mple.test", `https://example.test/${"a".repeat(2100)}`, "", null, undefined, 5,
  ]) assert.equal(httpsLink(bad), null, String(bad).slice(0, 40));
});

test("files are absolute paths only", () => {
  for (const ok of ["/home/me/data", "C:/Users/me/data", "C:\\Users\\me\\data"]) assert.equal(absolutePath(ok), ok);
  for (const bad of ["-a", "--help", "data", "~/data", "", "a\u0000b", null]) assert.equal(absolutePath(bad), null, String(bad));
});

test("the opener gets the target as one argument, never through a shell", () => {
  assert.deepEqual(openCommand("windows", "link", "https://x.test/a b".replace(" ", "%20")), { command: "rundll32", args: ["url.dll,FileProtocolHandler", "https://x.test/a%20b"] });
  assert.deepEqual(openCommand("macos", "link", "https://x.test"), { command: "open", args: ["https://x.test"] });
  assert.deepEqual(openCommand("linux", "file", "/tmp/x"), { command: "xdg-open", args: ["/tmp/x"] });
  assert.equal(openCommand("linux", "link", "http://x.test"), null);
  assert.equal(openCommand("linux", "file", "--version"), null);
  assert.equal(openCommand("plan9", "link", "https://x.test"), null);
  assert.equal(openCommand("linux", "exec", "https://x.test"), null);
  const hostile = "https://x.test/&calc.exe;rm -rf /";
  assert.equal(openCommand("windows", "link", hostile), null, "whitespace is refused");
  const amp = openCommand("windows", "link", "https://x.test/&calc.exe");
  assert.deepEqual(amp.args, ["url.dll,FileProtocolHandler", "https://x.test/&calc.exe"], "metacharacters stay inside one argument");
});

test("widget ids are the contract saved in the owner's tabs", () => {
  assert.deepEqual(WIDGETS.map((w) => w.id), ["summary", "ledger", "meetings", "jira", "favorites"]);
  assert.equal(widgetById("nope"), null);
  assert.deepEqual(sourcesFor(["summary", "ledger", "ledger"]), ["ledger", "calendar", "jira"]);
  assert.deepEqual(sourcesFor(["ledger"]), ["ledger"]);
  assert.deepEqual(DEFAULT_SPLITS, [["ledger", "down"], ["meetings", "right"], ["jira", "down"]]);
  for (const [widget] of DEFAULT_SPLITS) assert.ok(widgetById(widget));
  for (const w of WIDGETS) for (const source of w.sources) assert.ok(SOURCES[source], w.id);
});

test("the setup checklist lists only built sources", () => {
  const rows = checklist({ status: undefined, now: T });
  assert.deepEqual(rows.map((r) => [r.id, r.state, r.section]), [["ledger", "todo", "ledger"], ["calendar", "todo", "calendar"], ["jira", "todo", "jira"], ["ado", "todo", "ado"]]);
  const none = checklist({ status: { calendar: { ...succeeded(T), ok_at: null, not_set_up: true } }, now: T })[1];
  assert.deepEqual([none.state, none.detail], ["todo", "needs the iCal address"]);
  assert.deepEqual(checklist({ status: { jira: { ...succeeded(T), ok_at: null, not_set_up: true } }, now: T })[2].detail, "needs the site, e-mail and token");
  assert.equal(checklist({ status: { jira: succeeded(T) }, now: T })[2].state, "ok");
  assert.equal(checklist({ status: { calendar: succeeded(T) }, now: T })[1].state, "ok");
  assert.equal(checklist({ status: { ledger: succeeded(T) }, now: T })[0].state, "ok");
  assert.deepEqual(checklist({ status: { ado: { ...succeeded(T), ok_at: null, not_set_up: true } }, now: T })[3].detail, "needs the organization, PAT and repo");
  assert.equal(checklist({ status: { ado: succeeded(T) }, now: T })[3].state, "ok");
  const bad = checklist({ status: { ledger: failed(null, T, 15, { message: "ledger not found at x.md" }) }, now: T })[0];
  assert.deepEqual([bad.state, bad.detail], ["error", "ledger not found at x.md"]);
});

test("the header's state line", async () => {
  const { stateText } = await import("../mods/friday/core/format.js");
  const ok = new Date(2026, 10, 5, 14, 3).getTime();
  assert.equal(stateText("ok", { ok_at: ok }), "updated 14:03");
  assert.equal(stateText("stale", { ok_at: ok }), "stale, updated 14:03");
  assert.equal(stateText("error", { error: "ledger not found at x.md" }), "ledger not found at x.md");
  assert.equal(stateText("error", { rejected: true, error: "jira: HTTP 401" }), "token rejected");
  assert.equal(stateText("loading"), "loading…");
  assert.equal(stateText("not_set_up"), "not set up");
});

test("the first pane arranges the default panes only when it is alone in its tab", async () => {
  const { planArrangement, splitTarget } = await import("../mods/friday/core/arrange.js");
  const alone = [{ pane: "p1", mod: "friday", tab: "t1" }];
  assert.deepEqual(planArrangement(alone, DEFAULT_SPLITS), [
    { pane: "p1", direction: "down", mod: "friday", props: { widget: "ledger" } },
    { pane: "p1", direction: "right", mod: "friday", props: { widget: "meetings" } },
    { pane: "p1", direction: "down", mod: "friday", props: { widget: "jira" } },
  ]);
  assert.deepEqual(planArrangement([...alone, { pane: "p2", mod: "friday", tab: "t1" }], DEFAULT_SPLITS), [], "an arranged tab is left alone");
  assert.deepEqual(planArrangement([], DEFAULT_SPLITS), []);
  assert.deepEqual(planArrangement([{ pane: "p1", mod: null, tab: "t1" }], DEFAULT_SPLITS), [], "a lone terminal is not split");
  assert.deepEqual(planArrangement([{ pane: "p1", mod: "files", tab: "t1" }], DEFAULT_SPLITS), [], "nor another mod");

  const all = [{ pane: "p1", mod: "friday" }, { pane: "p9", mod: null }];
  assert.equal(splitTarget({ pane: "p1" }, all), "p1");
  assert.equal(splitTarget({ pane: "p9" }, all), null, "the focused pane is a terminal");
  assert.equal(splitTarget({ pane: null }, all), null);
  assert.equal(splitTarget(null, all), null);
  assert.equal(splitTarget({ pane: "p7" }, all), null);
});

test("an unchanged result is not fetched again before its interval, and is after it", () => {
  // the stored record is not rewritten for REWRITE_AFTER, so it keeps its old attempt_at
  const rec = { ...succeeded(T), for: "p" };
  const attempted = T + 15_000; // the holder fetched again at +15 s; the record stayed at T
  assert.ok(!shouldFetch(rec, 15, T + 20_000, attempted), "5 s tick after the fetch");
  assert.ok(!shouldFetch(rec, 15, T + 29_999, attempted));
  assert.ok(shouldFetch(rec, 15, T + 30_000, attempted));
});

test("a forced refresh is fetched at once", () => {
  const rec = { ...succeeded(T), for: "p" };
  assert.ok(shouldFetch(rec, 15, T + 1, T, true), "force: settings save or changed path");
  assert.ok(shouldFetch(refreshed(rec), 15, T + 1, T), "↻ from another pane resets attempt_at");
  assert.ok(shouldFetch(undefined, 15, T + 1, T), "no record yet");
});
