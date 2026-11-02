// Friday's JSON files in the data folder: the version check, copying a broken file aside, and
// compare-and-swap writes. All file access goes through `io`, so Node tests can fake it:
//   io.read(path)              -> string | null   (readTextFile)
//   io.write(path, text, prev) -> void, throws if the file no longer matches `prev` (writeTextFile)
// Every file carries "version": 1. A Friday that finds a newer version leaves the file alone.

export const SUPPORTED_VERSION = 1;

/** `20261102-153045`, in UTC, for `<name>.corrupt-<time>`. */
export function stamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/**
 * state: "missing", "ok", "corrupt" (not JSON, or not an object) or "newer" (needs Friday
 * `version` or later). `value` is the parsed object for "ok".
 */
export function parseJson(text) {
  if (text === null) return { state: "missing", text, value: null };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { state: "corrupt", text, value: null };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { state: "corrupt", text, value: null };
  const version = value.version === undefined ? SUPPORTED_VERSION : value.version;
  if (!Number.isInteger(version) || version < 1) return { state: "corrupt", text, value: null };
  if (version > SUPPORTED_VERSION) return { state: "newer", text, value: null, version };
  return { state: "ok", text, value };
}

export async function readJson(io, path) {
  return parseJson(await io.read(path));
}

export class NewerVersionError extends Error {
  constructor(path, version) {
    super(`${path} is version ${version}; this Friday reads version ${SUPPORTED_VERSION}`);
    this.version = version;
  }
}

/** Copies a broken file to `<path>.corrupt-<time>` and returns that path. */
export async function copyAside(io, path, text, nowMs) {
  const aside = `${path}.corrupt-${stamp(nowMs)}`;
  await io.write(aside, text, null);
  return aside;
}

/**
 * Reads the file, applies `mutate(valueCopy)` and writes the result with the snapshot read as the
 * expected content. A broken file is copied aside first and replaced; a newer version throws and
 * the file is left alone. A rejected write is retried once from a fresh read (the change is applied
 * again), and counted as done if the file already holds the intended text.
 * Returns the written value. `countLandedWrites: false` skips that last check, for writers that must
 * not mistake another copy's identical write for their own (alerts, R11): they re-read and mutate again.
 */
export async function updateJson(io, path, mutate, nowMs = Date.now(), countLandedWrites = true) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await readJson(io, path);
    if (read.state === "newer") throw new NewerVersionError(path, read.version);
    if (read.state === "corrupt") await copyAside(io, path, read.text, nowMs);
    const base = read.state === "ok" ? JSON.parse(read.text) : { version: SUPPORTED_VERSION };
    const next = mutate(base);
    const text = `${JSON.stringify(next, null, 2)}\n`;
    try {
      await io.write(path, text, read.text);
      return next;
    } catch (e) {
      lastError = e;
      if (countLandedWrites && (await io.read(path)) === text) return next;
    }
  }
  throw lastError;
}
