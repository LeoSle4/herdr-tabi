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

/** The newest `max` folders from `ls -1tp <dir>` (newest first, folders end in "/"): [{ name, path }], hidden ones left out. */
export function recentFromLs(out, dir, max = 6) {
  return out
    .split("\n")
    .filter((line) => line.endsWith("/"))
    .map((line) => line.slice(0, -1))
    .filter((name) => name && !name.startsWith("."))
    .slice(0, max)
    .map((name) => ({ name, path: `${dir}/${name}` }));
}
