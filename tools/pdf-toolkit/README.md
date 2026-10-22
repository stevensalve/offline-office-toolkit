# PDF Toolkit

> Merge, split, rotate, extract and delete PDF pages - privately, in your browser.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Everyday PDF jobs without uploading a confidential document to a website: join several PDFs into one, keep only some pages, remove pages, turn pages the right way up, or cut a long PDF into smaller files. It is aimed at office staff who currently use sites such as iLovePDF or Smallpdf.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/pdf-toolkit/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- pdf-toolkit ../pdf-toolkit-repo`.

## Features

- **Merge** two or more PDFs, in any order you set with the up/down buttons.
- **Extract or re-order** pages using simple ranges: `1-3, 5, 8-` keeps those pages; `3,1,2` puts page 3 first.
- **Delete pages** you do not want (`2, 4-6`).
- **Rotate** all pages or just some, by 90, 180 or 270 degrees.
- **Split** a PDF into files of N pages each (for example one file per page).
- Friendly messages for damaged or password-protected files.

## How it works

Files are read with the browser's `FileReader`, handed to pdf-lib as bytes, and the result is offered as a download through a temporary `blob:` link. Page selections such as `1-3, 5, 8-` are parsed by `parsePageSpec`, which returns 0-based page indexes (keeping order and duplicates, which is what makes re-ordering work) and throws a plain-language error for anything invalid.

| File                    | Purpose                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`            | Page structure and the Content-Security-Policy (blocks all network access)                                                     |
| `css/theme.css`         | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                                     |
| `css/app.css`           | Styles for this tool only                                                                                                      |
| `js/common.js`          | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                                       |
| `js/core.js`            | Pure PDF operations built on pdf-lib: `parsePageSpec`, `mergePdfs`, `extractPages`, `deletePages`, `rotatePages`, `splitEvery` |
| `js/app.js`             | Tabs, file lists, buttons and downloads                                                                                        |
| `vendor/pdf-lib.min.js` | Bundled copy of [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT)                                                            |
| `tests/core.test.js`    | Builds small PDFs in memory and checks every operation                                                                         |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- Password-protected PDFs are refused with a clear message (remove the password first).
- No compression - output size is about the same as the input.
- Very large PDFs are limited by your browser's memory.
- Splitting triggers several downloads; your browser may ask permission, and the tool caps a single split at 50 files.
- No page thumbnails (use the page numbers shown in your PDF viewer).

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/pdf-toolkit/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js'); // needs `npm install pdf-lib`
const indexes = core.parsePageSpec('1-3, 5', 10); // [0, 1, 2, 4]
const bytes = await core.extractPages(pdfBytes, indexes);
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: pdf-lib (MIT).
