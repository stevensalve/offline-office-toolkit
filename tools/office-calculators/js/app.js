/* Office Calculators - user interface. All maths lives in core.js. */
(function () {
  'use strict';

  const { bindTabs, downloadBlob, el } = OT;
  const $ = (id) => document.getElementById(id);
  const num = (id) => $(id).value;

  bindTabs($('tabs'));

  // ----------------------------------------------------------- Formatting
  const fmt = (n, d, min) => CalcCore.formatNumber($('set-locale').value, n, d, min);
  const money = (n) => $('set-currency').value + (n < 0 ? '-' : '') + fmt(Math.abs(n));
  const pct = (n) => fmt(n, 2) + '%';

  /**
   * Render [label, value, big?] rows into a <dl>. If `compute` throws, show the
   * message instead - but stay quiet while a field is simply still empty.
   */
  function show(dl, compute) {
    dl.textContent = '';
    try {
      compute().forEach(function (row) {
        dl.appendChild(el('dt', { text: row[0] }));
        dl.appendChild(el('dd', { text: row[1], class: row[2] ? 'big' : '' }));
      });
    } catch (err) {
      dl.appendChild(el('dd', { text: err.message, class: 'error' }));
    }
  }

  /** Re-run `render` whenever any input in `root` changes (and once now). */
  function live(root, render) {
    root.querySelectorAll('input, select').forEach((c) => {
      c.addEventListener('input', render);
      c.addEventListener('change', render);
    });
    render();
  }

  const renders = [];
  const register = (panelId, render) => {
    live($(panelId), render);
    renders.push(render);
  };
  // Changing locale/currency re-renders every calculator.
  ['set-locale', 'set-currency'].forEach((id) => $(id).addEventListener('change', () => renders.forEach((r) => r())));

  // ------------------------------------------------------------ Percentage
  register('panel-pct', function () {
    const mode = $('pct-mode').value;
    const labels = {
      of: ['X (%)', 'Y (the number)'],
      what: ['X (the part)', 'Y (the total)'],
      change: ['X (old value)', 'Y (new value)'],
      add: ['X (%)', 'Y (the number)'],
      sub: ['X (%)', 'Y (the number)'],
    }[mode];
    $('pct-x-label').textContent = labels[0];
    $('pct-y-label').textContent = labels[1];
    show($('panel-pct').querySelector('dl'), function () {
      const x = num('pct-x');
      const y = num('pct-y');
      switch (mode) {
        case 'of':
          return [['Answer', fmt(CalcCore.percentOf(x, y), 4, 0), true]];
        case 'what':
          return [['Answer', pct(CalcCore.whatPercent(x, y)), true]];
        case 'change': {
          const c = CalcCore.percentChange(x, y);
          return [
            ['Change', (c >= 0 ? '+' : '') + pct(c), true],
            ['Direction', c > 0 ? 'Increase' : c < 0 ? 'Decrease' : 'No change'],
          ];
        }
        case 'add':
          return [['Answer', fmt(CalcCore.addPercent(y, x)), true]];
        default:
          return [['Answer', fmt(CalcCore.subtractPercent(y, x)), true]];
      }
    });
  });

  // ------------------------------------------------------------------ EMI
  let schedule = [];
  function renderSchedule(full) {
    const box = $('emi-table');
    box.textContent = '';
    const rows = full ? schedule : schedule.slice(0, 12);
    const head = el(
      'tr',
      {},
      ['Month', 'Payment', 'Interest', 'Principal', 'Balance'].map((h) =>
        el('th', { scope: 'col', class: h === 'Month' ? '' : 'num', text: h }),
      ),
    );
    const body = rows.map((r) =>
      el('tr', {}, [
        el('td', { text: String(r.month) }),
        ...[r.payment, r.interest, r.principal, r.balance].map((v) => el('td', { class: 'num', text: fmt(v) })),
      ]),
    );
    box.appendChild(el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)]));
  }

  $('emi-toggle').addEventListener('click', function () {
    const showing = !$('emi-table').hidden;
    $('emi-table').hidden = showing;
    $('emi-toggle').textContent = showing ? 'Show full schedule' : 'Hide schedule';
  });

  $('emi-csv').addEventListener('click', function () {
    if (!schedule.length) return;
    const lines = ['Month,Payment,Interest,Principal,Balance'].concat(
      schedule.map((r) => [r.month, r.payment, r.interest, r.principal, r.balance].join(',')),
    );
    downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'emi-schedule.csv');
  });

  register('panel-emi', function () {
    show($('panel-emi').querySelector('dl'), function () {
      const months = Number(num('emi-n')) * Number($('emi-unit').value);
      const r = CalcCore.loanEmi(num('emi-p'), num('emi-r'), months);
      schedule = r.schedule;
      renderSchedule(false);
      $('emi-csv').disabled = false;
      return [
        ['Monthly EMI', money(r.emi), true],
        ['Total interest', money(r.totalInterest)],
        ['Total payment', money(r.totalPayment)],
        ['Number of payments', String(months)],
      ];
    });
    if (!$('panel-emi').querySelector('dl dt')) {
      schedule = [];
      $('emi-table').textContent = '';
      $('emi-csv').disabled = true;
    }
  });

  // ------------------------------------------------------------- GST / VAT
  register('panel-tax', function () {
    const mode = $('tax-mode').value;
    $('tax-amount-label').textContent = mode === 'add' ? 'Price (before tax)' : 'Price (including tax)';
    show($('panel-tax').querySelector('dl'), function () {
      const r =
        mode === 'add' ? CalcCore.taxAdd(num('tax-amount'), num('tax-rate')) : CalcCore.taxRemove(num('tax-amount'), num('tax-rate'));
      const half = Number(num('tax-rate')) / 2;
      return [
        ['Price before tax', money(r.net)],
        ['Tax', money(r.tax)],
        ['Price including tax', money(r.gross), true],
        ['Split in two halves (' + fmt(half, 2, 0) + '% each)', money(r.half1) + ' + ' + money(r.half2)],
      ];
    });
  });

  // ----------------------------------------------------------------- Dates
  const today = new Date().toISOString().slice(0, 10);
  ['d-from', 'd-to', 'a-from'].forEach((id) => ($(id).value = today));

  register('panel-date', function () {
    show($('d-result'), function () {
      const d = CalcCore.dateDiff(num('d-from'), num('d-to'));
      const parts = [];
      if (d.years) parts.push(d.years + (d.years === 1 ? ' year' : ' years'));
      if (d.months) parts.push(d.months + (d.months === 1 ? ' month' : ' months'));
      if (d.daysPart || !parts.length) parts.push(d.daysPart + (d.daysPart === 1 ? ' day' : ' days'));
      return [
        ['Total days', String(d.days), true],
        ['In years, months, days', parts.join(', ')],
        ['In weeks', d.weeks + ' weeks ' + d.extraDays + ' days'],
        ['Working days (Mon-Fri, both ends counted)', String(d.businessDays)],
      ];
    });
    show($('a-result'), function () {
      const out = CalcCore.addDays(num('a-from'), num('a-days'), $('a-business').checked);
      const label = new Date(out + 'T00:00:00Z').toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
      return [
        ['Result', label, true],
        ['ISO date', out],
      ];
    });
  });

  // ----------------------------------------------------------------- Units
  Object.keys(CalcCore.UNITS).forEach((k) =>
    $('u-cat').appendChild(el('option', { value: k, text: k.charAt(0).toUpperCase() + k.slice(1) })),
  );
  function fillUnits() {
    const units = Object.keys(CalcCore.UNITS[$('u-cat').value].units);
    [$('u-from'), $('u-to')].forEach((s, i) => {
      s.textContent = '';
      units.forEach((u) => s.appendChild(el('option', { value: u, text: u })));
      s.selectedIndex = Math.min(i, units.length - 1);
    });
  }
  fillUnits();
  $('u-cat').addEventListener('change', fillUnits);
  register('panel-unit', function () {
    show($('panel-unit').querySelector('dl'), function () {
      const r = CalcCore.convertUnit($('u-cat').value, num('u-val'), $('u-from').value, $('u-to').value);
      const text = Math.abs(r) >= 1e-4 && Math.abs(r) < 1e12 ? fmt(r, 6, 0) : r.toExponential(4);
      return [[num('u-val') + ' ' + $('u-from').value + ' =', text + ' ' + $('u-to').value, true]];
    });
  });

  // -------------------------------------------------------------- Interest
  register('panel-int', function () {
    show($('panel-int').querySelector('dl'), function () {
      const s = CalcCore.simpleInterest(num('i-p'), num('i-r'), num('i-t'));
      const c = CalcCore.compoundInterest(num('i-p'), num('i-r'), num('i-t'), num('i-n'));
      return [
        ['Simple interest', money(s.interest)],
        ['Simple - total', money(s.total)],
        ['Compound interest', money(c.interest)],
        ['Compound - total', money(c.total), true],
      ];
    });
  });

  // ------------------------------------------------------ Discount & margin
  register('panel-disc', function () {
    show($('ds-result'), function () {
      const d = CalcCore.discount(num('ds-price'), num('ds-off'));
      return [
        ['You save', money(d.saved)],
        ['Final price', money(d.final), true],
      ];
    });
    show($('mg-result'), function () {
      const m = CalcCore.margin(num('mg-cost'), num('mg-sell'));
      const rows = [
        ['Profit', money(m.profit), true],
        ['Margin (on selling price)', pct(m.marginPercent)],
        ['Markup (on cost)', pct(m.markupPercent)],
      ];
      if (num('mg-target') !== '')
        rows.push(['Price for ' + num('mg-target') + '% margin', money(CalcCore.priceForMargin(num('mg-cost'), num('mg-target')))]);
      return rows;
    });
  });
})();
