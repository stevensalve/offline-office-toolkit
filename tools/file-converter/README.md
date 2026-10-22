# File Converter

> Convert between CSV, Excel and JSON, or turn plain text into a PDF.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Switch data between formats without a website: CSV to Excel, Excel to JSON for a developer colleague, JSON from an API to a spreadsheet, or a text file to PDF. A live preview shows exactly what will be saved.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/file-converter/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- file-converter ../file-converter-repo`.

## Features

- Reads CSV/TSV (delimiter auto-detected), JSON, `.xlsx` and `.xls`.
- Writes CSV, TSV, Excel (`.xlsx`) or JSON.
- JSON options: pretty print, and turn `"42"` / `"true"` into real numbers/booleans (IDs such as `007` stay text).
- Nested JSON is flattened to columns (`address.city`).
- Optional **formula-injection protection** for CSV (prefixes cells starting with `=`, `+`, `-`, `@`).
- **Text to PDF** with font, size and page choices, automatic wrapping and page breaks.

## How it works

Every conversion goes through one simple middle format - rows, an array of arrays whose first row is the column names. Reading a file produces rows; writing a file consumes rows. Adding a new format means writing one reader and one writer, not N x N converters. CSV parsing and writing are implemented in `core.js` (RFC 4180) so they are fully tested.

| File                 | Purpose                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                                        |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                        |
| `css/app.css`        | Styles for this tool only                                                                                         |
| `js/common.js`       | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                          |
| `js/core.js`         | Pure converters: `parseCsv`, `stringifyCsv`, `jsonToRows`, `rowsToObjects`, `inferValue`, `wrapLine`, `textToPdf` |
| `js/app.js`          | File type detection, preview, downloads                                                                           |
| `vendor/`            | Bundled SheetJS (Apache-2.0) and pdf-lib (MIT)                                                                    |
| `tests/core.test.js` | CSV edge cases (quotes, newlines, BOM), JSON flattening, PDF pagination                                           |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- Text to PDF uses standard PDF fonts: English and Western European letters only. Other scripts show as `?`, and the rupee sign is written `Rs.`.
- JSON must be a list of records or a single record.
- Arrays inside JSON are kept as JSON text in one cell.
- For Excel files with several sheets you convert one sheet at a time.
- CSV files are read as UTF-8.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/file-converter/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js'); // needs `npm install pdf-lib`
const rows = core.parseCsv('name,age\nAnn,30');
const objects = core.rowsToObjects(rows, { inferTypes: true }); // [{ name: 'Ann', age: 30 }]
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: SheetJS Community Edition 0.20.3 (Apache-2.0), pdf-lib (MIT).
