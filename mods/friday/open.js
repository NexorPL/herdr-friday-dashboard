// Opening https links and files with the OS. The program and its single argument come from
// core/links.js, which refuses anything but an https link or an absolute path; there is no shell.
import { exec, window } from "herdr";
import { openCommand } from "./core/links.js";

async function open(kind, target) {
  const c = openCommand(window().platform, kind, target);
  if (!c) return false;
  try {
    await exec(c.command, c.args);
    return true;
  } catch {
    return false;
  }
}

/** Opens an `https` link; returns false (and does nothing) for anything else. */
export const openLink = (url) => open("link", url);

/** Opens a file or folder, given as an absolute path. */
export const openPath = (path) => open("file", path);
