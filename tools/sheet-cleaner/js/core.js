/**
 * Sheet Cleaner - core logic (no DOM, no SheetJS, fully unit-testable).
 *
 * A "table" is a plain object: { headers: string[], rows: any[][] }.
 * Every function returns a NEW table and never changes its input, which makes
 * the app's Undo feature trivial (just keep the previous table).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SheetCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isText = (v) => typeof v === 'string';
  const asText = (v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  const isBlank = (v) => v == null || (isText(v) && v.trim() === '');

  /** Visible text of a cell (dates become yyyy-mm-dd). */
  function formatCell(v) {
    return asText(v);
  }

  /**
   * Turn a raw array-of-arrays (first row = headers) into a clean table:
   * rectangular, with unique, non-empty header names.
   */
  function fromRows(aoa) {
    const data = (aoa || []).filter((r) => Array.isArray(r));
    const width = data.reduce((m, r) => Math.max(m, r.length), 0);
    if (data.length === 0 || width === 0) return { headers: [], rows: [] };
    const seen = new Map();
    const headers = Array.from({ length: width }, (_, i) => {
      let name = asText(data[0][i]).trim() || 'Column ' + (i + 1);
      const key = name.toLowerCase();
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      if (n > 0) name = name + ' (' + (n + 1) + ')';
      return name;
    });
    const rows = data.slice(1).map((r) => Array.from({ length: width }, (_, i) => (r[i] === undefined ? '' : r[i])));
    return { headers: headers, rows: rows };
  }

  /** Inverse of fromRows: headers first, then rows. */
  function toRows(table) {
    return [table.headers.slice()].concat(table.rows.map((r) => r.slice()));
  }

  function colIndex(table, col) {
    const i = typeof col === 'number' ? col : table.headers.indexOf(col);
    if (i < 0 || i >= table.headers.length) throw new Error('Column not found: ' + col);
    return i;
  }

  const mapRows = (table, fn) => ({ headers: table.headers.slice(), rows: table.rows.map(fn) });

  /** Trim spaces from text cells; optionally collapse inner runs of spaces. */
  function trimCells(table, opts) {
    const collapse = !!(opts && opts.collapse);
    return mapRows(table, (row) =>
      row.map((v) => {
        if (!isText(v)) return v;
        const t = v.trim();
        return collapse ? t.replace(/\s+/g, ' ') : t;
      }),
    );
  }

  /** Drop rows where every cell is blank. */
  function removeEmptyRows(table) {
    const rows = table.rows.filter((r) => !r.every(isBlank));
    return { table: { headers: table.headers.slice(), rows: rows }, removed: table.rows.length - rows.length };
  }

  /**
   * Remove duplicate rows (keeps the first). `cols` = column indexes/names that
   * must match; empty = whole row. Comparison ignores case and edge spaces
   * unless opts.matchCase is true.
   */
  function removeDuplicates(table, cols, opts) {
    const idx = !cols || cols.length === 0 ? table.headers.map((_, i) => i) : cols.map((c) => colIndex(table, c));
    const matchCase = !!(opts && opts.matchCase);
    const seen = new Set();
    const rows = [];
    for (const row of table.rows) {
      const key = JSON.stringify(
        idx.map((i) => {
          const t = asText(row[i]).trim();
          return matchCase ? t : t.toLowerCase();
        }),
      );
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    return { table: { headers: table.headers.slice(), rows: rows }, removed: table.rows.length - rows.length };
  }

  const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

  /** mode: "upper" | "lower" | "title" */
  function changeCase(table, col, mode) {
    const i = colIndex(table, col);
    const fn = { upper: (s) => s.toUpperCase(), lower: (s) => s.toLowerCase(), title: titleCase }[mode];
    if (!fn) throw new Error('Unknown case mode: ' + mode);
    return mapRows(table, (row) => row.map((v, j) => (j === i && isText(v) ? fn(v) : v)));
  }

  /**
   * Split one column into several at a delimiter ("Smith, John" -> two columns).
   * New columns are named "<Header> 1", "<Header> 2"... The original column is
   * removed unless opts.keep is true.
   */
  function splitColumn(table, col, delimiter, opts) {
    const i = colIndex(table, col);
    if (!delimiter) throw new Error('Enter a delimiter to split on.');
    const parts = table.rows.map((r) =>
      asText(r[i])
        .split(delimiter)
        .map((p) => p.trim()),
    );
    const count = parts.reduce((m, p) => Math.max(m, p.length), 1);
    const newHeaders = Array.from({ length: count }, (_, k) => table.headers[i] + ' ' + (k + 1));
    const keep = !!(opts && opts.keep);
    const headers = [];
    table.headers.forEach((h, j) => {
      if (j === i) {
        if (keep) headers.push(h);
        headers.push(...newHeaders);
      } else headers.push(h);
    });
    const rows = table.rows.map((r, n) => {
      const out = [];
      r.forEach((v, j) => {
        if (j === i) {
          if (keep) out.push(v);
          for (let k = 0; k < count; k++) out.push(parts[n][k] === undefined ? '' : parts[n][k]);
        } else out.push(v);
      });
      return out;
    });
    return { headers: headers, rows: rows };
  }

  /**
   * Find & replace plain text. `col` of -1 (or "all") means every column.
   * Returns { table, count } where count is the number of cells changed.
   */
  function findReplace(table, col, find, replacement, opts) {
    if (find === '' || find == null) throw new Error('Enter the text to find.');
    const o = opts || {};
    const all = col === -1 || col === 'all';
    const i = all ? -1 : colIndex(table, col);
    const flags = o.matchCase ? 'g' : 'gi';
    const escaped = String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(o.wholeCell ? '^' + escaped + '$' : escaped, o.wholeCell ? (o.matchCase ? '' : 'i') : flags);
    let count = 0;
    const out = mapRows(table, (row) =>
      row.map((v, j) => {
        if ((!all && j !== i) || !isText(v)) return v;
        const next = v.replace(pattern, () => String(replacement));
        if (next !== v) count++;
        return next;
      }),
    );
    return { table: out, count: count };
  }

  /** Remove the given columns. */
  function dropColumns(table, cols) {
    const drop = new Set(cols.map((c) => colIndex(table, c)));
    if (drop.size >= table.headers.length) throw new Error('You cannot delete every column.');
    const keep = table.headers.map((_, i) => i).filter((i) => !drop.has(i));
    return { headers: keep.map((i) => table.headers[i]), rows: table.rows.map((r) => keep.map((i) => r[i])) };
  }

  /** Sort rows by a column. Numbers sort numerically, text alphabetically; blanks go last. */
  function sortBy(table, col, direction) {
    const i = colIndex(table, col);
    const dir = direction === 'desc' ? -1 : 1;
    const num = (v) =>
      typeof v === 'number' ? v : v instanceof Date ? v.getTime() : isBlank(v) || isNaN(Number(asText(v))) ? NaN : Number(asText(v));
    const rows = table.rows
      .map((r, n) => ({ r: r, n: n }))
      .sort((a, b) => {
        const va = a.r[i];
        const vb = b.r[i];
        const ba = isBlank(va);
        const bb = isBlank(vb);
        if (ba || bb) return ba === bb ? a.n - b.n : ba ? 1 : -1;
        const na = num(va);
        const nb = num(vb);
        const c =
          !isNaN(na) && !isNaN(nb) ? na - nb : asText(va).localeCompare(asText(vb), undefined, { sensitivity: 'base', numeric: true });
        return c === 0 ? a.n - b.n : c * dir;
      })
      .map((x) => x.r);
    return { headers: table.headers.slice(), rows: rows };
  }

  /** Normalised lookup key for matching rows between two tables. */
  const keyOf = (v) => asText(v).trim().toLowerCase();

  /**
   * Compare table A (old) with table B (new) using a key column in each.
   * Columns with the same header name in both tables are compared.
   * Returns { onlyInA, onlyInB, changed, same, sharedColumns } where
   * onlyInA/onlyInB are tables and `changed` is a list of
   * { key, changes: [{ column, a, b }] }.
   */
  function compareTables(a, b, keyA, keyB) {
    const ia = colIndex(a, keyA);
    const ib = colIndex(b, keyB);
    const shared = a.headers
      .map((h, i) => ({ h: h, i: i, j: b.headers.findIndex((x) => x.toLowerCase() === h.toLowerCase()) }))
      .filter((c) => c.j >= 0 && c.i !== ia);
    const mapB = new Map();
    for (const r of b.rows) {
      const k = keyOf(r[ib]);
      if (k !== '' && !mapB.has(k)) mapB.set(k, r);
    }
    const seenA = new Set();
    const onlyA = [];
    const changed = [];
    let same = 0;
    for (const r of a.rows) {
      const k = keyOf(r[ia]);
      if (k === '') continue;
      seenA.add(k);
      const other = mapB.get(k);
      if (!other) {
        onlyA.push(r);
        continue;
      }
      const changes = shared
        .filter((c) => asText(r[c.i]).trim() !== asText(other[c.j]).trim())
        .map((c) => ({ column: c.h, a: r[c.i], b: other[c.j] }));
      if (changes.length) changed.push({ key: asText(r[ia]), changes: changes });
      else same++;
    }
    const onlyB = b.rows.filter((r) => {
      const k = keyOf(r[ib]);
      return k !== '' && !seenA.has(k);
    });
    return {
      onlyInA: { headers: a.headers.slice(), rows: onlyA },
      onlyInB: { headers: b.headers.slice(), rows: onlyB },
      changed: changed,
      same: same,
      sharedColumns: shared.map((c) => c.h),
    };
  }

  /** Flatten compareTables' `changed` list into a printable table. */
  function changesToTable(changed) {
    const rows = [];
    changed.forEach((c) => c.changes.forEach((ch) => rows.push([c.key, ch.column, ch.a, ch.b])));
    return { headers: ['Key', 'Column', 'Value in A', 'Value in B'], rows: rows };
  }

  /**
   * Spreadsheet "VLOOKUP" for whole tables: for every row of A, find the row
   * of B with the same key and append the chosen B columns.
   * Returns { table, matched, unmatched }. Unmatched rows get blanks.
   */
  function lookupMerge(a, b, keyA, keyB, bCols) {
    const ia = colIndex(a, keyA);
    const ib = colIndex(b, keyB);
    const picks = bCols.map((c) => colIndex(b, c));
    if (picks.length === 0) throw new Error('Choose at least one column to bring over.');
    const mapB = new Map();
    for (const r of b.rows) {
      const k = keyOf(r[ib]);
      if (k !== '' && !mapB.has(k)) mapB.set(k, r);
    }
    const taken = new Set(a.headers.map((h) => h.toLowerCase()));
    const newHeaders = picks.map((i) => {
      let name = b.headers[i];
      while (taken.has(name.toLowerCase())) name += ' (B)';
      taken.add(name.toLowerCase());
      return name;
    });
    let matched = 0;
    const rows = a.rows.map((r) => {
      const hit = mapB.get(keyOf(r[ia]));
      if (hit) matched++;
      return r.concat(picks.map((i) => (hit ? hit[i] : '')));
    });
    return { table: { headers: a.headers.concat(newHeaders), rows: rows }, matched: matched, unmatched: a.rows.length - matched };
  }

  return {
    formatCell: formatCell,
    fromRows: fromRows,
    toRows: toRows,
    trimCells: trimCells,
    removeEmptyRows: removeEmptyRows,
    removeDuplicates: removeDuplicates,
    changeCase: changeCase,
    splitColumn: splitColumn,
    findReplace: findReplace,
    dropColumns: dropColumns,
    sortBy: sortBy,
    compareTables: compareTables,
    changesToTable: changesToTable,
    lookupMerge: lookupMerge,
  };
});
