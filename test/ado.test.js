import { test } from "node:test";
import assert from "node:assert/strict";
import { orgName, validateAdo, authHeader, parseRepos, groupRepos, parsePrs, prUrl, clean, listRepos, fetchPrs, FETCH_TIMEOUT_MS } from "../mods/friday/core/ado.js";

const PAT = "PATSECRET123abc";
const B64 = Buffer.from(`:${PAT}`).toString("base64");
const CFG = { organization: "acme-org", project: "Proj A", repo: "web app", pat: PAT };
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
const leaks = (v) => JSON.stringify(v).includes(PAT) || JSON.stringify(v).includes(B64) || /Basic |acme-org|Proj A/.test(JSON.stringify(v));
const deps = (fetch, withTimeout = (p) => p) => ({ fetch, withTimeout });
const calls = [];
const fakeFetch = (r) => async (url, opts) => { calls.push({ url, opts }); return typeof r === "function" ? r(url) : r; };

test("organization names, validation and the Basic header with an empty user", () => {
  assert.equal(orgName("acme-org"), "acme-org");
  assert.equal(orgName(" https://dev.azure.com/acme-org/ "), "acme-org");
  for (const bad of ["", null, "http://dev.azure.com/x", "a b", "../x", "https://evil.test/acme", "-x"]) assert.equal(orgName(bad), null, String(bad));
  assert.equal(validateAdo({ organization: "acme-org" }), null);
  assert.match(validateAdo({ organization: "" }), /organization/);
  assert.equal(authHeader(PAT), `Basic ${B64}`);
});

test("repositories are parsed, sorted and grouped by project for the picker", () => {
  const value = [
    { id: "3", name: "zeta", project: { name: "B" } },
    { id: "1", name: "beta", project: { name: "A" } },
    { id: "2", name: "alpha", project: { name: "A" } },
    { id: "4", name: "no project" },
    { name: "no id", project: { name: "A" } },
  ];
  assert.deepEqual(parseRepos({ value }).map((r) => r.id), ["2", "1", "3"]);
  assert.deepEqual(parseRepos(null), []);
  assert.deepEqual(groupRepos(parseRepos({ value })), [
    { project: "A", repos: [{ id: "2", name: "alpha" }, { id: "1", name: "beta" }] },
    { project: "B", repos: [{ id: "3", name: "zeta" }] },
  ]);
  assert.deepEqual(groupRepos([]), []);
});

test("PRs are parsed with a link, a draft flag and cleaned text", () => {
  const prs = parsePrs({ value: [
    { pullRequestId: 812, title: "Add\tretry\u0007 to   upload", isDraft: false, creationDate: "2026-11-01T10:00:00Z", createdBy: { displayName: "Ann" } },
    { pullRequestId: 805, title: "Bump deps", isDraft: true },
    { title: "no id" },
  ] }, { organization: "acme-org", project: "Proj A", repo: "web app" });
  assert.deepEqual(prs.map((p) => [p.id, p.title, p.is_draft, p.author]), [[812, "Add retry to upload", false, "Ann"], [805, "Bump deps", true, ""]]);
  assert.equal(prs[0].url, "https://dev.azure.com/acme-org/Proj%20A/_git/web%20app/pullrequest/812");
  assert.equal(prUrl("o", "p", "r", 1), "https://dev.azure.com/o/p/_git/r/pullrequest/1");
  assert.equal(clean("x".repeat(500)).length, 300);
});

test("requests: URLs, the PAT only in the Authorization header, read-only GETs", async () => {
  calls.length = 0;
  const r = await listRepos(deps(fakeFetch(json({ value: [{ id: "1", name: "r", project: { name: "p" } }] }))), CFG);
  assert.deepEqual(r, { ok: true, repos: [{ id: "1", name: "r", project: "p" }] });
  assert.equal(calls[0].url, "https://dev.azure.com/acme-org/_apis/git/repositories?api-version=7.1");
  assert.equal(calls[0].opts.headers.Authorization, `Basic ${B64}`);
  assert.equal(calls[0].opts.method, undefined);
  assert.ok(!calls[0].url.includes(PAT));
  const p = await fetchPrs(deps(fakeFetch(json({ value: [{ pullRequestId: 1, title: "t" }] }))), CFG);
  assert.equal(p.value.prs.length, 1);
  assert.equal(calls[1].url, "https://dev.azure.com/acme-org/Proj%20A/_apis/git/repositories/web%20app/pullrequests?searchCriteria.status=active&$top=200&api-version=7.1");
  assert.ok(!calls[1].url.includes(PAT));
});

