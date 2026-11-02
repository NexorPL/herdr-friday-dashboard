// What Friday may hand to the OS opener. Only `https` links from outside text (calendar entries,
// issues, PRs) are opened, and they go to the opener as one argument, never through a shell
// (spec, Edge Cases: Untrusted text). Files are our own folders, given as absolute paths.

const MAX_LENGTH = 2048;

/** The URL if it is a plain `https://host/...` link, else null. */
export function httpsLink(url) {
  if (typeof url !== "string" || url.length > MAX_LENGTH) return null;
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return null;
  const m = /^https:\/\/([^/?#]+)/i.exec(url);
  if (!m) return null;
  const host = m[1];
  if (host.includes("@")) return null; // https://user:pass@host: not a link Friday opens
  if (!/^[^\s:]+(:\d+)?$/.test(host)) return null;
  return url;
}

/** A local absolute path: `/x`, `C:/x` or `C:\x`. Anything else could be read as an option. */
export function absolutePath(path) {
  if (typeof path !== "string" || path.length > MAX_LENGTH) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return /^(\/|[A-Za-z]:[\\/])/.test(path) ? path : null;
}

/**
 * The program and arguments that open `target` on `platform` (`window().platform`), or null.
 * `kind` is "link" (https only) or "file" (an absolute path).
 */
export function openCommand(platform, kind, target) {
  const safe = kind === "link" ? httpsLink(target) : kind === "file" ? absolutePath(target) : null;
  if (safe === null) return null;
  if (platform === "windows") return { command: "rundll32", args: ["url.dll,FileProtocolHandler", safe] };
  if (platform === "macos") return { command: "open", args: [safe] };
  if (platform === "linux") return { command: "xdg-open", args: [safe] };
  return null;
}
