// The Jira source's calls and parsers, with fetch passed in so Node tests can fake it. Basic auth
// with the e-mail and a token (D25: read:jira-work and write:jira-work). The token is used for the
// Authorization header and nowhere else: every error here is built from "jira" and a status, never
// from a URL, header, body or the text of a rejection (those can quote the token or the site).
import { httpError, networkError, rejectsToken } from "./backoff.js";

export const FETCH_TIMEOUT_MS = 15_000;
export const API_HOST = "https://api.atlassian.com";
/** Most extra keys (favorites, priorities) fetched per poll, and the pages of assigned issues. */
export const MAX_EXTRA_KEYS = 40;
const MAX_PAGES = 5;

const KEY = /(?<![A-Za-z0-9])[A-Z][A-Z0-9]+-\d+(?![A-Za-z0-9])/g;

/** The `https://host` of a typed site (`acme.atlassian.net` or a full address), or null. */
export function siteOrigin(site) {
  const v = String(site ?? "").trim().replace(/\/+$/, "");
  const m = /^(?:https:\/\/)?([A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d+)?)(?:\/.*)?$/.exec(v);
  return m && !/^http:/i.test(v) ? `https://${m[1]}` : null;
}

/** What is wrong with the typed Jira settings, or null. Never quotes the token. */
export function validateJira({ site, email }) {
  if (!siteOrigin(site)) return "jira: the site must be an address such as https://your-team.atlassian.net";
  if (!String(email ?? "").trim()) return "jira: set your Atlassian e-mail";
  return null;
}

/** Scoped tokens only work through api.atlassian.com with the cloud id; classic ones on the site. */
export function baseUrl({ kind, site, cloudId }) {
  return kind === "classic" ? siteOrigin(site) : `${API_HOST}/ex/jira/${cloudId}`;
}

/** `Basic base64(email:token)`; UTF-8 first, because `btoa` takes Latin-1 (Buffer base64 is broken in herdr-app). */
export function authHeader(email, token) {
  return "Basic " + btoa(unescape(encodeURIComponent(`${email}:${token}`)));
}

/** Every Jira key (`ABC-123`) in a text, in order, without repeats. */
export function jiraKeys(text) {
  return [...new Set(String(text ?? "").match(KEY) ?? [])];
}

/**
 * The keys to fetch besides the assigned issues: those in favorites.md and priorities.md. A file
 * that does not exist (null) or is empty adds none. Sorted, capped at MAX_EXTRA_KEYS.
 */
export function keySet(favorites, priorities) {
  return [...new Set([...jiraKeys(favorites), ...jiraKeys(priorities)])].sort(compareKeys).slice(0, MAX_EXTRA_KEYS);
}

/** `ABC-2` before `ABC-10`, projects in letter order. */
export function compareKeys(a, b) {
  const [pa, na] = a.split("-");
  const [pb, nb] = b.split("-");
  return pa < pb ? -1 : pa > pb ? 1 : Number(na) - Number(nb);
}

const RANKS = { blocker: 0, highest: 0, critical: 0, high: 1, major: 1, medium: 2, normal: 2, low: 3, minor: 3, lowest: 4, trivial: 4 };
const rank = (name) => RANKS[String(name ?? "").toLowerCase()] ?? 5;

/** One issue as Friday keeps it; null when the answer has no key. `origin` builds the browse link. */
export function parseIssue(raw, origin, assigned) {
  const f = raw?.fields ?? {};
  if (typeof raw?.key !== "string") return null;
  return {
    key: raw.key,
    summary: String(f.summary ?? ""),
    status: f.status?.name ?? "",
    status_category: f.status?.statusCategory?.key ?? "",
    priority: f.priority?.name ?? "",
    assigned,
    url: `${origin}/browse/${raw.key}`,
  };
}

