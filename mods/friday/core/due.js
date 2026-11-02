// When a source is due, and what its status record says afterwards. The record is what every pane
// reads from shared("friday.status")[source]; times are ms since the epoch, waits are seconds.
//   { ok_at, attempt_at, error, backoff_until, backoff_wait, rejected }
import { backoff, backsOff, rejectsToken } from "./backoff.js";

/** Rewriting an unchanged record at most this often keeps shared() quiet. */
export const REWRITE_AFTER = 60_000;

/** A source is stale when its last success is older than this, or twice its interval. */
export const STALE_FLOOR = 5 * 60_000;

/** Is `source` due? `intervalSec` is its polling interval. */
export function isDue(rec, intervalSec, now) {
  if (!rec) return true;
  if (rec.rejected) return false; // "token rejected": no retry until the secret changes or ↻
  if (now < (rec.backoff_until ?? 0)) return false;
  return now >= (rec.attempt_at ?? 0) + intervalSec * 1000;
}

/**
 * Should the lease holder fetch `source` now? `attempted` is its own last attempt (ms), which the
 * shared record cannot give: an unchanged result is not rewritten for REWRITE_AFTER, so the record
 * alone would make a short interval due on every tick. `force` (↻, a settings save, a changed
 * path) and a ↻ from another pane (`attempt_at` reset to 0) fetch at once.
 */
export function shouldFetch(rec, intervalSec, now, attempted, force = false) {
  if (force) return true;
  if (!isDue(rec, intervalSec, now)) return false;
  if (!rec?.attempt_at) return true;
  return now >= (attempted ?? 0) + intervalSec * 1000;
}

export function succeeded(now) {
  return { ok_at: now, attempt_at: now, error: null, backoff_until: 0, backoff_wait: 0, rejected: false };
}

/**
 * A failed attempt. `status` is the HTTP status when there was one; a 429 or 5xx backs off (twice
 * the interval, doubling to 30 min, honouring `retryAfterSec`), 401 and 403 stop until refreshed,
 * and anything else is tried again at the next interval. The last good time is kept.
 */
export function failed(rec, now, intervalSec, { status = null, retryAfterSec = null, message }) {
  const next = { ...succeeded(now), ok_at: rec?.ok_at ?? null, error: message };
  if (status !== null && rejectsToken(status)) next.rejected = true;
  else if (status !== null && backsOff(status)) {
    const wait = backoff(intervalSec, rec?.backoff_wait || null, retryAfterSec);
    next.backoff_wait = wait;
    next.backoff_until = now + wait * 1000;
  }
  return next;
}

/** ↻: due again at once, whatever the backoff or the rejection said. */
export function refreshed(rec) {
  return { ...(rec ?? {}), attempt_at: 0, backoff_until: 0, rejected: false };
}

/** Should a fresh record replace the shared one? Only on a change, or when it has gone quiet. */
export function shouldWrite(prev, next) {
  if (!prev) return true;
  if (prev.error !== next.error || prev.rejected !== next.rejected || prev.backoff_until !== next.backoff_until) return true;
  return next.attempt_at - (prev.attempt_at ?? 0) >= REWRITE_AFTER;
}

/** The five states every widget shows: loading, ok, stale, error and not_set_up. */
export function widgetState({ rec, configured = true, intervalSec = 60, now }) {
  if (!configured) return "not_set_up";
  if (!rec) return "loading";
  if (rec.error || rec.rejected) return "error";
  if (!rec.ok_at) return "loading";
  return now - rec.ok_at > Math.max(STALE_FLOOR, 2 * intervalSec * 1000) ? "stale" : "ok";
}
