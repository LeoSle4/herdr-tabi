// Pure helpers for the tabi-space-menu mod (testable with `node --test`).

/** A folder path without trailing separators, so "/a/b/" and "/a/b" compare equal ("/" stays). */
export function normalize(path) {
  if (!path) return "";
  const p = String(path).replace(/\\/g, "/").replace(/\/+$/, "");
  return p || "/";
}

/** The space that already has this folder (as its folder or where its first terminal is now), or undefined. */
export function findSpaceByFolder(spaces, whereOf, folder) {
  const want = normalize(folder);
  return spaces.find((s) => normalize(s.folder) === want || normalize(whereOf(s)) === want);
}

/** The newest `max` project folders from a listing of full paths (newest first; trailing separators, backslashes and CRLF allowed).
 *  Hidden ones are left out and a name that appears in two folders is shown once (the first one wins): [{ name, path }]. */
export function recentFromPaths(out, max = 6) {
  const seen = new Set();
  const found = [];
  for (const line of out.split("\n")) {
    const path = normalize(line.trim());
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!path || !name || name.startsWith(".") || seen.has(name)) continue;
    seen.add(name);
    found.push({ name, path });
  }
  return found.slice(0, max);
}

/** `s` as one POSIX shell word. */
export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** "~" or "%USERPROFILE%" at the start of a configured path, replaced by the home folder. */
export function expandPath(path, home) {
  const h = String(home).replace(/[\\/]+$/, "");
  return String(path).trim().replace(/^~(?=$|[\\/])/, h).replace(/^%USERPROFILE%(?=$|[\\/])/i, h);
}

/** Where projects live when tabi.json says nothing: ~/Projects, then Documents/Projects. `documents` is the real
 *  Documents folder when the system redirects it (OneDrive on Windows); the plain ~/Documents/Projects stays as a last resort. */
export function defaultProjectFolders(home, documents) {
  const h = normalize(home);
  return [...new Set([`${h}/Projects`, `${normalize(documents) || `${h}/Documents`}/Projects`, `${h}/Documents/Projects`])];
}

/** The project folders to look in, in priority order: the "projectFolders" list of tabi.json (a JSON text, or null when the
 *  file is missing), or the defaults when it is absent, broken or empty. */
export function projectFolders(configText, home, documents) {
  let list;
  try { list = JSON.parse(configText)?.projectFolders; } catch { list = null; }
  const own = Array.isArray(list)
    ? list.filter((x) => typeof x === "string" && x.trim()).map((x) => normalize(expandPath(x, home)))
    : [];
  return [...new Set(own.length ? own : defaultProjectFolders(home, documents))];
}

/** Of `folders`, the ones that exist and are not the same place as an earlier one (a symlink or junction to it).
 *  `resolved` has one "<1-based index>\t<real path>" line per folder that exists. */
export function usableFolders(folders, resolved) {
  const real = new Map();
  for (const line of resolved.split("\n")) {
    const [i, path] = line.replace(/\r$/, "").split("\t");
    if (i && path) real.set(Number(i), normalize(path));
  }
  const seen = new Set();
  return folders.filter((_, k) => {
    const r = real.get(k + 1);
    if (!r) return false;
    const key = /^[a-z]:\//i.test(r) ? r.toLowerCase() : r; // Windows paths are not case sensitive
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
