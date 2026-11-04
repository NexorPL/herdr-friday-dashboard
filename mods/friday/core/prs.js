// The PR ledger of prs.json (G15, G34, R11), pure: given the parsed file and a fresh fetch, what
// is new, what is owed a toast, and what the file becomes.
//   { version: 1, repos: { "<project>/<repo>": { baseline_set, prs: { "<id>": {
//     title, author, created_at, is_draft, url, first_seen_at, last_seen_at, active, unseen, notified } } } } }
// `notified` means no toast is owed any more (or never was: the baseline). A draft that is new
// waits, unnotified, until it is ready. Row text comes from outside and never holds a secret.

/** Inactive rows are kept this long, so a PR that comes back is not new again. */
export const KEEP_INACTIVE_MS = 30 * 24 * 3_600_000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const repoKey = (project, repo) => `${project}/${repo}`;

const repoOf = (raw, key) => {
  const r = isObject(raw?.repos) ? raw.repos[key] : null;
  return { baseline_set: r?.baseline_set === true, prs: isObject(r?.prs) ? r.prs : {} };
};

/**
 * Applies a successful fetch of one repo's active PRs. Returns { next, owed }: `next` is the file
 * to write, `owed` the rows that need a toast, already marked notified in `next` (recorded before
 * shown, so a failed toast is not repeated). Other repos in the file are kept.
 */
export function applyFetch(raw, key, fetched, now) {
  const repo = repoOf(raw, key);
  const prs = {};
  const owed = [];
  const seenNow = new Set();
  for (const p of fetched) {
    const id = String(p.id);
    seenNow.add(id);
    const old = repo.prs[id];
    const fields = { title: p.title, author: p.author, created_at: p.created_at, is_draft: p.is_draft, url: p.url, last_seen_at: now, active: true };
    if (!repo.baseline_set) prs[id] = { ...fields, first_seen_at: now, unseen: false, notified: true };
    else if (!old) prs[id] = { ...fields, first_seen_at: now, unseen: true, notified: false };
    else if (old.is_draft && !p.is_draft) prs[id] = { ...old, ...fields, unseen: true, notified: false };
    else prs[id] = { ...old, ...fields };
    if (!prs[id].is_draft && !prs[id].notified) {
      prs[id].notified = true;
      owed.push({ id: p.id, title: p.title, author: p.author, url: p.url });
    }
  }
  for (const [id, old] of Object.entries(repo.prs)) {
    if (seenNow.has(id)) continue;
    if (!old.active && now - (old.last_seen_at ?? 0) > KEEP_INACTIVE_MS) continue; // pruned
    prs[id] = { ...old, active: false };
  }
  const repos = { ...(isObject(raw?.repos) ? raw.repos : {}), [key]: { baseline_set: true, prs } };
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

/** The toast: `New PR !812`, with `title — author`. */
export const prToast = (pr) => ({ title: `New PR !${pr.id}`, body: `${pr.title} — ${pr.author}` });
