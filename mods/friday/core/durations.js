// Durations as the owner writes them: `30s`, `5m`, `1h 30m`, `1.5h`. One parser serves settings
// intervals and time entry (G24). Ported from the first version's config.rs. Values are seconds.

/** Upper bound for intervals and alerts, so later time arithmetic cannot overflow. */
export const MAX_SECONDS = 24 * 3600;

const UNITS = { s: 1, m: 60, h: 3600 };

/** Number and unit pairs (`s`, `m`, `h`), spaces between pairs optional. Seconds, or null. */
export function parseDuration(text) {
  if (typeof text !== "string") return null;
  let rest = text.trim();
  if (rest === "") return null;
  let seconds = 0;
  while (rest !== "") {
    const number = /^[0-9.]*/.exec(rest)[0];
    const value = Number(number);
    if (number === "" || Number.isNaN(value)) return null;
    const unit = UNITS[rest[number.length]];
    if (unit === undefined) return null;
    seconds += value * unit;
    rest = rest.slice(number.length + 1).trimStart();
  }
  return Number.isFinite(seconds) ? seconds : null;
}

/** A duration of at most a day, or null. */
export function parseBounded(text) {
  const seconds = parseDuration(text);
  return seconds !== null && seconds <= MAX_SECONDS ? seconds : null;
}

/** A polling interval: above zero and at most a day, so a source never polls in a busy loop. */
export function parseInterval(text) {
  const seconds = parseBounded(text);
  return seconds !== null && seconds > 0 ? seconds : null;
}

/** A list of bounded durations (alert offsets), or null when any entry is invalid. */
export function parseDurations(list) {
  if (!Array.isArray(list)) return null;
  const out = list.map(parseBounded);
  return out.includes(null) ? null : out;
}
