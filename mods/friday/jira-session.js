// What a dialog needs to talk to Jira: the fetch helpers, the settings and the stored token, read
// for one action and dropped (R12). `cloudId` and `accountId` come from the last poll in shared().
import { shared } from "herdr";
import { loadSettings, readSecret } from "./store.js";
import { JIRA } from "./hub.js";
import { jiraDeps } from "./net.js";

/** { deps, cfg: { site, email, kind, token, cloudId }, accountId } or null when Jira is not set up. */
export async function jiraSession(cx) {
  const j = (await loadSettings()).values.jira;
  const token = await readSecret("jira_token");
  if (!token || !j.site || !j.email) return null;
  const data = shared(JIRA)?.data ?? {};
  return { deps: jiraDeps(cx), cfg: { site: j.site, email: j.email, kind: j.token_kind, token, cloudId: data.cloud_id ?? null }, accountId: data.account_id ?? null };
}
