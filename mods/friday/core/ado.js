// The Azure DevOps source's calls and parsers, with fetch passed in so Node tests can fake it. Read
// calls only (R03, N03): a PAT scoped to Code (Read), sent as Basic auth with an empty user. The PAT
// is used for the Authorization header and nowhere else: every error here is built from "ado" and a
// status, never from a URL, header, body or the text of a rejection (those can quote the PAT).
import { httpError, networkError, rejectsToken } from "./backoff.js";

export const FETCH_TIMEOUT_MS = 15_000;
const HOST = "https://dev.azure.com";
const MAX_PRS = 200;

/** The organization name from a typed name or a `https://dev.azure.com/<org>` address, or null. */
export function orgName(input) {
  const v = String(input ?? "").trim().replace(/\/+$/, "");
  const m = /^(?:https:\/\/dev\.azure\.com\/)?([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/.exec(v);
  return m ? m[1] : null;
}

/** What is wrong with the typed organization, or null. Never quotes the PAT. */
export function validateAdo({ organization }) {
  return orgName(organization) ? null : "ado: set your organization, for example your-org (from dev.azure.com/your-org)";
}

/** `Basic base64(:pat)`: an empty user name. UTF-8 first, because `btoa` takes Latin-1. */
export function authHeader(pat) {
  return "Basic " + btoa(unescape(encodeURIComponent(`:${pat}`)));
}

const seg = encodeURIComponent;

/** The link that opens a PR in the browser. */
export const prUrl = (org, project, repo, id) => `${HOST}/${seg(org)}/${seg(project)}/_git/${seg(repo)}/pullrequest/${id}`;

/** Control characters out, whitespace collapsed, bounded: titles come from outside. */
export function clean(s, max = 300) {
  return String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** The repositories of an `_apis/git/repositories` answer: [{ id, name, project }] by project, then name. */
export function parseRepos(json) {
  const repos = [];
  for (const r of Array.isArray(json?.value) ? json.value : []) {
    if (typeof r?.id === "string" && typeof r?.name === "string" && typeof r?.project?.name === "string") {
      repos.push({ id: r.id, name: r.name, project: r.project.name });
    }
  }
  return repos.sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The picker's shape: [{ project, repos: [{ id, name }] }], projects and repos in letter order. */
export function groupRepos(repos) {
  const groups = [];
  for (const r of parseRepos({ value: repos.map((x) => ({ id: x.id, name: x.name, project: { name: x.project } })) })) {
    const last = groups[groups.length - 1];
    if (last && last.project === r.project) last.repos.push({ id: r.id, name: r.name });
    else groups.push({ project: r.project, repos: [{ id: r.id, name: r.name }] });
  }
  return groups;
}

/** The PRs of a pullrequests answer as Friday keeps them; entries without an id are dropped. */
export function parsePrs(json, { organization, project, repo }) {
  const prs = [];
  for (const p of Array.isArray(json?.value) ? json.value : []) {
    if (!Number.isInteger(p?.pullRequestId)) continue;
    prs.push({
      id: p.pullRequestId,
      title: clean(p.title),
      author: clean(p.createdBy?.displayName, 100),
      created_at: typeof p.creationDate === "string" ? p.creationDate : "",
      is_draft: p.isDraft === true,
      url: prUrl(organization, project, repo, p.pullRequestId),
    });
  }
  return prs;
}

const fail = (status, message) => ({ ok: false, status, message });

/** GET and parse JSON: { ok: true, json } or { ok: false, status?, message }. */
async function get({ fetch, withTimeout }, url, pat) {
  let res;
  try {
    res = await withTimeout(fetch(url, { headers: { Accept: "application/json", Authorization: authHeader(pat) } }), FETCH_TIMEOUT_MS);
  } catch (e) {
    return fail(undefined, networkError("ado", e, { timeoutMs: FETCH_TIMEOUT_MS }));
  }
  // A bad PAT can also get a 203 with the sign-in page instead of a 401.
  if (res.status === 203 || rejectsToken(res.status)) return fail(res.status, "ado: PAT rejected");
  if (!res.ok) return fail(res.status, res.status === 404 ? "ado: not found (check the organization, project and repo)" : httpError("ado", res.status));
  try {
    return { ok: true, json: JSON.parse(await withTimeout(res.text(), FETCH_TIMEOUT_MS)) };
  } catch (e) {
    return fail(undefined, e?.name === "FridayTimeout" ? networkError("ado", e, { stage: "body", timeoutMs: FETCH_TIMEOUT_MS }) : "ado: unexpected answer");
  }
}

/** Settings > Azure DevOps > Test, and the picker: the organization's repositories. { ok, repos } or a failure. */
export async function listRepos(deps, { organization, pat }) {
  const bad = validateAdo({ organization });
  if (bad) return fail(undefined, bad);
  const r = await get(deps, `${HOST}/${seg(orgName(organization))}/_apis/git/repositories?api-version=7.1`, pat);
  return r.ok ? { ok: true, repos: parseRepos(r.json) } : r;
}

/** The chosen repo's active PRs: { ok: true, value: { prs } } or a failure. */
export async function fetchPrs(deps, { organization, project, repo, pat }) {
  const bad = validateAdo({ organization });
  if (bad) return fail(undefined, bad);
  const org = orgName(organization);
  const url = `${HOST}/${seg(org)}/${seg(project)}/_apis/git/repositories/${seg(repo)}/pullrequests?searchCriteria.status=active&$top=${MAX_PRS}&api-version=7.1`;
  const r = await get(deps, url, pat);
  return r.ok ? { ok: true, value: { prs: parsePrs(r.json, { organization: org, project, repo }) } } : r;
}
