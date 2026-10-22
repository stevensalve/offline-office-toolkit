# QR & Barcode Maker

> QR codes for links, Wi-Fi, contacts, e-mail and SMS, plus common barcodes - no tracking, no expiry.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Make a QR code for a menu link, a guest Wi-Fi network or a business card, or a barcode for stock labels, and download it as PNG or SVG. Unlike many free QR sites, the codes are static: they contain your data directly, so they never expire and nobody can track the scans.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/qr-barcode-maker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- qr-barcode-maker ../qr-barcode-maker-repo`.

## Features

- QR types: website, text, **Wi-Fi** (join the network by scanning), **contact card** (vCard), e-mail, SMS, phone call.
- Error-correction level, size, colours and a warning when the colours would be hard to scan.
- Barcodes: Code 128, Code 39, EAN-13, EAN-8, UPC-A, ITF-14 - missing check digits are added automatically and wrong ones are rejected.
- Download PNG or SVG (SVG is ideal for printing).
- Blocks `javascript:` and `data:` links.

## How it works

`qrcode-generator` produces the grid of dark/light squares; our own `matrixToSvg` draws it so we control colours and the quiet zone (the blank border scanners need). Wi-Fi and vCard payloads follow the formats phones understand and escape special characters. Barcode drawing is done by JsBarcode after `normalizeBarcodeValue` has validated the input.

| File                 | Purpose                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                                                                           |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                                                           |
| `css/app.css`        | Styles for this tool only                                                                                                                            |
| `js/common.js`       | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                                                             |
| `js/core.js`         | Pure logic: payload builders (`wifiPayload`, `vcardPayload`, ...), `buildMatrix`, `matrixToSvg`, contrast check, barcode validation and check digits |
| `js/app.js`          | Live preview, PNG/SVG export                                                                                                                         |
| `vendor/`            | Bundled [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) and [JsBarcode](https://github.com/lindell/JsBarcode) (MIT)      |
| `tests/core.test.js` | Payload escaping, check digits against known real-world codes, matrix and SVG tests                                                                  |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (see `vendor/README.md` for exact versions and licenses) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.

## Limitations

- No logo in the middle of QR codes, and no dynamic (editable/trackable) QR codes - by design.
- PNG exports use a whole number of pixels per square, so the file can be slightly smaller than the size slider shows.
- Always test-scan before printing.
- "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/qr-barcode-maker/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js');
core.wifiPayload({ ssid: 'Cafe', password: 'secret1', security: 'WPA' }); // 'WIFI:T:WPA;S:Cafe;P:secret1;;'
core.normalizeBarcodeValue('EAN13', '400638133393'); // '4006381333931' (check digit added)
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: qrcode-generator (MIT), JsBarcode (MIT).
