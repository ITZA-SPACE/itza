# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow>=11", "httpx>=0.28", "fonttools>=4.55", "brotli>=1.1", "pyyaml>=6"]
# ///
"""Draws apps/web/public/og.jpg (1200 x 630), the link-preview image.

Everything is drawn here except the field photo: USGS National Map orthoimagery (public domain) of
the Akron proof field, with its outline from pipelines/hero_fields.yaml. Fonts are the app's own
DM Sans and Familjen Grotesk (SIL Open Font License), read from node_modules.

    uv run apps/web/scripts/make_og_image.py
"""

from __future__ import annotations

import io
import math
import os
import random
import tempfile
from pathlib import Path

import httpx
import yaml
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(os.environ.get("OG_OUT", ROOT / "apps/web/public/og.jpg"))
FIELDS = Path(os.environ.get("HERO_FIELDS", ROOT / "pipelines/hero_fields.yaml"))
W, H = 1200, 630
BG = (4, 10, 28)
INK = (243, 247, 255)
MUTED = (168, 184, 216)
ACCENT = (127, 208, 255)
GOOD = (52, 224, 161)
USGS = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"
FIELD = "akron-proof-2"

GLYPHS = {
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "...#.", "...#.", "..#..", ".#...", ".#...", "#####"],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
}


def font(name: str, size: int, weight: int) -> ImageFont.FreeTypeFont:
    """The app's variable font at a weight, converted from the fontsource WOFF2."""
    src = next((ROOT / "node_modules/.pnpm").glob(f"@fontsource-variable+{name}@*"))
    woff2 = (
        src
        / f"node_modules/@fontsource-variable/{name}/files/{name}-latin-wght-normal.woff2"
    )
    ttf = Path(tempfile.gettempdir()) / f"itza-{name}.ttf"
    if not ttf.exists():
        f = TTFont(woff2)
        f.flavor = None
        f.save(ttf)
    face = ImageFont.truetype(str(ttf), size)
    face.set_variation_by_axes([weight])
    return face


def stars(img: Image.Image, seed: int = 7) -> None:
    rnd = random.Random(seed)
    layer = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(layer)
    for _ in range(420):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H * 0.78) ** 1.08 / (H * 0.78) ** 0.08
        r = rnd.choice((0.6, 0.8, 1.0, 1.0, 1.4, 1.8))
        a = int(rnd.uniform(60, 230) * (1 - y / H * 0.7))
        d.ellipse((x - r, y - r, x + r, y + r), fill=(220, 232, 255, a))
    img.alpha_composite(layer)


def earth(img: Image.Image) -> None:
    """A dark planet made of dots, its limb lit by a thin atmosphere and a sunrise glow."""
    cx, cy, radius = W * 0.5, 1560.0, 1050.0
    body = Image.new("RGBA", img.size)
    ImageDraw.Draw(body).ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius), fill=(6, 18, 52, 255)
    )
    img.alpha_composite(body)
    dots = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(dots)
    step = 9
    for y in range(int(cy - radius), H + step, step):
        for x in range(0, W + step, step):
            dist = math.hypot(x - cx, y - cy)
            if dist > radius - 4:
                continue
            depth = (radius - dist) / 160
            a = int(max(0.0, 150 - depth * 70))
            if a > 8:
                d.ellipse((x - 1.4, y - 1.4, x + 1.4, y + 1.4), fill=(90, 150, 255, a))
    img.alpha_composite(dots)
    for width, blur, colour in (
        (110, 70, (30, 100, 255, 150)),
        (26, 18, (90, 180, 255, 230)),
        (5, 2, (215, 242, 255, 255)),
    ):
        ring = Image.new("RGBA", img.size)
        ImageDraw.Draw(ring).ellipse(
            (cx - radius, cy - radius, cx + radius, cy + radius),
            outline=colour,
            width=width,
        )
        img.alpha_composite(ring.filter(ImageFilter.GaussianBlur(blur)))
    sun = Image.new("RGBA", img.size)
    ImageDraw.Draw(sun).ellipse(
        (cx - 330, cy - radius - 80, cx + 330, cy - radius + 80),
        fill=(175, 228, 255, 190),
    )
    img.alpha_composite(sun.filter(ImageFilter.GaussianBlur(48)))


def wordmark(img: Image.Image, x: float, y: float, dot: float) -> float:
    d = ImageDraw.Draw(img)
    pitch = dot * 1.32
    for letter in "ITZA":
        for row, line in enumerate(GLYPHS[letter]):
            for col, cell in enumerate(line):
                if cell == "#":
                    px, py = x + col * pitch, y + row * pitch
                    d.ellipse((px, py, px + dot, py + dot), fill=INK)
        x += 6.2 * pitch
    return x


