# Image Tools

> Compress, resize, crop and convert photos, or combine them into a PDF.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Shrink phone photos before e-mailing them, make a square profile picture, convert PNG to JPEG, or put scanned pages into one PDF - without sending your pictures to a third-party site. Resizing and re-encoding also removes hidden camera data such as GPS location (EXIF), which is a privacy bonus.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/image-tools/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- image-tools ../image-tools-repo`.

## Features

- Add many images at once (drag and drop or choose).
- **Resize**: keep size, shrink to fit inside a maximum width/height (never enlarges), or scale by percent.
- **Centre-crop** to 1:1, 4:3, 3:2, 16:9, 3:4 or 9:16.
- **Convert** to JPEG, PNG or WebP, with a quality slider for JPEG/WebP.
- Shows size before and after, and the percentage saved.
- **Create a PDF** from the results (A4, US Letter or same-as-image page size, with margins).

## How it works

Each image is decoded with `createImageBitmap`, cropped and scaled onto a `<canvas>`, and re-encoded with `canvas.toBlob`. All the maths (target size, crop rectangle, page placement) is in `core.js` so it can be tested without a browser. JPEG output is drawn on a white background because JPEG has no transparency.

| File                    | Purpose                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `index.html`            | Page structure and the Content-Security-Policy (blocks all network access)                                               |
| `css/theme.css`         | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                               |
| `css/app.css`           | Styles for this tool only                                                                                                |
| `js/common.js`          | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                                 |
| `js/core.js`            | Pure logic: `computeTargetSize`, `cropRect`, `fitImageOnPage`, `resolveMime`, naming helpers and `imagesToPdf` (pdf-lib) |
| `js/app.js`             | Canvas processing (decode, crop, scale, encode) and the page                                                             |
| `vendor/pdf-lib.min.js` | Bundled [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) for PDF export                                               |
| `tests/core.test.js`    | Maths, naming and PDF export tests                                                                                       |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- Input: JPG, PNG and WebP only (no HEIC, GIF or SVG).
- Some browsers (notably Safari) cannot encode WebP and silently produce PNG instead; the tool then names the file honestly (`.png`).
- Extremely large images can exceed the browser's canvas limits (roughly 16,000 px on a side).
- Cropping is centred with fixed ratios (no manual crop box yet).
- PDF export embeds JPEG and PNG; WebP results are converted to JPEG first.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/image-tools/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js');
core.computeTargetSize(4000, 3000, { mode: 'max', maxWidth: 1000, maxHeight: 1000 }); // { width: 1000, height: 750 }
core.cropRect(400, 300, [1, 1]); // { x: 50, y: 0, width: 300, height: 300 }
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: pdf-lib (MIT).
