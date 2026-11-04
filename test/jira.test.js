import { test } from "node:test";
import assert from "node:assert/strict";
import { siteOrigin, validateJira, baseUrl, authHeader, jiraKeys, keySet, compareKeys, myRows, parseIssue, fetchCloudId, testMyself, fetchJira, FETCH_TIMEOUT_MS } from "../mods/friday/core/jira.js";

const TOKEN = "TEST-TOKEN-123";
const CFG = { site: "https://acme.atlassian.net", email: "me@example.org", kind: "scoped", token: TOKEN };
const B64 = Buffer.from(`me@example.org:${TOKEN}`).toString("base64");
const AUTH = `Basic ${B64}`;
const CLOUD = "11111111-2222-3333-4444-555555555555";
const API = `https://api.atlassian.com/ex/jira/${CLOUD}`;
const issue = (key, priority = "Medium") => ({ key, fields: { summary: `Task ${key}`, status: { name: "In Progress", statusCategory: { key: "indeterminate" } }, priority: { name: priority } } });
const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

/** A fake fetch over { "url prefix": response | fn }; records every call. */
function fake(routes) {
  const calls = [];
  const f = async (url, opts = {}) => {
    calls.push({ url, headers: opts.headers ?? {} });
    const hit = Object.keys(routes).find((p) => url.startsWith(p));
    if (!hit) throw new Error(`unexpected ${url}`);
    const r = routes[hit];
    return typeof r === "function" ? r(url) : r;
  };
  f.calls = calls;
  return f;
}
const deps = (fetch, withTimeout = (p) => p) => ({ fetch, withTimeout });
const leaks = (v) => /SECRETTOKEN123|acme\.atlassian|api\.atlassian|Basic /.test(JSON.stringify(v)) || JSON.stringify(v).includes(B64);
const tenant = { "https://acme.atlassian.net/_edge/tenant_info": json({ cloudId: CLOUD }) };

test("site origin, validation and base URL by token kind", () => {
  assert.equal(siteOrigin("https://acme.atlassian.net/"), "https://acme.atlassian.net");
  assert.equal(siteOrigin("acme.atlassian.net"), "https://acme.atlassian.net");
  for (const bad of ["", null, "http://acme.atlassian.net", "https://", "not a site", "ftp://x.net"]) assert.equal(siteOrigin(bad), null, String(bad));
  assert.equal(validateJira(CFG), null);
  assert.match(validateJira({ ...CFG, site: "x" }), /site/);
  assert.match(validateJira({ ...CFG, email: " " }), /e-mail/);
  assert.equal(baseUrl({ kind: "scoped", site: CFG.site, cloudId: CLOUD }), API);
  assert.equal(baseUrl({ kind: "classic", site: "acme.atlassian.net/" }), "https://acme.atlassian.net");
});

test("Basic auth is UTF-8 safe and matches Node base64", () => {
  assert.equal(authHeader("me@example.org", TOKEN), AUTH);
  assert.equal(authHeader("zażółć@example.org", "t"), "Basic " + Buffer.from("zażółć@example.org:t").toString("base64"));
});

test("the key set is built from missing, empty and full files", () => {
  assert.deepEqual(keySet(null, null), []);
  assert.deepEqual(keySet("", ""), []);
  assert.deepEqual(keySet("no keys here\n- abc-1 lower\n", null), []);
  const fav = "- [ABC-10](https://x.example/browse/ABC-10) ten\n- ABC-2 two\n- XYZ-1\n";
  const pri = "1. ABC-2 again (blocked by NOPE-9)\r\n2. fooABC-3 and ABC-4bar\r\n";
  assert.deepEqual(keySet(fav, pri), ["ABC-2", "ABC-10", "NOPE-9", "XYZ-1"]);
  assert.deepEqual(keySet(null, "ABC-1"), ["ABC-1"]);
  assert.equal(keySet(Array.from({ length: 80 }, (_, i) => `KEY-${i + 1}`).join("\n"), null).length, 40);
  assert.deepEqual(jiraKeys("A1-2, B-3."), ["A1-2"]); // a project has two or more characters, as in the ledger
});

test("rows: priority first, then key in project and number order; others are not mine", () => {
  const origin = "https://acme.atlassian.net";
  const mk = (key, p, assigned = true) => parseIssue(issue(key, p), origin, assigned);
  const rows = myRows([mk("ABC-10", "High"), mk("ABC-2", "High"), mk("AAA-9", "Low"), mk("ZZZ-1", "Highest"), mk("ABC-3", "Wat"), mk("ABC-4", ""), mk("FAV-1", "Highest", false), mk("ABC-1", "Medium")]);
  assert.deepEqual(rows.map((r) => r.key), ["ZZZ-1", "ABC-2", "ABC-10", "ABC-1", "AAA-9", "ABC-3", "ABC-4"]);
  assert.equal(rows[0].url, "https://acme.atlassian.net/browse/ZZZ-1");
  assert.deepEqual(myRows(null), []);
  assert.ok(compareKeys("ABC-2", "ABC-10") < 0);
});

