# Office Calculators

> Percentage, loan EMI, GST/VAT, date differences, unit conversion, interest and profit margin.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

The small calculations of office life in one place, with clear answers: What is 18% GST on this price? What is my monthly EMI and total interest? How many working days until the deadline? How much is 5 miles in kilometres? Choose Indian or international number formats and a currency symbol.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/office-calculators/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- office-calculators ../office-calculators-repo`.

## Features

- **Percentage**: X% of Y, X is what % of Y, % change, add/subtract a percentage.
- **Loan EMI** with total interest and a full month-by-month schedule (download as CSV).
- **GST / VAT**: add or remove tax, with the tax split into two equal halves (e.g. CGST + SGST).
- **Dates**: days between two dates (years/months/days, weeks, working days) and add/subtract days, optionally skipping weekends.
- **Units**: length, weight, area, volume, speed, data size and temperature.
- **Interest**: simple and compound (yearly to daily).
- **Discount and margin**: sale price, profit, margin vs markup, price needed for a target margin.
- Results update as you type; Indian (12,34,567) and other number styles.

## How it works

Money is rounded to two decimals only when a result is produced; inputs and intermediate steps keep full precision. Invoice-style tax uses whole-cent arithmetic in the Document Generator, while these calculators prefer clarity. The EMI schedule adjusts the final instalment so the balance ends at exactly zero. Dates are handled in UTC so daylight-saving changes cannot add or remove a day.

| File                 | Purpose                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                       |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                       |
| `css/app.css`        | Styles for this tool only                                                                        |
| `js/common.js`       | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here         |
| `js/core.js`         | All calculations as pure, tested functions (`loanEmi`, `taxAdd`, `dateDiff`, `convertUnit`, ...) |
| `js/app.js`          | Form wiring and live rendering                                                                   |
| `tests/core.test.js` | Checked against well-known reference values (e.g. a 10 lakh, 8.5%, 20-year EMI is about 8,678)   |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- This tool uses no third-party libraries at all, so there is nothing external to trust or update.

## Limitations

- For guidance only - not financial, legal or tax advice.
- Working-day counts do not know about public holidays.
- EMI assumes a fixed rate with monthly reducing balance; no prepayments, fees or rate changes.
- No currency conversion (that needs live rates, which an offline tool cannot have).
- Tax shown is a single rate; real invoices may need several.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/office-calculators/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js');
core.loanEmi(1000000, 8.5, 240).emi; // 8678.23
core.taxAdd(1000, 18); // { net: 1000, tax: 180, gross: 1180, half1: 90, half2: 90 }
core.dateDiff('2026-01-05', '2026-03-10'); // { days: 64, years: 0, months: 2, daysPart: 5, ... }
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: none (no third-party libraries).
