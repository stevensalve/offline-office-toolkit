'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const core = require('../js/core.js');

const info = (rotation, extra) => Object.assign({ x0: 0, y0: 0, width: 600, height: 800, rotation: rotation }, extra);

test('displaySize swaps width/height for sideways pages', () => {
  assert.deepEqual(core.displaySize(info(0)), { width: 600, height: 800 });
  assert.deepEqual(core.displaySize(info(90)), { width: 800, height: 600 });
  assert.deepEqual(core.displaySize(info(270)), { width: 800, height: 600 });
  assert.deepEqual(core.displaySize(info(180)), { width: 600, height: 800 });
});

test('displayToUser: the four corners for every rotation', () => {
  // top-left of what the user sees
  assert.deepEqual(core.displayToUser(0, 0, info(0)), { x: 0, y: 800 });
  assert.deepEqual(core.displayToUser(0, 0, info(90)), { x: 0, y: 0 });
  assert.deepEqual(core.displayToUser(0, 0, info(180)), { x: 600, y: 0 });
  assert.deepEqual(core.displayToUser(0, 0, info(270)), { x: 600, y: 800 });
  // bottom-right of what the user sees
  assert.deepEqual(core.displayToUser(600, 800, info(0)), { x: 600, y: 0 });
  assert.deepEqual(core.displayToUser(800, 600, info(90)), { x: 600, y: 800 });
  assert.deepEqual(core.displayToUser(600, 800, info(180)), { x: 0, y: 800 });
  assert.deepEqual(core.displayToUser(800, 600, info(270)), { x: 0, y: 0 });
});

test('displayToUser and userToDisplay are inverses (incl. offset page boxes)', () => {
  for (const r of [0, 90, 180, 270, -90, 450]) {
    const i = info(r, { x0: 12, y0: 7 });
    const p = core.displayToUser(123.5, 77.25, i);
    const back = core.userToDisplay(p.x, p.y, i);
    assert.ok(Math.abs(back.u - 123.5) < 1e-9 && Math.abs(back.v - 77.25) < 1e-9, 'rotation ' + r);
  }
});

test('planText anchors at the baseline below the box top', () => {
  assert.deepEqual(core.planText({ x: 50, y: 100 }, info(0), 10), { x: 50, y: 690, rotate: 0 });
  assert.equal(core.planText({ x: 50, y: 100 }, info(90), 10).rotate, 90);
});

test('planImage anchors at the on-screen bottom-left', () => {
  assert.deepEqual(core.planImage({ x: 10, y: 20, w: 100, h: 40 }, info(0)), { x: 10, y: 740, width: 100, height: 40, rotate: 0 });
});

test('planCheck returns two connected segments inside the box', () => {
  const [a, b] = core.planCheck({ x: 100, y: 100, size: 20 }, info(0));
  assert.deepEqual(a.end, b.start);
  assert.ok(b.end.x > a.start.x && b.end.y > a.start.y, 'long stroke rises to the right');
});

test('clampBox keeps boxes on the page', () => {
  assert.deepEqual(core.clampBox({ x: 590, y: -5, w: 100, h: 50 }, info(0)), { x: 500, y: 0 });
});

test('formatDate', () => {
  const d = new Date(2026, 9, 5);
  assert.equal(core.formatDate(d, 'dd/mm/yyyy'), '05/10/2026');
  assert.equal(core.formatDate(d, 'mm/dd/yyyy'), '10/05/2026');
  assert.equal(core.formatDate(d, 'yyyy-mm-dd'), '2026-10-05');
  assert.equal(core.formatDate(d, 'd mmm yyyy'), '5 Oct 2026');
  assert.throws(() => core.formatDate(d, 'x'), /Unknown date format/);
});

test('sanitizeForFont', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(core.sanitizeForFont(font, '₹ 5\n中'), 'Rs. 5 ?');
});

// A small form PDF for the integration tests.
async function formPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  const name = form.createTextField('full_name');
  name.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 50, y: 650, width: 15, height: 15 });
  const color = form.createDropdown('colour');
  color.addOptions(['Red', 'Green']);
  color.addToPage(page, { x: 50, y: 600, width: 100, height: 20 });
  doc.addPage([600, 800]);
  return doc.save();
}

test('listFormFields describes fields; plain PDFs give an empty list', async () => {
  const fields = await core.listFormFields(await formPdf());
  assert.deepEqual(
    fields.map((f) => [f.name, f.type]),
    [
      ['full_name', 'text'],
      ['agree', 'checkbox'],
      ['colour', 'dropdown'],
    ],
  );
  assert.deepEqual(fields[2].options, ['Red', 'Green']);
  const plain = await PDFDocument.create();
  plain.addPage();
  assert.deepEqual(await core.listFormFields(await plain.save()), []);
});

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('applyEdits fills fields, draws items and keeps page count', async () => {
  const out = await core.applyEdits(await formPdf(), {
    fields: { full_name: 'Ann ₹', agree: true, colour: 'Green', missing_field: 'ignored' },
    items: [
      { type: 'text', page: 0, x: 100, y: 100, size: 12, text: 'Hello' },
      { type: 'check', page: 1, x: 200, y: 200, size: 18 },
      { type: 'signature', page: 1, x: 50, y: 300, w: 120, h: 40, imageId: 's1' },
      { type: 'text', page: 0, x: 0, y: 0, size: 12, text: '   ' }, // blank text is skipped
    ],
    images: { s1: new Uint8Array(PNG_1X1) },
  });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 2);
  const form = doc.getForm();
  assert.equal(form.getTextField('full_name').getText(), 'Ann Rs.');
  assert.equal(form.getCheckBox('agree').isChecked(), true);
  assert.deepEqual(form.getDropdown('colour').getSelected(), ['Green']);
});

test('applyEdits can flatten the form', async () => {
  const out = await core.applyEdits(await formPdf(), { fields: { full_name: 'Locked' }, flatten: true });
  assert.equal((await PDFDocument.load(out)).getForm().getFields().length, 0);
});

test('applyEdits works on rotated pages using the viewer-supplied page info', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]).setRotation(require('pdf-lib').degrees(90));
  const out = await core.applyEdits(await doc.save(), {
    pages: [{ x0: 0, y0: 0, width: 600, height: 800, rotation: 90 }],
    items: [{ type: 'text', page: 0, x: 10, y: 10, size: 12, text: 'Rotated' }],
  });
  assert.equal((await PDFDocument.load(out)).getPage(0).getRotation().angle, 90);
});

test('applyEdits ignores items for pages that do not exist', async () => {
  const out = await core.applyEdits(await formPdf(), { items: [{ type: 'text', page: 9, x: 0, y: 0, size: 12, text: 'x' }] });
  assert.equal((await PDFDocument.load(out)).getPageCount(), 2);
});
