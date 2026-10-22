/**
 * Document Generator - core logic (pure functions, no DOM, no pdf-lib).
 * Money maths is done in whole cents so totals always add up on paper.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DocCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const toCents = (x) => Math.round((Number(x) + Number.EPSILON) * 100);
  const fromCents = (c) => c / 100;
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));

  /**
   * Work out every line and the totals of an invoice.
   * items: [{ description, qty, rate, taxPercent }]
   * options: { discountPercent }  (applied to each line before tax)
   * Rows with no description AND no amount are ignored (blank form rows).
   * Returns amounts in normal currency units, rounded to 2 decimals.
   */
  function calcInvoice(items, options) {
    const discountPercent = num(options && options.discountPercent);
    if (discountPercent < 0 || discountPercent > 100) throw new Error('Discount must be between 0 and 100%.');
    const lines = [];
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const taxByRate = {};
    (items || []).forEach(function (item) {
      const qty = num(item.qty);
      const rate = num(item.rate);
      const taxPercent = num(item.taxPercent);
      const description = String(item.description || '').trim();
      if (!description && qty * rate === 0) return;
      if (qty < 0 || rate < 0 || taxPercent < 0) throw new Error('Quantity, rate and tax cannot be negative.');
      const net = toCents(qty * rate);
      const discount = Math.round((net * discountPercent) / 100);
      const taxable = net - discount;
      const tax = Math.round((taxable * taxPercent) / 100);
      subtotal += net;
      discountTotal += discount;
      taxTotal += tax;
      if (tax) taxByRate[taxPercent] = (taxByRate[taxPercent] || 0) + tax;
      lines.push({
        description: description,
        qty: qty,
        rate: rate,
        taxPercent: taxPercent,
        net: fromCents(net),
        discount: fromCents(discount),
        tax: fromCents(tax),
        total: fromCents(taxable + tax),
      });
    });
    Object.keys(taxByRate).forEach((k) => (taxByRate[k] = fromCents(taxByRate[k])));
    return {
      lines: lines,
      subtotal: fromCents(subtotal),
      discountTotal: fromCents(discountTotal),
      taxTotal: fromCents(taxTotal),
      total: fromCents(subtotal - discountTotal + taxTotal),
      taxByRate: taxByRate,
    };
  }

  /** "INV-0009" -> "INV-0010"; "2026/7" -> "2026/8"; "ABC" -> "ABC-001". */
  function nextNumber(previous) {
    const text = String(previous || '').trim();
    const m = /^(.*?)(\d+)(\D*)$/.exec(text);
    if (!m) return (text || 'INV') + '-001';
    const next = String(Number(m[2]) + 1).padStart(m[2].length, '0');
    return m[1] + next + m[3];
  }

  /** Friendly list of problems that should stop PDF creation. */
  function validateInvoice(data) {
    const problems = [];
    if (!String((data.seller && data.seller.name) || '').trim()) problems.push('Enter your business name.');
    if (!String((data.client && data.client.name) || '').trim()) problems.push('Enter the client name.');
    if (!String(data.number || '').trim()) problems.push('Enter a document number.');
    try {
      const calc = calcInvoice(data.items, { discountPercent: data.discountPercent });
      if (calc.lines.length === 0) problems.push('Add at least one item.');
      calc.lines.forEach(function (l, i) {
        if (!l.description) problems.push('Item ' + (i + 1) + ' needs a description.');
      });
    } catch (e) {
      problems.push(e.message);
    }
    return problems;
  }

  function validateLetter(data) {
    const problems = [];
    if (!String(data.senderName || '').trim()) problems.push('Enter the sender name.');
    if (!String(data.recipientName || '').trim()) problems.push('Enter the recipient name.');
    if (!String(data.body || '').trim()) problems.push('Write the letter text.');
    return problems;
  }

  /** Characters the standard PDF fonts cannot draw are swapped for safe ones. */
  function sanitizeForFont(font, text) {
    const supported = new Set(font.getCharacterSet());
    const replacements = { '₹': 'Rs.', '…': '...', '→': '->', ' ': ' ', '\t': '    ' };
    let out = '';
    for (const ch of String(text)) {
      if (ch === '\n') out += ch;
      else if (replacements[ch] !== undefined) out += replacements[ch];
      else if (supported.has(ch.codePointAt(0))) out += ch;
      else out += '?';
    }
    return out;
  }

  /** Greedy word-wrap; `measure(str)` gives the drawn width. Long words are split. */
  function wrapLine(line, maxWidth, measure) {
    if (line === '') return [''];
    const lines = [];
    let current = '';
    for (const word of line.split(/(?<=\s)/)) {
      if (measure((current + word).trimEnd()) <= maxWidth) {
        current += word;
        continue;
      }
      if (current) lines.push(current.trimEnd());
      current = '';
      let rest = word;
      while (measure(rest.trimEnd()) > maxWidth && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && measure(rest.slice(0, n)) > maxWidth) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      current = rest;
    }
    lines.push(current.trimEnd());
    return lines;
  }

  /** Wrap multi-line text (keeps blank lines). */
  const wrapText = (text, maxWidth, measure) =>
    String(text)
      .split('\n')
      .flatMap((l) => wrapLine(l, maxWidth, measure));

  /** 1234.5 -> "1,234.50" in the chosen locale. */
  function formatAmount(locale, value) {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  /** A fresh, empty invoice with sensible defaults. */
  function emptyInvoice(todayIso) {
    return {
      kind: 'invoice',
      number: 'INV-0001',
      date: todayIso,
      dueDate: '',
      currency: '₹',
      locale: 'en-IN',
      seller: { name: '', address: '', taxId: '', contact: '' },
      client: { name: '', address: '', taxId: '' },
      items: [{ description: '', qty: 1, rate: 0, taxPercent: 0 }],
      discountPercent: 0,
      notes: '',
      paymentDetails: '',
      paymentMethod: '',
      logo: null,
    };
  }

  return {
    calcInvoice: calcInvoice,
    nextNumber: nextNumber,
    validateInvoice: validateInvoice,
    validateLetter: validateLetter,
    sanitizeForFont: sanitizeForFont,
    wrapLine: wrapLine,
    wrapText: wrapText,
    formatAmount: formatAmount,
    emptyInvoice: emptyInvoice,
  };
});
