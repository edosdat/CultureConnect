#!/usr/bin/env python3
"""Night full-bleed startup images with the LOCK v3 C, recolored rose.

Reads src/lib/appleSplashScreens.json and writes public/splash/apple-{w}x{h}.png.
Phone screens are portrait. iPad screens include landscape (upright C).
The shape stays the v3 letter. No neon ring: that edge belongs to the app icon.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "plan-c-icon-LOCK-v3-violet.jpg"
SCREENS = ROOT / "src" / "lib" / "appleSplashScreens.json"
OUT = ROOT / "public" / "splash"
NUIT = (26, 11, 30)  # #1A0B1E
ROSE = (255, 46, 126)  # #FF2E7E
# Same halo as the inline shell: drop-shadow(0 0 6px rgba(255,46,126,.6)) on an 88px mark.
HALO_PX_AT_88 = 6
HALO_ALPHA = 0.6


def is_violet(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return b > r + 8 and b > 150


def lettermark_mask() -> Image.Image:
    """L mask of the LOCK v3 C. The startup images recolor it; they do not redraw it."""
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    px = im.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if not is_violet(px[x, y]):
                continue
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    pad = 8
    box = (
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + pad + 1),
        min(h, maxy + pad + 1),
    )
    crop = im.crop(box)
    mask = Image.new("L", crop.size, 0)
    src = crop.load()
    dst = mask.load()
    cw, ch = crop.size
    for y in range(ch):
        for x in range(cw):
            if is_violet(src[x, y]):
                dst[x, y] = 255
    return mask


def pixels(spec: dict) -> tuple[int, int]:
    pw = int(spec["deviceWidth"]) * int(spec["dpr"])
    ph = int(spec["deviceHeight"]) * int(spec["dpr"])
    if spec["orientation"] == "landscape":
        return ph, pw
    return pw, ph


def render(mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    width, height = size
    short = min(width, height)
    target_h = min(int(short * 0.34), 560)
    target_h = max(target_h, 180)
    scale = target_h / mask.height
    target_w = max(1, int(round(mask.width * scale)))
    resized = mask.resize((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, NUIT + (255,))
    blur_r = max(1, round(target_h * HALO_PX_AT_88 / 88))
    blurred = resized.filter(ImageFilter.GaussianBlur(radius=blur_r))
    halo = Image.new("RGBA", (target_w, target_h), ROSE + (0,))
    halo.putalpha(blurred.point(lambda p: int(p * HALO_ALPHA)))
    ox = (width - target_w) // 2
    oy = (height - target_h) // 2
    canvas.alpha_composite(halo, (ox, oy))
    core = Image.new("RGBA", (target_w, target_h), ROSE + (0,))
    core.putalpha(resized)
    canvas.alpha_composite(core, (ox, oy))
    rgb = canvas.convert("RGB")
    if rgb.getpixel((0, 0)) != NUIT:
        raise SystemExit(f"night drifted to {rgb.getpixel((0, 0))} for {size}")
    # Eight steps from night to rose. Night and the letter stay exact, files stay small.
    steps = []
    for t in (0, 0.12, 0.24, 0.4, 0.55, 0.7, 0.85, 1):
        steps.extend(int(NUIT[i] * (1 - t) + ROSE[i] * t) for i in range(3))
    steps.extend([0] * (768 - len(steps)))
    palette = Image.new("P", (1, 1))
    palette.putpalette(steps)
    indexed = rgb.quantize(palette=palette, dither=Image.Dither.NONE)
    out = indexed.convert("RGB")
    if out.getpixel((0, 0)) != NUIT:
        raise SystemExit(f"night drifted to {out.getpixel((0, 0))} for {size}")
    return indexed


def main() -> None:
    specs = json.loads(SCREENS.read_text())
    mask = lettermark_mask()
    OUT.mkdir(parents=True, exist_ok=True)
    seen: set[tuple[int, int]] = set()
    total = 0
    for spec in specs:
        size = pixels(spec)
        if size in seen:
            continue
        seen.add(size)
        path = OUT / f"apple-{size[0]}x{size[1]}.png"
        image = render(mask, size)
        image.save(path, format="PNG", optimize=True, compress_level=9)
        total += path.stat().st_size
        print(f"{path.name} {path.stat().st_size}")
    print(f"files {len(seen)} bytes {total}")


if __name__ == "__main__":
    main()
