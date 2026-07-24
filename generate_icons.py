"""
Unravel — PWA icon generator

Draws a single master icon in code (no external image assets) using the
app's existing brand palette, then downsamples it into every icon size a
modern PWA + favicon setup needs. Re-run this script any time the design
needs tweaking — everything is parametric (colors, grid size, offset/rotation
of the "escaping" cube) rather than baked into a fixed image file.

Brand concept: a 3x3 grid of cubes (echoing the app's cube-grid picture),
with one cube knocked loose and rendered in the app's single accent color —
a literal, instantly-readable miniature of "Unravel" even at 16px.
"""

from PIL import Image, ImageDraw
import os

# ---- Brand palette (matches globals.css :root variables) ----
INK = (26, 26, 26, 255)        # --ink, used as the icon's background fill
OFFWHITE = (247, 246, 242, 255)  # --bg, used for the resting cubes
ACCENT = (255, 59, 48, 255)      # --accent, used for the one "loose" cube

MASTER_SIZE = 1024
OUT_DIR = "/home/claude/icons"
os.makedirs(OUT_DIR, exist_ok=True)


def draw_master(padding_scale: float = 1.0) -> Image.Image:
    """
    Draws the master icon at MASTER_SIZE x MASTER_SIZE.
    padding_scale < 1.0 shrinks the cube grid toward the center (used for
    maskable icons, which need extra safe-zone padding since OS icon shapes
    crop toward a circle/rounded-square and would otherwise clip content).
    """
    img = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), INK)
    draw = ImageDraw.Draw(img)

    cell = int(200 * padding_scale)
    gap = int(40 * padding_scale)
    radius = int(28 * padding_scale)
    grid_w = cell * 3 + gap * 2
    start_x = (MASTER_SIZE - grid_w) // 2
    start_y = (MASTER_SIZE - grid_w) // 2

    loose_row, loose_col = 2, 2  # bottom-right cube is the one that "escaped"

    for row in range(3):
        for col in range(3):
            x0 = start_x + col * (cell + gap)
            y0 = start_y + row * (cell + gap)
            x1, y1 = x0 + cell, y0 + cell

            if (row, col) == (loose_row, loose_col):
                continue  # drawn separately below, offset + rotated
            draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=OFFWHITE)

    # The "loose" cube: drawn on its own transparent layer so it can be
    # rotated cleanly, then offset outward (down-right) from its grid slot
    # and composited on top — this is the visual echo of the app's core
    # interaction (a cube knocked out of formation).
    loose_layer = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    loose_draw = ImageDraw.Draw(loose_layer)
    lx0 = start_x + loose_col * (cell + gap)
    ly0 = start_y + loose_row * (cell + gap)
    loose_draw.rounded_rectangle(
        [lx0, ly0, lx0 + cell, ly0 + cell], radius=radius, fill=ACCENT
    )
    rotated = loose_layer.rotate(-14, resample=Image.BICUBIC, center=(lx0 + cell / 2, ly0 + cell / 2))

    offset = int(46 * padding_scale)
    shifted = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    shifted.paste(rotated, (offset, offset), rotated)

    img = Image.alpha_composite(img, shifted)
    return img


def save_png(img: Image.Image, size: int, path: str):
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(path, format="PNG")
    print(f"  wrote {path} ({size}x{size})")


def main():
    print("Rendering master icon (standard, edge-to-edge)...")
    master_standard = draw_master(padding_scale=1.0)

    print("Rendering master icon (maskable safe-zone padded)...")
    master_maskable = draw_master(padding_scale=0.62)

    # --- Standard "any" purpose icons (manifest.json + general use) ---
    standard_sizes = [512, 384, 192, 152, 144, 128, 96, 72]
    print("\nStandard icons:")
    for s in standard_sizes:
        save_png(master_standard, s, f"{OUT_DIR}/icon-{s}.png")

    # --- Maskable icons (Android adaptive icon safe zone) ---
    print("\nMaskable icons:")
    for s in [512, 192]:
        save_png(master_maskable, s, f"{OUT_DIR}/icon-{s}-maskable.png")

    # --- Apple touch icon (iOS applies its own rounding automatically) ---
    print("\nApple touch icon:")
    save_png(master_standard, 180, f"{OUT_DIR}/apple-touch-icon.png")

    # --- Favicons ---
    print("\nFavicons:")
    save_png(master_standard, 16, f"{OUT_DIR}/favicon-16x16.png")
    save_png(master_standard, 32, f"{OUT_DIR}/favicon-32x32.png")
    save_png(master_standard, 48, f"{OUT_DIR}/favicon-48x48.png")

    ico_path = f"{OUT_DIR}/favicon.ico"
    master_standard.resize((256, 256), Image.LANCZOS).save(
        ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f"  wrote {ico_path} (multi-size .ico)")

    # --- Reference full-res master, in case the design needs further edits ---
    master_standard.save(f"{OUT_DIR}/icon-master-1024.png", format="PNG")
    print(f"\n  wrote {OUT_DIR}/icon-master-1024.png (reference/edit source)")

    print("\nDone.")


if __name__ == "__main__":
    main()
