/* Document Generator - user interface. Maths in core.js, PDF layout in pdf.js. */
(function () {
  'use strict';

  const { setStatus, bindTabs, downloadBlob, readText, readArrayBuffer, el, safeFileName, debounce } = OT;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'offline-office-toolkit.doc-generator.v1';
  const today = new Date().toISOString().slice(0, 10);

  bindTabs($('tabs'));

  // --------------------------------------------------------------- State
  let logo = null; // { mime, bytes: Uint8Array }

  const bytesToBase64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const base64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  /** Read the whole invoice form into the data shape used by core/pdf. */
  function readInvoice() {
    return {
      kind: $('inv-kind').value,
      number: $('inv-number').value,
      date: $('inv-date').value,
      dueDate: $('inv-due').value,
      currency: $('inv-currency').value,
      locale: $('inv-locale').value,
      seller: { name: $('s-name').value, address: $('s-address').value, taxId: $('s-tax').value, contact: $('s-contact').value },
      client: { name: $('c-name').value, address: $('c-address').value, taxId: $('c-tax').value },
      items: Array.from($('items').querySelectorAll('tbody tr')).map((tr) => ({
        description: tr.querySelector('.i-desc').value,
        qty: tr.querySelector('.i-qty').value,
        rate: tr.querySelector('.i-rate').value,
        taxPercent: tr.querySelector('.i-tax').value,
      })),
      discountPercent: $('inv-discount').value,
      notes: $('inv-notes').value,
      paymentDetails: $('inv-payment').value,
      paymentMethod: $('inv-method').value,
      logo: logo,
    };
  }

  /** Fill the form from saved data (draft file or auto-save). */
  function writeInvoice(d) {
    $('inv-kind').value = d.kind || 'invoice';
    $('inv-number').value = d.number || '';
    $('inv-date').value = d.date || today;
    $('inv-due').value = d.dueDate || '';
    $('inv-currency').value = d.currency || '₹';
    $('inv-locale').value = d.locale || 'en-IN';
    const s = d.seller || {};
    const c = d.client || {};
    $('s-name').value = s.name || '';
    $('s-address').value = s.address || '';
    $('s-tax').value = s.taxId || '';
    $('s-contact').value = s.contact || '';
    $('c-name').value = c.name || '';
    $('c-address').value = c.address || '';
    $('c-tax').value = c.taxId || '';
    $('inv-discount').value = d.discountPercent || 0;
    $('inv-notes').value = d.notes || '';
    $('inv-payment').value = d.paymentDetails || '';
    $('inv-method').value = d.paymentMethod || '';
    logo = d.logo && d.logo.base64 ? { mime: d.logo.mime, bytes: base64ToBytes(d.logo.base64) } : d.logo && d.logo.bytes ? d.logo : null;
    $('logo-clear').hidden = !logo;
    const body = $('items').querySelector('tbody');
    body.textContent = '';
    (d.items && d.items.length ? d.items : [{}]).forEach(addItemRow);
    refresh();
  }

  // ---------------------------------------------------------- Item rows
  function addItemRow(item) {
    const it = item || {};
    const input = (cls, type, value, label, extra) =>
      el(
        'input',
        Object.assign({ class: cls, type: type, value: value === undefined ? '' : String(value), 'aria-label': label }, extra || {}),
      );
    const tr = el('tr', {}, [
      el('td', {}, [input('i-desc', 'text', it.description, 'Description')]),
      el('td', {}, [input('i-qty', 'number', it.qty === undefined ? 1 : it.qty, 'Quantity', { min: '0', step: 'any' })]),
      el('td', {}, [input('i-rate', 'number', it.rate === undefined ? '' : it.rate, 'Rate', { min: '0', step: 'any' })]),
      el('td', {}, [input('i-tax', 'number', it.taxPercent === undefined ? 0 : it.taxPercent, 'Tax percent', { min: '0', step: 'any' })]),
      el('td', { class: 'num amount', text: '' }),
      el('td', {}, [
        el('button', {
          type: 'button',
          class: 'danger',
          'aria-label': 'Remove item',
          text: '✕',
          onclick: function () {
            tr.remove();
            if (!$('items').querySelector('tbody tr')) addItemRow();
            refresh();
          },
        }),
      ]),
    ]);
    $('items').querySelector('tbody').appendChild(tr);
  }

  $('add-item').addEventListener('click', function () {
    addItemRow();
    refresh();
    const rows = $('items').querySelectorAll('tbody tr');
    rows[rows.length - 1].querySelector('.i-desc').focus();
  });

  // ------------------------------------------------------- Live totals
  function refresh() {
    const kind = $('inv-kind').value;
    $('due-box').hidden = kind === 'receipt';
    $('method-box').hidden = kind !== 'receipt';
    $('to-title').textContent = kind === 'receipt' ? 'Received from' : 'Bill to';
    $('inv-pdf').textContent = 'Download ' + (kind === 'receipt' ? 'receipt' : 'invoice') + ' PDF';
    const data = readInvoice();
    const box = $('totals');
    box.textContent = '';
    try {
      const calc = DocCore.calcInvoice(data.items, { discountPercent: data.discountPercent });
      const fmt = (v) => data.currency + ' ' + DocCore.formatAmount(data.locale, v);
      // Show per-row amounts the same way the PDF does.
      const rows = Array.from($('items').querySelectorAll('tbody tr'));
      let k = 0;
      rows.forEach((tr, i) => {
        const item = data.items[i];
        const blank = !String(item.description).trim() && !Number(item.qty) * Number(item.rate);
        tr.querySelector('.amount').textContent = blank ? '' : fmt(calc.lines[k++].net);
      });
      const add = (label, value, cls) => {
        box.appendChild(el('dt', { text: label }));
        box.appendChild(el('dd', { text: value, class: cls || '' }));
      };
      add('Subtotal', fmt(calc.subtotal));
      if (calc.discountTotal) add('Discount', '-' + fmt(calc.discountTotal));
      if (calc.taxTotal) add('Tax', fmt(calc.taxTotal));
      add('Total', fmt(calc.total), 'grand');
    } catch (err) {
      box.appendChild(el('dd', { text: err.message, class: 'status error' }));
    }
    autosave();
  }

  function saveNow() {
    try {
      const d = readInvoice();
      d.logo = logo ? { mime: logo.mime, base64: bytesToBase64(logo.bytes) } : null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch (e) {
      /* storage can be unavailable (private mode); the app still works */
    }
  }
  const autosave = debounce(saveNow, 400);
  // Debounced saves can be pending when the tab closes, so flush on the way out.
  window.addEventListener('pagehide', saveNow);

  document.querySelectorAll('#panel-invoice input, #panel-invoice select, #panel-invoice textarea').forEach((c) => {
    if (c.type === 'file') return;
    c.addEventListener('input', refresh);
    c.addEventListener('change', refresh);
  });
  // Rows are created later, so listen on the table itself.
  $('items').addEventListener('input', refresh);

  // -------------------------------------------------------------- Logo
  $('s-logo').addEventListener('change', async function () {
    const file = $('s-logo').files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setStatus($('inv-status'), 'Please choose a PNG or JPG image.', 'error');
    if (file.size > 1.5 * 1024 * 1024) return setStatus($('inv-status'), 'That logo is over 1.5 MB. Please use a smaller image.', 'error');
    logo = { mime: file.type, bytes: new Uint8Array(await readArrayBuffer(file)) };
    $('logo-clear').hidden = false;
    setStatus($('inv-status'), 'Logo added.', 'ok');
    refresh();
  });
  $('logo-clear').addEventListener('click', function () {
    logo = null;
    $('s-logo').value = '';
    $('logo-clear').hidden = true;
    refresh();
  });

  // --------------------------------------------------- PDF / draft actions
  $('inv-pdf').addEventListener('click', async function () {
    try {
      const data = readInvoice();
      const bytes = await DocPdf.buildInvoicePdf(data);
      downloadBlob(bytes, safeFileName(data.kind + '-' + data.number) + '.pdf', 'application/pdf');
      setStatus($('inv-status'), 'PDF saved.', 'ok');
    } catch (err) {
      setStatus($('inv-status'), err.message, 'error');
    }
  });

  $('inv-next').addEventListener('click', function () {
    const d = readInvoice();
    d.number = DocCore.nextNumber(d.number);
    d.date = today;
    d.dueDate = '';
    d.client = { name: '', address: '', taxId: '' };
    d.items = [{}];
    d.discountPercent = 0;
    d.paymentMethod = '';
    writeInvoice(d);
    setStatus($('inv-status'), 'Ready for ' + d.number + '. Your business details were kept.', 'ok');
  });

  $('inv-save').addEventListener('click', function () {
    const d = readInvoice();
    d.logo = logo ? { mime: logo.mime, base64: bytesToBase64(logo.bytes) } : null;
    downloadBlob(
      new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }),
      safeFileName(d.kind + '-' + d.number) + '-draft.json',
    );
  });

  $('inv-load').addEventListener('change', async function () {
    const file = $('inv-load').files[0];
    $('inv-load').value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await readText(file));
      if (!d || typeof d !== 'object' || !Array.isArray(d.items)) throw new Error('bad');
      writeInvoice(d);
      setStatus($('inv-status'), 'Draft loaded.', 'ok');
    } catch (e) {
      setStatus($('inv-status'), 'That file is not a draft saved from this tool.', 'error');
    }
  });

  // -------------------------------------------------------------- Letter
  $('l-date').value = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  $('l-pdf').addEventListener('click', async function () {
    try {
      const data = {
        senderName: $('l-sname').value,
        senderAddress: $('l-saddr').value,
        date: $('l-date').value,
        recipientName: $('l-rname').value,
        recipientAddress: $('l-raddr').value,
        subject: $('l-subject').value,
        salutation: $('l-salute').value,
        body: $('l-body').value,
        closing: $('l-closing').value,
      };
      downloadBlob(await DocPdf.buildLetterPdf(data), 'letter.pdf', 'application/pdf');
      setStatus($('l-status'), 'PDF saved.', 'ok');
    } catch (err) {
      setStatus($('l-status'), err.message, 'error');
    }
  });

  // ----------------------------------------------------------- Start up
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  writeInvoice(saved && Array.isArray(saved.items) ? saved : DocCore.emptyInvoice(today));
})();
