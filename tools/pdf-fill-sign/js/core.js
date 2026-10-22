/**
 * PDF Fill & Sign - core logic (no DOM; unit-testable in Node).
 *
 * Coordinate model
 * ----------------
 * The user places things on a picture of the page (what they SEE). We store
 * every item in "display points": origin at the top-left of the displayed
 * page, 1 point = 1/72 inch, already accounting for page rotation.
 * When saving, `displayToUser()` converts those points into the PDF's own
 * coordinate system (origin bottom-left, unrotated, offset by the page's
 * visible box). Getting this conversion right is what makes a signature land
 * where the user dropped it, even on rotated or cropped pages.
 *
 * pageInfo = { x0, y0, width, height, rotation }
 *   x0,y0,width,height - the page's visible box in PDF user space (unrotated)
 *   rotation           - 0, 90, 180 or 270 (clockwise, as displayed)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'));
  } else {
    root.FillCore = factory(root.PDFLib);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib) {
  'use strict';

  /**
   * Distance from the top of a text box to its baseline, as a fraction of the
   * font size. The on-screen editor (line-height: 1) and the saved PDF both use
   * this value, so text lands exactly where it was typed.
   */
  const TEXT_BASELINE = 0.85;

  const normRotation = (r) => (((Math.round((Number(r) || 0) / 90) * 90) % 360) + 360) % 360;

  /** Size of the page as the user sees it (width/height swap for 90/270). */
  function displaySize(info) {
    const r = normRotation(info.rotation);
    return r === 90 || r === 270 ? { width: info.height, height: info.width } : { width: info.width, height: info.height };
  }

  /** Display point (u right, v down) -> PDF user-space point. */
  function displayToUser(u, v, info) {
    const r = normRotation(info.rotation);
    let x;
    let y;
    if (r === 0) {
      x = u;
      y = info.height - v;
    } else if (r === 90) {
      x = v;
      y = u;
    } else if (r === 180) {
      x = info.width - u;
      y = v;
    } else {
      x = info.width - v;
      y = info.height - u;
    }
    return { x: info.x0 + x, y: info.y0 + y };
  }

  /** Inverse of displayToUser (used by tests and by hit-testing helpers). */
  function userToDisplay(x, y, info) {
    const r = normRotation(info.rotation);
    const lx = x - info.x0;
    const ly = y - info.y0;
    if (r === 0) return { u: lx, v: info.height - ly };
    if (r === 90) return { u: ly, v: lx };
    if (r === 180) return { u: info.width - lx, v: ly };
    return { u: info.height - ly, v: info.width - lx };
  }

  /** Keep an item's box inside the displayed page. */
  function clampBox(item, info) {
    const d = displaySize(info);
    const w = Math.min(item.w || 0, d.width);
    const h = Math.min(item.h || 0, d.height);
    return { x: Math.max(0, Math.min(item.x, d.width - w)), y: Math.max(0, Math.min(item.y, d.height - h)) };
  }

  // ---------------------------------------------------- Drawing plans

  /** Where to draw a line of text whose TOP-LEFT is (item.x, item.y) on screen. */
  function planText(item, info, ascent) {
    const p = displayToUser(item.x, item.y + ascent, info);
    return { x: p.x, y: p.y, rotate: normRotation(info.rotation) };
  }

  /** Where to draw an image whose top-left is (item.x, item.y) and size w x h. */
  function planImage(item, info) {
    const p = displayToUser(item.x, item.y + item.h, info); // bottom-left on screen
    return { x: p.x, y: p.y, width: item.w, height: item.h, rotate: normRotation(info.rotation) };
  }

  /** The check mark as two line segments in PDF space. */
  function planCheck(item, info) {
    const s = item.size;
    const pts = [
      [item.x + 0.1 * s, item.y + 0.55 * s],
      [item.x + 0.4 * s, item.y + 0.88 * s],
      [item.x + 0.92 * s, item.y + 0.12 * s],
    ].map((p) => displayToUser(p[0], p[1], info));
    return [
      { start: pts[0], end: pts[1] },
      { start: pts[1], end: pts[2] },
    ];
  }

  // ------------------------------------------------------------- Text

  /** Replace characters a standard PDF font cannot draw. */
  function sanitizeForFont(font, text) {
    const supported = new Set(font.getCharacterSet());
    const replacements = { '₹': 'Rs.', '…': '...', ' ': ' ', '\t': '    ', '\n': ' ' };
    let out = '';
    for (const ch of String(text)) {
      if (replacements[ch] !== undefined) out += replacements[ch];
      else if (supported.has(ch.codePointAt(0))) out += ch;
      else out += '?';
    }
    return out;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** format: "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "d mmm yyyy" */
  function formatDate(date, format) {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const p2 = (n) => String(n).padStart(2, '0');
    switch (format) {
      case 'dd/mm/yyyy':
        return p2(d) + '/' + p2(m) + '/' + y;
      case 'mm/dd/yyyy':
        return p2(m) + '/' + p2(d) + '/' + y;
      case 'yyyy-mm-dd':
        return y + '-' + p2(m) + '-' + p2(d);
      case 'd mmm yyyy':
        return d + ' ' + MONTHS[m - 1] + ' ' + y;
      default:
        throw new Error('Unknown date format: ' + format);
    }
  }

  // ------------------------------------------------------ PDF form fields

  /** Describe the fillable fields in a PDF (empty list if it has none). */
  async function listFormFields(bytes) {
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: false });
    const out = [];
    doc
      .getForm()
      .getFields()
      .forEach(function (f) {
        const name = f.getName();
        if (f instanceof PDFLib.PDFTextField) out.push({ name: name, type: 'text', value: f.getText() || '', readOnly: f.isReadOnly() });
        else if (f instanceof PDFLib.PDFCheckBox)
          out.push({ name: name, type: 'checkbox', value: f.isChecked(), readOnly: f.isReadOnly() });
        else if (f instanceof PDFLib.PDFDropdown)
          out.push({ name: name, type: 'dropdown', value: f.getSelected()[0] || '', options: f.getOptions(), readOnly: f.isReadOnly() });
        else if (f instanceof PDFLib.PDFRadioGroup)
          out.push({ name: name, type: 'radio', value: f.getSelected() || '', options: f.getOptions(), readOnly: f.isReadOnly() });
      });
    return out;
  }

  /**
   * Produce the final PDF.
   * edits = {
   *   items:   [{ type: "text"|"check"|"signature", page, x, y, w, h, size, text, imageId }],
   *   images:  { [imageId]: Uint8Array (PNG) },
   *   pages:   [pageInfo, ...]   // one per page, from the viewer
   *   fields:  { [fieldName]: string | boolean },
   *   flatten: boolean
   * }
   */
  async function applyEdits(bytes, edits) {
    const doc = await PDFLib.PDFDocument.load(bytes);
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const pages = doc.getPages();
    const infoFor = function (index) {
      const given = edits.pages && edits.pages[index];
      if (given) return given;
      const p = pages[index];
      return { x0: 0, y0: 0, width: p.getWidth(), height: p.getHeight(), rotation: p.getRotation().angle };
    };

    // 1. Form fields
    const values = edits.fields || {};
    if (Object.keys(values).length) {
      const form = doc.getForm();
      for (const name of Object.keys(values)) {
        const field = form.getFieldMaybe(name);
        if (!field) continue;
        const v = values[name];
        try {
          if (field instanceof PDFLib.PDFTextField) field.setText(sanitizeForFont(font, v));
          else if (field instanceof PDFLib.PDFCheckBox) v ? field.check() : field.uncheck();
          else if (field instanceof PDFLib.PDFDropdown && v !== '') field.select(String(v));
          else if (field instanceof PDFLib.PDFRadioGroup && v !== '') field.select(String(v));
        } catch (e) {
          throw new Error('Could not fill the field "' + name + '": ' + e.message);
        }
      }
    }

    // 2. Items drawn on top of pages
    const embedded = {};
    for (const item of edits.items || []) {
      const page = pages[item.page];
      if (!page) continue;
      const info = infoFor(item.page);
      if (item.type === 'text') {
        const size = item.size || 12;
        const text = sanitizeForFont(font, item.text || '');
        if (!text.trim()) continue;
        const plan = planText(item, info, size * TEXT_BASELINE);
        page.drawText(text, {
          x: plan.x,
          y: plan.y,
          size: size,
          font: font,
          color: PDFLib.rgb(0, 0, 0),
          rotate: PDFLib.degrees(plan.rotate),
        });
      } else if (item.type === 'check') {
        const thickness = Math.max(1, item.size / 9);
        planCheck(item, info).forEach((seg) =>
          page.drawLine({ start: seg.start, end: seg.end, thickness: thickness, color: PDFLib.rgb(0, 0, 0) }),
        );
      } else if (item.type === 'signature') {
        const png = edits.images && edits.images[item.imageId];
        if (!png) continue;
        if (!embedded[item.imageId]) embedded[item.imageId] = await doc.embedPng(png);
        const plan = planImage(item, info);
        page.drawImage(embedded[item.imageId], {
          x: plan.x,
          y: plan.y,
          width: plan.width,
          height: plan.height,
          rotate: PDFLib.degrees(plan.rotate),
        });
      }
    }

    // 3. Optionally make form values permanent
    if (edits.flatten) doc.getForm().flatten();
    return doc.save();
  }

  return {
    TEXT_BASELINE: TEXT_BASELINE,
    normRotation: normRotation,
    displaySize: displaySize,
    displayToUser: displayToUser,
    userToDisplay: userToDisplay,
    clampBox: clampBox,
    planText: planText,
    planImage: planImage,
    planCheck: planCheck,
    sanitizeForFont: sanitizeForFont,
    formatDate: formatDate,
    listFormFields: listFormFields,
    applyEdits: applyEdits,
  };
});
