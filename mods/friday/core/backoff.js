// What a source does after a failed call. Ported from the first version's net.rs. Seconds
// throughout. Nothing here touches the network, and no message carries a URL: the iCal address
// is a secret, and herdr-app's own fetch errors quote it.

/** The longest wait Friday picks itself after a 429 or 5xx. */
export const MAX_BACKOFF = 30 * 60;

/** A server's `Retry-After` is honoured up to a day, like the longest interval. */
export const MAX_RETRY_AFTER = 24 * 3600;

/** A 429 or a 5xx: the source backs off instead of trying again at its next interval. */
export function backsOff(status) {
  return status === 429 || (status >= 500 && status < 600);
}

/** 401 and 403: no retry until the secret is replaced or the owner refreshes. */
export function rejectsToken(status) {
  return status === 401 || status === 403;
}

/**
 * The wait after a 429 or 5xx: twice the source's interval, then twice the last wait, up to 30
 * minutes, and never less than the server's `Retry-After` (itself capped at a day).
 */
export function backoff(interval, lastWait = null, retryAfter = null) {
  const wait = Math.min((lastWait ?? interval) * 2, MAX_BACKOFF);
  return Math.max(wait, Math.min(retryAfter ?? 0, MAX_RETRY_AFTER));
}

const HTTP_DATE = /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} (GMT|UTC|[+-]\d{4})$/;

/**
 * `Retry-After` in either of HTTP's forms: seconds, or a date, read as the time left until it.
 * A date in the past or a value that is neither gives null. herdr-app 0.1.12's `fetch` does not
 * expose response headers (see the spike note), so nothing calls this yet.
 */
export function parseRetryAfter(value, nowMs = Date.now()) {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (!HTTP_DATE.test(text)) return null;
  const at = Date.parse(text);
  if (Number.isNaN(at) || at < nowMs) return null;
  return (at - nowMs) / 1000;
}

/** An error message built from the source name and the status only, never a URL, header or body. */
export function httpError(source, status) {
  return `${source}: HTTP ${status}`;
}

/** For a rejected `fetch`: its own message quotes the URL, so it is never used. */
export function networkError(source) {
  return `${source}: request failed`;
}
