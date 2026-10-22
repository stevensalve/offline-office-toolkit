'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const core = require('../js/core.js');

/** Build a throw-away PDF with `n` pages for testing. */
async function makePdf(n) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([200 + i, 300]); // width encodes the page number
  return doc.save();
}
const widths = async (bytes) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getWidth());

test('parsePageSpec: all / empty', () => {
  assert.deepEqual(core.parsePageSpec('all', 3), [0, 1, 2]);
  assert.deepEqual(core.parsePageSpec('  ', 3), [0, 1, 2]);
});

test('parsePageSpec: numbers, ranges, open ranges, order kept', () => {
  assert.deepEqual(core.parsePageSpec('1-3, 5', 6), [0, 1, 2, 4]);
  assert.deepEqual(core.parsePageSpec('4-', 6), [3, 4, 5]);
  assert.deepEqual(core.parsePageSpec('3,1,2', 3), [2, 0, 1]);
  assert.deepEqual(core.parsePageSpec('3-1', 3), [2, 1, 0]);
  assert.deepEqual(core.parsePageSpec('1,1', 2), [0, 0]);
});

test('parsePageSpec: rejects bad input with helpful messages', () => {
  assert.throws(() => core.parsePageSpec('0', 3), /out of range/);
  assert.throws(() => core.parsePageSpec('9', 3), /out of range/);
  assert.throws(() => core.parsePageSpec('a-b', 3), /Cannot understand/);
  assert.throws(() => core.parsePageSpec(',', 3), /No pages selected/);
  assert.throws(() => core.parsePageSpec('1', 0), /no pages/);
});

test('mergePdfs concatenates pages in order', async () => {
  const merged = await core.mergePdfs([await makePdf(2), await makePdf(3)]);
  assert.deepEqual(await widths(merged), [200, 201, 200, 201, 202]);
});

test('mergePdfs needs two files', async () => {
  await assert.rejects(async () => core.mergePdfs([await makePdf(1)]), /at least two/);
});

test('extractPages also re-orders', async () => {
  const out = await core.extractPages(await makePdf(4), [3, 0]);
  assert.deepEqual(await widths(out), [203, 200]);
});

test('deletePages removes only the chosen pages', async () => {
  const out = await core.deletePages(await makePdf(4), [1, 2]);
  assert.deepEqual(await widths(out), [200, 203]);
});

test('deletePages refuses to delete everything', async () => {
  await assert.rejects(async () => core.deletePages(await makePdf(2), [0, 1]), /every page/);
});

test('rotatePages is relative and wraps at 360', async () => {
  let bytes = await core.rotatePages(await makePdf(2), [0], 270);
  bytes = await core.rotatePages(bytes, [0], 180);
  const pages = (await PDFDocument.load(bytes)).getPages();
  assert.equal(pages[0].getRotation().angle, 90);
  assert.equal(pages[1].getRotation().angle, 0);
  await assert.rejects(() => core.rotatePages(bytes, [0], 45), /90, 180 or 270/);
});

test('splitEvery makes ceil(n/size) files', async () => {
  const parts = await core.splitEvery(await makePdf(5), 2);
  assert.equal(parts.length, 3);
  assert.deepEqual(
    parts.map((p) => [p.from, p.to]),
    [
      [1, 2],
      [3, 4],
      [5, 5],
    ],
  );
  assert.equal((await widths(parts[2].bytes)).length, 1);
  await assert.rejects(() => core.splitEvery(new Uint8Array(), 0), /whole number/);
});

test('invalid files give a friendly error', async () => {
  await assert.rejects(() => core.pageCount(new Uint8Array([1, 2, 3])), /could not be read as a PDF/);
});

test('outputName', () => {
  assert.equal(core.outputName('Report.PDF', 'merged'), 'Report-merged.pdf');
  assert.equal(core.outputName('', 'x'), 'document-x.pdf');
});
