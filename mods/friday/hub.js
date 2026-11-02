// The hub: what keeps the sources fresh while herdr-app is open. Every pane is its own copy of the
// mod, with its own module scope (spike note, question 1), so each copy runs its own Hub and the
// copies agree through leases in shared(): the copy that holds a source's lease reads it and writes
// the result to shared("friday.<source>") and its record to shared("friday.status"); every other
// copy re-renders from those values. A lost race costs nothing, because only the lease holder reads.
import { shared, setShared, readTextFile } from "herdr";
import { loadSettings, resolvePath } from "./store.js";
import { loadLedger, parseLedger, newestDays } from "./core/ledger.js";
import { leaseAction, leaseValue, leaseIsMine, leaseKey, CONFIRM_AFTER } from "./core/lease.js";
import { shouldFetch, succeeded, failed, refreshed, shouldWrite, widgetState } from "./core/due.js";
import { sourcesFor, SOURCES } from "./core/widgets.js";
import { resolveSettings } from "./core/settings.js";

export const STATUS = "friday.status";
export const LEDGER = "friday.ledger";
/** Settings bumps this after a save, so every copy rereads settings.json within a second. */
export const SETTINGS_REV = "friday.settings_rev";

/** The newest days kept in shared(), so the value stays far below 1 MiB. */
const MAX_DAYS = 120;

const sleep = (cx, ms) => new Promise((resolve) => cx.timer.after(ms, () => resolve()));

/** FNV-1a over the text: only to tell whether the ledger changed. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16) + ":" + text.length;
}

/** What identifies a source's configuration: its records and data only count while it matches. */
export function sourceKey(source, values) {
  return source === "ledger" ? resolvePath(values.ledger.path) : source;
}

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
    this.polling = false;
    this.attempted = {}; // source -> ms of this copy's last fetch
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
    if (this.polling) return;
    this.polling = true;
    cx.spawn(async (cx) => {
      try {
        const next = await loadSettings();
        if (next.text !== this.settings.text || next.state !== this.settings.state) {
          this.settings = next;
          cx.notify();
        }
        for (const source of this.sources) await this.poll(cx, source, force);
      } catch {
        // a failing poll must not stop the timer; the source's own status shows the error
      } finally {
        this.polling = false;
      }
    });
  }

  key(source) {
    return sourceKey(source, this.settings.values);
  }

  async poll(cx, source, force) {
    const now = Date.now();
    const rec = (shared(STATUS) ?? {})[source];
    const key = this.key(source);
    if (!shouldFetch(rec, SOURCES[source].interval, now, this.attempted[source], force || rec?.for !== key)) return;

    const action = leaseAction(shared(leaseKey(source)), this.copy, now);
    if (action === "skip") return;
    if (action !== "hold") setShared(leaseKey(source), leaseValue(this.copy, now));
    if (action === "claim") {
      await sleep(cx, CONFIRM_AFTER);
      if (!leaseIsMine(shared(leaseKey(source)), this.copy, Date.now())) return;
    }
    await this.fetch(source, key);
  }

  async fetch(source, key) {
    const interval = SOURCES[source].interval;
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
    if (shouldWrite(prev, next) || prev?.for !== key) setShared(STATUS, { ...(shared(STATUS) ?? {}), [source]: next });
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

  /** loading, ok, stale, error or not_set_up for a source. */
  state(source, now = Date.now()) {
    return widgetState({ rec: this.status()[source], intervalSec: SOURCES[source].interval, now });
  }
}
