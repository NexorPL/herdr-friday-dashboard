// The hub: what keeps the sources fresh while herdr-app is open. Every pane is its own copy of the
// mod, with its own module scope (spike note, question 1), so each copy runs its own Hub and the
// copies agree through leases in shared(): the copy that holds a source's lease reads it and writes
// the result to shared("friday.<source>") and its record to shared("friday.status"); every other
// copy re-renders from those values. A lost race costs nothing, because only the lease holder reads.
import { shared, setShared, readTextFile, notify, playSound } from "herdr";
import { loadSettings, resolvePath, readSecret, readDataText, readAlertsSent, claimAlerts, recordPrs, markPrsSeen } from "./store.js";
import { repoKey, prToast } from "./core/prs.js";
import { dueAlerts, alertText } from "./core/alerts.js";
import { runCalendar, runJira, runAdo, offsetNow } from "./net.js";
import { keySet, jiraKeys } from "./core/jira.js";
import { favoriteKeys } from "./core/favorites.js";
import { parseBoard, boardKeys } from "./core/board.js";
import { localDay } from "./core/meetings.js";
import { parseInterval, parseDurations } from "./core/durations.js";
import { loadLedger, parseLedger, newestDays } from "./core/ledger.js";
import { leaseAction, leaseValue, leaseIsMine, leaseKey, CONFIRM_AFTER } from "./core/lease.js";
import { shouldFetch, succeeded, failed, refreshed, shouldWrite, widgetState } from "./core/due.js";
import { sourcesFor, SOURCES } from "./core/widgets.js";
import { resolveSettings } from "./core/settings.js";

export const STATUS = "friday.status";
export const LEDGER = "friday.ledger";
/** { data: { meetings, day, note }, for, ok_at }: today and tomorrow; no secret is ever in it. */
export const MEETINGS = "friday.meetings";
/** { data: { issues, missing, cloud_id, account_id, favorites, priorities }, for, ok_at }: no token or other secret is ever in it. */
export const JIRA = "friday.jira";
/** { data: { prs: [{ id, title, author, is_draft, unseen, url }] }, for, ok_at }: no PAT or other secret is ever in it. */
export const PRS = "friday.prs";
/** Settings bumps this after a save, so every copy rereads settings.json within a second. */
export const SETTINGS_REV = "friday.settings_rev";

/**
 * A run still going after this long was ended by herdr-app, which stops a job that runs about half a
 * second without giving control back and then runs no catch or finally (see core/meetings.js).
 */
const STUCK_MS = 120_000;

/** The newest days kept in shared(), so the value stays far below 1 MiB. */
const MAX_DAYS = 120;

export const sleep = (cx, ms) => new Promise((resolve) => cx.timer.after(ms, () => resolve()));

/** FNV-1a over the text: only to tell whether the ledger changed. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16) + ":" + text.length;
}

/** What identifies a source's configuration: its records and data only count while it matches. */
export function sourceKey(source, values) {
  if (source === "ledger") return resolvePath(values.ledger.path);
  if (source === "calendar") return `calendar:${values.calendar.email ?? ""}`;
  if (source === "jira") {
    const j = values.jira;
    return `jira:${j.site ?? ""}|${j.email ?? ""}|${j.token_kind}`;
  }
  if (source === "ado") {
    const a = values.azure_devops;
    return `ado:${a.organization ?? ""}|${a.project ?? ""}|${a.repo ?? ""}`;
  }
  return source;
}

/** The settings section that holds a source's interval. */
const INTERVAL_SECTION = { calendar: "calendar", jira: "jira", ado: "azure_devops" };

/** The status records that belong to what is configured now (a changed ledger path starts over). */
export function currentStatus(values) {
  const all = shared(STATUS) ?? {};
  return Object.fromEntries(Object.entries(all).filter(([source, rec]) => SOURCES[source] && rec?.for === sourceKey(source, values)));
}

