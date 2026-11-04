// Seeds a sandbox herdr-app home with Friday and the anonymized fixtures, for screenshots that must
// never show the owner's real spaces or work (D32, D18):
//
//   node scripts/demo-home.mjs <empty folder>
//   HERDR_APP_HOME=<that folder> herdr-app
//
// It writes the mod, a settings.json whose ledger path is the fixture ledger (dated to today) and a
// made-up Jira site and Azure DevOps organization, favorites.md, todos.md, notes.md and priorities.md, and shared.json with the ledger, Jira issues and pull requests as Friday would
// have cached them (keys and titles are invented, D32). Without a token the Jira and PR panes poll once
// and shows "not set up"; the seeded cache is for reading the shape and the first frame. It writes no secrets.json and no
// token of any kind, and it refuses the real app home. Note: a second herdr-app window may share
// the owner's herdr-core, so Phase 1's screenshots are taken from the real window instead (see the PR).
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseLedger, newestDays } from "../mods/friday/core/ledger.js";
import { succeeded } from "../mods/friday/core/due.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DAYS = ["2026-11-05", "2026-11-04", "2026-11-03"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEMO_JIRA = { site: "https://demo-team.atlassian.net", email: "demo@example.org" };
const JIRA_KEY = `jira:${DEMO_JIRA.site}|${DEMO_JIRA.email}|scoped`; // hub.js sourceKey("jira", ...)
const DEMO_ISSUES = [
  ["DEMO-12", "Tidy the settings form", "In Progress", "indeterminate", "High", true],
  ["DEMO-7", "Write the release notes", "To Do", "new", "Medium", true],
  ["DEMO-31", "Check the nightly build", "To Do", "new", "Low", true],
  ["DEMO-3", "Plan the next sprint", "In Progress", "indeterminate", "Medium", false],
].map(([key, summary, status, status_category, priority, assigned]) => ({ key, summary, status, status_category, priority, assigned, url: `${DEMO_JIRA.site}/browse/${key}` }));

export const DEMO_ADO = { organization: "demo-org", project: "Demo", repo: "demo-app" };
const ADO_KEY = `ado:${DEMO_ADO.organization}|${DEMO_ADO.project}|${DEMO_ADO.repo}`; // hub.js sourceKey("ado", ...)
const DEMO_PRS = [
  [812, "Add retry to the upload step", "Alex Demo", false, true],
  [809, "Update the contributor guide", "Sam Example", false, false],
  [805, "Bump the build tools", "Alex Demo", true, false],
].map(([id, title, author, is_draft, unseen]) => ({ id, title, author, is_draft, unseen, url: `https://dev.azure.com/${DEMO_ADO.organization}/${DEMO_ADO.project}/_git/${DEMO_ADO.repo}/pullrequest/${id}` }));

const norm = (p) => resolve(p).replaceAll("\\", "/").toLowerCase();

/** The folders that are a real app home: the default one, and the one HERDR_APP_HOME names. */
function realHomes(env = process.env) {
  return [join(homedir(), ".config", "herdr-app"), env.HERDR_APP_HOME].filter(Boolean).map(norm);
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The fixture ledger with its three days moved to today and the two days before it. */
export function datedLedger(text, today) {
  let out = text;
  FIXTURE_DAYS.forEach((day, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out = out.replaceAll(`${day}, ${WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}`, `${ymd(d)}, ${WEEKDAYS[d.getDay()]}`);
  });
  return out;
}

/** Writes the sandbox home into `dir`, which must be new or empty, or a previous demo home. */
export function seed(dir, { today = new Date(), env = process.env } = {}) {
  const home = resolve(dir);
  if (realHomes(env).includes(norm(home))) throw new Error(`${home} is the real app home; pick another folder`);
  const marker = join(home, ".friday-demo-home");
  if (existsSync(home) && readdirSync(home).length > 0 && !existsSync(marker)) {
    throw new Error(`${home} is not empty and is not a Friday demo home`);
  }
  mkdirSync(join(home, "data", "friday"), { recursive: true });
  writeFileSync(marker, "Seeded by scripts/demo-home.mjs. No secrets are written here.\n");

  cpSync(join(root, "mods", "friday"), join(home, "mods", "friday"), {
    recursive: true,
    filter: (src) => !/(jsconfig\.json|\.d\.ts)$/.test(src),
  });

  const ledgerPath = `${home.replaceAll("\\", "/")}/data/friday/pr-reviews.md`;
  const ledgerText = datedLedger(readFileSync(join(root, "test", "fixtures", "ledger.md"), "utf8"), today);
  writeFileSync(ledgerPath, ledgerText);
  writeFileSync(join(home, "data", "friday", "settings.json"), `${JSON.stringify({ version: 1, ledger: { path: ledgerPath }, jira: DEMO_JIRA, azure_devops: DEMO_ADO }, null, 2)}\n`);
  writeFileSync(join(home, "data", "friday", "favorites.md"), "DEMO-3\nDEMO-99\n");
  // The owner's lists (R10); todos.md has CRLF lines, as a file edited on Windows would.
  writeFileSync(join(home, "data", "friday", "todos.md"), "- [ ] Call the bank\r\n- [x] Book the train\r\n- [ ] Review the contributor guide\r\n");
  writeFileSync(join(home, "data", "friday", "notes.md"), "# Notes\n- 2026-11-04 09:10 Ask Sam about the release date\n- 2026-11-03 16:40 Idea: show the nightly build in the summary\n");
  writeFileSync(join(home, "data", "friday", "priorities.md"), "1. DEMO-12\n2. Prepare the demo\n3. DEMO-7\n");

  const now = today.getTime();
  const shared = {
    layout: "main",
    "friday.ledger": { data: newestDays(parseLedger(ledgerText), 120), hash: "demo", path: ledgerPath, ok_at: now, error: null, backoff_until: 0 },
    "friday.jira": { data: { issues: DEMO_ISSUES, missing: ["DEMO-99"], cloud_id: null, account_id: null, favorites: ["DEMO-3", "DEMO-99"], priorities: ["DEMO-12", "DEMO-7"] }, for: JIRA_KEY, ok_at: now },
    "friday.prs": { data: { prs: DEMO_PRS }, for: ADO_KEY, ok_at: now },
    "friday.status": { ledger: { ...succeeded(now), for: ledgerPath }, jira: { ...succeeded(now), for: JIRA_KEY }, ado: { ...succeeded(now), for: ADO_KEY } },
  };
  writeFileSync(join(home, "shared.json"), `${JSON.stringify(shared)}\n`);
  return { home, ledgerPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/demo-home.mjs <empty folder>");
    process.exit(2);
  }
  try {
    const { home } = seed(dir);
    console.log(`Seeded ${home}\nRun: HERDR_APP_HOME=${home} herdr-app`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