/** My issues in the order the widget shows them: priority (highest first), then key. */
export function myRows(issues) {
  return (issues ?? []).filter((i) => i.assigned).sort((a, b) => rank(a.priority) - rank(b.priority) || compareKeys(a.key, b.key));
}

const fail = (status, message) => ({ ok: false, status, message });

/**
 * Sends the request and parses the JSON answer: { ok: true, json } or { ok: false, status?, message }.
 * `auth` is the Authorization header value, or null for the unauthenticated tenant_info call.
 * A POST (a write) that fails without a definite "no" (no status, a 5xx, an unreadable answer) may
 * have been saved: the failure carries `unknown: true` and the caller must not blindly retry it.
 */
async function send({ fetch, withTimeout }, url, auth, { method = "GET", body } = {}) {
  const write = method === "POST";
  const lost = (status, message) => ({ ...fail(status, message), ...(write && (status === undefined || status >= 500) ? { unknown: true } : {}) });
  const headers = { Accept: "application/json", ...(auth ? { Authorization: auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) };
  let res;
  try {
    res = await withTimeout(fetch(url, body ? { method, headers, body: JSON.stringify(body) } : { headers }), FETCH_TIMEOUT_MS);
  } catch (e) {
    return lost(undefined, networkError("jira", e, { timeoutMs: FETCH_TIMEOUT_MS }));
  }
  if (!res.ok) return lost(res.status, rejectsToken(res.status) ? "jira: token rejected" : httpError("jira", res.status));
  try {
    return { ok: true, json: JSON.parse(await withTimeout(res.text(), FETCH_TIMEOUT_MS)) };
  } catch (e) {
    return lost(undefined, e?.name === "FridayTimeout" ? networkError("jira", e, { stage: "body", timeoutMs: FETCH_TIMEOUT_MS }) : "jira: unexpected answer");
  }
}
const get = (deps, url, auth) => send(deps, url, auth);

/** The cloud id of a site (no auth), or a failure. */
export async function fetchCloudId(deps, site) {
  const r = await get(deps, `${siteOrigin(site)}/_edge/tenant_info`, null);
  if (!r.ok) return r;
  return typeof r.json?.cloudId === "string" && r.json.cloudId ? { ok: true, cloudId: r.json.cloudId } : fail(undefined, "jira: site not recognised");
}

async function base(deps, cfg, cloudId) {
  if (cfg.kind === "classic") return { ok: true, base: baseUrl(cfg), cloudId: null };
  if (cloudId) return { ok: true, base: baseUrl({ ...cfg, cloudId }), cloudId };
  const r = await fetchCloudId(deps, cfg.site);
  return r.ok ? { ok: true, base: baseUrl({ ...cfg, cloudId: r.cloudId }), cloudId: r.cloudId } : r;
}

/** Settings > Jira > Test: GET /myself. { ok: true, name, cloudId } or a failure. */
export async function testMyself(deps, cfg) {
  const bad = validateJira(cfg);
  if (bad) return fail(undefined, bad);
  const b = await base(deps, cfg, null);
  if (!b.ok) return b;
  const r = await get(deps, `${b.base}/rest/api/3/myself`, authHeader(cfg.email, cfg.token));
  return r.ok ? { ok: true, name: String(r.json?.displayName ?? ""), accountId: String(r.json?.accountId ?? ""), cloudId: b.cloudId } : r;
}

const SEARCH = "assignee = currentUser() AND statusCategory != Done ORDER BY priority";
const FIELDS = "summary,status,priority";

/**
 * The source's fetch: my assigned issues (paged by nextPageToken), then each extra key by itself.
 * A 404 marks a key missing; any other failure fails the whole fetch. `cfg` is { site, email,
 * kind, token }; `cloudId` and `accountId` are the ones kept from the last poll, if any (the
 * account id comes from /myself and is what R09 matches the owner's worklogs by).
 * Returns { ok: true, value: { issues, missing, cloud_id } } or { ok: false, status?, message }.
 */
export async function fetchJira(deps, cfg, { keys = [], cloudId = null, accountId = null } = {}) {
  const bad = validateJira(cfg);
  if (bad) return fail(undefined, bad);
  const origin = siteOrigin(cfg.site);
  const auth = authHeader(cfg.email, cfg.token);
  const b = await base(deps, cfg, cloudId);
  if (!b.ok) return b;
  const issues = [];
  let token = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = `jql=${encodeURIComponent(SEARCH)}&fields=${FIELDS}&maxResults=100${token ? `&nextPageToken=${encodeURIComponent(token)}` : ""}`;
    const r = await get(deps, `${b.base}/rest/api/3/search/jql?${q}`, auth);
    if (!r.ok) return r;
    for (const raw of r.json?.issues ?? []) {
      const i = parseIssue(raw, origin, true);
      if (i) issues.push(i);
    }
    token = r.json?.isLast === false && typeof r.json?.nextPageToken === "string" ? r.json.nextPageToken : null;
    if (!token) break;
  }
  const have = new Set(issues.map((i) => i.key));
  const missing = [];
  for (const key of keys) {
    if (have.has(key)) continue;
    const r = await get(deps, `${b.base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${FIELDS}`, auth);
    if (r.ok) {
      const i = parseIssue(r.json, origin, false);
      if (i) issues.push(i);
    } else if (r.status === 404) missing.push(key);
    else return r;
  }
  let account = accountId;
  if (!account) {
    const me = await get(deps, `${b.base}/rest/api/3/myself`, auth);
    if (!me.ok) return me;
    account = String(me.json?.accountId ?? "") || null;
  }
  return { ok: true, value: { issues, missing, cloud_id: b.cloudId, account_id: account } };
}

