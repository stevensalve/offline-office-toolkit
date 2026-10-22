/**
 * Document Generator - PDF layout with pdf-lib (A4, standard fonts).
 * Works in the browser and in Node, so the layout can be tested.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('pdf-lib'), require('./core.js'));
  } else {
    root.DocPdf = factory(root.PDFLib, root.DocCore);
  }
})(typeof self !== 'undefined' ? self : this, function (PDFLib, DocCore) {
  'use strict';

  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 48;
  const INK = rgb(0.11, 0.14, 0.19);
  const MUTED = rgb(0.42, 0.46, 0.52);
  const LINE = rgb(0.82, 0.85, 0.89);
  const ACCENT = rgb(0.12, 0.37, 0.82);

  /** Tiny drawing helper that tracks the cursor and starts new pages. */
  async function createCanvas() {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const c = { doc: doc, font: font, bold: bold, page: null, y: 0 };
    c.newPage = function () {
      c.page = doc.addPage([PAGE_W, PAGE_H]);
      c.y = PAGE_H - MARGIN;
    };
    c.clean = (t) => DocCore.sanitizeForFont(font, t);
    c.width = (t, size, f) => (f || font).widthOfTextAtSize(c.clean(t), size);
    c.text = function (t, x, y, size, opts) {
      const o = opts || {};
      const f = o.bold ? bold : font;
      const s = c.clean(t);
      const drawX = o.align === 'right' ? x - f.widthOfTextAtSize(s, size) : x;
      c.page.drawText(s, { x: drawX, y: y, size: size, font: f, color: o.color || INK });
    };
    c.rule = (y, color) =>
      c.page.drawLine({ start: { x: MARGIN, y: y }, end: { x: PAGE_W - MARGIN, y: y }, thickness: 0.6, color: color || LINE });
    c.ensure = function (needed) {
      if (c.y - needed < MARGIN + 30) c.newPage();
    };
    c.newPage();
    return c;
  }

  /** Draw wrapped text lines at the cursor; returns lines used. */
  function paragraph(c, text, x, maxWidth, size, opts) {
    const o = opts || {};
    const f = o.bold ? c.bold : c.font;
    const lines = DocCore.wrapText(c.clean(text), maxWidth, (s) => f.widthOfTextAtSize(s, size));
    lines.forEach(function (line) {
      c.ensure(size * 1.4);
      if (line) c.text(line, x, c.y - size, size, o);
      c.y -= size * 1.4;
    });
    return lines.length;
  }

  async function embedLogo(c, logo) {
    if (!logo || !logo.bytes) return null;
    try {
      return logo.mime === 'image/png' ? await c.doc.embedPng(logo.bytes) : await c.doc.embedJpg(logo.bytes);
    } catch (e) {
      return null; // a broken logo should never block the document
    }
  }

  /**
   * Build an invoice or receipt. `data` follows DocCore.emptyInvoice().
   * data.kind: "invoice" | "receipt" (receipt adds a PAID line).
   */
  async function buildInvoicePdf(data) {
    const problems = DocCore.validateInvoice(data);
    if (problems.length) throw new Error(problems[0]);
    const calc = DocCore.calcInvoice(data.items, { discountPercent: data.discountPercent });
    const money = (v) => data.currency + ' ' + DocCore.formatAmount(data.locale || 'en-US', v);
    const c = await createCanvas();
    const isReceipt = data.kind === 'receipt';

    // ---- Header: logo + seller on the left, title and numbers on the right
    let leftY = c.y;
    const logo = await embedLogo(c, data.logo);
    if (logo) {
      const scale = Math.min(140 / logo.width, 56 / logo.height, 1);
      c.page.drawImage(logo, { x: MARGIN, y: leftY - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
      leftY -= logo.height * scale + 8;
    }
    c.y = leftY;
    c.text(data.seller.name, MARGIN, c.y - 14, 14, { bold: true });
    c.y -= 20;
    [data.seller.address, data.seller.taxId && 'Tax ID: ' + data.seller.taxId, data.seller.contact]
      .filter(Boolean)
      .forEach((t) => paragraph(c, t, MARGIN, 260, 9, { color: MUTED }));
    const leftEnd = c.y;

    const rightX = PAGE_W - MARGIN;
    let ry = PAGE_H - MARGIN;
    c.text(isReceipt ? 'RECEIPT' : 'INVOICE', rightX, ry - 22, 22, { bold: true, color: ACCENT, align: 'right' });
    ry -= 34;
    [['No.', data.number], ['Date', data.date], !isReceipt && data.dueDate ? ['Due', data.dueDate] : null]
      .filter(Boolean)
      .forEach(function (row) {
        c.text(row[0] + ':', rightX - 110, ry - 10, 10, { color: MUTED });
        c.text(row[1], rightX, ry - 10, 10, { align: 'right' });
        ry -= 14;
      });
    c.y = Math.min(leftEnd, ry) - 18;

    // ---- Bill to
    c.rule(c.y);
    c.y -= 12;
    c.text(isReceipt ? 'RECEIVED FROM' : 'BILL TO', MARGIN, c.y - 9, 9, { bold: true, color: MUTED });
    c.y -= 14;
    c.text(data.client.name, MARGIN, c.y - 11, 11, { bold: true });
    c.y -= 16;
    [data.client.address, data.client.taxId && 'Tax ID: ' + data.client.taxId]
      .filter(Boolean)
      .forEach((t) => paragraph(c, t, MARGIN, 300, 9.5));
    c.y -= 10;

    // ---- Items table
    const col = { desc: MARGIN, qty: 330, rate: 400, tax: 440, amount: PAGE_W - MARGIN };
    const header = function () {
      c.page.drawRectangle({ x: MARGIN, y: c.y - 20, width: PAGE_W - 2 * MARGIN, height: 20, color: rgb(0.94, 0.96, 0.98) });
      c.text('Description', col.desc + 6, c.y - 14, 9, { bold: true });
      c.text('Qty', col.qty, c.y - 14, 9, { bold: true, align: 'right' });
      c.text('Rate', col.rate, c.y - 14, 9, { bold: true, align: 'right' });
      c.text('Tax', col.tax + 22, c.y - 14, 9, { bold: true, align: 'right' });
      c.text('Amount', col.amount - 6, c.y - 14, 9, { bold: true, align: 'right' });
      c.y -= 24;
    };
    header();
    calc.lines.forEach(function (l) {
      const descLines = DocCore.wrapText(c.clean(l.description), col.qty - col.desc - 50, (s) => c.font.widthOfTextAtSize(s, 10));
      const h = Math.max(1, descLines.length) * 13 + 6;
      if (c.y - h < MARGIN + 60) {
        c.newPage();
        header();
      }
      descLines.forEach((line, i) => c.text(line, col.desc + 6, c.y - 11 - i * 13, 10));
      c.text(String(l.qty), col.qty, c.y - 11, 10, { align: 'right' });
      c.text(DocCore.formatAmount(data.locale || 'en-US', l.rate), col.rate, c.y - 11, 10, { align: 'right' });
      c.text(l.taxPercent ? l.taxPercent + '%' : '-', col.tax + 22, c.y - 11, 10, { align: 'right' });
      c.text(DocCore.formatAmount(data.locale || 'en-US', l.net), col.amount - 6, c.y - 11, 10, { align: 'right' });
      c.y -= h;
      c.rule(c.y);
    });

    // ---- Totals
    c.ensure(110);
    c.y -= 12;
    const totals = [['Subtotal', calc.subtotal]];
    if (calc.discountTotal) totals.push(['Discount (' + Number(data.discountPercent) + '%)', -calc.discountTotal]);
    Object.keys(calc.taxByRate).forEach((r) => totals.push(['Tax @ ' + r + '%', calc.taxByRate[r]]));
    totals.forEach(function (t) {
      c.text(t[0], col.amount - 150, c.y - 10, 10, { color: MUTED });
      c.text((t[1] < 0 ? '-' : '') + money(Math.abs(t[1])), col.amount - 6, c.y - 10, 10, { align: 'right' });
      c.y -= 16;
    });
    c.rule(c.y - 2, INK);
    c.y -= 8;
    c.text(isReceipt ? 'Total received' : 'Total due', col.amount - 150, c.y - 13, 12, { bold: true });
    c.text(money(calc.total), col.amount - 6, c.y - 13, 12, { bold: true, align: 'right' });
    c.y -= 30;
    if (isReceipt && data.paymentMethod) {
      c.text('Paid by: ' + data.paymentMethod, MARGIN, c.y - 10, 10, { bold: true });
      c.y -= 22;
    }

    // ---- Notes / payment details
    [
      ['Payment details', data.paymentDetails],
      ['Notes', data.notes],
    ].forEach(function (block) {
      if (!String(block[1] || '').trim()) return;
      c.ensure(50);
      c.text(block[0].toUpperCase(), MARGIN, c.y - 9, 9, { bold: true, color: MUTED });
      c.y -= 14;
      paragraph(c, block[1], MARGIN, PAGE_W - 2 * MARGIN, 9.5);
      c.y -= 8;
    });

    // ---- Page numbers
    const pages = c.doc.getPages();
    pages.forEach((p, i) =>
      p.drawText(c.clean('Page ' + (i + 1) + ' of ' + pages.length), { x: PAGE_W / 2 - 24, y: 24, size: 8, font: c.font, color: MUTED }),
    );
    c.doc.setTitle((isReceipt ? 'Receipt ' : 'Invoice ') + data.number);
    c.doc.setCreator('Offline Office Toolkit');
    return c.doc.save();
  }

  /** Build a simple business letter. */
  async function buildLetterPdf(data) {
    const problems = DocCore.validateLetter(data);
    if (problems.length) throw new Error(problems[0]);
    const c = await createCanvas();
    const width = PAGE_W - 2 * MARGIN;

    const block = (name, address, align) => {
      c.text(name, align === 'right' ? PAGE_W - MARGIN : MARGIN, c.y - 11, 11, { bold: true, align: align });
      c.y -= 16;
      String(address || '')
        .split('\n')
        .filter(Boolean)
        .forEach(function (line) {
          c.text(line, align === 'right' ? PAGE_W - MARGIN : MARGIN, c.y - 10, 10, { color: MUTED, align: align });
          c.y -= 13;
        });
    };
    block(data.senderName, data.senderAddress, 'right');
    c.y -= 14;
    c.text(data.date, MARGIN, c.y - 10, 10);
    c.y -= 28;
    block(data.recipientName, data.recipientAddress, 'left');
    c.y -= 16;
    if (String(data.subject || '').trim()) {
      paragraph(c, 'Subject: ' + data.subject, MARGIN, width, 11, { bold: true });
      c.y -= 8;
    }
    paragraph(c, data.salutation || 'Dear ' + data.recipientName + ',', MARGIN, width, 11);
    c.y -= 6;
    paragraph(c, data.body, MARGIN, width, 11);
    c.y -= 14;
    paragraph(c, data.closing || 'Sincerely,', MARGIN, width, 11);
    c.y -= 36;
    c.text(data.senderName, MARGIN, c.y - 11, 11, { bold: true });
    c.doc.setTitle('Letter to ' + data.recipientName);
    c.doc.setCreator('Offline Office Toolkit');
    return c.doc.save();
  }

  return { buildInvoicePdf: buildInvoicePdf, buildLetterPdf: buildLetterPdf };
});
