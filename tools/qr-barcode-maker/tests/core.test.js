'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

// Test the exact files that ship in vendor/. The UTF-8 add-on expects a global `qrcode`.
const qrcode = require('../vendor/qrcode.js');
global.qrcode = qrcode;
require('../vendor/qrcode_UTF8.js');

test('normalizeUrl', () => {
  assert.equal(core.normalizeUrl('example.com/a'), 'https://example.com/a');
  assert.equal(core.normalizeUrl(' http://x.org '), 'http://x.org');
  assert.equal(core.normalizeUrl('mailto:a@b.co'), 'mailto:a@b.co');
  assert.throws(() => core.normalizeUrl('JavaScript:alert(1)'), /not allowed/);
  assert.throws(() => core.normalizeUrl(' '), /web address/);
});

test('wifiPayload escapes special characters and validates', () => {
  assert.equal(
    core.wifiPayload({ ssid: 'Home;Net', password: 'p:a"ss,\\', security: 'WPA' }),
    'WIFI:T:WPA;S:Home\\;Net;P:p\\:a\\"ss\\,\\\\;;',
  );
  assert.equal(core.wifiPayload({ ssid: 'Cafe', security: 'nopass' }), 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(core.wifiPayload({ ssid: 'A', password: 'b', hidden: true }), 'WIFI:T:WPA;S:A;P:b;H:true;;');
  assert.throws(() => core.wifiPayload({ ssid: '', password: 'x' }), /network name/);
  assert.throws(() => core.wifiPayload({ ssid: 'A', security: 'WPA' }), /password/);
});

test('vcardPayload', () => {
  const v = core.vcardPayload({ firstName: 'Ann', lastName: 'Lee', org: 'Acme, Inc', phone: '+91 98765-43210', email: 'a@b.co' });
  assert.match(
    v,
    /^BEGIN:VCARD\nVERSION:3\.0\nN:Lee;Ann;;;\nFN:Ann Lee\nORG:Acme\\, Inc\nTEL;TYPE=CELL:\+919876543210\nEMAIL:a@b\.co\nEND:VCARD$/,
  );
  assert.throws(() => core.vcardPayload({}), /name or a company/);
});

test('mailto, sms and tel payloads', () => {
  assert.equal(core.mailtoPayload({ to: 'a@b.co', subject: 'Hi there', body: 'x&y' }), 'mailto:a@b.co?subject=Hi%20there&body=x%26y');
  assert.equal(core.mailtoPayload({ to: 'a@b.co' }), 'mailto:a@b.co');
  assert.throws(() => core.mailtoPayload({ to: 'nope' }), /valid e-mail/);
  assert.equal(core.smsPayload({ number: '+1 (555) 123', message: 'Hello' }), 'SMSTO:+1555123:Hello');
  assert.equal(core.telPayload({ number: '98765 43210' }), 'tel:9876543210');
  assert.throws(() => core.telPayload({ number: '1' }), /valid phone/);
});

test('buildMatrix produces a square grid with finder patterns', () => {
  const m = core.buildMatrix(qrcode, 'hello', 'M');
  assert.equal(m.size, m.modules.length);
  assert.equal(m.size, 21); // version 1
  assert.deepEqual(m.modules[0].slice(0, 7), [true, true, true, true, true, true, true]); // top-left finder
  assert.throws(() => core.buildMatrix(qrcode, '', 'M'), /something to encode/);
  assert.throws(() => core.buildMatrix(qrcode, 'x'.repeat(5000), 'H'), /too much text/);
});

test('buildMatrix handles non-ASCII text (UTF-8 add-on)', () => {
  const m = core.buildMatrix(qrcode, '₹ é 中', 'L');
  assert.ok(m.size >= 21);
});

test('matrixToSvg validates colours and embeds viewBox with quiet zone', () => {
  const m = core.buildMatrix(qrcode, 'hi', 'L');
  const svg = core.matrixToSvg(m, { pixels: 200, quiet: 4, fg: '#112233', bg: '#ffffff' });
  assert.match(svg, new RegExp('viewBox="0 0 ' + (m.size + 8) + ' ' + (m.size + 8) + '"'));
  assert.match(svg, /fill="#112233"/);
  assert.throws(() => core.matrixToSvg(m, { fg: 'red' }), /Colours/);
});

test('contrast and scan warnings', () => {
  assert.equal(Math.round(core.contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(core.scanWarning('#000000', '#ffffff'), '');
  assert.match(core.scanWarning('#cccccc', '#ffffff'), /Low contrast/);
  assert.match(core.scanWarning('#ffffff', '#000000'), /Light-on-dark/);
});

test('EAN-13 check digit matches a real product code', () => {
  // 4006381333931 is the standard EAN-13 example (Stabilo pen).
  assert.equal(core.normalizeBarcodeValue('EAN13', '400638133393'), '4006381333931');
  assert.equal(core.normalizeBarcodeValue('EAN13', '4006381333931'), '4006381333931');
  assert.throws(() => core.normalizeBarcodeValue('EAN13', '4006381333930'), /should be 1/);
  assert.throws(() => core.normalizeBarcodeValue('EAN13', '123'), /needs 12 digits/);
  assert.throws(() => core.normalizeBarcodeValue('EAN13', '40063813339a'), /only accepts digits/);
});

test('other barcode types', () => {
  assert.equal(core.normalizeBarcodeValue('EAN8', '9638507'), '96385074'); // known EAN-8 example
  assert.equal(core.normalizeBarcodeValue('UPC', '03600029145'), '036000291452'); // known UPC-A example
  assert.equal(core.normalizeBarcodeValue('CODE128', 'Hello-123'), 'Hello-123');
  assert.throws(() => core.normalizeBarcodeValue('CODE128', 'café'), /plain English/);
  assert.equal(core.normalizeBarcodeValue('CODE39', 'AB-12'), 'AB-12');
  assert.throws(() => core.normalizeBarcodeValue('CODE39', 'ab'), /capital letters/);
  assert.throws(() => core.normalizeBarcodeValue('NOPE', '1'), /Unknown/);
  assert.throws(() => core.normalizeBarcodeValue('CODE128', '  '), /Enter a value/);
});
