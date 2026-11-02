// secrets.json (R12, Q8): `jira_token`, `ado_pat` and `ical_url` in plain text in the data folder,
// protected only by the user account's file permissions. Only Settings writes it and only the code
// that fetches reads it. A secret never goes into shared(), localStorage, logs, errors or toasts;
// nothing in this file returns or prints one except `secretFrom`, for the fetch.

export const SECRET_NAMES = ["jira_token", "ado_pat", "ical_url"];

/** The stored secret `name` from a parsed secrets.json, or null. */
export function secretFrom(parsed, name) {
  const v = parsed && parsed.state === "ok" ? parsed.value[name] : null;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** A copy of the parsed file with one secret set; an empty value removes it. Other entries stay. */
export function withSecret(raw, name, value) {
  if (!SECRET_NAMES.includes(name)) throw new Error("unknown secret");
  const next = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  const v = typeof value === "string" ? value.trim() : "";
  if (v === "") delete next[name];
  else next[name] = v;
  next.version = 1;
  return next;
}
