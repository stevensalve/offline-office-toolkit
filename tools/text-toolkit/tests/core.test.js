'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

test('splitWords understands camelCase, snake, kebab and acronyms', () => {
  assert.deepEqual(core.splitWords('helloWorld_foo-bar baz'), ['hello', 'World', 'foo', 'bar', 'baz']);
  assert.deepEqual(core.splitWords('XMLHttpRequest'), ['XML', 'Http', 'Request']);
  assert.deepEqual(core.splitWords('  '), []);
});

test('convertCase: basic modes', () => {
  assert.equal(core.convertCase('Hello World', 'upper'), 'HELLO WORLD');
  assert.equal(core.convertCase('Hello World', 'lower'), 'hello world');
  assert.equal(core.convertCase('hELLO wORLD-test', 'title'), 'Hello World-Test');
  assert.equal(core.convertCase('Hello', 'toggle'), 'hELLO');
});

test('convertCase: sentence case restarts after . ! ? and new lines', () => {
  assert.equal(core.convertCase('HELLO there. how ARE you? fine!\nnew line', 'sentence'), 'Hello there. How are you? Fine!\nNew line');
});

test('convertCase: programmer styles', () => {
  assert.equal(core.convertCase('hello big world', 'camel'), 'helloBigWorld');
  assert.equal(core.convertCase('hello big world', 'pascal'), 'HelloBigWorld');
  assert.equal(core.convertCase('Hello Big World', 'snake'), 'hello_big_world');
  assert.equal(core.convertCase('helloBigWorld', 'kebab'), 'hello-big-world');
  assert.equal(core.convertCase('helloBigWorld', 'constant'), 'HELLO_BIG_WORLD');
  assert.throws(() => core.convertCase('x', 'nope'), /Unknown case/);
});

test('countStats', () => {
  const s = core.countStats('Hello world. This is a test!\n\nSecond paragraph here.');
  assert.equal(s.words, 9);
  assert.equal(s.sentences, 3);
  assert.equal(s.paragraphs, 2);
  assert.equal(s.lines, 3);
  assert.equal(s.characters, 'Hello world. This is a test!\n\nSecond paragraph here.'.length);
  assert.deepEqual(core.countStats(''), {
    characters: 0,
    charactersNoSpaces: 0,
    words: 0,
    sentences: 0,
    paragraphs: 0,
    lines: 0,
    readingMinutes: 0,
    speakingMinutes: 0,
  });
});

test('countStats counts emoji as one character', () => {
  assert.equal(core.countStats('a\u{1F600}').characters, 2);
});

test('formatMinutes', () => {
  assert.equal(core.formatMinutes(0), '0 min');
  assert.equal(core.formatMinutes(0.4), 'under 1 min');
  assert.equal(core.formatMinutes(3.2), 'about 4 min');
});

test('cleanLines: order of operations', () => {
  const input = '  b  \n\nA\n a \nB\n';
  assert.equal(core.cleanLines(input, { trim: true, removeEmpty: true, dedupe: true }), 'b\nA');
  assert.equal(core.cleanLines(input, { trim: true, removeEmpty: true, dedupe: true, sort: 'asc' }), 'A\nb');
  assert.equal(core.cleanLines('a\nb\nc', { reverse: true, number: true }), '1. c\n2. b\n3. a');
  assert.equal(core.cleanLines('a   b\t\tc', { collapse: true }), 'a b c');
  assert.equal(core.cleanLines('item10\nitem2', { sort: 'asc' }), 'item2\nitem10', 'natural number order');
});

test('findReplace: plain text is literal, counts matches', () => {
  assert.deepEqual(core.findReplace('a.b a.b', '.', '-'), { text: 'a-b a-b', count: 2 });
  assert.deepEqual(core.findReplace('Cat cat', 'cat', 'dog', { matchCase: true }), { text: 'Cat dog', count: 1 });
  assert.deepEqual(core.findReplace('cat concat', 'cat', 'dog', { wholeWord: true }), { text: 'dog concat', count: 1 });
});

test('findReplace: regex mode with capture groups and friendly errors', () => {
  assert.deepEqual(core.findReplace('John Smith', '(\\w+) (\\w+)', '$2, $1', { regex: true }), { text: 'Smith, John', count: 1 });
  assert.deepEqual(core.findReplace('a1 b22', '\\d+', '[$&]', { regex: true }), { text: 'a[1] b[22]', count: 2 });
  assert.throws(() => core.findReplace('x', '(', 'y', { regex: true }), /not valid/);
  assert.throws(() => core.findReplace('x', '', 'y'), /text to find/);
});

test('diffLines marks added, removed and unchanged lines', () => {
  const ops = core.diffLines('a\nb\nc\nd', 'a\nc\nd\ne');
  assert.deepEqual(
    ops.map((o) => o.type + ':' + o.text),
    ['same:a', 'del:b', 'same:c', 'same:d', 'add:e'],
  );
  assert.deepEqual(core.diffSummary(ops), { same: 3, add: 1, del: 1 });
});

test('diffLines options and edge cases', () => {
  assert.deepEqual(core.diffSummary(core.diffLines('Hello  World', 'hello world', { ignoreCase: true, ignoreSpace: true })), {
    same: 1,
    add: 0,
    del: 0,
  });
  assert.deepEqual(core.diffSummary(core.diffLines('', 'x\ny')), { same: 0, add: 2, del: 0 });
  assert.deepEqual(core.diffSummary(core.diffLines('same', 'same')), { same: 1, add: 0, del: 0 });
  assert.deepEqual(core.diffSummary(core.diffLines('x\r\ny', 'x\ny')), { same: 2, add: 0, del: 0 });
});

test('diffLines refuses absurdly large inputs instead of freezing', () => {
  const big = Array.from({ length: 2500 }, (_, i) => 'a' + i).join('\n');
  const other = Array.from({ length: 2500 }, (_, i) => 'b' + i).join('\n');
  assert.throws(() => core.diffLines(big, other), /too different and too long/);
});

test('extractors de-duplicate and tidy punctuation', () => {
  const text = 'Mail a.b@x.com, A.B@x.com or c@y.org. See https://x.com/a?b=1, and http://y.org.';
  assert.deepEqual(core.extractEmails(text), ['a.b@x.com', 'A.B@x.com', 'c@y.org']);
  assert.deepEqual(core.extractUrls(text), ['https://x.com/a?b=1', 'http://y.org']);
  assert.deepEqual(core.extractNumbers('Total 1,200.50 and -3 and 7, 7'), ['1,200.50', '-3', '7']);
});
