# Chart Animation Studio

A local, standalone studio for building animated data charts and exporting them as
H.264 MP4 files for video editing.

This app is self-contained. It reads nothing but the CSV and background images you give
it, and writes nothing outside `outputs/` and its own `.cache/`. Uploaded CSV files are
read in the browser and never modified.

**Templates:** Animated Bar · Animated Line · Comparison Chart · Big Number
**Resolutions:** 1920×1080 landscape and 1080×1920 portrait (Shorts), both 30 fps
**Formats:** MP4 (H.264) · PNG (final frame) · PNG sequence (every frame, RGBA)
**Backgrounds:** solid color · uploaded image (cover/contain) · transparent

---

## Requirements

| | |
|---|---|
| Node.js | 18 or newer (developed on 22) |
| Chromium | installed via Playwright, see below |
| FFmpeg | a system install is used if present; otherwise the bundled `ffmpeg-static` binary is used automatically |

No database, no accounts, no cloud services.

## Installation (PowerShell)

```powershell
npm install
npx playwright install chromium
npm run dev
```

Then open **http://127.0.0.1:5173/**.

`npm install` also installs `ffmpeg-static`, so exporting works immediately with no
extra setup. If you prefer a real system FFmpeg — recommended if you already use it
elsewhere — install it once and it takes priority automatically:

```powershell
winget install --id Gyan.FFmpeg -e
```

Close and reopen PowerShell afterwards so `ffmpeg` is on `PATH`. To point at a specific
binary instead, set `FFMPEG_PATH`:

```powershell
$env:FFMPEG_PATH = "C:\tools\ffmpeg\bin\ffmpeg.exe"
npm run dev
```

Resolution order is `FFMPEG_PATH` → `PATH` → bundled `ffmpeg-static`. Visit
http://127.0.0.1:5173/api/health to see which one was picked.

## Exporting

1. `npm run dev`, open http://127.0.0.1:5173/.
2. Pick a **Chart type** and a **Preset**. Presets load their own template, copy, data
   and settings; switching preset or chart type clears settings the new template does
   not use.
3. Edit the title, subtitle and data — paste CSV or click **Upload CSV…**.
4. Choose a theme, or adjust the four colors by hand.
5. Set **Duration**, **Easing**, **Reveal** and **Final-frame hold**. The panel shows
   the exact frame count and video length before you export.
6. Set the **Composition**: background mode, and which elements are drawn.
7. Choose a **Resolution** and **Format**, type a filename, and click Export. Progress is
   reported frame by frame.
8. The finished file appears in **`outputs/`** and its name is shown in the UI.

Existing files are never overwritten — a colliding name becomes `name-1.mp4`,
`name-2.mp4`, and so on. The same applies to PNG files and to PNG sequence directories
(`name-frames`, `name-frames-1`, …).

### Export formats

| Format | Output | Alpha |
|---|---|---|
| MP4 video | `outputs/name.mp4` — H.264, yuv420p, 30 fps | no |
| PNG — final frame | `outputs/name.png` at the selected resolution | yes |
| PNG sequence | `outputs/name-frames/frame_000000.png` … one per timeline frame, hold included | yes |

A PNG sequence is written as a clearly named directory rather than a ZIP, so the frames
can be dropped straight into an editor. An exported sequence is never deleted by the
app; only the scratch directory under `.cache/` is cleaned up.

### Backgrounds and transparency

Three background modes, all available to every template:

- **Solid color** — the theme background (the original behavior).
- **Image** — upload a PNG or JPG. **Cover** fills the frame and crops the overflow;
  **Contain** fits the whole image inside and fills the letterbox with the theme color.
  Neither ever stretches the image. The file is validated by its magic bytes on the
  backend, stored under a server-generated id in `.cache/backgrounds/`, and served back
  over `/api/backgrounds/:id`; the browser never picks a path. Frames are captured only
  after the image has finished decoding.
- **Transparent** — the page, the composition layer and the ECharts canvas are all
  transparent and Playwright captures with `omitBackground`, so the exported pixels are
  genuinely RGBA with alpha 0 outside the chart.

The editor draws a checkerboard behind a transparent composition. It lives only in the
editor page — the render host has no checkerboard at all, so it cannot reach an export.

**Transparency and MP4 do not mix.** H.264 with yuv420p has no alpha channel, so
selecting MP4 with a transparent background is refused, in the editor and again on the
server, with an explanation pointing at PNG / PNG sequence or an opaque background. No
ProRes or other alpha-capable codec is implemented in this milestone.

### Composition controls

Title, subtitle, axis labels, axes, gridlines, legend and value labels can each be
switched off independently. Only the controls a template actually uses are shown: Big
Number offers title and subtitle only, and no current template draws a legend, so that
control never appears.

**Chart Only** hides the title, subtitle and gridlines while keeping the axes, tick
labels and value read-outs. Nothing is cropped — when the titling is hidden the header
collapses to a plain top margin and the plot expands into the freed space. Chart Only
and transparent mode compose freely.

Composition settings are independent of the chart: changing preset, template, dataset or
animation settings leaves the background and visibility untouched.

### Presets

| Preset | Template | Data |
|---|---|---|
| Comeback Curve | Animated Bar (works with Animated Line too) | Comeback rate by gold deficit, 7 buckets |
| Scaling Comparison | Comparison Chart | Comeback rate by champion scaling, 3 categories |
| Scaling Comparison — 0–3k | Comparison Chart | Same, restricted to a 0–3,000 gold deficit |
| Big Numbers | Big Number | Three individually selectable variants (A, B, C) |

