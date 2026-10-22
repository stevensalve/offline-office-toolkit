/**
 * Text Toolkit - core logic (pure functions, no DOM; unit-testable in Node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TextCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ----------------------------------------------------------- Case

  /** Split "helloWorld_foo-bar baz" into ["hello","World","foo","bar","baz"]. */
  function splitWords(text) {
    return String(text)
      .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

  /**
   * mode: upper | lower | title | sentence | toggle | camel | pascal | snake | kebab | constant
   */
  function convertCase(text, mode) {
    const s = String(text);
    switch (mode) {
      case 'upper':
        return s.toUpperCase();
      case 'lower':
        return s.toLowerCase();
      case 'title':
        return s.toLowerCase().replace(/(^|[\s\-(—])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
      case 'sentence':
        return s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
      case 'toggle':
        return Array.from(s, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
      case 'camel': {
        const w = splitWords(s);
        return w.map((x, i) => (i === 0 ? x.toLowerCase() : cap(x))).join('');
      }
      case 'pascal':
        return splitWords(s).map(cap).join('');
      case 'snake':
        return splitWords(s)
          .map((x) => x.toLowerCase())
          .join('_');
      case 'kebab':
        return splitWords(s)
          .map((x) => x.toLowerCase())
          .join('-');
      case 'constant':
        return splitWords(s)
          .map((x) => x.toUpperCase())
          .join('_');
      default:
        throw new Error('Unknown case: ' + mode);
    }
  }

  // ---------------------------------------------------------- Counting

  /** Counts for the "word counter" tab. Reading speed: 200 wpm, speaking: 130 wpm. */
  function countStats(text) {
    const s = String(text);
    const words = (s.match(/\S+/g) || []).length;
    const sentences = s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim()).length;
    const paragraphs = s.split(/\n\s*\n/).filter((x) => x.trim()).length;
    return {
      characters: Array.from(s).length,
      charactersNoSpaces: Array.from(s.replace(/\s/g, '')).length,
      words: words,
      sentences: words ? sentences : 0,
      paragraphs: paragraphs,
      lines: s === '' ? 0 : s.split(/\r?\n/).length,
      readingMinutes: words / 200,
      speakingMinutes: words / 130,
    };
  }

  /** 0.4 -> "under 1 min", 3.2 -> "about 4 min". */
  function formatMinutes(m) {
    if (m <= 0) return '0 min';
    if (m < 1) return 'under 1 min';
    return 'about ' + Math.ceil(m) + ' min';
  }

  // ------------------------------------------------------ Line tools

  /**
   * Apply line clean-up steps in a fixed, predictable order:
   * trim -> remove blank -> remove duplicates -> sort -> reverse -> number.
   * opts: { trim, collapse, removeEmpty, dedupe, sort: "none"|"asc"|"desc", reverse, number }
   */
  function cleanLines(text, opts) {
    const o = opts || {};
    let lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    if (o.trim) lines = lines.map((l) => l.trim());
    if (o.collapse) lines = lines.map((l) => l.replace(/[ \t]+/g, ' '));
    if (o.removeEmpty) lines = lines.filter((l) => l.trim() !== '');
    if (o.dedupe) {
      const seen = new Set();
      lines = lines.filter((l) => {
        const k = l.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    if (o.sort === 'asc' || o.sort === 'desc') {
      const dir = o.sort === 'desc' ? -1 : 1;
      lines = lines
        .map((l, i) => ({ l: l, i: i }))
        .sort((a, b) => dir * a.l.localeCompare(b.l, undefined, { sensitivity: 'base', numeric: true }) || a.i - b.i)
        .map((x) => x.l);
    }
    if (o.reverse) lines.reverse();
    if (o.number) lines = lines.map((l, i) => i + 1 + '. ' + l);
    return lines.join('\n');
  }

  // --------------------------------------------------- Find & replace

  const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Replace everywhere. opts: { regex, matchCase, wholeWord }.
   * Returns { text, count }. Throws a friendly Error for a bad pattern.
   */
  function findReplace(text, find, replacement, opts) {
    const o = opts || {};
    if (find === '' || find == null) throw new Error('Enter the text to find.');
    let source = o.regex ? find : escapeRegExp(find);
    if (o.wholeWord) source = '\\b(?:' + source + ')\\b';
    let re;
    try {
      re = new RegExp(source, o.matchCase ? 'gu' : 'giu');
    } catch (e) {
      throw new Error('That pattern is not valid: ' + e.message);
    }
    let count = 0;
    const out = String(text).replace(re, function (...args) {
      count++;
      if (!o.regex) return replacement;
      // Support $1, $&, etc. in regex mode through the normal replace syntax.
      const groups = args.slice(0, -2).filter((a) => typeof a !== 'object');
      return String(replacement).replace(/\$(\d+|&)/g, (m, g) =>
        g === '&' ? groups[0] : groups[Number(g)] === undefined ? m : groups[Number(g)],
      );
    });
    return { text: out, count: count };
  }

  // ------------------------------------------------------------- Diff

  const MAX_DIFF_CELLS = 4000000;

  /**
   * Line-by-line comparison using the longest-common-subsequence method.
   * Returns [{ type: "same"|"add"|"del", text }] plus counts via diffSummary().
   * opts: { ignoreCase, ignoreSpace }
   */
  function diffLines(a, b, opts) {
    const o = opts || {};
    const split = (t) => (String(t) === '' ? [] : String(t).replace(/\r\n?/g, '\n').split('\n'));
    const A = split(a);
    const B = split(b);
    const norm = (l) => {
      let x = l;
      if (o.ignoreSpace) x = x.replace(/\s+/g, ' ').trim();
      if (o.ignoreCase) x = x.toLowerCase();
      return x;
    };
    const na = A.map(norm);
    const nb = B.map(norm);

    let start = 0;
    while (start < A.length && start < B.length && na[start] === nb[start]) start++;
    let endA = A.length;
    let endB = B.length;
    while (endA > start && endB > start && na[endA - 1] === nb[endB - 1]) {
      endA--;
      endB--;
    }
    const n = endA - start;
    const m = endB - start;
    if ((n + 1) * (m + 1) > MAX_DIFF_CELLS)
      throw new Error('These texts are too different and too long to compare here. Try comparing smaller sections.');

    const w = m + 1;
    const table = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * w + j] =
          na[start + i] === nb[start + j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
      }
    }

    const ops = [];
    for (let i = 0; i < start; i++) ops.push({ type: 'same', text: A[i] });
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (na[start + i] === nb[start + j]) {
        ops.push({ type: 'same', text: A[start + i] });
        i++;
        j++;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        ops.push({ type: 'del', text: A[start + i++] });
      } else {
        ops.push({ type: 'add', text: B[start + j++] });
      }
    }
    while (i < n) ops.push({ type: 'del', text: A[start + i++] });
    while (j < m) ops.push({ type: 'add', text: B[start + j++] });
    for (let k = endA; k < A.length; k++) ops.push({ type: 'same', text: A[k] });
    return ops;
  }

  function diffSummary(ops) {
    const c = { same: 0, add: 0, del: 0 };
    ops.forEach((o) => c[o.type]++);
    return c;
  }

  // ------------------------------------------------------- Extraction

  /** Unique values in order of appearance. */
  const unique = (list) => Array.from(new Set(list));

  function extractEmails(text) {
    return unique(String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) || []);
  }

  function extractUrls(text) {
    return unique((String(text).match(/\bhttps?:\/\/[^\s<>"')]+/gi) || []).map((u) => u.replace(/[.,;:!?]+$/, '')));
  }

  function extractNumbers(text) {
    return unique(String(text).match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) || []);
  }

  return {
    splitWords: splitWords,
    convertCase: convertCase,
    countStats: countStats,
    formatMinutes: formatMinutes,
    cleanLines: cleanLines,
    findReplace: findReplace,
    diffLines: diffLines,
    diffSummary: diffSummary,
    extractEmails: extractEmails,
    extractUrls: extractUrls,
    extractNumbers: extractNumbers,
  };
});
