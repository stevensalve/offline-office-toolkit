# PDF Fill & Sign

> Fill in PDF forms, type anywhere on a PDF, tick boxes and add your signature.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Complete and sign a PDF without printing it or uploading it to a signing service: type your details onto any PDF, fill its form boxes, tick checkboxes, add today's date and place a drawn or typed signature, then save a new copy. Your original file is never changed.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/pdf-fill-sign/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- pdf-fill-sign ../pdf-fill-sign-repo`.

## Features

- Page-by-page view with zoom; click where you want an item.
- **Text**, **date** (four formats) and **tick** items; drag them with the move handle, resize with Smaller/Larger, delete with the button or the Delete key.
- **Signature**: draw with mouse, finger or stylus, or type your name; choose black or blue ink; reuse it on any page.
- **Real form fields**: lists a PDF's own text boxes, checkboxes, dropdowns and radio groups so you can fill them in; optionally lock (flatten) them afterwards.
- Works on rotated and cropped pages (placement maths is unit-tested for all four rotations).

## How it works

You place things on a picture of the page that PDF.js draws. Each item is stored in _display points_ (origin top-left, as you see it). When you save, `displayToUser` converts those points into the PDF's own coordinate system, accounting for the page's visible box and rotation, and pdf-lib draws the text, tick lines and signature image onto a copy of the document. On-screen text and saved text share one baseline constant (`TEXT_BASELINE`), so they line up.

| File                 | Purpose                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                                       |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                       |
| `css/app.css`        | Styles for this tool only                                                                                        |
| `js/common.js`       | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                         |
| `js/core.js`         | Coordinate conversion between what you see and PDF space, drawing plans, form listing and `applyEdits` (pdf-lib) |
| `js/app.js`          | Viewer, overlay editor, signature pad, form panel (PDF.js draws the page)                                        |
| `vendor/`            | Bundled pdf-lib (MIT) and [PDF.js](https://github.com/mozilla/pdf.js) 3.11.174 (Apache-2.0)                      |
| `tests/core.test.js` | Rotation maths for all corners, filling real form PDFs, drawing on rotated pages                                 |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- An image of your signature is not a certified digital signature (no certificate or audit trail). Check what the recipient requires.
- The preview does not display values typed into the PDF's own form fields; they appear in the saved file.
- Password-protected PDFs and XFA (dynamic) forms are not supported.
- Text uses a standard font: English and Western European letters only.
- When opened directly from disk, PDF.js runs in the page instead of a background worker, so very large PDFs can feel slow. Hosting it (see docs/HOSTING.md) uses a worker.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/pdf-fill-sign/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js'); // needs `npm install pdf-lib`
const info = { x0: 0, y0: 0, width: 600, height: 800, rotation: 90 };
core.displayToUser(0, 0, info); // { x: 0, y: 0 } - top-left of a page shown rotated 90 degrees
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: pdf-lib (MIT), PDF.js 3.11.174 (Apache-2.0; run with `isEvalSupported: false` and a CSP that forbids eval).