export class Hub {
  constructor(widgetIds) {
    this.copy = Math.random().toString(36).slice(2, 10);
    this.sources = sourcesFor(widgetIds);
    this.settings = { ...resolveSettings({}), state: "loading", saved: false, text: null };
    this.rev = shared(SETTINGS_REV);
    this.seconds = 0;
    this.polling = 0; // ms the running poll started, 0 when none
    this.attempted = {}; // source -> ms of this copy's last fetch
    this.holds = {}; // source -> this copy holds its lease right now (set by poll)
    this.dayChecked = null; // the local day this copy last forced a calendar fetch for
  }

  /** Reads settings, polls once, then every 5 s; the 1 s tick only watches for a settings save. */
  start(cx) {
    this.run(cx, true);
    cx.timer.every(1000, (cx) => {
      const rev = shared(SETTINGS_REV);
      const saved = rev !== this.rev;
      this.rev = rev;
      if (saved || ++this.seconds % 5 === 0) this.run(cx, saved);
    });
  }

  run(cx, force) {
    if (this.polling && Date.now() - this.polling < STUCK_MS) return;
    this.polling = Date.now();
    cx.spawn(async (cx) => {
      try {
        const next = await loadSettings();
        if (next.text !== this.settings.text || next.state !== this.settings.state) {
          this.settings = next;
          cx.notify();
        }
        for (const source of this.sources) await this.poll(cx, source, force);
        // Only the calendar's lease holder runs the alert loop; the others have no lease.
        if (this.holds.calendar) await this.alerts();
      } catch {
        // a failing poll must not stop the timer; the source's own status shows the error
      } finally {
        this.polling = 0;
      }
    });
  }

  /** Seconds between fetches: the interval setting for the calendar, Jira and Azure DevOps, a fixed one for the rest. */
  interval(source) {
    const setting = INTERVAL_SECTION[source] ? this.settings.values[INTERVAL_SECTION[source]].interval : null;
    return (setting && parseInterval(setting)) || SOURCES[source].interval;
  }

  key(source) {
    return sourceKey(source, this.settings.values);
  }

  async poll(cx, source, force) {
    const now = Date.now();
    const rec = (shared(STATUS) ?? {})[source];
    const key = this.key(source);
    // The meetings window is today and tomorrow: fetch again once when the local day changes.
    let forced = force || rec?.for !== key;
    if (source === "calendar") {
      const day = localDay(now, offsetNow());
      if (shared(MEETINGS)?.data?.day !== day && this.dayChecked !== day) {
        this.dayChecked = day;
        forced = true;
      }
    }
    const due = shouldFetch(rec, this.interval(source), now, this.attempted[source], forced);
    const persistent = SOURCES[source].persistent;
    this.holds[source] = false;
    if (!due && !persistent) return;

    if (!(await this.lease(cx, source))) return;
    this.holds[source] = true;
    if (due) await this.fetch(cx, source, key);
  }

  /** True when this copy holds the lease of `name`: it claims a free one, then confirms; a lost race costs nothing. */
  async lease(cx, name) {
    const now = Date.now();
    const action = leaseAction(shared(leaseKey(name)), this.copy, now);
    if (action === "skip") return false;
    if (action !== "hold") setShared(leaseKey(name), leaseValue(this.copy, now));
    if (action !== "claim") return true;
    await sleep(cx, CONFIRM_AFTER);
    return leaseIsMine(shared(leaseKey(name)), this.copy, Date.now());
  }

  async fetch(cx, source, key) {
    const interval = this.interval(source);
    const now = Date.now();
    this.attempted[source] = now;
    const prev = (shared(STATUS) ?? {})[source];
    let next;
    if (source === "ledger") {
      const r = await loadLedger(readTextFile, key);
      if (r.state !== "ok") {
        next = { ...failed(prev, now, interval, { message: r.error }), for: key };
      } else {
        next = { ...succeeded(now), for: key };
        const h = hash(r.text);
        const old = shared(LEDGER);
        if (!old || old.hash !== h || old.path !== key) {
          setShared(LEDGER, { data: newestDays(parseLedger(r.text), MAX_DAYS), hash: h, path: key, ok_at: now, error: null, backoff_until: 0 });
        }
      }
    }
    if (source === "calendar") next = await this.fetchCalendar(cx, prev, key, interval, now);
    if (source === "jira") next = await this.fetchJira(cx, prev, key, interval, now);
    if (source === "ado") next = await this.fetchAdo(cx, prev, key, interval, now);
    if (shouldWrite(prev, next) || prev?.for !== key) setShared(STATUS, { ...(shared(STATUS) ?? {}), [source]: next });
  }

