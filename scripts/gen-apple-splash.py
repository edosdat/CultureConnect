#!/usr/bin/env python3
"""Cream full-bleed startup images with the LOCK v3 violet C centered.

Reads src/lib/appleSplashScreens.json and writes public/splash/apple-{w}x{h}.png.
Phone screens are portrait. iPad screens include landscape (upright C).
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "plan-c-icon-LOCK-v3-violet.jpg"
SCREENS = ROOT / "src" / "lib" / "appleSplashScreens.json"
OUT = ROOT / "public" / "splash"
CREAM = (247, 240, 232)  # #F7F0E8
# Core of the LOCK v3 letter, also used by the inline shell stroke.
VIOLET = (175, 125, 222)  # #AF7DDE


def is_violet(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return b > r + 8 and b > 150


def lettermark_mask() -> Image.Image:
    """L mask of the LOCK v3 C. Flat violet keeps the PNGs small."""
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
    canvas = Image.new("RGB", size, CREAM)
    short = min(width, height)
    target_h = min(int(short * 0.34), 560)
    target_h = max(target_h, 180)
    scale = target_h / mask.height
    target_w = max(1, int(mask.width * scale))
    resized = mask.resize((target_w, target_h), Image.Resampling.LANCZOS)
    src = resized.load()
    dst = canvas.load()
    ox = (width - target_w) // 2
    oy = (height - target_h) // 2
    for y in range(target_h):
        for x in range(target_w):
            alpha = src[x, y]
            if not alpha:
                continue
            t = alpha / 255
            dst[ox + x, oy + y] = tuple(
                int(CREAM[i] * (1 - t) + VIOLET[i] * t) for i in range(3)
            )
    # 8-color palette: cream stays exact, the edge stays smooth, files stay small.
    indexed = canvas.quantize(colors=8, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    rgb = indexed.convert("RGB")
    if rgb.getpixel((0, 0)) != CREAM:
        raise SystemExit(f"cream drifted to {rgb.getpixel((0, 0))} for {size}")
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
