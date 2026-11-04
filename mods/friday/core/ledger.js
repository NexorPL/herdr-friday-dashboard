// The review ledger: markdown written by the owner's hook, read here and never written (D19, R08).
// Cells are read by position, because the headers are in the owner's language. Minutes and day
// totals are shown as the file records them; Friday never recounts them (R08).
// Ported from the first version's ledger.rs.

/** herdr-app's `readTextFile` stops here; so does Friday, whatever the reader returns. */
export const MAX_LEDGER_CHARS = 1024 * 1024;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UINT = /^\d+$/;
const TIME = /^(\d{1,2}):(\d{2})$/;

/** A calendar date `YYYY-MM-DD`, or false. */
export function isDate(text) {
  const m = DATE.exec(text);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** The cells of a table row, or null for any other line. */
function cells(line) {
  if (!line.startsWith("|") || !line.endsWith("|") || line.length < 2) return null;
  return line.slice(1, -1).split("|").map((c) => c.trim());
}

function isSeparator(line) {
  const c = cells(line);
  return c !== null && c.every((x) => x !== "" && /^[-:]+$/.test(x));
}

/** `[text](url)` as [text, url], or null. */
function link(cell) {
  if (!cell.startsWith("[")) return null;
  const at = cell.indexOf("](");
  if (at < 0 || !cell.endsWith(")")) return null;
  return [cell.slice(1, at), cell.slice(at + 2, -1)];
}

/** The one definition of a Jira key, `PROJ-123`: capitals and digits starting with a capital, a dash, then digits. */
export const JIRA_KEY = "[A-Z][A-Z0-9]*-[0-9]+";

export function isJiraKey(text) {
  return new RegExp(`^${JIRA_KEY}$`).test(text);
}

/** The first Jira key in `text`, as a word of its own, or null. */
export function firstKey(text) {
  return text.split(/[^A-Za-z0-9-]/).find(isJiraKey) ?? null;
}

/** `| 2026-10-29, Thursday | 7 | 35 |` */
function summaryRow(c) {
  const date = c[0].slice(0, 10);
  if (!isDate(date) || !UINT.test(c[1]) || !UINT.test(c[2])) return null;
  return [date, { runs: Number(c[1]), minutes: Number(c[2]) }];
}

/** `| [KEY-1](https://…) | [!812](https://…) | 3 | 09:20, 12:57, 18:07 | 15 |` */
function dataRow(c) {
  const pr = link(c[1]);
  if (!pr) return null;
  const times = c[3].split(",").map((t) => t.trim());
  for (const t of times) {
    const m = TIME.exec(t);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  }
  if (!pr[0].startsWith("!") || !UINT.test(pr[0].slice(1))) return null;
  if (!UINT.test(c[2]) || !UINT.test(c[4])) return null;
  const task = link(c[0]);
  return {
    task: task && isJiraKey(task[0]) ? { key: task[0], url: task[1] } : null,
    pr: Number(pr[0].slice(1)),
    pr_url: pr[1],
    runs: Number(c[2]),
    times: times.map((t) => t.padStart(5, "0")),
    minutes: Number(c[4]),
  };
}

/**
 * Parses the ledger. `days` are in file order (the hook writes the newest first), `totals` maps a
 * day to the summary table's `{runs, minutes}`, and `skipped` counts five-cell rows that did not
 * parse (G27).
 */
export function parseLedger(text) {
  const lines = text.split("\n").map((l) => l.trim());
  const ledger = { days: [], totals: {}, skipped: 0 };
  let inDay = false;
  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      const date = line.slice(3, 13);
      inDay = isDate(date);
      if (inDay) ledger.days.push({ date, rows: [] });
      return;
    }
    const c = cells(line);
    if (c === null) return;
    // A header is the row right above a separator; a total row starts with a bold cell.
    const header = i + 1 < lines.length && isSeparator(lines[i + 1]);
    if (header || isSeparator(line) || c[0].startsWith("**")) return;
    if (c.length === 3) {
      const s = summaryRow(c);
      if (s) ledger.totals[s[0]] = s[1];
    } else if (c.length === 5) {
      const row = inDay ? dataRow(c) : null;
      if (row) ledger.days[ledger.days.length - 1].rows.push(row);
      else ledger.skipped++;
    }
  });
  return ledger;
}

/**
 * Reads and parses the ledger through `readText(path)`, which gives the text, null for a missing
 * file, or throws (herdr-app's reader throws for a file over 1 MiB). The state is "ok", "missing",
 * "too_large" or "error"; the path is not a secret, so messages may name it.
 */
export async function loadLedger(readText, path) {
  let text;
  try {
    text = await readText(path);
  } catch (e) {
    const message = String((e && e.message) || e);
    if (/exceeds 1 MiB/.test(message)) return { state: "too_large", text: null, error: `file too large: ${path}` };
    return { state: "error", text: null, error: `cannot read ${path}` };
  }
  if (text === null) return { state: "missing", text: null, error: `ledger not found at ${path}` };
  if (text.length > MAX_LEDGER_CHARS) return { state: "too_large", text: null, error: `file too large: ${path}` };
  return { state: "ok", text, error: null };
}

/** At most the newest `n` days, so the shared value stays small. */
export function newestDays(ledger, n) {
  const days = ledger.days.slice(0, n);
  const oldest = days.length ? days[days.length - 1].date : "";
  const totals = Object.fromEntries(Object.entries(ledger.totals).filter(([d]) => d >= oldest));
  return { days, totals, skipped: ledger.skipped };
}

/** The summary table's `{runs, minutes}` for a day, or null (R08: never recounted from rows). */
export function totalFor(ledger, date) {
  return ledger?.totals?.[date] ?? null;
}
