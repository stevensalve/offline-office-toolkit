'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const core = require('../js/core.js');

// A valid 1x1 pixel PNG.
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('computeTargetSize: none keeps size', () => {
  assert.deepEqual(core.computeTargetSize(4000, 3000, { mode: 'none' }), { width: 4000, height: 3000 });
});

test('computeTargetSize: max fits inside the box and keeps aspect', () => {
  assert.deepEqual(core.computeTargetSize(4000, 3000, { mode: 'max', maxWidth: 1000, maxHeight: 1000 }), { width: 1000, height: 750 });
  assert.deepEqual(core.computeTargetSize(3000, 4000, { mode: 'max', maxWidth: 1000 }), { width: 1000, height: 1333 });
});

test('computeTargetSize: max never enlarges; empty limits ignored', () => {
  assert.deepEqual(core.computeTargetSize(500, 400, { mode: 'max', maxWidth: 1000 }), { width: 500, height: 400 });
  assert.deepEqual(core.computeTargetSize(500, 400, { mode: 'max', maxWidth: '', maxHeight: 0 }), { width: 500, height: 400 });
});

test('computeTargetSize: percent and validation', () => {
  assert.deepEqual(core.computeTargetSize(1000, 500, { mode: 'percent', percent: 50 }), { width: 500, height: 250 });
  assert.throws(() => core.computeTargetSize(1000, 500, { mode: 'percent', percent: 0 }), /between 1 and 500/);
  assert.throws(() => core.computeTargetSize(0, 500, {}), /no size/);
});

test('cropRect centres the largest rectangle with the ratio', () => {
  assert.deepEqual(core.cropRect(400, 300, [1, 1]), { x: 50, y: 0, width: 300, height: 300 });
  assert.deepEqual(core.cropRect(300, 400, [16, 9]), { x: 0, y: 116, width: 300, height: 169 });
  assert.deepEqual(core.cropRect(400, 300, null), { x: 0, y: 0, width: 400, height: 300 });
});

test('parseRatio', () => {
  assert.deepEqual(core.parseRatio('16:9'), [16, 9]);
  assert.equal(core.parseRatio('free'), null);
  assert.equal(core.parseRatio(''), null);
});

test('resolveMime / outputName', () => {
  assert.equal(core.resolveMime('webp', 'image/png'), 'image/webp');
  assert.equal(core.resolveMime('original', 'image/png'), 'image/png');
  assert.equal(core.resolveMime('original', 'image/heic'), 'image/jpeg');
  assert.equal(core.outputName('photo.HEIC', 'image/jpeg', 'small'), 'photo-small.jpg');
  assert.equal(core.outputName('a.b.png', 'image/webp'), 'a.b.webp');
});

test('percentSaved', () => {
  assert.equal(core.percentSaved(1000, 400), 60);
  assert.equal(core.percentSaved(1000, 1200), -20);
  assert.equal(core.percentSaved(0, 5), 0);
});

test('fitImageOnPage scales down and centres', () => {
  const r = core.fitImageOnPage(1000, 500, 600, 800, 50);
  assert.equal(r.width, 500);
  assert.equal(r.height, 250);
  assert.equal(r.x, 50);
  assert.equal(r.y, 275);
  assert.throws(() => core.fitImageOnPage(10, 10, 100, 100, 60), /Margin is too large/);
});

test('imagesToPdf makes one page per image, landscape for wide images', async () => {
  const bytes = await core.imagesToPdf(
    [
      { bytes: PNG_1X1, mime: 'image/png', width: 100, height: 200 },
      { bytes: PNG_1X1, mime: 'image/png', width: 300, height: 100 },
    ],
    { pageSize: 'a4', margin: 10 },
  );
  const pages = (await PDFDocument.load(bytes)).getPages();
  assert.equal(pages.length, 2);
  assert.ok(pages[0].getWidth() < pages[0].getHeight(), 'portrait');
  assert.ok(pages[1].getWidth() > pages[1].getHeight(), 'landscape');
});

test('imagesToPdf "fit" uses the image size; rejects unsupported types', async () => {
  const bytes = await core.imagesToPdf([{ bytes: PNG_1X1, mime: 'image/png', width: 120, height: 80 }], { pageSize: 'fit' });
  const page = (await PDFDocument.load(bytes)).getPages()[0];
  assert.equal(Math.round(page.getWidth()), 120);
  await assert.rejects(() => core.imagesToPdf([{ bytes: PNG_1X1, mime: 'image/webp', width: 1, height: 1 }]), /JPEG and PNG/);
  await assert.rejects(() => core.imagesToPdf([]), /at least one/);
});