## Running tests

```powershell
npm test
```

```powershell
npm run typecheck
```

## How it works

```
index.html   + src/ui/        the editor and live preview
render.html  + src/render/    headless render host Playwright drives
src/templates/               the four templates: (spec, progress, canvas, composition) -> option
src/shared/                  types, CSV validation, timeline, layout, formatting
src/presets/                 example data and copy, kept separate from the templates
server/                      Express + Vite middleware, export API, Playwright, FFmpeg, uploads
outputs/                     finished MP4 / PNG files and PNG sequence directories
.cache/                      scratch frames (deleted on success), failed-export artifacts,
                             and uploaded background images
```

One Node process serves the editor, the render host and the `/api` routes on port 5173,
so Playwright always reaches the render page at a known URL. The browser never touches
the filesystem; all export work happens in the backend. The export pipeline only calls
`init(spec, width, height, composition)` then `renderFrame(progress)`, so it is entirely
template-agnostic and every composition setting applies to all four templates.

### Deterministic animation

Export frames never depend on wall-clock time or on ECharts' own animation, which is
disabled during export. For each frame the backend computes a timestamp from the frame
index, converts it to eased progress, asks the page to draw exactly that state, waits
for ECharts to report the canvas render complete plus a composited paint, then captures
the frame. Re-running an export produces the same video.

Every template is a pure function of `(spec, progress, canvas, composition)`:

- **Animated Bar** interpolates each bar from zero to its value.
- **Animated Line** advances a drawing head along the category index, revealing whole
  points and interpolating the one partially drawn segment. It is a genuinely shorter
  polyline each frame, not a fade-in.
- **Comparison Chart** works like the bar chart with an outsized read-out.
- **Big Number** computes the displayed value directly from progress.

### Sequential reveal

Animated Bar and Comparison Chart can reveal categories one after another. Item `i` of
`n` animates over the window `[i·s·w, i·s·w + w]` where `w = 1 / (1 + (n−1)·s)` and
`s = 0.35`. The windows come from the global timeline, so there are no real-time delays:
every item is at zero on the first frame and at exactly its final value on the last.

### Frame-count rule

```
animationFrames = round(durationSeconds × fps)
holdFrames      = max(1, round(holdSeconds × fps))
totalFrames     = animationFrames + holdFrames
videoDuration   = totalFrames / fps
```

Frame `i` shows the chart at timestamp `i / fps`, so frame 0 is always the zero state
and every frame from `animationFrames` onward is the completed chart. Fractional
durations are rounded to the nearest whole frame, and the exported duration always
matches the resulting frame count. The hold is clamped to at least one frame so the last
frame is always the finished composition.

A 3-second animation with a 1-second hold at 30 fps gives 90 + 30 = **120 frames**,
a **4.000 s** video.

### Landscape and portrait

Portrait is a recomposition, not a crop: larger type, tighter side margins, more
vertical room for the plot, and titles wrapped to the narrower frame. Category labels
shrink and then rotate when they would collide, so nothing is clipped in either format.
Horizontal bars usually read best in portrait.

### Data validation

The CSV needs a `category,value` header. Rows are rejected — with a line number — for a
missing category or value, a non-numeric value, or a duplicate category. Category order
is always the source order; nothing is sorted. The Comparison Chart additionally
requires exactly two or three categories, and Animated Line requires at least two.

**Percentage** mode pins the value axis to 0–100 so differences are not visually
exaggerated, suffixes labels with `%`, and rejects values outside 0–100. **Number** mode
places no such restriction and auto-scales the axis from zero. Big Number takes a
numeric value, decimal precision, prefix and suffix directly — no placeholder CSV rows.

### Themes

Dark Minimal (default), Dark Blue and Light Minimal. Each defines a background,
primary, accent, text and gridline color, applied identically across all four
templates in both the preview and the exported video. The four main colors stay
editable by hand after picking a theme.

## Troubleshooting

**`Executable doesn't exist` / "The Playwright Chromium browser is not installed"**
```powershell
npx playwright install chromium
```

**"FFmpeg was not found"**
Install it with `winget install --id Gyan.FFmpeg -e` and restart PowerShell, or set
`$env:FFMPEG_PATH` to the full path of `ffmpeg.exe`. Check
http://127.0.0.1:5173/api/health to confirm what the server resolved.

**Port 5173 is in use**
```powershell
$env:PORT = "5180"
npm run dev
```

**An export failed**
Frames from the failed job are kept under `.cache/failed/<job-id>/` for inspection and
are deliberately never placed in `outputs/`. The UI shows the underlying error. Delete
the whole `.cache/` directory at any time; it is regenerated as needed.

**"Comparison Chart requires between 2 and 3 categories"**
That template is deliberately limited. Use Animated Bar for longer datasets.

**"MP4 … cannot be exported as MP4" with a transparent background**
Pick PNG or PNG sequence, or set the background to a solid color or an image.

**"Only PNG and JPG background images are supported"**
The upload is checked by its actual file signature, not its name or extension. Re-save
the image as a real PNG or JPG (16 MB limit).

## Git

`node_modules/`, `.cache/` and everything in `outputs/` are ignored. Generated videos,
PNGs, PNG sequences and uploaded background images are not committed.
