# Third-party licenses

## Fonts

Chart Animation Studio bundles two typefaces so that the editor preview and the
headless renderer resolve identical font files, with no network access and no
dependency on fonts installed on the machine. Both are distributed under the
SIL Open Font License, Version 1.1.

### Inter

- Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)
- Licensed under the SIL Open Font License, Version 1.1
- Obtained via the `@fontsource/inter` package, which repackages the upstream
  release without modifying the font binaries.
- Full license text: `node_modules/@fontsource/inter/LICENSE`

### IBM Plex Mono

- Copyright (c) 2017 IBM Corp. (https://github.com/IBM/plex)
- Licensed under the SIL Open Font License, Version 1.1
- Obtained via the `@fontsource/ibm-plex-mono` package, which repackages the
  upstream release without modifying the font binaries.
- Full license text: `node_modules/@fontsource/ibm-plex-mono/LICENSE`

The SIL Open Font License permits redistribution, embedding and use in any
project, including commercial work, provided the fonts are not sold on their own
and the copyright notice and license are retained. This file, together with the
LICENSE files in the packages above, retains those notices.

## Other dependencies

Apache ECharts (Apache-2.0), Playwright (Apache-2.0), Express (MIT), Papa Parse
(MIT), Vite (MIT), Vitest (MIT), and the bundled FFmpeg/FFprobe binaries
(`ffmpeg-static`, `ffprobe-static`; FFmpeg is LGPL/GPL depending on build) are
installed from npm and retain their own licenses in `node_modules`.