/** An Atlassian Document Format body with one paragraph, for a worklog comment. */
export const adfComment = (text) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** The plain text of a worklog comment (ADF or a string), for matching and display. */
export function commentText(c) {
  if (typeof c === "string") return c;
  const walk = (n) => (n?.text ?? "") + (n?.content ?? []).map(walk).join("");
  return walk(c);
}

/**
 * The owner's worklogs on `key` that started in [after, before) ms: { ok: true, worklogs:
 * [{ id, started, seconds, comment }] } filtered by author (R09), or a failure. `cfg` has the
 * cloudId when the token is scoped, and `accountId` is the owner's.
 */
export async function listWorklogs(deps, cfg, key, { after, before, accountId }) {
  const b = await base(deps, cfg, cfg.cloudId);
  if (!b.ok) return b;
  const r = await get(deps, `${b.base}/rest/api/3/issue/${encodeURIComponent(key)}/worklog?startedAfter=${after}&startedBefore=${before}`, authHeader(cfg.email, cfg.token));
  if (!r.ok) return r;
  const worklogs = (r.json?.worklogs ?? [])
    .filter((w) => w?.author?.accountId === accountId)
    .map((w) => ({ id: String(w.id), started: String(w.started ?? ""), seconds: Number(w.timeSpentSeconds) || 0, comment: commentText(w.comment) }));
  return { ok: true, worklogs };
}

/**
 * POST /issue/{key}/worklog with { started, seconds, comment }; `comment` is left out when empty.
 * { ok: true, id } or a failure; `unknown: true` means it may have been saved (see send()).
 */
export async function postWorklog(deps, cfg, key, { started, seconds, comment }) {
  const b = await base(deps, cfg, cfg.cloudId);
  if (!b.ok) return b;
  const body = { started, timeSpentSeconds: seconds, ...(comment ? { comment: adfComment(comment) } : {}) };
  const r = await send(deps, `${b.base}/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, authHeader(cfg.email, cfg.token), { method: "POST", body });
  if (!r.ok) return r;
  return r.json?.id ? { ok: true, id: String(r.json.id) } : { ...fail(undefined, "jira: unexpected answer"), unknown: true };
}
