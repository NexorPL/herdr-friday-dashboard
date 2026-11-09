// The PR ledger of prs.json (G15, G34, R11), pure: given the parsed file and a fresh fetch, what
// is new, what is owed a toast, and what the file becomes.
//   { version: 1, repos: { "<project>/<repo>": { baseline_set, prs: { "<id>": {
//     title, author, created_at, is_draft, url, first_seen_at, last_seen_at, active, unseen, notified } } } } }
// `notified` means no toast is owed any more (or never was: the baseline). A draft that is new
// waits, unnotified, until it is ready. Row text comes from outside and never holds a secret.

/** Inactive rows are kept this long, so a PR that comes back is not new again. */
export const KEEP_INACTIVE_MS = 30 * 24 * 3_600_000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const repoKey = (organization, project, repo) => `${organization}/${project}/${repo}`;

const repoOf = (raw, key) => {
  const r = isObject(raw?.repos) ? raw.repos[key] : null;
  return { baseline_set: r?.baseline_set === true, prs: isObject(r?.prs) ? r.prs : {} };
};

/** Active rows as they are; inactive ones slimmed to what a comeback needs, and dropped after 30 days. */
function pruneInactive(prs, now) {
  const out = {};
  for (const [id, p] of Object.entries(isObject(prs) ? prs : {})) {
    if (!isObject(p)) continue;
    if (p.active) out[id] = p;
    else if (now - (p.last_seen_at ?? 0) <= KEEP_INACTIVE_MS) out[id] = { active: false, is_draft: p.is_draft === true, notified: p.notified === true, last_seen_at: p.last_seen_at ?? 0 };
  }
  return out;
}

/**
 * Applies a successful fetch of one repo's active PRs. Returns { next, owed }: `next` is the file
 * to write, `owed` the rows that need a toast, already marked notified in `next` (recorded before
 * shown, so a failed toast is not repeated). Other repos in the file are kept.
 */
export function applyFetch(raw, key, fetched, now) {
  const repo = repoOf(raw, key);
  const prs = {};
  const rowOf = (id) => (isObject(repo.prs[id]) ? repo.prs[id] : undefined); // a damaged row counts as absent
  const owed = [];
  const seenNow = new Set();
  for (const p of fetched) {
    const id = String(p.id);
    seenNow.add(id);
    const old = rowOf(id);
    const fields = { title: p.title, author: p.author, created_at: p.created_at, is_draft: p.is_draft, url: p.url, last_seen_at: now, active: true };
    if (!repo.baseline_set) prs[id] = { ...fields, first_seen_at: now, unseen: false, notified: true };
    else if (!old) prs[id] = { ...fields, first_seen_at: now, unseen: true, notified: false };
    else if (old.is_draft && !p.is_draft) prs[id] = { ...old, ...fields, first_seen_at: old.first_seen_at ?? now, unseen: true, notified: false };
    else prs[id] = { ...old, ...fields, first_seen_at: old.first_seen_at ?? now, unseen: old.unseen === true };
    if (!prs[id].is_draft && !prs[id].notified) {
      prs[id].notified = true;
      owed.push({ id: p.id, title: p.title, author: p.author, url: p.url });
    }
  }
  for (const [id, old] of Object.entries(repo.prs)) {
    if (seenNow.has(id) || !isObject(old)) continue;
    prs[id] = old.active ? { ...old, active: false } : old;
  }
  // Inactive rows keep only what a comeback needs, and are dropped after 30 days, in every repo.
  const repos = {};
  for (const [k, r] of Object.entries(isObject(raw?.repos) ? raw.repos : {})) {
    if (k !== key && isObject(r)) repos[k] = { ...r, prs: pruneInactive(r.prs, now) };
  }
  repos[key] = { baseline_set: true, prs: pruneInactive(prs, now) };
  return { next: { version: 1, repos }, owed };
}

/** Enter on a PR clears its mark (`id`), `m` clears every PR of the repo (`id` null). */
export function markSeen(raw, key, id = null) {
  const repo = repoOf(raw, key);
  const prs = Object.fromEntries(Object.entries(repo.prs).map(([k, p]) => [k, id === null || String(id) === k ? { ...p, unseen: false } : p]));
  return { ...(isObject(raw) ? raw : {}), version: 1, repos: { ...(isObject(raw?.repos) ? raw.repos : {}), [key]: { ...repo, prs } } };
}

/** The active PRs of a repo as the widget draws them, newest id first. */
export function rowsFor(raw, key) {
  return Object.entries(repoOf(raw, key).prs)
    .filter(([, p]) => p.active)
    .map(([id, p]) => ({ id: Number(id), title: p.title, author: p.author, is_draft: p.is_draft === true, unseen: p.unseen === true, url: p.url }))
    .sort((a, b) => b.id - a.id);
}

/** The active PRs of several repos of one project in one list, newest id first; each row names its repo. */
export function rowsForRepos(raw, organization, project, repos) {
  return repos
    .flatMap((repo) => rowsFor(raw, repoKey(organization, project, repo)).map((r) => ({ ...r, repo })))
    .sort((a, b) => b.id - a.id);
}

/** The toast: `New PR !812`, with `title — author`. */
export const prToast = (pr) => ({ title: `New PR !${pr.id}`, body: `${pr.title} — ${pr.author}` });