test("fetchCloudId and testMyself: scoped goes through api.atlassian.com, classic on the site", async () => {
  const f = fake({ ...tenant, [`${API}/rest/api/3/myself`]: json({ displayName: "Me Myself", accountId: "x" }) });
  assert.deepEqual(await fetchCloudId(deps(f), CFG.site), { ok: true, cloudId: CLOUD });
  assert.equal(f.calls[0].headers.Authorization, undefined); // tenant_info is unauthenticated
  const r = await testMyself(deps(f), CFG);
  assert.deepEqual(r, { ok: true, name: "Me Myself", accountId: "x", cloudId: CLOUD });
  assert.equal(f.calls.at(-1).headers.Authorization, AUTH);
  const c = fake({ "https://acme.atlassian.net/rest/api/3/myself": json({ displayName: "Me" }) });
  assert.equal((await testMyself(deps(c), { ...CFG, kind: "classic" })).ok, true);
  assert.equal(c.calls.length, 1); // no tenant_info for a classic token
});

test("fetchJira pages my issues, then fetches the extra keys; a 404 marks a key missing", async () => {
  const f = fake({
    ...tenant,
    [`${API}/rest/api/3/myself`]: json({ accountId: "acc-1" }),
    [`${API}/rest/api/3/search/jql`]: (url) => url.includes("nextPageToken=P2")
      ? json({ issues: [issue("ABC-2", "Low")], isLast: true })
      : json({ issues: [issue("ABC-1", "High")], isLast: false, nextPageToken: "P2" }),
    [`${API}/rest/api/3/issue/FAV-1`]: json(issue("FAV-1")),
    [`${API}/rest/api/3/issue/GONE-1`]: json({}, 404),
  });
  const r = await fetchJira(deps(f), CFG, { keys: ["ABC-1", "FAV-1", "GONE-1"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.issues.map((i) => [i.key, i.assigned]), [["ABC-1", true], ["ABC-2", true], ["FAV-1", false]]);
  assert.deepEqual(r.value.missing, ["GONE-1"]);
  assert.equal(r.value.cloud_id, CLOUD);
  assert.equal(r.value.account_id, "acc-1");
  assert.ok(f.calls.some((c) => c.url.includes("jql=assignee%20%3D%20currentUser()")));
  assert.equal(f.calls.filter((c) => c.url.includes("/issue/ABC-1")).length, 0); // already assigned
  assert.equal(JSON.stringify(r.value).includes(TOKEN), false);
  // a kept cloud id skips tenant_info
  f.calls.length = 0;
  await fetchJira(deps(f), CFG, { cloudId: CLOUD, accountId: "acc-1" });
  assert.equal(f.calls.some((c) => c.url.includes("_edge") || c.url.includes("/myself")), false);
});

test("every error path maps to a message without the token, the auth header or a URL", async () => {
  const urlErr = new Error(`fetching ${API}/rest/api/3/myself failed: error sending request for url (${API}) ${AUTH} ${TOKEN}`);
  const timer = Object.assign(new Error(`timeout ${TOKEN}`), { name: "FridayTimeout" });
  const text = (t) => ({ ok: true, status: 200, text: t });
  const connect = "jira: could not connect (check the network or proxy)";
  const search = `${API}/rest/api/3/search/jql`;
  const myself = `${API}/rest/api/3/myself`;
  const site = "https://acme.atlassian.net/_edge/tenant_info";
  const empty = json({ issues: [], isLast: true });
  const fetchWith = (routes, opts) => (d) => fetchJira(d, CFG, opts);
  const cases = [
    ["401", { ...tenant, [search]: json({ errorMessages: [TOKEN] }, 401) }, 401, "jira: token rejected"],
    ["403", { ...tenant, [search]: json({}, 403) }, 403, "jira: token rejected"],
    ["429", { ...tenant, [search]: json({}, 429) }, 429, "jira: HTTP 429"],
    ["503", { ...tenant, [search]: json({}, 503) }, 503, "jira: HTTP 503"],
    ["network", { ...tenant, [search]: () => { throw urlErr; } }, undefined, connect],
    ["weird", { ...tenant, [search]: () => { throw new Error(`weird ${TOKEN}`); } }, undefined, "jira: request failed"],
    ["timeout", { ...tenant, [search]: () => { throw timer; } }, undefined, `jira: timed out after ${FETCH_TIMEOUT_MS / 1000} s`],
    ["bad json", { ...tenant, [search]: text(async () => `<html>${TOKEN}`) }, undefined, "jira: unexpected answer"],
    ["body error", { ...tenant, [search]: text(async () => { throw urlErr; }) }, undefined, "jira: unexpected answer"],
    ["body timeout", { ...tenant, [search]: text(async () => { throw timer; }) }, undefined, `jira: timed out after ${FETCH_TIMEOUT_MS / 1000} s`],
    ["extra key 401", { ...tenant, [search]: empty, [`${API}/rest/api/3/issue/`]: json({}, 401) }, 401, "jira: token rejected", { keys: ["ABC-1"] }],
    ["extra key 500", { ...tenant, [search]: empty, [`${API}/rest/api/3/issue/`]: json({}, 500) }, 500, "jira: HTTP 500", { keys: ["ABC-1"] }],
    ["extra key network", { ...tenant, [search]: empty, [`${API}/rest/api/3/issue/`]: () => { throw urlErr; } }, undefined, connect, { keys: ["ABC-1"] }],
    ["tenant 404", { [site]: json({}, 404) }, 404, "jira: HTTP 404"],
    ["tenant no id", { [site]: json({ other: 1 }) }, undefined, "jira: site not recognised"],
    ["tenant network", { [site]: () => { throw urlErr; } }, undefined, connect],
    ["myself 401", { ...tenant, [myself]: json({}, 401) }, 401, "jira: token rejected", null],
    ["myself network", { ...tenant, [myself]: () => { throw urlErr; } }, undefined, connect, null],
  ];
  for (const [name, routes, status, message, opts] of cases) {
    const d = deps(fake(routes));
    const got = opts === null ? await testMyself(d, CFG) : await fetchJira(d, CFG, opts);
    assert.equal(got.ok, false, name);
    assert.equal(got.message, message, name);
    assert.equal(got.status, status, name);
    assert.equal(leaks(got), false, name);
  }
  const raced = await testMyself({ fetch: fake(tenant), withTimeout: () => Promise.reject(timer) }, CFG);
  assert.equal(raced.message, `jira: timed out after ${FETCH_TIMEOUT_MS / 1000} s`);
  assert.equal(leaks(raced), false);
  // bad settings never reach the network and never quote the token
  const f = fake({});
  for (const bad of [{ ...CFG, site: "" }, { ...CFG, email: "" }]) {
    for (const r of [await fetchJira(deps(f), bad), await testMyself(deps(f), bad)]) {
      assert.equal(r.ok, false);
      assert.equal(leaks(r), false);
    }
  }
  assert.equal(f.calls.length, 0);
});

import { testJiraSettings, saveToken } from "../mods/friday/core/jiraform.js";
import { resolveSettings } from "../mods/friday/core/settings.js";

test("Settings > Jira: Test says OK or an error, never the token", async () => {
  const run = async (over) => {
    const said = [];
    await testJiraSettings({ cfg: { site: CFG.site, email: CFG.email, kind: "scoped" }, typed: "", readSecret: async () => TOKEN, test: async () => ({ ok: true, name: "Me" }), say: (t, s) => said.push([t, s]), ...over });
    return said;
  };
  assert.deepEqual(await run({}), [["OK, signed in as Me.", "ok"]]);
  assert.deepEqual(await run({ readSecret: async () => null }), [["No token yet.", "error"]]);
  assert.deepEqual(await run({ typed: "typed", readSecret: async () => { throw new Error(TOKEN); } }), [["OK, signed in as Me.", "ok"]]);
  assert.equal((await run({ cfg: { site: "", email: "x", kind: "scoped" } }))[0][1], "error");
  assert.deepEqual(await run({ test: async () => ({ ok: false, status: 401, message: "jira: token rejected" }) }), [["jira: token rejected", "error"]]);
  const thrown = await run({ test: async () => { throw new Error(`boom ${TOKEN}`); } });
  assert.deepEqual(thrown, [["jira: the test failed", "error"]]);
  const saved = [];
  const say = (t, s) => saved.push([t, s]);
  await saveToken({ typed: "", remove: false, saveSecret: async () => { throw new Error("no"); }, saved: () => saved.push("saved"), say });
  await saveToken({ typed: TOKEN, remove: false, saveSecret: async () => { throw new Error(TOKEN); }, saved: () => saved.push("saved"), say });
  await saveToken({ typed: TOKEN, remove: false, saveSecret: async () => {}, saved: () => saved.push("saved"), say });
  assert.deepEqual(saved.map((x) => (Array.isArray(x) ? x[0] : x)), ["Paste the token first.", "Could not save secrets.json. Try again.", "Token saved (written to secrets.json).", "saved"]);
  assert.equal(JSON.stringify(saved).includes(TOKEN), false);
});

test("jira settings default to a scoped token every 5 minutes, and an unknown kind falls back", () => {
  assert.deepEqual(resolveSettings({}).values.jira, { site: null, email: null, token_kind: "scoped", interval: "5m" });
  assert.deepEqual(resolveSettings({ jira: { token_kind: "pat", interval: "0s" } }).invalid, ["jira.token_kind", "jira.interval"]);
});

import { widgetById, sourcesFor, SOURCES } from "../mods/friday/core/widgets.js";
import { httpsLink } from "../mods/friday/core/links.js";

test("the Jira widget reads the jira source, and every row's link passes the https filter", () => {
  assert.deepEqual(widgetById("jira").sources, ["jira"]);
  assert.deepEqual(sourcesFor(["jira"]), ["jira"]);
  assert.equal(SOURCES.jira.interval, 300);
  const rows = myRows([parseIssue(issue("ABC-1", "High"), "https://acme.atlassian.net", true)]);
  assert.equal(httpsLink(rows[0].url), rows[0].url);
});