def tile_xy(lon: float, lat: float, z: int) -> tuple[float, float]:
    n = 2**z
    return (lon + 180) / 360 * n * 256, (
        1 - math.asinh(math.tan(math.radians(lat))) / math.pi
    ) / 2 * n * 256


def field_card(size: tuple[int, int]) -> Image.Image:
    """The Akron proof field on USGS orthoimagery, cropped around its real outline."""
    fields = yaml.safe_load(FIELDS.read_text())["fields"]
    ring = next(f for f in fields if f["id"] == FIELD)["geometry"]["coordinates"][0]
    z = 16
    pts = [tile_xy(lon, lat, z) for lon, lat in ring]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.55
    half_w = span * size[0] / max(size) / 2 * (size[0] / size[1]) ** 0.0
    half_h = half_w * size[1] / size[0]
    if half_h < (max(ys) - min(ys)) * 0.75:
        half_h = (max(ys) - min(ys)) * 0.75
        half_w = half_h * size[0] / size[1]
    x0, y0, x1, y1 = cx - half_w, cy - half_h, cx + half_w, cy + half_h
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    mosaic = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    with httpx.Client(timeout=60) as client:
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                r = client.get(USGS.format(z=z, x=tx, y=ty))
                r.raise_for_status()
                mosaic.paste(
                    Image.open(io.BytesIO(r.content)).convert("RGB"),
                    ((tx - tx0) * 256, (ty - ty0) * 256),
                )
    crop = mosaic.crop(
        (
            int(x0 - tx0 * 256),
            int(y0 - ty0 * 256),
            int(x1 - tx0 * 256),
            int(y1 - ty0 * 256),
        )
    )
    scale = size[0] / crop.width
    crop = crop.resize(size, Image.LANCZOS).convert("RGBA")
    shade = Image.new("RGBA", size, (4, 10, 28, 70))
    crop.alpha_composite(shade)
    d = ImageDraw.Draw(crop)
    outline = [((px - x0) * scale, (py - y0) * scale) for px, py in pts]
    glow = Image.new("RGBA", size)
    ImageDraw.Draw(glow).line(outline, fill=(*GOOD, 200), width=10, joint="curve")
    crop.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6)))
    d.line(outline, fill=(*GOOD, 255), width=4, joint="curve")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1), radius=22, fill=255
    )
    card = Image.new("RGBA", size)
    card.paste(crop, (0, 0), mask)
    ImageDraw.Draw(card).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1),
        radius=22,
        outline=(255, 255, 255, 70),
        width=2,
    )
    return card


def main() -> None:
    img = Image.new("RGBA", (W, H), (*BG, 255))
    stars(img)
    earth(img)
    d = ImageDraw.Draw(img)

    wordmark(img, 72, 74, 10)
    title = font("familjen-grotesk", 58, 700)
    d.text((70, 186), "A flight simulator", font=title, fill=INK)
    d.text((70, 252), "for crop rotations", font=title, fill=INK)
    body = font("dm-sans", 25, 450)
    for i, line in enumerate(
        (
            "Replay every real season on your field",
            "with NASA satellite data. See which rotation",
            "holds up, today and in a 2050 climate.",
        )
    ):
        d.text((72, 344 + i * 35), line, font=body, fill=MUTED)

    card = field_card((410, 300))
    shadow = Image.new("RGBA", img.size)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (722, 112, 722 + 410, 112 + 300), radius=22, fill=(0, 0, 0, 160)
    )
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
    img.alpha_composite(card, (716, 96))
    small = font("dm-sans", 19, 600)
    chip = "Real field · Akron, Colorado"
    tw = d.textlength(chip, font=small)
    d.rounded_rectangle(
        (732, 112, 732 + tw + 26, 112 + 34), radius=17, fill=(4, 10, 28, 210)
    )
    d.text((745, 118), chip, font=small, fill=INK)

    swatches = (
        (37, 79, 160),
        (67, 125, 191),
        (166, 201, 223),
        (240, 240, 240),
        (243, 178, 122),
        (226, 122, 63),
        (156, 51, 22),
    )
    label = font("dm-sans", 17, 500)
    d.text((716, 420), "Past seasons, coolest to hottest", font=label, fill=MUTED)
    for i, colour in enumerate(swatches):
        x = 716 + i * 59
        d.rounded_rectangle((x, 448, x + 53, 468), radius=5, fill=colour)

    foot = font("dm-sans", 19, 500)
    x = 72.0
    for i, (text, colour) in enumerate(
        (
            ("itza.microclub.info", INK),
            ("NASA Space Apps 2026", MUTED),
            ("Field Shift", MUTED),
        )
    ):
        if i:
            d.text((x, 572), "·", font=foot, fill=MUTED)
            x += d.textlength("·", font=foot) + 14
        d.text((x, 572), text, font=foot, fill=colour)
        x += d.textlength(text, font=foot) + 14

    img.convert("RGB").save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
