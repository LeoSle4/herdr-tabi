// Tests of portraits.ps1, the Windows helper of tabi-party. They run PowerShell, so everywhere else they are skipped.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFolder } from "./lib.js";

const skip = process.platform !== "win32";
const script = join(dirname(fileURLToPath(import.meta.url)), "portraits.ps1");
const ps = (...args) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, ...args], { encoding: "utf8" });
// Draws a w x h picture (left half red, right half blue) in the given format; `exifOrientation` > 0 tags it as rotated.
const draw = (path, w, h, format, exifOrientation = 0) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `
  Add-Type -AssemblyName System.Drawing
  $b = New-Object System.Drawing.Bitmap(${w}, ${h})
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.FillRectangle([System.Drawing.Brushes]::Red, 0, 0, ${w / 2}, ${h})
  $g.FillRectangle([System.Drawing.Brushes]::Blue, ${w / 2}, 0, ${w / 2}, ${h})
  $g.Dispose()
  if (${exifOrientation} -gt 0) {
    $p = [System.Runtime.Serialization.FormatterServices]::GetUninitializedObject([System.Drawing.Imaging.PropertyItem])
    $p.Id = 0x0112; $p.Type = 3; $p.Len = 2; $p.Value = [byte[]](${exifOrientation}, 0)
    $b.SetPropertyItem($p)
  }
  $b.Save('${path}', [System.Drawing.Imaging.ImageFormat]::${format})
  $b.Dispose()`]);
const pngSize = (path) => { const b = readFileSync(path); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const colorAt = (path, x, y) => {
  const c = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `
    Add-Type -AssemblyName System.Drawing
    $b = New-Object System.Drawing.Bitmap('${path}')
    $p = $b.GetPixel(${x}, ${y}); $b.Dispose()
    if ($p.R -gt 200 -and $p.B -lt 60) { 'red' } elseif ($p.B -gt 200 -and $p.R -lt 60) { 'blue' } else { 'other' }`], { encoding: "utf8" });
  return c.trim();
};

test("list: files with extension, one without extension but png/jpeg inside, and the others, in parseFolder's format", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tabi-party-"));
  try {
    draw(join(dir, "uno.jpg"), 8, 8, "Jpeg");
    draw(join(dir, "1"), 8, 8, "Png"); // a png with no extension
    draw(join(dir, "2"), 8, 8, "Jpeg"); // a jpeg with no extension
    writeFileSync(join(dir, "3"), "not an image"); // no extension, not an image
    writeFileSync(join(dir, "notas.txt"), "hola");
    writeFileSync(join(dir, "acción.png"), ""); // accents in the name survive the pipe
    const { images, ignored } = parseFolder(ps("-Mode", "list", "-Dir", dir));
    assert.deepEqual(images.map((i) => i.file), ["1", "2", "acción.png", "uno.jpg"]);
    assert.deepEqual(ignored, ["3", "notas.txt"]);
    assert.ok(images.every((i) => i.mtime > 1.6e12), "modification times come in unix seconds");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("thumb: a centered square of the asked size, saved as png, from a wide and a tall image", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tabi-party-"));
  try {
    draw(join(dir, "wide.jpg"), 40, 20, "Jpeg");
    draw(join(dir, "tall.png"), 20, 40, "Png");
    for (const [src, out] of [["wide.jpg", "wide.png"], ["tall.png", "tall.png"]]) {
      ps("-Mode", "thumb", "-Src", join(dir, src), "-Out", join(dir, "o-" + out), "-Size", "96");
      assert.deepEqual(pngSize(join(dir, "o-" + out)), [96, 96], src);
    }
    assert.equal(existsSync(join(dir, "o-wide.png.tmp.png")), false, "no temporary file is left");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("thumb: the crop is centered, and the EXIF rotation is applied before it", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tabi-party-"));
  try {
    draw(join(dir, "plain.jpg"), 40, 20, "Jpeg"); // red on the left, blue on the right
    ps("-Mode", "thumb", "-Src", join(dir, "plain.jpg"), "-Out", join(dir, "plain.png"));
    assert.deepEqual([colorAt(join(dir, "plain.png"), 10, 48), colorAt(join(dir, "plain.png"), 86, 48)], ["red", "blue"]);
    draw(join(dir, "turned.jpg"), 40, 20, "Jpeg", 6); // tagged "rotate 90 clockwise": red ends on top, blue at the bottom
    ps("-Mode", "thumb", "-Src", join(dir, "turned.jpg"), "-Out", join(dir, "turned.png"));
    assert.deepEqual([colorAt(join(dir, "turned.png"), 48, 10), colorAt(join(dir, "turned.png"), 48, 86)], ["red", "blue"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("thumb: works on an image without extension and a path with spaces", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tabi party "));
  try {
    draw(join(dir, "retrato 1"), 30, 30, "Png");
    ps("-Mode", "thumb", "-Src", join(dir, "retrato 1"), "-Out", join(dir, "salida final.png"), "-Size", "48");
    assert.deepEqual(pngSize(join(dir, "salida final.png")), [48, 48]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("thumb: a failing source reports an error and leaves no output", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "tabi-party-"));
  try {
    writeFileSync(join(dir, "roto.jpg"), "not an image");
    assert.throws(() => ps("-Mode", "thumb", "-Src", join(dir, "roto.jpg"), "-Out", join(dir, "out.png")), /./s);
    assert.equal(existsSync(join(dir, "out.png")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
