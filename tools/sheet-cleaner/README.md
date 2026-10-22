# Sheet Cleaner

> Clean up Excel and CSV data, remove duplicates, compare two sheets and look up values.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Tidy messy exports in a few clicks instead of fiddling with formulas: trim stray spaces, delete blank rows, remove duplicates, fix capitalisation, split "Last, First" into two columns, find and replace, sort. A second mode compares two lists (what was added, removed or changed) and brings columns across from one sheet to another like VLOOKUP.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/sheet-cleaner/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- sheet-cleaner ../sheet-cleaner-repo`.

## Features

- Opens `.xlsx`, `.xls`, `.csv` and `.tsv`; pick the sheet to work on.
- **Quick clean**: trim spaces, squeeze double spaces, remove empty rows, remove duplicate rows.
- **Column tools**: UPPER/lower/Title case, split at a character, find and replace, remove rows with a repeated value, sort, delete column.
- **Undo** every step, see a plain-English log of what changed, or start over.
- **Compare** two sheets by a key column: only in A, only in B, changed values - downloadable as one Excel report.
- **Look up**: add chosen columns from sheet B to sheet A by matching a key.
- Download as Excel or CSV (CSV includes a BOM so accents open correctly in Excel).

## How it works

SheetJS is used only at the edges to read and write files. In the middle, the data is a plain `{ headers, rows }` object and every operation returns a new object. That design makes the logic easy to test and makes Undo trivial: the app just keeps the previous table.

| File                      | Purpose                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`              | Page structure and the Content-Security-Policy (blocks all network access)                                                                                                     |
| `css/theme.css`           | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                                                                                     |
| `css/app.css`             | Styles for this tool only                                                                                                                                                      |
| `js/common.js`            | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                                                                                       |
| `js/core.js`              | Pure table functions (`trimCells`, `removeDuplicates`, `splitColumn`, `compareTables`, `lookupMerge`, ...). A table is `{ headers, rows }`; functions never change their input |
| `js/app.js`               | File loading with SheetJS, preview table, undo history, downloads                                                                                                              |
| `vendor/xlsx.full.min.js` | Bundled [SheetJS Community Edition](https://docs.sheetjs.com) (Apache-2.0)                                                                                                     |
| `tests/core.test.js`      | Table-logic tests (no browser or SheetJS needed)                                                                                                                               |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- Values only: formulas, cell colours and other formatting are not preserved.
- The first row is always treated as the header row.
- Matching ignores case and edge spaces; when a key repeats, the first match wins.
- Comparison pairs columns by identical header name (case-insensitive).
- Very large files (hundreds of thousands of rows) will be slow because everything is in memory.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/sheet-cleaner/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js');
const table = core.fromRows([
  ['Name', 'City'],
  [' Ann ', 'Pune'],
  [' ann', 'PUNE'],
]);
const cleaned = core.removeDuplicates(core.trimCells(table), []).table;
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: SheetJS Community Edition 0.20.3 (Apache-2.0).
