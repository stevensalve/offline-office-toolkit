'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const core = require('../js/core.js');
const pdf = require('../js/pdf.js');

test('calcInvoice: line totals, tax and grand total', () => {
  const r = core.calcInvoice([
    { description: 'Design', qty: 2, rate: 1500, taxPercent: 18 },
    { description: 'Hosting', qty: 1, rate: 499.99, taxPercent: 0 },
  ]);
  assert.equal(r.subtotal, 3499.99);
  assert.equal(r.taxTotal, 540);
  assert.equal(r.total, 4039.99);
  assert.deepEqual(r.taxByRate, { 18: 540 });
  assert.equal(r.lines[0].total, 3540);
});

test('calcInvoice: discount applies before tax', () => {
  const r = core.calcInvoice([{ description: 'A', qty: 1, rate: 1000, taxPercent: 10 }], { discountPercent: 20 });
  assert.equal(r.discountTotal, 200);
  assert.equal(r.taxTotal, 80); // 10% of 800
  assert.equal(r.total, 880);
});

test('calcInvoice: no floating point drift (0.1 + 0.2 style)', () => {
  const r = core.calcInvoice([
    { description: 'x', qty: 3, rate: 0.1, taxPercent: 0 },
    { description: 'y', qty: 1, rate: 0.2, taxPercent: 0 },
  ]);
  assert.equal(r.total, 0.5);
});

test('calcInvoice: blank rows ignored; bad numbers rejected', () => {
  assert.equal(core.calcInvoice([{ description: '', qty: '', rate: '' }]).lines.length, 0);
  assert.throws(() => core.calcInvoice([{ description: 'x', qty: -1, rate: 5 }]), /cannot be negative/);
  assert.throws(() => core.calcInvoice([], { discountPercent: 150 }), /between 0 and 100/);
});

test('nextNumber keeps padding and suffix', () => {
  assert.equal(core.nextNumber('INV-0009'), 'INV-0010');
  assert.equal(core.nextNumber('2026/7'), '2026/8');
  assert.equal(core.nextNumber('A-99-X'), 'A-100-X');
  assert.equal(core.nextNumber('ABC'), 'ABC-001');
  assert.equal(core.nextNumber(''), 'INV-001');
});

test('validateInvoice / validateLetter report plain-language problems', () => {
  const inv = core.emptyInvoice('2026-10-22');
  assert.deepEqual(core.validateInvoice(inv).length, 3);
  inv.seller.name = 'Me';
  inv.client.name = 'You';
  inv.items = [{ description: 'Thing', qty: 1, rate: 10 }];
  assert.deepEqual(core.validateInvoice(inv), []);
  assert.equal(core.validateLetter({}).length, 3);
  assert.deepEqual(core.validateLetter({ senderName: 'a', recipientName: 'b', body: 'c' }), []);
});

test('formatAmount and wrapText', () => {
  assert.equal(core.formatAmount('en-IN', 1234567.5), '12,34,567.50');
  assert.deepEqual(
    core.wrapText('aaa bbb\n\nccc', 7, (s) => s.length),
    ['aaa bbb', '', 'ccc'],
  );
});

test('sanitizeForFont maps the rupee sign', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(core.sanitizeForFont(font, '₹ 100'), 'Rs. 100');
});

function sampleInvoice(extra) {
  const inv = core.emptyInvoice('2026-10-22');
  inv.seller = {
    name: 'Acme Traders',
    address: '12 Main Road\nPune 411001',
    taxId: 'GSTIN 27ABCDE1234F1Z5',
    contact: 'accounts@acme.example',
  };
  inv.client = { name: 'Beta Industries', address: '5 Park Street', taxId: '' };
  inv.items = [{ description: 'Consulting', qty: 2, rate: 5000, taxPercent: 18 }];
  inv.notes = 'Thank you for your business.';
  return Object.assign(inv, extra);
}

test('buildInvoicePdf produces a valid one-page A4 PDF', async () => {
  const bytes = await pdf.buildInvoicePdf(sampleInvoice());
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(Math.round(doc.getPage(0).getWidth()), 595);
  assert.match(doc.getTitle(), /Invoice INV-0001/);
});

test('buildInvoicePdf paginates long item lists and handles long descriptions', async () => {
  const items = Array.from({ length: 70 }, (_, i) => ({
    description: 'Item ' + i + ' ' + 'long description '.repeat(i % 4 ? 1 : 8),
    qty: 1,
    rate: 10 + i,
    taxPercent: 5,
  }));
  const doc = await PDFDocument.load(await pdf.buildInvoicePdf(sampleInvoice({ items: items })));
  assert.ok(doc.getPageCount() >= 2);
});

test('buildInvoicePdf: receipt, discount, rupee symbol, odd characters', async () => {
  const bytes = await pdf.buildInvoicePdf(
    sampleInvoice({
      kind: 'receipt',
      paymentMethod: 'UPI',
      discountPercent: 10,
      currency: '₹',
      client: { name: 'Zoë 中', address: '', taxId: '' },
    }),
  );
  assert.match((await PDFDocument.load(bytes)).getTitle(), /Receipt/);
});

test('buildInvoicePdf rejects incomplete data', async () => {
  await assert.rejects(() => pdf.buildInvoicePdf(core.emptyInvoice('2026-10-22')), /business name/);
});

test('buildLetterPdf', async () => {
  const bytes = await pdf.buildLetterPdf({
    senderName: 'Me',
    senderAddress: 'Line1\nLine2',
    recipientName: 'You',
    recipientAddress: 'Addr',
    date: '22 Oct 2026',
    subject: 'Hello',
    body: 'Para one.\n\n' + 'Long text '.repeat(400),
  });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 2);
  await assert.rejects(() => pdf.buildLetterPdf({}), /sender name/);
});
