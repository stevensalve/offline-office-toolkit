/**
 * PDF Toolkit - core logic (no DOM access, so it can be unit-tested in Node).
 *
 * All functions take/return raw bytes (Uint8Array / ArrayBuffer) and use
 * pdf-lib, which is bundled in ../vendor/pdf-lib.min.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'));
  } else {
    root.PdfCore = factory(root.PDFLib);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';

  const { PDFDocument, degrees } = PDFLib;

  /**
   * Turn a page selection such as "1-3, 5, 8-" into 0-based page indexes.
   * - "all" or an empty string selects every page.
   * - "8-" means page 8 to the last page.
   * - A descending range ("5-3") is allowed and yields pages in that order.
   * - Order and duplicates are preserved (useful for re-ordering pages).
   * Throws an Error with a user-friendly message for invalid input.
   */
  function parsePageSpec(spec, total) {
    if (!Number.isInteger(total) || total < 1) throw new Error('The PDF has no pages.');
    const text = String(spec == null ? '' : spec)
      .trim()
      .toLowerCase();
    if (text === '' || text === 'all') return Array.from({ length: total }, (_, i) => i);

    const result = [];
    const check = (n) => {
      if (n < 1 || n > total) throw new Error('Page ' + n + ' is out of range. This PDF has ' + total + ' page(s).');
      return n;
    };
    for (const raw of text.split(',')) {
      const token = raw.trim();
      if (!token) continue;
      let m = /^(\d+)$/.exec(token);
      if (m) {
        result.push(check(Number(m[1])) - 1);
        continue;
      }
      m = /^(\d+)\s*-\s*(\d*)$/.exec(token);
      if (!m) throw new Error('Cannot understand "' + token + '". Use numbers and ranges like 1-3, 5, 8-');
      const from = check(Number(m[1]));
      const to = check(m[2] === '' ? total : Number(m[2]));
      const step = from <= to ? 1 : -1;
      for (let p = from; p !== to + step; p += step) result.push(p - 1);
    }
    if (result.length === 0) throw new Error('No pages selected.');
    return result;
  }

  /** Sorted, de-duplicated copy of an index list. */
  function uniqueSorted(indexes) {
    return Array.from(new Set(indexes)).sort((a, b) => a - b);
  }

  /** Load a PDF and translate pdf-lib errors into plain language. */
  async function loadPdf(bytes) {
    try {
      return await PDFDocument.load(bytes);
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/encrypted/i.test(msg)) {
        throw new Error('This PDF is password-protected. Remove the password first, then try again.');
      }
      throw new Error('This file could not be read as a PDF (it may be damaged).');
    }
  }

  /** Number of pages in a PDF. */
  async function pageCount(bytes) {
    return (await loadPdf(bytes)).getPageCount();
  }

  /** Append several PDFs, in order, into one. */
  async function mergePdfs(list) {
    if (!list || list.length < 2) throw new Error('Add at least two PDF files to merge.');
    const out = await PDFDocument.create();
    for (const bytes of list) {
      const src = await loadPdf(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    return out.save();
  }

  /** New PDF containing only `indexes` (in the given order). */
  async function extractPages(bytes, indexes) {
    const src = await loadPdf(bytes);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indexes);
    pages.forEach((p) => out.addPage(p));
    return out.save();
  }

  /** New PDF with `indexes` removed. */
  async function deletePages(bytes, indexes) {
    const doc = await loadPdf(bytes);
    const unique = uniqueSorted(indexes);
    if (unique.length >= doc.getPageCount()) throw new Error('You cannot delete every page.');
    for (let i = unique.length - 1; i >= 0; i--) doc.removePage(unique[i]);
    return doc.save();
  }

  /** Rotate pages clockwise by 90, 180 or 270 degrees (relative to current). */
  async function rotatePages(bytes, indexes, angle) {
    if (![90, 180, 270].includes(angle)) throw new Error('Rotation must be 90, 180 or 270 degrees.');
    const doc = await loadPdf(bytes);
    const pages = doc.getPages();
    for (const i of uniqueSorted(indexes)) {
      const current = pages[i].getRotation().angle;
      pages[i].setRotation(degrees((current + angle) % 360));
    }
    return doc.save();
  }

  /** Split into several PDFs of `size` pages each (the last may be shorter). */
  async function splitEvery(bytes, size) {
    if (!Number.isInteger(size) || size < 1) throw new Error('Pages per file must be a whole number of 1 or more.');
    const src = await loadPdf(bytes);
    const total = src.getPageCount();
    const parts = [];
    for (let start = 0; start < total; start += size) {
      const end = Math.min(start + size, total);
      const indexes = Array.from({ length: end - start }, (_, k) => start + k);
      parts.push({ from: start + 1, to: end, bytes: await extractPages(bytes, indexes) });
    }
    return parts;
  }

  /** "report.pdf" + "merged" -> "report-merged.pdf" */
  function outputName(originalName, suffix) {
    const base = String(originalName).replace(/\.pdf$/i, '') || 'document';
    return base + '-' + suffix + '.pdf';
  }

  return {
    parsePageSpec: parsePageSpec,
    uniqueSorted: uniqueSorted,
    pageCount: pageCount,
    mergePdfs: mergePdfs,
    extractPages: extractPages,
    deletePages: deletePages,
    rotatePages: rotatePages,
    splitEvery: splitEvery,
    outputName: outputName,
  };
});
