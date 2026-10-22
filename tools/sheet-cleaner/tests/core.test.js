'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

const T = (headers, rows) => ({ headers, rows });

test('fromRows: unique non-empty headers, rectangular rows', () => {
  const t = core.fromRows([['Name', '', 'name'], ['a'], ['b', 1, 2]]);
  assert.deepEqual(t.headers, ['Name', 'Column 2', 'name (2)']);
  assert.deepEqual(t.rows, [
    ['a', '', ''],
    ['b', 1, 2],
  ]);
  // data wider than the header row is kept, not silently dropped
  assert.deepEqual(core.fromRows([['A'], [1, 2]]).headers, ['A', 'Column 2']);
  assert.deepEqual(core.fromRows([]), { headers: [], rows: [] });
});

test('toRows is the inverse of fromRows', () => {
  const aoa = [
    ['A', 'B'],
    [1, 2],
  ];
  assert.deepEqual(core.toRows(core.fromRows(aoa)), aoa);
});

test('trimCells trims text only and never mutates input', () => {
  const input = T(['A'], [['  hi  there '], [5]]);
  const out = core.trimCells(input, { collapse: true });
  assert.deepEqual(out.rows, [['hi there'], [5]]);
  assert.equal(input.rows[0][0], '  hi  there ');
});

test('removeEmptyRows', () => {
  const r = core.removeEmptyRows(
    T(
      ['A', 'B'],
      [
        ['x', ''],
        ['', '  '],
        [0, ''],
      ],
    ),
  );
  assert.equal(r.removed, 1);
  assert.equal(r.table.rows.length, 2);
});

test('removeDuplicates: whole row, ignoring case/space by default', () => {
  const t = T(
    ['Name', 'City'],
    [
      ['Ann', 'Pune'],
      [' ann ', 'PUNE'],
      ['Bob', 'Pune'],
    ],
  );
  const r = core.removeDuplicates(t);
  assert.equal(r.removed, 1);
  assert.deepEqual(
    r.table.rows.map((x) => x[0]),
    ['Ann', 'Bob'],
  );
});

test('removeDuplicates: by chosen columns and match case', () => {
  const t = T(
    ['Name', 'City'],
    [
      ['Ann', 'Pune'],
      ['Ann', 'Delhi'],
      ['ann', 'X'],
    ],
  );
  assert.equal(core.removeDuplicates(t, ['Name']).table.rows.length, 1);
  assert.equal(core.removeDuplicates(t, ['Name'], { matchCase: true }).table.rows.length, 2);
  assert.throws(() => core.removeDuplicates(t, ['Nope']), /Column not found/);
});

test('changeCase', () => {
  const t = T(['N'], [["mary-ann o'neil"], [7]]);
  assert.equal(core.changeCase(t, 'N', 'upper').rows[0][0], "MARY-ANN O'NEIL");
  assert.equal(core.changeCase(t, 0, 'title').rows[0][0], "Mary-Ann O'Neil");
  assert.equal(core.changeCase(t, 0, 'lower').rows[1][0], 7);
  assert.throws(() => core.changeCase(t, 0, 'weird'), /Unknown case/);
});

test('splitColumn pads short rows and can keep the original', () => {
  const t = T(
    ['Name', 'Age'],
    [
      ['Smith, John', 1],
      ['Cher', 2],
    ],
  );
  const r = core.splitColumn(t, 'Name', ',');
  assert.deepEqual(r.headers, ['Name 1', 'Name 2', 'Age']);
  assert.deepEqual(r.rows, [
    ['Smith', 'John', 1],
    ['Cher', '', 2],
  ]);
  assert.equal(core.splitColumn(t, 'Name', ',', { keep: true }).headers.length, 4);
  assert.throws(() => core.splitColumn(t, 'Name', ''), /delimiter/);
});

