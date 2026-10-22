/**
 * Office Calculators - core logic (pure functions, no DOM; unit-testable).
 *
 * Money is rounded to 2 decimals only when RESULTS are produced; inputs and
 * intermediate steps keep full precision so totals do not drift.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CalcCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  function needNumber(value, name) {
    const n = Number(value);
    if (value === '' || value === null || value === undefined || !Number.isFinite(n)) throw new Error('Enter a number for ' + name + '.');
    return n;
  }

  /**
   * Format a number using a locale: ("en-IN", 1234567.5) -> "12,34,567.50".
   * `decimals` is the maximum, `minDecimals` the minimum (defaults to `decimals`).
   */
  function formatNumber(locale, n, decimals, minDecimals) {
    const max = decimals === undefined ? 2 : decimals;
    const min = minDecimals === undefined ? max : minDecimals;
    return new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }).format(n);
  }

  // --------------------------------------------------------- Percentages

  const percentOf = (percent, value) => (needNumber(percent, 'the percentage') * needNumber(value, 'the number')) / 100;

  function whatPercent(part, whole) {
    const w = needNumber(whole, 'the total');
    if (w === 0) throw new Error('The total cannot be zero.');
    return (needNumber(part, 'the part') / w) * 100;
  }

  /** Percentage change from `from` to `to` (negative = decrease). */
  function percentChange(from, to) {
    const f = needNumber(from, 'the old value');
    if (f === 0) throw new Error('The old value cannot be zero.');
    return ((needNumber(to, 'the new value') - f) / Math.abs(f)) * 100;
  }

  const addPercent = (value, percent) => needNumber(value, 'the number') * (1 + needNumber(percent, 'the percentage') / 100);
  const subtractPercent = (value, percent) => needNumber(value, 'the number') * (1 - needNumber(percent, 'the percentage') / 100);

  // ------------------------------------------------------------- Loan EMI

  /**
   * Monthly instalment for a reducing-balance loan.
   * Returns { emi, totalPayment, totalInterest, schedule } where each schedule
   * row is { month, payment, interest, principal, balance } (rounded to 2 dp,
   * with the final row adjusted so the balance ends at exactly zero).
   */
  function loanEmi(principal, annualRatePercent, months) {
    const P = needNumber(principal, 'the loan amount');
    const rate = needNumber(annualRatePercent, 'the interest rate');
    const n = needNumber(months, 'the number of months');
    if (P <= 0) throw new Error('The loan amount must be more than zero.');
    if (rate < 0 || rate > 100) throw new Error('The interest rate must be between 0 and 100.');
    if (!Number.isInteger(n) || n < 1 || n > 1200) throw new Error('Months must be a whole number from 1 to 1200.');

    const r = rate / 12 / 100;
    const emi = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const emiRounded = round2(emi);

    const schedule = [];
    let balance = P;
    let totalPayment = 0;
    for (let month = 1; month <= n; month++) {
      const interest = round2(balance * r);
      let payment = emiRounded;
      let principalPart = round2(payment - interest);
      if (month === n) {
        principalPart = round2(balance);
        payment = round2(principalPart + interest);
      }
      balance = round2(balance - principalPart);
      totalPayment = round2(totalPayment + payment);
      schedule.push({ month: month, payment: payment, interest: interest, principal: principalPart, balance: Math.max(0, balance) });
    }
    return { emi: emiRounded, totalPayment: totalPayment, totalInterest: round2(totalPayment - P), schedule: schedule };
  }

  // ------------------------------------------------------------ GST / VAT

  /** Add tax to a price. Tax is also split in two halves (e.g. CGST + SGST). */
  function taxAdd(net, ratePercent) {
    const n = needNumber(net, 'the price');
    const rate = needNumber(ratePercent, 'the tax rate');
    if (rate < 0) throw new Error('The tax rate cannot be negative.');
    const tax = round2((n * rate) / 100);
    const half = round2(tax / 2);
    return { net: round2(n), tax: tax, gross: round2(round2(n) + tax), half1: half, half2: round2(tax - half) };
  }

  /** Remove tax from a tax-inclusive price. */
  function taxRemove(gross, ratePercent) {
    const g = needNumber(gross, 'the price');
    const rate = needNumber(ratePercent, 'the tax rate');
    if (rate < 0) throw new Error('The tax rate cannot be negative.');
    const net = round2(g / (1 + rate / 100));
    const tax = round2(round2(g) - net);
    const half = round2(tax / 2);
    return { net: net, tax: tax, gross: round2(g), half1: half, half2: round2(tax - half) };
  }

  // ---------------------------------------------------------------- Dates

  const DAY = 86400000;

  /** Parse "YYYY-MM-DD" into a UTC timestamp; rejects impossible dates. */
  function parseDate(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
    if (!m) throw new Error('Choose a valid date.');
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(t);
    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3]))
      throw new Error('That date does not exist.');
    return t;
  }

  const toIso = (t) => new Date(t).toISOString().slice(0, 10);
  const daysInMonth = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

  /** Weekdays (Mon-Fri) from start to end, counting both ends - like Excel NETWORKDAYS. */
  function countBusinessDays(startT, endT) {
    let count = 0;
    for (let t = startT; t <= endT; t += DAY) {
      const wd = new Date(t).getUTCDay();
      if (wd !== 0 && wd !== 6) count++;
    }
    return count;
  }

  /**
   * Difference between two dates. Order does not matter.
   * Returns { days, weeks, extraDays, years, months, daysPart, businessDays, reversed }.
   */
  function dateDiff(fromText, toText) {
    let a = parseDate(fromText);
    let b = parseDate(toText);
    const reversed = a > b;
    if (reversed) [a, b] = [b, a];
    const A = new Date(a);
    const B = new Date(b);
    // Whole months from A, clamping to month-end (31 Jan + 1 month = 28/29 Feb),
    // then the leftover days. This is how people count "2 years, 1 month, 1 day".
    const anchorAfter = (n) => {
      const idx = A.getUTCFullYear() * 12 + A.getUTCMonth() + n;
      const y = Math.floor(idx / 12);
      const m0 = idx - y * 12;
      return Date.UTC(y, m0, Math.min(A.getUTCDate(), daysInMonth(y, m0)));
    };
    let totalMonths = (B.getUTCFullYear() - A.getUTCFullYear()) * 12 + (B.getUTCMonth() - A.getUTCMonth());
    if (anchorAfter(totalMonths) > b) totalMonths--;
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const days = Math.round((b - anchorAfter(totalMonths)) / DAY);
    const total = Math.round((b - a) / DAY);
    return {
      days: total,
      weeks: Math.floor(total / 7),
      extraDays: total % 7,
      years: years,
      months: months,
      daysPart: days,
      businessDays: countBusinessDays(a, b),
      reversed: reversed,
    };
  }

  /** Add (or subtract) days. With businessOnly, weekends are skipped. */
  function addDays(dateText, amount, businessOnly) {
    const n = needNumber(amount, 'the number of days');
    if (!Number.isInteger(n)) throw new Error('The number of days must be whole.');
    let t = parseDate(dateText);
    if (!businessOnly) return toIso(t + n * DAY);
    const step = n < 0 ? -1 : 1;
    let left = Math.abs(n);
    while (left > 0) {
      t += step * DAY;
      const wd = new Date(t).getUTCDay();
      if (wd !== 0 && wd !== 6) left--;
    }
    return toIso(t);
  }

  // ---------------------------------------------------------------- Units

  /** Factor = how many base units one of this unit equals. */
  const UNITS = {
    length: { base: 'm', units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
    weight: { base: 'kg', units: { mg: 1e-6, g: 0.001, kg: 1, tonne: 1000, oz: 0.028349523125, lb: 0.45359237 } },
    area: { base: 'm²', units: { 'cm²': 1e-4, 'm²': 1, ha: 10000, 'km²': 1e6, 'ft²': 0.09290304, 'yd²': 0.83612736, acre: 4046.8564224 } },
    volume: {
      base: 'L',
      units: {
        ml: 0.001,
        L: 1,
        'm³': 1000,
        tsp: 0.00492892159375,
        tbsp: 0.01478676478125,
        'fl oz': 0.0295735295625,
        cup: 0.2365882365,
        pint: 0.473176473,
        gallon: 3.785411784,
      },
    },
    speed: { base: 'm/s', units: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 1852 / 3600 } },
    data: { base: 'B', units: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776 } },
    temperature: { base: '°C', units: { '°C': 0, '°F': 0, K: 0 } },
  };

  const TEMP_TO_C = { '°C': (v) => v, '°F': (v) => ((v - 32) * 5) / 9, K: (v) => v - 273.15 };
  const TEMP_FROM_C = { '°C': (v) => v, '°F': (v) => (v * 9) / 5 + 32, K: (v) => v + 273.15 };

  function convertUnit(category, value, from, to) {
    const cat = UNITS[category];
    if (!cat || !(from in cat.units) || !(to in cat.units)) throw new Error('Unknown unit.');
    const v = needNumber(value, 'the value');
    if (category === 'temperature') {
      const c = TEMP_TO_C[from](v);
      if (c < -273.15 - 1e-9) throw new Error('That is below absolute zero.');
      return TEMP_FROM_C[to](c);
    }
    return (v * cat.units[from]) / cat.units[to];
  }

  // ------------------------------------------------------------- Interest

  function simpleInterest(principal, annualRatePercent, years) {
    const P = needNumber(principal, 'the amount');
    const r = needNumber(annualRatePercent, 'the interest rate');
    const t = needNumber(years, 'the number of years');
    if (P < 0 || r < 0 || t < 0) throw new Error('Values cannot be negative.');
    const interest = (P * r * t) / 100;
    return { interest: round2(interest), total: round2(P + interest) };
  }

  /** timesPerYear: 1 = yearly, 4 = quarterly, 12 = monthly, 365 = daily. */
  function compoundInterest(principal, annualRatePercent, years, timesPerYear) {
    const P = needNumber(principal, 'the amount');
    const r = needNumber(annualRatePercent, 'the interest rate');
    const t = needNumber(years, 'the number of years');
    const n = needNumber(timesPerYear, 'the compounding frequency');
    if (P < 0 || r < 0 || t < 0) throw new Error('Values cannot be negative.');
    if (!(n >= 1)) throw new Error('Compounding must happen at least once a year.');
    const total = P * Math.pow(1 + r / 100 / n, n * t);
    return { interest: round2(total - P), total: round2(total) };
  }

  // ------------------------------------------------------ Discount / margin

  function discount(price, offPercent) {
    const p = needNumber(price, 'the price');
    const off = needNumber(offPercent, 'the discount');
    if (off < 0 || off > 100) throw new Error('The discount must be between 0 and 100%.');
    const saved = round2((p * off) / 100);
    return { saved: saved, final: round2(p - saved) };
  }

  /** Profit, margin (on selling price) and markup (on cost). */
  function margin(cost, sellingPrice) {
    const c = needNumber(cost, 'the cost');
    const s = needNumber(sellingPrice, 'the selling price');
    if (s === 0) throw new Error('The selling price cannot be zero.');
    if (c === 0) throw new Error('The cost cannot be zero.');
    return { profit: round2(s - c), marginPercent: ((s - c) / s) * 100, markupPercent: ((s - c) / c) * 100 };
  }

  /** Selling price needed to reach a target margin % (on the selling price). */
  function priceForMargin(cost, marginPercent) {
    const c = needNumber(cost, 'the cost');
    const m = needNumber(marginPercent, 'the margin');
    if (m >= 100) throw new Error('The margin must be below 100%.');
    return c / (1 - m / 100);
  }

  return {
    round2: round2,
    formatNumber: formatNumber,
    percentOf: percentOf,
    whatPercent: whatPercent,
    percentChange: percentChange,
    addPercent: addPercent,
    subtractPercent: subtractPercent,
    loanEmi: loanEmi,
    taxAdd: taxAdd,
    taxRemove: taxRemove,
    dateDiff: dateDiff,
    addDays: addDays,
    UNITS: UNITS,
    convertUnit: convertUnit,
    simpleInterest: simpleInterest,
    compoundInterest: compoundInterest,
    discount: discount,
    margin: margin,
    priceForMargin: priceForMargin,
  };
});
