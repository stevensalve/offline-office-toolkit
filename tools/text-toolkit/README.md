# Text Toolkit

> Change case, count words, clean lists, find and replace, compare two texts and extract e-mails or links.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Small text jobs that come up all day: make a heading Title Case, check a word limit, remove duplicate e-mail addresses from a pasted list, replace a name everywhere, see exactly what changed between two versions of a paragraph, or pull every e-mail address out of a long message.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/text-toolkit/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- text-toolkit ../text-toolkit-repo`.

## Features

- **Change case**: UPPER, lower, Title, Sentence, tOGGLE, camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE.
- **Word count**: words, characters, sentences, paragraphs, lines, reading and speaking time.
- **Clean up lines**: trim, squeeze spaces, remove blanks, remove duplicates, sort (natural order), reverse, number.
- **Find and replace** with case, whole-word and optional pattern (regular expression) modes, with `$1`/`$&` support.
- **Compare texts**: line-by-line differences marked with `+` / `-` (not just colour).
- **Extract** unique e-mail addresses, web links or numbers.
- One-click copy for every result.

## How it works

`diffLines` uses the classic longest-common-subsequence method after trimming matching lines from both ends, and refuses inputs that would need more than about four million comparisons so the page never freezes. Results are written with `textContent` / `value`, never `innerHTML`, so pasted text cannot inject markup.

| File                 | Purpose                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                                                    |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                                    |
| `css/app.css`        | Styles for this tool only                                                                                                     |
| `js/common.js`       | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                                      |
| `js/core.js`         | All text logic as pure functions: `convertCase`, `countStats`, `cleanLines`, `findReplace`, `diffLines`, `extractEmails`, ... |
| `js/app.js`          | Tabs, live updates, copy buttons, diff rendering                                                                              |
| `tests/core.test.js` | Edge cases for every function (acronyms, emoji, blank lines, bad patterns, huge diffs)                                        |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- This tool uses no third-party libraries at all, so there is nothing external to trust or update.

## Limitations

- The diff is line-based (it does not highlight individual words).
- Comparison is limited to roughly 2,000 differing lines.
- Title Case is simple: every word is capitalised (no small-word rules).
- Reading time assumes 200 words per minute, speaking 130.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/text-toolkit/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const core = require('./js/core.js');
core.convertCase('helloBigWorld', 'snake'); // 'hello_big_world'
core.cleanLines('b\na\nb', { dedupe: true, sort: 'asc' }); // 'a\nb'
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: none (no third-party libraries).
