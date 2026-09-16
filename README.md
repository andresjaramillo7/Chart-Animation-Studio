# Chart Animation Studio

A local, standalone studio for building animated data charts and exporting them as
H.264 MP4 files for video editing.

This app is self-contained. It reads nothing but the CSV you paste or upload and writes
nothing but MP4 files into `outputs/`. Uploaded CSV files are read in the browser and
never modified.

**Templates:** Animated Bar · Animated Line · Comparison Chart · Big Number
**Formats:** 1920×1080 landscape and 1080×1920 portrait (Shorts), both 30 fps

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

## Exporting a video

1. `npm run dev`, open http://127.0.0.1:5173/.
2. Pick a **Chart type** and a **Preset**. Presets load their own template, copy, data
   and settings; switching preset or chart type clears settings the new template does
   not use.
3. Edit the title, subtitle and data — paste CSV or click **Upload CSV…**.
4. Choose a theme, or adjust the four colors by hand.
5. Set **Duration**, **Easing**, **Reveal** and **Final-frame hold**. The panel shows
   the exact frame count and video length before you export.
6. Choose a **Resolution**, type a filename, and click **Export MP4**. Progress is
   reported frame by frame.
7. The finished file appears in **`outputs/`** and its name is shown in the UI.

Existing files are never overwritten — a colliding name becomes `name-1.mp4`,
`name-2.mp4`, and so on.

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
src/templates/               the four templates: (spec, progress, canvas) -> option
src/shared/                  types, CSV validation, timeline, layout, formatting
src/presets/                 example data and copy, kept separate from the templates
server/                      Express + Vite middleware, export API, Playwright, FFmpeg
outputs/                     finished MP4 files
.cache/                      temporary frames (deleted on success) and failed-export artifacts
```

One Node process serves the editor, the render host and the `/api` routes on port 5173,
so Playwright always reaches the render page at a known URL. The browser never touches
the filesystem; all export work happens in the backend. The export pipeline only calls
`init(spec, width, height)` then `renderFrame(progress)`, so it is entirely
template-agnostic.

### Deterministic animation

Export frames never depend on wall-clock time or on ECharts' own animation, which is
disabled during export. For each frame the backend computes a timestamp from the frame
index, converts it to eased progress, asks the page to draw exactly that state, waits
for ECharts to report the canvas render complete plus a composited paint, then captures
the frame. Re-running an export produces the same video.

Every template is a pure function of `(spec, progress, canvas)`:

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

## Git

`node_modules/`, `.cache/` and everything in `outputs/` are ignored. Generated MP4 files
are not committed.
