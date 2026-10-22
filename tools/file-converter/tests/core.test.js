'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const core = require('../js/core.js');

test('detectDelimiter', () => {
  assert.equal(core.detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(core.detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(core.detectDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(core.detectDelimiter('just text'), ',');
});

test('parseCsv handles quotes, escaped quotes, newlines in cells, CRLF and BOM', () => {
  const csv = '\ufeffname,note\r\n"Smith, J","He said ""hi"""\r\n"multi\nline",x\r\n';
  assert.deepEqual(core.parseCsv(csv), [
    ['name', 'note'],
    ['Smith, J', 'He said "hi"'],
    ['multi\nline', 'x'],
  ]);
});

test('parseCsv: last line without newline, blank lines skipped, unclosed quote rejected', () => {
  assert.deepEqual(core.parseCsv('a,b\n\n1,2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
  assert.deepEqual(core.parseCsv('a;b\n1;2', ';'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
  assert.throws(() => core.parseCsv('a,"b\n'), /never closed/);
});

test('stringifyCsv quotes only when needed and round-trips', () => {
  const rows = [
    ['a', 'b,c', 'say "x"', 'two\nlines'],
    [1, null, undefined, 0],
  ];
  const text = core.stringifyCsv(rows);
  assert.equal(text, 'a,"b,c","say ""x""","two\nlines"\r\n1,,,0');
  assert.deepEqual(core.parseCsv(text), [
    ['a', 'b,c', 'say "x"', 'two\nlines'],
    ['1', '', '', '0'],
  ]);
});

test('stringifyCsv can neutralise spreadsheet formulas', () => {
  const out = core.stringifyCsv([['=1+1', '-5', '+SUM(A1)', '@x', 'ok']], ',', { protect: true });
  assert.equal(out, "'=1+1,-5,'+SUM(A1),'@x,ok");
  assert.equal(core.stringifyCsv([['=1']]), '=1');
});

test('flattenObject', () => {
  assert.deepEqual(core.flattenObject({ a: 1, b: { c: 2, d: { e: 3 } }, f: [1, 2] }), { a: 1, 'b.c': 2, 'b.d.e': 3, f: '[1,2]' });
});

test('jsonToRows: union of keys, nested, single object, primitives', () => {
  assert.deepEqual(core.jsonToRows([{ a: 1 }, { b: 2, a: 3 }]), [
    ['a', 'b'],
    [1, ''],
    [3, 2],
  ]);
  assert.deepEqual(core.jsonToRows({ x: { y: 1 } }), [['x.y'], [1]]);
  assert.deepEqual(core.jsonToRows([1, 2]), [['value'], [1], [2]]);
  assert.deepEqual(core.jsonToRows([]), []);
  assert.throws(() => core.jsonToRows('text'), /list of records/);
});

test('inferValue keeps IDs with leading zeros as text', () => {
  assert.equal(core.inferValue('42'), 42);
  assert.equal(core.inferValue('-3.5'), -3.5);
  assert.equal(core.inferValue('007'), '007');
  assert.equal(core.inferValue('12345678901234567890'), '12345678901234567890');
  assert.equal(core.inferValue('true'), true);
  assert.equal(core.inferValue('hello'), 'hello');
});

test('rowsToObjects: unique keys and optional type inference', () => {
  const rows = [
    ['id', 'id', ''],
    ['1', 'x'],
  ];
  assert.deepEqual(core.rowsToObjects(rows), [{ id: '1', id_2: 'x', column3: '' }]);
  assert.deepEqual(core.rowsToObjects(rows, { inferTypes: true }), [{ id: 1, id_2: 'x', column3: '' }]);
  assert.deepEqual(core.rowsToObjects([]), []);
});

test('wrapLine wraps at word boundaries and splits very long words', async () => {
  const measure = (s) => s.length; // 1 unit per character
  assert.deepEqual(core.wrapLine('aaa bbb ccc', 7, measure), ['aaa bbb', 'ccc']);
  assert.deepEqual(core.wrapLine('abcdefghij', 4, measure), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(core.wrapLine('', 4, measure), ['']);
});

test('sanitizeForFont swaps unsupported characters', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(core.sanitizeForFont(font, 'Price ₹500 …'), 'Price Rs.500 ...');
  assert.equal(core.sanitizeForFont(font, 'café 中'), 'café ?');
});

test('textToPdf paginates long text and validates input', async () => {
  const long = Array.from({ length: 200 }, (_, i) => 'Line number ' + i).join('\n');
  const pdf = await PDFDocument.load(await core.textToPdf(long, { fontSize: 12 }));
  assert.ok(pdf.getPageCount() >= 3);
  await assert.rejects(() => core.textToPdf('   '), /no text/);
  await assert.rejects(() => core.textToPdf('x', { fontSize: 2 }), /between 6 and 36/);
});
