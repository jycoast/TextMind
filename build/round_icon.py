"""Round the corners of the TextMind app icon.

Reads `build/appicon.png` and produces a version with transparent rounded
corners. Also generates the small frontend favicon and a multi-resolution
Windows ICO file.

Run from the project root:
    python build/round_icon.py
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PATH = os.path.join(PROJECT_ROOT, "build", "appicon.png")
OUT_APPICON = os.path.join(PROJECT_ROOT, "build", "appicon.png")
OUT_FRONTEND = os.path.join(
    PROJECT_ROOT, "frontend", "src", "assets", "TextMind-logo.png"
)
OUT_ICO = os.path.join(PROJECT_ROOT, "build", "windows", "icon.ico")

# Radius as a fraction of the icon size. macOS uses ~22.37% (squircle); a
# plain rounded rectangle around 18-22% looks balanced for app icons.
RADIUS_RATIO = 0.20

# Render the mask at a higher resolution then downscale for smoother edges.
SUPERSAMPLE = 4


def make_rounded_mask(size: int, radius: int) -> Image.Image:
    """Return an L-mode mask with a rounded square at full opacity."""
    big_size = size * SUPERSAMPLE
    big_radius = radius * SUPERSAMPLE
    mask = Image.new("L", (big_size, big_size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, big_size - 1, big_size - 1),
        radius=big_radius,
        fill=255,
    )
    return mask.resize((size, size), Image.LANCZOS).filter(
        ImageFilter.SMOOTH
    )


def round_corners(src: Image.Image) -> Image.Image:
    src = src.convert("RGBA")
    size = min(src.size)
    if src.size != (size, size):
        # Center-crop to a square if the source isn't already square.
        left = (src.width - size) // 2
        top = (src.height - size) // 2
        src = src.crop((left, top, left + size, top + size))

    radius = int(round(size * RADIUS_RATIO))
    mask = make_rounded_mask(size, radius)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(src, (0, 0), mask)
    return out


def save_ico(img: Image.Image, path: str) -> None:
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(path, format="ICO", sizes=sizes)


def main() -> None:
    src = Image.open(SRC_PATH)
    rounded = round_corners(src)

    rounded.save(OUT_APPICON, format="PNG")
    print(f"Wrote {OUT_APPICON}  ({rounded.size[0]}x{rounded.size[1]})")

    favicon = rounded.resize((64, 64), Image.LANCZOS)
    favicon.save(OUT_FRONTEND, format="PNG")
    print(f"Wrote {OUT_FRONTEND}  ({favicon.size[0]}x{favicon.size[1]})")

    save_ico(rounded, OUT_ICO)
    print(f"Wrote {OUT_ICO}")


if __name__ == "__main__":
    main()