test('findReplace: counts, case, whole cell, all columns', () => {
  const t = T(
    ['A', 'B'],
    [
      ['Foo bar', 'foo'],
      ['x', 'FOO'],
    ],
  );
  const r = core.findReplace(t, 'all', 'foo', 'baz');
  assert.equal(r.count, 3);
  assert.deepEqual(r.table.rows, [
    ['baz bar', 'baz'],
    ['x', 'baz'],
  ]);
  assert.equal(core.findReplace(t, 'A', 'foo', 'z', { matchCase: true }).count, 0);
  assert.equal(core.findReplace(t, 'B', 'foo', 'z', { wholeCell: true }).count, 2);
  assert.equal(core.findReplace(T(['A'], [['a.b']]), 0, '.', '-').table.rows[0][0], 'a-b', 'special characters are literal');
  assert.throws(() => core.findReplace(t, 0, '', 'x'), /text to find/);
});

test('dropColumns', () => {
  const t = T(['A', 'B', 'C'], [[1, 2, 3]]);
  assert.deepEqual(core.dropColumns(t, ['B']), T(['A', 'C'], [[1, 3]]));
  assert.throws(() => core.dropColumns(t, ['A', 'B', 'C']), /every column/);
});

test('sortBy: numeric, text, descending, blanks last, stable', () => {
  const t = T(['V'], [['10'], ['9'], [''], ['abc'], [2]]);
  assert.deepEqual(
    core.sortBy(T(['V'], [['10'], ['9'], [''], [2]]), 'V', 'asc').rows.map((r) => r[0]),
    [2, '9', '10', ''],
  );
  assert.deepEqual(
    core.sortBy(T(['V'], [['10'], ['9'], [''], [2]]), 'V', 'desc').rows.map((r) => r[0]),
    ['10', '9', 2, ''],
  );
  assert.equal(core.sortBy(t, 'V', 'asc').rows.length, 5);
});

test('compareTables finds added, removed and changed rows', () => {
  const a = T(
    ['ID', 'Name', 'City'],
    [
      [1, 'Ann', 'Pune'],
      [2, 'Bob', 'Delhi'],
      [3, 'Cy', 'Goa'],
    ],
  );
  const b = T(
    ['id', 'name', 'city'],
    [
      [1, 'Ann', 'Pune'],
      [2, 'Bob', 'Mumbai'],
      [4, 'Di', 'Goa'],
    ],
  );
  const r = core.compareTables(a, b, 'ID', 'id');
  assert.equal(r.same, 1);
  assert.deepEqual(r.onlyInA.rows, [[3, 'Cy', 'Goa']]);
  assert.deepEqual(r.onlyInB.rows, [[4, 'Di', 'Goa']]);
  assert.deepEqual(r.changed, [{ key: '2', changes: [{ column: 'City', a: 'Delhi', b: 'Mumbai' }] }]);
  assert.deepEqual(core.changesToTable(r.changed).rows, [['2', 'City', 'Delhi', 'Mumbai']]);
  assert.deepEqual(r.sharedColumns, ['Name', 'City']);
});

test('lookupMerge works like VLOOKUP and avoids duplicate headers', () => {
  const a = T(
    ['ID', 'Name'],
    [
      [1, 'Ann'],
      [2, 'Bob'],
      [9, 'Zed'],
    ],
  );
  const b = T(
    ['Code', 'Name', 'Dept'],
    [
      ['1', 'A.', 'HR'],
      [2, 'B.', 'IT'],
      [2, 'dup', 'XX'],
    ],
  );
  const r = core.lookupMerge(a, b, 'ID', 'Code', ['Name', 'Dept']);
  assert.deepEqual(r.table.headers, ['ID', 'Name', 'Name (B)', 'Dept']);
  assert.deepEqual(r.table.rows, [
    [1, 'Ann', 'A.', 'HR'],
    [2, 'Bob', 'B.', 'IT'],
    [9, 'Zed', '', ''],
  ]);
  assert.equal(r.matched, 2);
  assert.equal(r.unmatched, 1);
  assert.throws(() => core.lookupMerge(a, b, 'ID', 'Code', []), /at least one/);
});
