/**
 * QR & Barcode Maker - core logic (no DOM, unit-testable in Node).
 *
 * - Builders that turn friendly form values into the text a QR code must
 *   contain (Wi-Fi, contact card, e-mail, SMS, phone, web address).
 * - A matrix -> SVG renderer so we control colours and the quiet zone.
 * - Barcode value validation with friendly messages (JsBarcode draws them).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QrCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --------------------------------------------------------- Payloads

  /** Add https:// when no scheme is given; refuse script-running schemes. */
  function normalizeUrl(input) {
    const text = String(input || '').trim();
    if (!text) throw new Error('Enter a web address.');
    if (/^(javascript|data|vbscript):/i.test(text)) throw new Error('That kind of link is not allowed.');
    return /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text;
  }

  const escapeWifi = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

  /** Text a phone reads as "join this Wi-Fi". security: WPA | WEP | nopass */
  function wifiPayload(o) {
    const ssid = String(o.ssid || '').trim();
    if (!ssid) throw new Error('Enter the Wi-Fi network name.');
    const security = ['WPA', 'WEP', 'nopass'].includes(o.security) ? o.security : 'WPA';
    if (security !== 'nopass' && !o.password) throw new Error('Enter the Wi-Fi password, or choose "No password".');
    let text = 'WIFI:T:' + security + ';S:' + escapeWifi(ssid) + ';';
    if (security !== 'nopass') text += 'P:' + escapeWifi(o.password) + ';';
    if (o.hidden) text += 'H:true;';
    return text + ';';
  }

  const escapeVcard = (s) =>
    String(s)
      .replace(/([\\;,])/g, '\\$1')
      .replace(/\r?\n/g, '\\n');

  /** vCard 3.0 contact card. Needs a name or an organisation. */
  function vcardPayload(o) {
    const first = String(o.firstName || '').trim();
    const last = String(o.lastName || '').trim();
    const org = String(o.org || '').trim();
    if (!first && !last && !org) throw new Error('Enter a name or a company.');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push('N:' + escapeVcard(last) + ';' + escapeVcard(first) + ';;;');
    lines.push('FN:' + escapeVcard([first, last].filter(Boolean).join(' ') || org));
    if (org) lines.push('ORG:' + escapeVcard(org));
    if (o.title) lines.push('TITLE:' + escapeVcard(o.title));
    if (o.phone) lines.push('TEL;TYPE=CELL:' + String(o.phone).replace(/[^\d+]/g, ''));
    if (o.email) lines.push('EMAIL:' + escapeVcard(o.email));
    if (o.url) lines.push('URL:' + escapeVcard(o.url));
    lines.push('END:VCARD');
    return lines.join('\n');
  }

  const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  /** mailto: link with optional subject and body. */
  function mailtoPayload(o) {
    const to = String(o.to || '').trim();
    if (!looksLikeEmail(to)) throw new Error('Enter a valid e-mail address.');
    const params = [];
    if (o.subject) params.push('subject=' + encodeURIComponent(o.subject));
    if (o.body) params.push('body=' + encodeURIComponent(o.body));
    return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
  }

  function cleanNumber(n) {
    const number = String(n || '').replace(/[^\d+]/g, '');
    if (number.replace(/\D/g, '').length < 3) throw new Error('Enter a valid phone number.');
    return number;
  }

  const smsPayload = (o) => 'SMSTO:' + cleanNumber(o.number) + ':' + String(o.message || '');
  const telPayload = (o) => 'tel:' + cleanNumber(o.number);

  // ------------------------------------------------------- QR rendering

  /** Build the module grid with a qrcode-generator instance factory. */
  function buildMatrix(qrcodeFactory, text, level) {
    if (!String(text)) throw new Error('Enter something to encode.');
    const qr = qrcodeFactory(0, ['L', 'M', 'Q', 'H'].includes(level) ? level : 'M');
    try {
      qr.addData(String(text));
      qr.make();
    } catch (e) {
      throw new Error('That is too much text for one QR code. Shorten it or lower the error correction level.');
    }
    const size = qr.getModuleCount();
    const modules = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
      modules.push(row);
    }
    return { size: size, modules: modules };
  }

  const HEX = /^#[0-9a-f]{6}$/i;

  /** Crisp, scalable SVG. `quiet` = blank border measured in modules (spec: 4). */
  function matrixToSvg(matrix, opts) {
    const o = Object.assign({ pixels: 320, quiet: 4, fg: '#000000', bg: '#ffffff' }, opts);
    if (!HEX.test(o.fg) || !HEX.test(o.bg)) throw new Error('Colours must look like #112233.');
    const total = matrix.size + 2 * o.quiet;
    let path = '';
    matrix.modules.forEach((row, r) => {
      let c = 0;
      while (c < row.length) {
        if (!row[c]) {
          c++;
          continue;
        }
        let end = c;
        while (end < row.length && row[end]) end++;
        path += 'M' + (c + o.quiet) + ' ' + (r + o.quiet) + 'h' + (end - c) + 'v1h-' + (end - c) + 'z';
        c = end;
      }
    });
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      total +
      ' ' +
      total +
      '" width="' +
      o.pixels +
      '" height="' +
      o.pixels +
      '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="' +
      o.bg +
      '"/><path fill="' +
      o.fg +
      '" d="' +
      path +
      '"/></svg>'
    );
  }

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** WCAG contrast ratio between two #rrggbb colours (1 to 21). */
  function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** Returns a warning string if the colours may not scan, otherwise "". */
  function scanWarning(fg, bg) {
    if (!HEX.test(fg) || !HEX.test(bg)) return '';
    if (contrastRatio(fg, bg) < 3) return 'Low contrast - many scanners will not read this. Use a much darker foreground.';
    if (luminance(fg) > luminance(bg)) return 'Light-on-dark codes are not read by some scanners. Dark-on-light is safest.';
    return '';
  }

  // ----------------------------------------------------------- Barcodes

  /** EAN/UPC check digit for a digit string WITHOUT its check digit. */
  function mod10CheckDigit(digits, weightOddPosition) {
    // Positions counted from the right of the digits given (rightmost = 1).
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      const fromRight = digits.length - i;
      sum += Number(digits[i]) * (fromRight % 2 === 1 ? weightOddPosition : 4 - weightOddPosition);
    }
    return (10 - (sum % 10)) % 10;
  }

  const BARCODE_RULES = {
    CODE128: {
      label: 'Code 128 (any text)',
      test: (v) => /^[\x20-\x7e]+$/.test(v),
      message: 'Code 128 supports plain English letters, digits and symbols.',
    },
    CODE39: {
      label: 'Code 39',
      test: (v) => /^[A-Z0-9 .$/+%-]+$/.test(v),
      message: 'Code 39 supports capital letters, digits and - . $ / + % space.',
    },
    EAN13: { label: 'EAN-13 (retail)', digits: [12, 13], weight: 3 },
    EAN8: { label: 'EAN-8', digits: [7, 8], weight: 3 },
    UPC: { label: 'UPC-A (US retail)', digits: [11, 12], weight: 3 },
    ITF14: { label: 'ITF-14 (cartons)', digits: [13, 14], weight: 3 },
  };

  /**
   * Validate and normalise a barcode value. For numeric formats a missing
   * check digit is added and a wrong one is rejected.
   * Returns the value to encode; throws a friendly Error otherwise.
   */
  function normalizeBarcodeValue(format, value) {
    const rule = BARCODE_RULES[format];
    if (!rule) throw new Error('Unknown barcode type.');
    const v = String(value == null ? '' : value).trim();
    if (!v) throw new Error('Enter a value for the barcode.');
    if (rule.digits) {
      if (!/^\d+$/.test(v)) throw new Error(rule.label + ' only accepts digits.');
      const [without, withCheck] = rule.digits;
      if (v.length !== without && v.length !== withCheck)
        throw new Error(rule.label + ' needs ' + without + ' digits (the check digit is added for you) or ' + withCheck + ' digits.');
      const body = v.slice(0, without);
      const check = mod10CheckDigit(body, rule.weight);
      if (v.length === withCheck && Number(v[without]) !== check) throw new Error('Check digit is wrong - it should be ' + check + '.');
      return body + check;
    }
    if (!rule.test(v)) throw new Error(rule.message);
    return v;
  }

  return {
    normalizeUrl: normalizeUrl,
    wifiPayload: wifiPayload,
    vcardPayload: vcardPayload,
    mailtoPayload: mailtoPayload,
    smsPayload: smsPayload,
    telPayload: telPayload,
    buildMatrix: buildMatrix,
    matrixToSvg: matrixToSvg,
    contrastRatio: contrastRatio,
    scanWarning: scanWarning,
    mod10CheckDigit: mod10CheckDigit,
    normalizeBarcodeValue: normalizeBarcodeValue,
    BARCODE_RULES: BARCODE_RULES,
  };
});