test("every error path is built without the PAT, the URL or the organization", async () => {
  const results = [];
  const run = async (f, wt) => {
    for (const fn of [listRepos, fetchPrs]) results.push(await fn(deps(f, wt), CFG));
  };
  for (const status of [401, 403, 404, 429, 500, 503]) await run(fakeFetch(json({ message: `bad ${PAT} ${B64}` }, status)));
  await run(fakeFetch(json({}, 203)));
  await run(async () => { throw new Error(`error sending request for url (https://dev.azure.com/acme-org) ${PAT}`); });
  await run(fakeFetch({ ok: true, status: 200, text: async () => `<html>${PAT}</html>` }));
  await run(fakeFetch({ ok: true, status: 200, text: async () => { throw new Error(PAT); } }));
  await run(fakeFetch(json({})), () => Promise.reject(Object.assign(new Error(`timeout ${PAT}`), { name: "FridayTimeout" })));
  const bad = { ...CFG, organization: "" };
  results.push(await listRepos(deps(fakeFetch(json({}))), bad), await fetchPrs(deps(fakeFetch(json({}))), bad));
  assert.ok(results.length > 20);
  for (const r of results) {
    assert.equal(r.ok, false);
    assert.match(r.message, /^ado: /);
    assert.equal(leaks(r.message), false, r.message);
  }
  assert.equal(results[0].message, "ado: PAT rejected");
  assert.equal(results[0].status, 401);
  assert.match(results[4].message, /not found/);
  assert.equal(FETCH_TIMEOUT_MS, 15000);
});

import { testAdoSettings, savePat } from "../mods/friday/core/adoform.js";

function form(overrides = {}) {
  const said = [];
  let groups = null;
  const args = {
    cfg: { organization: "acme-org" },
    typed: "",
    readSecret: async () => PAT,
    test: async () => ({ ok: true, repos: [{ id: "1", name: "b", project: "Q" }, { id: "2", name: "a", project: "P" }, { id: "3", name: "c", project: "P" }] }),
    loaded: (g) => { groups = g; },
    say: (text, state) => said.push([text, state]),
    ...overrides,
  };
  return { args, said, groups: () => groups };
}

test("Test lists repositories, fills the picker grouped by project, and says OK", async () => {
  const f = form();
  await testAdoSettings(f.args);
  assert.deepEqual(f.said, [["OK, 3 repositories in 2 projects.", "ok"]]);
  assert.deepEqual(f.groups().map((g) => [g.project, g.repos.map((r) => r.name)]), [["P", ["a", "c"]], ["Q", ["b"]]]);
});

test("Test says what is missing, and its messages never hold the PAT", async () => {
  for (const [over, re] of [
    [{ cfg: { organization: "" } }, /organization/],
    [{ readSecret: async () => null }, /No PAT/],
    [{ test: async () => ({ ok: false, message: "ado: PAT rejected" }) }, /rejected/],
    [{ test: async () => { throw new Error(PAT); } }, /test failed/],
    [{ readSecret: async () => { throw new Error(PAT); } }, /test failed/],
  ]) {
    const f = form(over);
    await testAdoSettings(f.args);
    assert.equal(f.said.length, 1);
    assert.match(f.said[0][0], re);
    assert.equal(f.said[0][1], "error");
    assert.equal(leaks(f.said), false);
    assert.equal(f.groups(), null);
  }
});

test("Save PAT and Remove write through saveSecret and say so without the PAT", async () => {
  const said = [];
  const wrote = [];
  let saved = 0;
  const base = { saveSecret: async (v) => { wrote.push(v); }, saved: () => saved++, say: (t, s) => said.push([t, s]) };
  await savePat({ ...base, typed: PAT, remove: false });
  await savePat({ ...base, typed: "", remove: true });
  await savePat({ ...base, typed: "", remove: false });
  await savePat({ ...base, typed: PAT, remove: false, saveSecret: async () => { throw new Error(PAT); } });
  assert.deepEqual(wrote, [PAT, ""]);
  assert.equal(saved, 2);
  assert.deepEqual(said.map((s) => s[1]), ["ok", "ok", "error", "error"]);
  assert.equal(leaks(said), false);
});

import { widgetById, sourcesFor, SOURCES, WIDGETS } from "../mods/friday/core/widgets.js";
import { httpsLink } from "../mods/friday/core/links.js";

test("the PR widget reads the ado source, every PR link passes the https filter, and it is in the + menu", () => {
  assert.deepEqual(widgetById("prs").sources, ["ado"]);
  assert.deepEqual(sourcesFor(["prs"]), ["ado"]);
  assert.equal(SOURCES.ado.interval, 120);
  assert.ok(WIDGETS.some((w) => w.id === "prs"));
  const [pr] = parsePrs({ value: [{ pullRequestId: 7, title: "t" }] }, { organization: "o", project: "P Q", repo: "r" });
  assert.equal(httpsLink(pr.url), pr.url);
});
