"""Inline the deck's screenshots as data URIs.

The artifact is a single self-contained page, so every image has to travel inside it.
Screenshots are resized to a sensible presentation width and re-encoded as JPEG, because
a raw 2MB PNG per slide would blow the page budget several times over.
"""
import base64
import io
import json
import pathlib
import sys

from PIL import Image

# Everything is sourced from shots/ — the committed, already-cropped set — so a rebuild
# works on any machine with the repo, not only the one that captured the screenshots.
HERE = pathlib.Path(__file__).parent
SHOTS = HERE / "shots"
APP = pathlib.Path(r"C:\APPS\WorkDiary")

# key -> (source file, max width, whether to trim uniform margins)
IMAGES = {
    "logo":        (APP / "public" / "agrotop-logo.png", 520, False),
    "login":       (SHOTS / "login.jpg", 1500, False),
    "gantt":       (SHOTS / "gantt.jpg", 1600, False),
    "gantt_hover": (SHOTS / "gantt_hover.jpg", 1500, False),
    "gantt_phone": (SHOTS / "gantt_phone.jpg", 460, False),
    "qc_gate":     (SHOTS / "qc_gate.jpg", 1400, False),
    "qc_log":      (SHOTS / "qc_log.jpg", 1400, False),
    "qc_summary":  (SHOTS / "qc_summary.jpg", 1400, False),
    "qc_open":     (SHOTS / "qc_open.jpg", 1400, False),
    "qc_report":   (SHOTS / "qc_report.jpg", 1200, False),
    "menu":        (SHOTS / "menu.jpg", 1500, False),
    "digest":      (SHOTS / "digest.jpg", 1500, True),
    "progress":    (SHOTS / "progress.jpg", 1500, True),
    "logbook":     (SHOTS / "logbook.jpg", 1500, True),
    "control":     (SHOTS / "control.jpg", 1500, True),
    # revision 2 — the drill-down / favourites / alerts update (2026-08-12)
    "cc_coop":     (SHOTS / "cc_coop.jpg", 1500, True),
    "cc_overdue":  (SHOTS / "cc_overdue.jpg", 1500, True),
    "qc_dash":     (SHOTS / "qc_dash.jpg", 1500, True),
    "coops_list":  (SHOTS / "coops_list.jpg", 1500, True),
    "alerts":      (SHOTS / "alerts.jpg", 1500, True),
}


def trim_white(im: Image.Image) -> Image.Image:
    """Drop uniform white padding the browser left around the captured content."""
    rgb = im.convert("RGB")
    bg = Image.new("RGB", rgb.size, (255, 255, 255))
    from PIL import ImageChops
    diff = ImageChops.difference(rgb, bg).convert("L")
    box = diff.getbbox()
    return im.crop(box) if box else im


def encode(path: pathlib.Path, max_w: int, trim: bool, transparent: bool) -> str:
    im = Image.open(path)
    if trim:
        im = trim_white(im)
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)

    buf = io.BytesIO()
    if transparent and im.mode in ("RGBA", "LA", "P"):
        im.convert("RGBA").save(buf, format="PNG", optimize=True)
        mime = "image/png"
    else:
        im.convert("RGB").save(buf, format="JPEG", quality=84, optimize=True, progressive=True)
        mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(buf.getvalue()).decode()}"


def main():
    template, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    html = template.read_text(encoding="utf-8")

    total = 0
    for key, (path, max_w, trim) in IMAGES.items():
        if not path.exists():
            print(f"  MISSING {key}: {path}")
            continue
        uri = encode(path, max_w, trim, transparent=(key == "logo"))
        total += len(uri)
        token = f"__IMG_{key}__"
        if token not in html:
            print(f"  unused {key}")
        html = html.replace(token, uri)
        print(f"  {key:12} {len(uri) // 1024:5} KB")

    leftovers = [t for t in html.split("__IMG_")[1:]]
    if leftovers:
        print("  UNRESOLVED tokens:", [t.split("__")[0] for t in leftovers])

    out.write_text(html, encoding="utf-8")
    size = len(html.encode("utf-8"))
    print(f"images {total // 1024} KB · page {size // 1024} KB "
          f"({'ok' if size < 15_500_000 else 'TOO BIG'})")


if __name__ == "__main__":
    main()
