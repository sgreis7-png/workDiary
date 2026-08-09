# מצגת היכרות לעובד

Onboarding deck for the work-diary system: what it does, how to use it, and why it
replaces the WhatsApp / Excel / MS Project / paper mix it grew out of. Twenty-one slides,
Hebrew, RTL.

## The files

| File | What it is |
|---|---|
| `אגרוטופ — היכרות עם המערכת.html` | **The deck.** Open it in a browser — double-click is enough. |
| `deck_template.html` | Its source, with `__IMG_<key>__` placeholders where the screenshots go. |
| `shots/` | The screenshots, already trimmed and sized. |
| `build_deck.py` | Inlines `shots/` into the template and writes the finished HTML. |
| `build_pptx.py` | Builds the same content as a `.pptx` from the same screenshots. |

The built HTML is committed as well as its source, because the people who need to read it
should not need Python to open it.

The `.pptx` is **not** committed — `.gitignore` excludes `*.pptx` repo-wide. Run
`build_pptx.py` when you want it.

## Why the deck is one self-contained file

Every screenshot is a `data:` URI and the logo is inline SVG, so the file has no external
references at all. It can be emailed, copied to a USB stick or opened with no network, and
it still renders. That is also why it is ~1.9MB.

## Presenting it

- Arrow keys or space move between slides, `Home` returns to the start
- `F11` for full screen
- `Ctrl+P` prints one slide per page — the print rules set a 13.333×7.5in page box, the
  same 16:9 as the slides, so nothing splits across two pages

## Rebuilding

```bash
pip install pillow python-pptx
python build_deck.py deck_template.html "אגרוטופ — היכרות עם המערכת.html"
python build_pptx.py
```

## Replacing a screenshot

Drop a new image over the matching name in `shots/` and rebuild. `build_deck.py` resizes
and re-encodes on the way in, so the source does not have to be the right size — but it
does have to be cropped to the content, because nothing here knows what to trim.

The current set came from the live system with the sidebar hidden and animations frozen —
framer-motion animates through inline styles, so a screenshot taken too early catches a
half-faded slide. To recapture, inject before shooting:

```css
.main *[style*="opacity"] { opacity: 1 !important; transform: none !important; }
.main * { animation: none !important; transition: none !important; }
.sidebar { display: none !important; }
.shell { grid-template-columns: 1fr !important; }
body { background: #fff !important; }
```

`menu.jpg` is the exception — the sidebar is the subject there, so leave it visible.

`gantt*.jpg` come from `/gantt-preview.html`, the dev harness, which renders the board from
a converted schedule with no login. See `src/gantt/preview.tsx`.

## Two known gaps

- **`logbook.jpg`** — the photo thumbnails are empty squares. They load lazily (see the
  scroll fix in `src/screens/Logbook.tsx`), and the capture beat them to it. Recapture with
  a wait on `img.complete`.
- **Real customer data.** The screenshots carry real project names, staff names and a full
  schedule. Fine internally; recapture against demo data before sending this outside the
  company.
