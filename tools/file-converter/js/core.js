/**
 * File Converter - core logic (no DOM, no SheetJS; unit-testable in Node).
 *
 * Everything converts through one simple shape, "rows": an array of arrays
 * whose FIRST row holds the column names:
 *   [["name","age"],["Ann",30],["Bob",25]]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'));
  } else {
    root.ConvertCore = factory(root.PDFLib);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';

  // ------------------------------------------------------------------ CSV

  /** Guess the delimiter from the first few lines. Defaults to a comma. */
  function detectDelimiter(text) {
    const lines = String(text)
      .replace(/^\ufeff/, '')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 5);
    let best = ',';
    let bestScore = 0;
    for (const d of [',', ';', '\t', '|']) {
      const counts = lines.map((l) => l.split(d).length - 1);
      if (counts.length === 0 || counts[0] === 0) continue;
      const consistent = counts.every((c) => c === counts[0]);
      const score = counts[0] * (consistent ? 2 : 1);
      if (score > bestScore) {
        best = d;
        bestScore = score;
      }
    }
    return best;
  }

  /** RFC 4180 CSV parser: handles quotes, escaped quotes, CRLF and a BOM. */
  function parseCsv(text, delimiter) {
    const src = String(text).replace(/^\ufeff/, '');
    const d = delimiter || detectDelimiter(src);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inQuotes) {
        if (c === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"' && field === '') {
        inQuotes = true;
      } else if (c === d) {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += c;
    }
    if (inQuotes) throw new Error('The CSV has an opening quote (") that is never closed.');
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => !(r.length === 1 && r[0] === ''));
  }

  /**
   * Write rows as CSV text. With opts.protect, cells that start with = + - @
   * get a leading apostrophe so Excel cannot run them as formulas.
   */
  function stringifyCsv(rows, delimiter, opts) {
    const d = delimiter || ',';
    const protect = !!(opts && opts.protect);
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (protect && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      return s.includes(d) || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return rows.map((r) => r.map(cell).join(d)).join('\r\n');
  }

  // ----------------------------------------------------------------- JSON

  /** Flatten nested objects: {a:{b:1}} -> {"a.b":1}. Arrays are kept as JSON text. */
  function flattenObject(obj, prefix, out) {
    const result = out || {};
    for (const key of Object.keys(obj)) {
      const name = prefix ? prefix + '.' + key : key;
      const v = obj[key];
      if (v && typeof v === 'object' && !Array.isArray(v)) flattenObject(v, name, result);
      else result[name] = Array.isArray(v) ? JSON.stringify(v) : v;
    }
    return result;
  }

  /**
   * Convert parsed JSON into rows. Accepts an array of objects, a single
   * object, or an array of plain values. Column order = order first seen.
   */
  function jsonToRows(value) {
    let list = value;
    if (list && typeof list === 'object' && !Array.isArray(list)) list = [list];
    if (!Array.isArray(list)) throw new Error('The JSON must be a list of records (or one record).');
    if (list.length === 0) return [];
    const objects = list.map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? flattenObject(item) : { value: item }));
    const headers = [];
    const seen = new Set();
    objects.forEach((o) => Object.keys(o).forEach((k) => !seen.has(k) && (seen.add(k), headers.push(k))));
    return [headers].concat(objects.map((o) => headers.map((h) => (o[h] === undefined || o[h] === null ? '' : o[h]))));
  }

  /** "42" -> 42, "3.5" -> 3.5, "true" -> true. Leaves "007" and long digit strings alone. */
  function inferValue(v) {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    return v;
  }

  /** rows -> array of objects (first row = keys). Duplicate/blank names are made unique. */
  function rowsToObjects(rows, opts) {
    if (!rows || rows.length === 0) return [];
    const infer = !!(opts && opts.inferTypes);
    const used = new Set();
    const keys = rows[0].map((h, i) => {
      let k = String(h == null ? '' : h).trim() || 'column' + (i + 1);
      while (used.has(k)) k += '_' + (i + 1);
      used.add(k);
      return k;
    });
    return rows.slice(1).map((r) => {
      const o = {};
      keys.forEach((k, i) => (o[k] = infer ? inferValue(r[i] === undefined ? '' : r[i]) : r[i] === undefined ? '' : r[i]));
      return o;
    });
  }

  // ------------------------------------------------------------ Text -> PDF

  /** Fix characters a standard PDF font cannot draw (e.g. the rupee sign). */
  function sanitizeForFont(font, text) {
    const supported = new Set(font.getCharacterSet());
    const replacements = { '₹': 'Rs.', '…': '...', '→': '->', '✓': 'v', ' ': ' ', '\t': '    ' };
    let out = '';
    for (const ch of String(text)) {
      if (ch === '\n') out += ch;
      else if (replacements[ch] !== undefined) out += replacements[ch];
      else if (supported.has(ch.codePointAt(0))) out += ch;
      else out += '?';
    }
    return out;
  }

  /** Greedy word-wrap. `measure(str)` returns the drawn width. Very long words are split. */
  function wrapLine(line, maxWidth, measure) {
    if (line === '') return [''];
    const lines = [];
    let current = '';
    for (const word of line.split(/(?<=\s)/)) {
      const candidate = current + word;
      if (measure(candidate.trimEnd()) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current.trimEnd());
      current = '';
      let rest = word;
      while (measure(rest.trimEnd()) > maxWidth && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n)) > maxWidth) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      current = rest;
    }
    lines.push(current.trimEnd());
    return lines;
  }

  const PAGE = { a4: [595.28, 841.89], letter: [612, 792] };
  const FONTS = { helvetica: 'Helvetica', times: 'TimesRoman', courier: 'Courier' };

  /**
   * Render plain text to a multi-page PDF.
   * opts: { fontSize = 11, pageSize = "a4"|"letter", margin = 54, font = "helvetica"|"times"|"courier" }
   */
  async function textToPdf(text, opts) {
    const o = Object.assign({ fontSize: 11, pageSize: 'a4', margin: 54, font: 'helvetica' }, opts);
    if (!String(text).trim()) throw new Error('There is no text to convert.');
    if (!(o.fontSize >= 6 && o.fontSize <= 36)) throw new Error('Font size must be between 6 and 36.');
    const doc = await PDFLib.PDFDocument.create();
    const font = await doc.embedFont(PDFLib.StandardFonts[FONTS[o.font] || 'Helvetica']);
    const [w, h] = PAGE[o.pageSize] || PAGE.a4;
    const maxWidth = w - 2 * o.margin;
    const lineHeight = o.fontSize * 1.35;
    const measure = (s) => font.widthOfTextAtSize(s, o.fontSize);

    const lines = [];
    sanitizeForFont(font, String(text).replace(/\r\n?/g, '\n'))
      .split('\n')
      .forEach((l) => lines.push(...wrapLine(l, maxWidth, measure)));

    let page = doc.addPage([w, h]);
    let y = h - o.margin - o.fontSize;
    for (const line of lines) {
      if (y < o.margin) {
        page = doc.addPage([w, h]);
        y = h - o.margin - o.fontSize;
      }
      if (line) page.drawText(line, { x: o.margin, y: y, size: o.fontSize, font: font });
      y -= lineHeight;
    }
    return doc.save();
  }

  return {
    detectDelimiter: detectDelimiter,
    parseCsv: parseCsv,
    stringifyCsv: stringifyCsv,
    flattenObject: flattenObject,
    jsonToRows: jsonToRows,
    inferValue: inferValue,
    rowsToObjects: rowsToObjects,
    sanitizeForFont: sanitizeForFont,
    wrapLine: wrapLine,
    textToPdf: textToPdf,
  };
});
