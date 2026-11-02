// Seeds a sandbox herdr-app home with Friday and the anonymized fixtures, for screenshots that must
// never show the owner's real spaces or work (D32, D18):
//
//   node scripts/demo-home.mjs <empty folder>
//   HERDR_APP_HOME=<that folder> herdr-app
//
// It writes the mod, a settings.json whose ledger path is the fixture ledger (dated to today), and
// shared.json with the ledger as Friday would have cached it. It writes no secrets.json and no
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
  writeFileSync(join(home, "data", "friday", "settings.json"), `${JSON.stringify({ version: 1, ledger: { path: ledgerPath } }, null, 2)}\n`);

  const now = today.getTime();
  const shared = {
    layout: "main",
    "friday.ledger": { data: newestDays(parseLedger(ledgerText), 120), hash: "demo", path: ledgerPath, ok_at: now, error: null, backoff_until: 0 },
    "friday.status": { ledger: { ...succeeded(now), for: ledgerPath } },
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