  /**
   * The alert loop (R06, R11): toasts for meetings that are alerts-due now. The alert is recorded
   * in alerts.json before it is shown, so a failed toast is not repeated, and a copy that loses
   * the compare-and-swap race gets nothing to show.
   */
  async alerts() {
    try {
      const m = this.meetings();
      if (!m) return;
      const now = Date.now();
      const offsets = parseDurations(this.settings.values.calendar.alerts) ?? [];
      // Read alerts.json only when an alert is due now; the check is in memory.
      if (!dueAlerts(m.data.meetings, offsets, {}, now).length) return;
      const sent = await readAlertsSent();
      const due = dueAlerts(m.data.meetings, offsets, sent, now);
      if (!due.length) return;
      const won = await claimAlerts(due, now);
      const sound = this.settings.values.notifications.sound;
      for (const d of won) {
        notify({ ...alertText(d.meeting, d.offsetMin, offsetNow()), level: "info" });
      }
      if (won.length && sound !== "none") playSound(sound);
    } catch {
      // an alert that cannot be recorded is not sent (at most once); the next tick tries again
    }
  }

  /** The calendar's address is read here, used for one fetch and dropped; only meetings go to shared(). */
  async fetchCalendar(cx, prev, key, interval, now) {
    const url = await readSecret("ical_url");
    if (!url) {
      if (shared(MEETINGS)) setShared(MEETINGS, null);
      return { ...succeeded(now), ok_at: null, not_set_up: true, for: key };
    }
    const r = await runCalendar(cx, url, this.settings.values.calendar.email);
    if (!r.ok) return { ...failed(prev, now, interval, { status: r.status ?? null, message: r.message }), for: key };
    const old = shared(MEETINGS);
    if (!old || old.for !== key || JSON.stringify(old.data) !== JSON.stringify(r.value)) setShared(MEETINGS, { data: r.value, for: key, ok_at: now });
    return { ...succeeded(now), for: key };
  }

  /** The token is read here, used for one fetch and dropped; only issues go to shared(). */
  async fetchJira(cx, prev, key, interval, now) {
    const j = this.settings.values.jira;
    const token = await readSecret("jira_token");
    if (!token || !j.site || !j.email) {
      if (shared(JIRA)) setShared(JIRA, null);
      return { ...succeeded(now), ok_at: null, not_set_up: true, for: key };
    }
    const fav = await readDataText("favorites.md");
    const pri = await readDataText("priorities.md");
    const board = boardKeys(parseBoard(await readDataText("board.md")));
    const old = shared(JIRA);
    const kept = old?.for === key ? old.data : {};
    const r = await runJira(cx, { site: j.site, email: j.email, kind: j.token_kind, token }, { keys: keySet(fav, pri, board), cloudId: kept.cloud_id ?? null, accountId: kept.account_id ?? null });
    if (!r.ok) return { ...failed(prev, now, interval, { status: r.status ?? null, message: r.message }), for: key };
    // The widgets need to know which keys are favorites and which are priorities, in file order. The favorites are read again
    // now, so a move made while the fetch was running is not undone (D45); one key per line, as the widget's moves count them.
    const data = { ...r.value, favorites: favoriteKeys((await readDataText("favorites.md")) ?? fav).slice(0, 200), priorities: jiraKeys(pri).slice(0, 200) };
    if (!old || old.for !== key || JSON.stringify(old.data) !== JSON.stringify(data)) setShared(JIRA, { data, for: key, ok_at: now });
    return { ...succeeded(now), for: key };
  }

