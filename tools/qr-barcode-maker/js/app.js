/* QR & Barcode Maker - user interface. Payload/validation logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, bindTabs, downloadBlob, debounce } = OT;
  const $ = (id) => document.getElementById(id);
  const val = (id) => $(id).value;

  bindTabs($('tabs'));

  // ------------------------------------------------------------- QR code
  let qrMatrix = null;

  function payloadForType(type) {
    switch (type) {
      case 'url':
        return QrCore.normalizeUrl(val('f-url'));
      case 'text':
        return val('f-text');
      case 'wifi':
        return QrCore.wifiPayload({
          ssid: val('f-ssid'),
          password: val('f-wifi-pass'),
          security: val('f-wifi-sec'),
          hidden: $('f-wifi-hidden').checked,
        });
      case 'vcard':
        return QrCore.vcardPayload({
          firstName: val('f-vc-first'),
          lastName: val('f-vc-last'),
          org: val('f-vc-org'),
          title: val('f-vc-title'),
          phone: val('f-vc-phone'),
          email: val('f-vc-email'),
          url: val('f-vc-url'),
        });
      case 'email':
        return QrCore.mailtoPayload({ to: val('f-em-to'), subject: val('f-em-subject'), body: val('f-em-body') });
      case 'sms':
        return QrCore.smsPayload({ number: val('f-sms-num'), message: val('f-sms-msg') });
      case 'tel':
        return QrCore.telPayload({ number: val('f-tel-num') });
    }
    throw new Error('Unknown QR type.');
  }

  function qrOptions() {
    return { pixels: Number(val('qr-size')), quiet: 4, fg: val('qr-fg'), bg: val('qr-bg') };
  }

  function renderQr() {
    const type = val('qr-type');
    document.querySelectorAll('.qr-fields').forEach((f) => (f.hidden = f.dataset.type !== type));
    $('qr-size-out').textContent = val('qr-size');
    const img = $('qr-img');
    try {
      const matrix = QrCore.buildMatrix(qrcode, payloadForType(type), val('qr-ecc'));
      const opts = qrOptions();
      const svg = QrCore.matrixToSvg(matrix, opts);
      qrMatrix = matrix;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      img.width = opts.pixels;
      img.height = opts.pixels;
      img.hidden = false;
      $('qr-png').disabled = false;
      $('qr-svg').disabled = false;
      const warn = QrCore.scanWarning(opts.fg, opts.bg);
      setStatus(
        $('qr-status'),
        warn || 'Ready. Version ' + (matrix.size - 17) / 4 + ' code, ' + matrix.size + '×' + matrix.size + ' modules.',
        warn ? 'warn' : 'ok',
      );
    } catch (err) {
      qrMatrix = null;
      img.hidden = true;
      $('qr-png').disabled = true;
      $('qr-svg').disabled = true;
      // An empty form is not an error - just wait for the user.
      setStatus($('qr-status'), 'Fill in the details to see your QR code. (' + err.message + ')', '');
    }
  }

  const renderQrSoon = debounce(renderQr, 150);
  document.querySelectorAll('#panel-qr input, #panel-qr select, #panel-qr textarea').forEach((c) => {
    c.addEventListener('input', renderQrSoon);
    c.addEventListener('change', renderQrSoon);
  });

  $('qr-svg').addEventListener('click', function () {
    if (qrMatrix) downloadBlob(new Blob([QrCore.matrixToSvg(qrMatrix, qrOptions())], { type: 'image/svg+xml' }), 'qr-code.svg');
  });

  $('qr-png').addEventListener('click', function () {
    if (!qrMatrix) return;
    const o = qrOptions();
    const total = qrMatrix.size + 2 * o.quiet;
    const cell = Math.max(1, Math.floor(o.pixels / total)); // whole pixels per module keeps edges sharp
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = cell * total;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = o.fg;
    qrMatrix.modules.forEach((row, r) =>
      row.forEach((dark, c) => dark && ctx.fillRect((c + o.quiet) * cell, (r + o.quiet) * cell, cell, cell)),
    );
    canvas.toBlob((blob) => downloadBlob(blob, 'qr-code.png'), 'image/png');
  });

  // ------------------------------------------------------------- Barcode
  const HINTS = {
    CODE128: 'Any English letters, digits and symbols.',
    CODE39: 'Capital letters, digits and - . $ / + % space.',
    EAN13: '12 digits - the 13th (check) digit is added for you.',
    EAN8: '7 digits - the 8th (check) digit is added for you.',
    UPC: '11 digits - the 12th (check) digit is added for you.',
    ITF14: '13 digits - the 14th (check) digit is added for you.',
  };
  const DEFAULTS = {
    CODE128: 'Hello-123',
    CODE39: 'ABC-123',
    EAN13: '400638133393',
    EAN8: '9638507',
    UPC: '03600029145',
    ITF14: '1234567890123',
  };

  Object.keys(QrCore.BARCODE_RULES).forEach(function (key) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = QrCore.BARCODE_RULES[key].label;
    $('bar-format').appendChild(o);
  });

  let barcodeValue = null;

  function barcodeOptions(value) {
    return {
      format: val('bar-format'),
      value: value,
      width: Number(val('bar-width')),
      height: Number(val('bar-height')),
      displayValue: $('bar-text').checked,
      margin: 10,
      background: '#ffffff',
      lineColor: '#000000',
    };
  }

  function renderBarcode() {
    $('bar-hint').textContent = HINTS[val('bar-format')];
    $('bar-width-out').textContent = val('bar-width');
    $('bar-height-out').textContent = val('bar-height');
    try {
      barcodeValue = QrCore.normalizeBarcodeValue(val('bar-format'), val('bar-value'));
      const o = barcodeOptions(barcodeValue);
      JsBarcode('#bar-svg', barcodeValue, o);
      $('bar-png').disabled = false;
      $('bar-svg-dl').disabled = false;
      setStatus($('bar-status'), 'Encoded: ' + barcodeValue, 'ok');
    } catch (err) {
      barcodeValue = null;
      $('bar-svg').textContent = '';
      $('bar-png').disabled = true;
      $('bar-svg-dl').disabled = true;
      setStatus($('bar-status'), err.message, 'error');
    }
  }

  const renderBarcodeSoon = debounce(renderBarcode, 150);
  $('bar-format').addEventListener('change', function () {
    $('bar-value').value = DEFAULTS[val('bar-format')];
    renderBarcode();
  });
  ['bar-value', 'bar-width', 'bar-height', 'bar-text'].forEach((id) => {
    $(id).addEventListener('input', renderBarcodeSoon);
    $(id).addEventListener('change', renderBarcodeSoon);
  });

  $('bar-svg-dl').addEventListener('click', function () {
    if (!barcodeValue) return;
    const xml = new XMLSerializer().serializeToString($('bar-svg'));
    downloadBlob(new Blob([xml], { type: 'image/svg+xml' }), 'barcode.svg');
  });

  $('bar-png').addEventListener('click', function () {
    if (!barcodeValue) return;
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, barcodeValue, barcodeOptions(barcodeValue));
    canvas.toBlob((blob) => downloadBlob(blob, 'barcode.png'), 'image/png');
  });

  // Start with a friendly example in each tab.
  $('f-url').value = 'example.com';
  renderQr();
  renderBarcode();
})();
