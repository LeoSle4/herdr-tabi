# Copies the images of a folder into <herdr-app-home>/backgrounds/tabi/ (layouts can only paint images that live
# there) and measures how bright each one is, so the layout can darken bright pictures more than dark ones.
#   python3 -X utf8 prepare.py <herdr-app-home> [source-folder]
# Brightness: Pillow when installed, else macOS `sips`; if neither exists it is left null and the mod falls
# back to the strongest darkening, which is safe.
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

EXT = (".jpg", ".jpeg", ".png", ".webp")


def brightness_pillow(path):
    from PIL import Image  # noqa: PLC0415
    with Image.open(path) as im:
        small = im.convert("L").resize((32, 32))
        data = list(small.getdata())
    return sum(data) / len(data) / 255


def brightness_sips(path):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "s.bmp")
        subprocess.run(["sips", "-z", "24", "24", "-s", "format", "bmp", path, "--out", out], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raw = open(out, "rb").read()
    offset, = struct.unpack_from("<I", raw, 10)
    width, height, _planes, bpp = struct.unpack_from("<iiHH", raw, 18)
    if bpp not in (24, 32):
        raise ValueError("unsupported bmp")
    step, stride = bpp // 8, ((width * bpp // 8) + 3) // 4 * 4
    total = count = 0
    for y in range(abs(height)):
        for x in range(width):
            b, g, r = raw[offset + y * stride + x * step: offset + y * stride + x * step + 3]
            total += 0.2126 * r + 0.7152 * g + 0.0722 * b
            count += 1
    return total / count / 255


def brightness(path):
    for fn in (brightness_pillow, brightness_sips):
        try:
            return round(fn(path), 3)
        except Exception:  # noqa: BLE001 - try the next method
            continue
    return None


def main():
    home = sys.argv[1]
    src = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser("~/Documents/fondos/optimizados")
    dest = os.path.join(home, "backgrounds", "tabi")
    os.makedirs(dest, exist_ok=True)
    names = sorted(n for n in os.listdir(src) if n.lower().endswith(EXT)) if os.path.isdir(src) else []
    items = []
    for i, name in enumerate(names, 1):
        ext = os.path.splitext(name)[1].lower()
        target = os.path.join(dest, f"{i:02d}{ext}")
        shutil.copyfile(os.path.join(src, name), target)
        items.append({"file": f"backgrounds/tabi/{i:02d}{ext}", "brightness": brightness(target)})
    os.makedirs(os.path.join(home, "data", "tabi"), exist_ok=True)
    with open(os.path.join(home, "data", "tabi", "backdrops.json"), "w", encoding="utf-8") as f:
        json.dump({"images": items}, f)
    print(json.dumps(items))


if __name__ == "__main__":
    main()
