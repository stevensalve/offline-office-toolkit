'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../js/core.js');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' !~ ' + b);

test('formatNumber uses locale grouping (Indian lakh style)', () => {
  assert.equal(c.formatNumber('en-IN', 1234567.5), '12,34,567.50');
  assert.equal(c.formatNumber('en-US', 1234567.5), '1,234,567.50');
  assert.equal(c.formatNumber('en-US', 7, 0), '7');
  assert.equal(c.formatNumber('en-US', 7.5, 4, 0), '7.5');
  assert.equal(c.formatNumber('de-DE', 300, 4, 0), '300');
});

test('percentages', () => {
  assert.equal(c.percentOf(15, 200), 30);
  assert.equal(c.whatPercent(50, 200), 25);
  assert.equal(c.percentChange(80, 100), 25);
  assert.equal(c.percentChange(100, 80), -20);
  assert.equal(c.addPercent(200, 18), 236);
  assert.equal(c.subtractPercent(200, 10), 180);
  assert.throws(() => c.whatPercent(1, 0), /cannot be zero/);
  assert.throws(() => c.percentChange(0, 5), /cannot be zero/);
  assert.throws(() => c.percentOf('', 5), /Enter a number/);
  assert.throws(() => c.percentOf('abc', 5), /Enter a number/);
});

test('loanEmi matches the standard formula', () => {
  // 10 lakh at 8.5% for 20 years: widely quoted EMI is about 8678.
  const r = c.loanEmi(1000000, 8.5, 240);
  assert.equal(Math.round(r.emi), 8678);
  assert.equal(r.schedule.length, 240);
  assert.equal(r.schedule[239].balance, 0);
  assert.ok(Math.abs(r.totalPayment - r.emi * 240) < 5, 'final payment adjusts by a few rupees at most');
  close(r.totalInterest, r.totalPayment - 1000000, 0.01);
});

test('loanEmi: schedule is internally consistent', () => {
  const r = c.loanEmi(50000, 12, 12);
  let balance = 50000;
  for (const row of r.schedule) {
    balance = c.round2(balance - row.principal);
    assert.equal(row.balance, balance);
    close(row.payment, row.principal + row.interest, 0.011);
  }
  assert.equal(balance, 0);
});

test('loanEmi: zero interest and validation', () => {
  const r = c.loanEmi(1200, 0, 12);
  assert.equal(r.emi, 100);
  assert.equal(r.totalInterest, 0);
  assert.throws(() => c.loanEmi(0, 5, 12), /more than zero/);
  assert.throws(() => c.loanEmi(1000, 5, 0), /whole number/);
  assert.throws(() => c.loanEmi(1000, 5, 12.5), /whole number/);
  assert.throws(() => c.loanEmi(1000, 150, 12), /between 0 and 100/);
});

test('taxAdd / taxRemove are inverses and split tax in halves', () => {
  assert.deepEqual(c.taxAdd(1000, 18), { net: 1000, tax: 180, gross: 1180, half1: 90, half2: 90 });
  assert.deepEqual(c.taxRemove(1180, 18), { net: 1000, tax: 180, gross: 1180, half1: 90, half2: 90 });
  const odd = c.taxAdd(0.5, 5); // 0.025 tax -> rounds to 0.03; halves must still add up
  assert.equal(c.round2(odd.half1 + odd.half2), odd.tax);
  assert.throws(() => c.taxAdd(100, -1), /negative/);
});

test('dateDiff: years, months, days, business days', () => {
  const d = c.dateDiff('2024-01-31', '2026-03-01');
  assert.equal(d.days, 760);
  assert.deepEqual([d.years, d.months, d.daysPart], [2, 1, 1]);
  assert.equal(d.reversed, false);
  const same = c.dateDiff('2026-10-22', '2026-10-22');
  assert.equal(same.days, 0);
  assert.equal(same.businessDays, 1); // Thursday counted (inclusive)
  // Mon 2026-10-19 .. Sun 2026-10-25 contains 5 weekdays
  assert.equal(c.dateDiff('2026-10-19', '2026-10-25').businessDays, 5);
});

test('dateDiff: order independent, handles leap day and month borrow', () => {
  const r = c.dateDiff('2026-03-10', '2026-01-05');
  assert.equal(r.reversed, true);
  assert.equal(r.days, 64);
  assert.deepEqual([r.years, r.months, r.daysPart], [0, 2, 5]);
  assert.equal(c.dateDiff('2024-02-28', '2024-03-01').days, 2);
  assert.throws(() => c.dateDiff('2026-02-30', '2026-03-01'), /does not exist/);
  assert.throws(() => c.dateDiff('', '2026-03-01'), /valid date/);
});

test('addDays: calendar and business days', () => {
  assert.equal(c.addDays('2026-10-22', 10), '2026-11-01');
  assert.equal(c.addDays('2026-10-22', -22), '2026-09-30');
  assert.equal(c.addDays('2026-10-23', 1, true), '2026-10-26'); // Fri + 1 business day = Mon
  assert.equal(c.addDays('2026-10-26', -1, true), '2026-10-23'); // Mon - 1 = Fri
  assert.equal(c.addDays('2026-10-22', 5, true), '2026-10-29');
  assert.throws(() => c.addDays('2026-10-22', 1.5), /whole/);
});

test('convertUnit', () => {
  close(c.convertUnit('length', 1, 'mi', 'km'), 1.609344);
  close(c.convertUnit('weight', 1, 'lb', 'g'), 453.59237);
  close(c.convertUnit('area', 1, 'acre', 'ha'), 0.40468564224);
  close(c.convertUnit('volume', 1, 'gallon', 'L'), 3.785411784);
  close(c.convertUnit('speed', 36, 'km/h', 'm/s'), 10);
  close(c.convertUnit('data', 1, 'GiB', 'MiB'), 1024);
  close(c.convertUnit('data', 1, 'GB', 'MB'), 1000);
});

test('convertUnit: temperature', () => {
  close(c.convertUnit('temperature', 100, '°C', '°F'), 212);
  close(c.convertUnit('temperature', 32, '°F', '°C'), 0);
  close(c.convertUnit('temperature', 0, '°C', 'K'), 273.15);
  assert.throws(() => c.convertUnit('temperature', -300, '°C', 'K'), /absolute zero/);
  assert.throws(() => c.convertUnit('length', 1, 'm', 'zzz'), /Unknown unit/);
});

test('interest', () => {
  assert.deepEqual(c.simpleInterest(10000, 5, 3), { interest: 1500, total: 11500 });
  assert.deepEqual(c.compoundInterest(10000, 10, 2, 1), { interest: 2100, total: 12100 });
  assert.equal(c.compoundInterest(1000, 12, 1, 12).total, 1126.83);
  assert.throws(() => c.simpleInterest(-1, 5, 1), /negative/);
  assert.throws(() => c.compoundInterest(1, 5, 1, 0), /at least once/);
});

test('discount and margin', () => {
  assert.deepEqual(c.discount(999, 15), { saved: 149.85, final: 849.15 });
  assert.throws(() => c.discount(100, 120), /between 0 and 100/);
  const m = c.margin(80, 100);
  assert.equal(m.profit, 20);
  close(m.marginPercent, 20);
  close(m.markupPercent, 25);
  assert.throws(() => c.margin(0, 5), /cost cannot be zero/);
  close(c.priceForMargin(80, 20), 100);
  assert.throws(() => c.priceForMargin(80, 100), /below 100/);
});
