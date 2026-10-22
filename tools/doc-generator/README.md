# Document Generator

> Create invoices, receipts and business letters as clean PDFs.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Fill in a form and download a professional PDF - no account, no watermark, no upload of your clients' details. Your work is saved in your browser, so the next invoice only needs the client and items.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/doc-generator/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- doc-generator ../doc-generator-repo`.

## Features

- **Invoice** and **receipt** from one form: seller, client, numbered items with quantity, rate and tax %, discount, notes and payment details.
- Live totals; amounts are calculated in whole cents so they always add up on paper.
- Logo upload (PNG or JPG), multi-page invoices with repeated table headers and page numbers.
- "Start next document" increments the number (`INV-0009` becomes `INV-0010`) and keeps your business details.
- Save a draft file and open it later; automatic save in the browser.
- **Letter** with sender, recipient, subject, body and signature name.
- Number formats for India, US and Europe; currency symbols for rupee, dollar, euro, pound and dirham.

## How it works

Calculation (`core.js`) and drawing (`pdf.js`) are kept apart: the same `calcInvoice` result feeds the on-screen totals and the PDF, so they cannot disagree. Discounts apply to each line before tax. Characters that standard PDF fonts cannot draw are swapped for safe ones (the rupee sign prints as `Rs.`).

| File                    | Purpose                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `index.html`            | Page structure and the Content-Security-Policy (blocks all network access)                              |
| `css/theme.css`         | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                              |
| `css/app.css`           | Styles for this tool only                                                                               |
| `js/common.js`          | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                |
| `js/core.js`            | Money maths (`calcInvoice`), numbering, validation, text wrapping - no PDF code                         |
| `js/pdf.js`             | A4 layout with pdf-lib (`buildInvoicePdf`, `buildLetterPdf`)                                            |
| `js/app.js`             | Form, item rows, live totals, drafts, auto-save                                                         |
| `vendor/pdf-lib.min.js` | Bundled [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT)                                             |
| `tests/core.test.js`    | Totals, rounding, numbering, validation and real PDF generation (including 70-item multi-page invoices) |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- Standard PDF fonts: English and Western European letters only.
- A4 only; one currency and one tax rate per line (several rates are supported and itemised).
- Not an e-invoicing system: legal formats such as GST invoice rules, e-invoice IRNs or QR codes are your responsibility.
- No recurring invoices or client address book.
- Browser storage belongs to one browser profile - use "Save draft file" for backups.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/doc-generator/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js');
core.calcInvoice([{ description: 'Design', qty: 2, rate: 1500, taxPercent: 18 }], { discountPercent: 10 }).total; // 3186
core.nextNumber('INV-0009'); // 'INV-0010'
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: pdf-lib (MIT).
