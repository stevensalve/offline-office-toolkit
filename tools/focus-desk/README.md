# Focus Desk

> A private to-do list, Kanban board, focus timer and notes - saved only in your browser.

Part of the [Offline Office Toolkit](../../README.md). Runs entirely in your browser and works without internet.

## What it does

A small personal workspace for the day: capture tasks with priorities and due dates, drag them across a To do / Doing / Done board, run Pomodoro focus sessions, and jot notes. Everything stays in your browser - no account, no sync, nothing uploaded.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/focus-desk/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- focus-desk ../focus-desk-repo`.

## Features

- **Tasks** with priority, due date (shows "Overdue by 2 days"), filter, sort, inline edit.
- **Board** with drag and drop and keyboard-friendly arrow buttons.
- **Focus timer** (default 25/5/15 minutes, 4 rounds), accurate even in background tabs, optional end-of-session sound, daily and weekly focus statistics.
- **Notes** with autosave.
- **Backup**: save everything to a file and restore it later; "Erase everything" button.

## How it works

The state is one plain object. Every change creates a new object (`state = D.addTask(state, ...)`), which is saved to `localStorage` and re-rendered. The timer stores a target end time instead of counting seconds, so it stays correct when the browser slows a background tab. Imported backups are treated as untrusted: unknown fields are dropped, values are clamped, and ids are re-issued.

| File                 | Purpose                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                                                       |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                                       |
| `css/app.css`        | Styles for this tool only                                                                                                        |
| `js/common.js`       | Shared helpers (downloads, file reading, tabs). Synced from `shared/` - do not edit here                                         |
| `js/core.js`         | The rules: tasks, notes, the timer state machine, statistics, and backup validation - pure functions that never edit their input |
| `js/app.js`          | Rendering (safe DOM building, no `innerHTML`), storage and timer loop                                                            |
| `tests/core.test.js` | Timer phases, late ticks, due labels, import hardening                                                                           |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- This tool uses no third-party libraries at all, so there is nothing external to trust or update.

## Limitations

- Data lives in this browser profile on this device (no sync). Clearing browser data erases it - use the backup button.
- The timer does not survive a page reload.
- Notes are plain text.
- Opening from disk (`file://`) works, but some browsers keep storage separate for each file location; hosting the site gives the most predictable storage.

## Development

```bash
npm test                              # all tools, from the repository root
node --test tools/focus-desk/tests/core.test.js   # just this tool
npm run verify                        # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node:

```js
const D = require('./js/core.js');
let state = D.emptyState();
state = D.addTask(state, { title: 'Write report', priority: 'high', due: '2026-11-01' });
D.dueLabel('2026-10-20', '2026-10-22'); // { text: 'Overdue by 2 days', overdue: true }
```

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). Bundled third-party software: none (no third-party libraries).