  /**
   * The PAT is read here, used for one fetch and dropped; only PR rows go to shared(). The fetch is
   * recorded in prs.json first, which decides what is new and owes a toast (R11); the first fetch of
   * a repo is the baseline and shows none. A toast is recorded before it is shown, so a failed one
   * is not repeated.
   */
  async fetchAdo(cx, prev, key, interval, now) {
    const a = this.settings.values.azure_devops;
    const pat = await readSecret("ado_pat");
    if (!pat || !a.organization || !a.project || !a.repo) {
      if (shared(PRS)) setShared(PRS, null);
      return { ...succeeded(now), ok_at: null, not_set_up: true, for: key };
    }
    const r = await runAdo(cx, { organization: a.organization, project: a.project, repo: a.repo, pat });
    if (!r.ok) return { ...failed(prev, now, interval, { status: r.status ?? null, message: r.message }), for: key };
    let rec;
    try {
      rec = await recordPrs(repoKey(a.organization, a.project, a.repo), r.value.prs, now);
    } catch (e) {
      const newer = Number.isInteger(e?.version) ? `ado: prs.json is version ${e.version}; this Friday reads version 1` : "ado: could not update prs.json";
      return { ...failed(prev, now, interval, { message: newer }), for: key };
    }
    const old = shared(PRS);
    const data = { prs: rec.rows.slice(0, 100) };
    if (!old || old.for !== key || JSON.stringify(old.data) !== JSON.stringify(data)) setShared(PRS, { data, for: key, ok_at: now });
    for (const pr of rec.owed) notify({ ...prToast(pr), level: "info" });
    const sound = this.settings.values.notifications.sound;
    if (rec.owed.length && sound !== "none") playSound(sound);
    return { ...succeeded(now), for: key };
  }

  /** Enter or a click on a PR (`id`), or "mark all seen" (null): clears the mark in prs.json and in shared(). */
  markSeen(cx, id) {
    const key = this.key("ado");
    const a = this.settings.values.azure_devops;
    cx.spawn(async (cx) => {
      try {
        const rows = await markPrsSeen(repoKey(a.organization, a.project, a.repo), id);
        const cur = shared(PRS);
        if (cur && cur.for === key) setShared(PRS, { ...cur, data: { prs: rows.slice(0, 100) } });
      } catch {
        // the mark stays; the next click tries again
      }
      cx.notify();
    });
  }

  /** ↻: make the sources due now; the lease holder reads them within a few seconds. */
  refresh(cx) {
    const status = { ...(shared(STATUS) ?? {}) };
    for (const source of this.sources) status[source] = refreshed(status[source]);
    setShared(STATUS, status);
    this.run(cx, true);
  }

  status() {
    return currentStatus(this.settings.values);
  }

  /** The ledger as shared, only while it belongs to the configured path. */
  ledger() {
    const l = shared(LEDGER);
    return l && l.path === this.key("ledger") ? l : null;
  }

  /** Today's and tomorrow's meetings as shared, only while they belong to the configured calendar. */
  meetings() {
    const m = shared(MEETINGS);
    return m && m.for === this.key("calendar") && !this.status().calendar?.not_set_up ? m : null;
  }

  /** Jira issues as shared, only while they belong to the configured site and e-mail. */
  /** The favorites in a new order, at once and without a Jira call (the poll keeps the issues). */
  setFavorites(keys) {
    const old = shared(JIRA);
    if (old) setShared(JIRA, { ...old, data: { ...old.data, favorites: keys } });
  }

  jira() {
    const m = shared(JIRA);
    return m && m.for === this.key("jira") && !this.status().jira?.not_set_up ? m : null;
  }

  /** Pull requests as shared, only while they belong to the configured organization and repo. */
  prs() {
    const m = shared(PRS);
    return m && m.for === this.key("ado") && !this.status().ado?.not_set_up ? m : null;
  }

  /** loading, ok, stale, error or not_set_up for a source. */
  state(source, now = Date.now()) {
    return widgetState({ rec: this.status()[source], intervalSec: this.interval(source), now });
  }
}
