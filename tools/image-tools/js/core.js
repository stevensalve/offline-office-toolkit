/**
 * Image Tools - core logic (no DOM, so it can be unit-tested in Node).
 * Canvas work happens in app.js; this file does the maths, naming and PDF export.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'));
  } else {
    root.ImageCore = factory(root.PDFLib);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';

  /** Page sizes in PDF points (1 pt = 1/72 inch). */
  const PAGE_SIZES = {
    a4: [595.28, 841.89],
    letter: [612, 792],
  };

  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  const toInt = (n) => Math.max(1, Math.round(n));

  /**
   * Work out the output size for an image.
   * opts.mode:
   *   "none"    keep the size
   *   "max"     shrink so it fits inside maxWidth x maxHeight (never enlarges)
   *   "percent" scale by `percent` (1-500)
   * Aspect ratio is always preserved. Empty/zero limits are ignored.
   */
  function computeTargetSize(width, height, opts) {
    const o = opts || {};
    if (!(width > 0 && height > 0)) throw new Error('Image has no size.');
    if (o.mode === 'percent') {
      const p = Number(o.percent);
      if (!(p > 0 && p <= 500)) throw new Error('Percent must be between 1 and 500.');
      return { width: toInt((width * p) / 100), height: toInt((height * p) / 100) };
    }
    if (o.mode === 'max') {
      const maxW = Number(o.maxWidth) > 0 ? Number(o.maxWidth) : Infinity;
      const maxH = Number(o.maxHeight) > 0 ? Number(o.maxHeight) : Infinity;
      const scale = Math.min(1, maxW / width, maxH / height);
      return { width: toInt(width * scale), height: toInt(height * scale) };
    }
    return { width: width, height: height };
  }

  /**
   * Largest centred rectangle with the given aspect ratio ([w, h]) that fits
   * inside the image. `ratio` of null means "do not crop".
   */
  function cropRect(width, height, ratio) {
    if (!ratio) return { x: 0, y: 0, width: width, height: height };
    const target = ratio[0] / ratio[1];
    let w = width;
    let h = width / target;
    if (h > height) {
      h = height;
      w = height * target;
    }
    w = Math.round(w);
    h = Math.round(h);
    return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h };
  }

  /** Parse "16:9" into [16, 9]; "" or "free" gives null. */
  function parseRatio(text) {
    const m = /^(\d+):(\d+)$/.exec(String(text || '').trim());
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  /** Output format -> MIME type. "original" falls back to JPEG for unknown types. */
  function resolveMime(format, originalMime) {
    if (MIME[format]) return MIME[format];
    return EXT[originalMime] ? originalMime : MIME.jpeg;
  }

  /** "photo.HEIC" + "image/jpeg" + "small" -> "photo-small.jpg" */
  function outputName(originalName, mime, suffix) {
    const dot = String(originalName).lastIndexOf('.');
    const base = dot > 0 ? String(originalName).slice(0, dot) : String(originalName) || 'image';
    return base + (suffix ? '-' + suffix : '') + '.' + (EXT[mime] || 'jpg');
  }

  /** Percentage saved, e.g. (1000, 400) -> 60. Negative if the file grew. */
  function percentSaved(before, after) {
    if (!(before > 0)) return 0;
    return Math.round(((before - after) / before) * 100);
  }

  /**
   * Place an image on a page, centred and scaled down to fit inside the margins.
   * Returns PDF coordinates (origin bottom-left).
   */
  function fitImageOnPage(imgW, imgH, pageW, pageH, margin) {
    const m = margin || 0;
    const availW = pageW - 2 * m;
    const availH = pageH - 2 * m;
    if (!(availW > 0 && availH > 0)) throw new Error('Margin is too large for this page.');
    const scale = Math.min(availW / imgW, availH / imgH);
    const width = imgW * scale;
    const height = imgH * scale;
    return { x: (pageW - width) / 2, y: (pageH - height) / 2, width: width, height: height };
  }

  /**
   * Build a PDF with one image per page.
   * images: [{ bytes: Uint8Array, mime: "image/jpeg" | "image/png", width, height }]
   * options: { pageSize: "a4" | "letter" | "fit", margin: points }
   * With "a4"/"letter" the page turns landscape automatically for wide images.
   */
  async function imagesToPdf(images, options) {
    if (!images || images.length === 0) throw new Error('Add at least one image.');
    const opt = Object.assign({ pageSize: 'a4', margin: 24 }, options);
    const doc = await PDFLib.PDFDocument.create();
    for (const img of images) {
      let embedded;
      if (img.mime === 'image/jpeg') embedded = await doc.embedJpg(img.bytes);
      else if (img.mime === 'image/png') embedded = await doc.embedPng(img.bytes);
      else throw new Error('Only JPEG and PNG can be placed in a PDF.');

      let pageW;
      let pageH;
      let margin = opt.margin;
      if (opt.pageSize === 'fit') {
        pageW = img.width;
        pageH = img.height;
        margin = 0;
      } else {
        const size = PAGE_SIZES[opt.pageSize] || PAGE_SIZES.a4;
        const landscape = img.width > img.height;
        pageW = landscape ? size[1] : size[0];
        pageH = landscape ? size[0] : size[1];
      }
      const page = doc.addPage([pageW, pageH]);
      const r = fitImageOnPage(img.width, img.height, pageW, pageH, margin);
      page.drawImage(embedded, r);
    }
    return doc.save();
  }

  return {
    PAGE_SIZES: PAGE_SIZES,
    computeTargetSize: computeTargetSize,
    cropRect: cropRect,
    parseRatio: parseRatio,
    resolveMime: resolveMime,
    outputName: outputName,
    percentSaved: percentSaved,
    fitImageOnPage: fitImageOnPage,
    imagesToPdf: imagesToPdf,
  };
});
