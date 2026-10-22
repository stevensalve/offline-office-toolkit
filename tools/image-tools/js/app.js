/* Image Tools - user interface. Maths, naming and PDF export live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, formatBytes, downloadBlob, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);

  const sources = []; // [{ file }]
  const results = []; // [{ blob, name, width, height, original, url }]

  // ----------------------------------------------------------- UI wiring
  const resizeMode = $('resize-mode');
  function syncOptionVisibility() {
    $('max-fields').hidden = resizeMode.value !== 'max';
    $('percent-field').hidden = resizeMode.value !== 'percent';
  }
  resizeMode.addEventListener('change', syncOptionVisibility);
  $('quality').addEventListener('input', () => ($('quality-out').textContent = $('quality').value));
  syncOptionVisibility();

  function renderSources() {
    const list = $('source-list');
    list.textContent = '';
    sources.forEach(function (s, i) {
      list.appendChild(
        el('li', {}, [
          el('span', { class: 'name', text: s.file.name }),
          el('span', { class: 'meta', text: formatBytes(s.file.size) }),
          el('button', {
            type: 'button',
            class: 'danger',
            'aria-label': 'Remove ' + s.file.name,
            text: '✕',
            onclick: function () {
              sources.splice(i, 1);
              renderSources();
            },
          }),
        ]),
      );
    });
    $('process').disabled = sources.length === 0;
    $('clear').disabled = sources.length === 0;
  }

  bindDropzone($('drop'), $('file-input'), function (files) {
    const accepted = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    accepted.forEach((file) => sources.push({ file: file }));
    renderSources();
    const skipped = files.length - accepted.length;
    setStatus($('status'), skipped ? skipped + ' file(s) skipped - only JPG, PNG and WebP are supported.' : '', skipped ? 'warn' : '');
  });

  $('clear').addEventListener('click', function () {
    sources.length = 0;
    renderSources();
  });

  // ----------------------------------------------------------- Processing
  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (blob) {
          blob ? resolve(blob) : reject(new Error('The browser could not encode the image.'));
        },
        mime,
        quality,
      );
    });
  }

  async function processOne(file, options) {
    const bitmap = await createImageBitmap(file);
    try {
      const crop = ImageCore.cropRect(bitmap.width, bitmap.height, options.ratio);
      const size = ImageCore.computeTargetSize(crop.width, crop.height, options.resize);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (options.mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'; // JPEG has no transparency
        ctx.fillRect(0, 0, size.width, size.height);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
      const blob = await canvasToBlob(canvas, options.mime, options.quality);
      return { blob: blob, width: size.width, height: size.height };
    } finally {
      bitmap.close();
    }
  }

  function readOptions() {
    return {
      ratio: ImageCore.parseRatio($('crop').value),
      format: $('format').value,
      quality: Number($('quality').value) / 100,
      resize: {
        mode: resizeMode.value,
        maxWidth: $('max-width').value,
        maxHeight: $('max-height').value,
        percent: $('percent').value,
      },
    };
  }

  function clearResults() {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    results.length = 0;
  }

  $('process').addEventListener('click', async function () {
    const base = readOptions();
    const button = $('process');
    button.disabled = true;
    clearResults();
    const problems = [];
    for (let i = 0; i < sources.length; i++) {
      const file = sources[i].file;
      setStatus($('status'), 'Processing ' + (i + 1) + ' of ' + sources.length + '...');
      try {
        const mime = ImageCore.resolveMime(base.format, file.type);
        const out = await processOne(file, Object.assign({}, base, { mime: mime }));
        // Safari cannot encode WebP and silently returns PNG - name the file honestly.
        const actualMime = out.blob.type || mime;
        results.push({
          blob: out.blob,
          width: out.width,
          height: out.height,
          original: file.size,
          name: ImageCore.outputName(file.name, actualMime, 'edited'),
          url: URL.createObjectURL(out.blob),
        });
      } catch (err) {
        problems.push(file.name + ': ' + err.message);
      }
    }
    renderResults();
    if (problems.length) setStatus($('status'), problems.join(' '), 'error');
    else setStatus($('status'), 'Done. ' + results.length + ' image(s) ready below.', 'ok');
    button.disabled = sources.length === 0;
  });

  function renderResults() {
    $('results-card').hidden = results.length === 0;
    const list = $('result-list');
    list.textContent = '';
    results.forEach(function (r) {
      const saved = ImageCore.percentSaved(r.original, r.blob.size);
      const note = saved >= 0 ? saved + '% smaller' : Math.abs(saved) + '% larger';
      list.appendChild(
        el('li', {}, [
          el('img', { class: 'thumb', src: r.url, alt: '' }),
          el('span', { class: 'name', text: r.name }),
          el('span', {
            class: 'meta',
            text: r.width + '×' + r.height + ' - ' + formatBytes(r.original) + ' → ' + formatBytes(r.blob.size) + ' (' + note + ')',
          }),
          el('button', { type: 'button', text: 'Download', onclick: () => downloadBlob(r.blob, r.name) }),
        ]),
      );
    });
  }

  $('download-all').addEventListener('click', function () {
    results.forEach((r, i) => setTimeout(() => downloadBlob(r.blob, r.name), i * 300));
  });

  // ------------------------------------------------------------ PDF export
  /** PDF only supports JPEG/PNG; convert anything else (e.g. WebP) to JPEG. */
  async function toPdfImage(result) {
    if (result.blob.type === 'image/jpeg' || result.blob.type === 'image/png') {
      return {
        bytes: new Uint8Array(await readArrayBuffer(result.blob)),
        mime: result.blob.type,
        width: result.width,
        height: result.height,
      };
    }
    const bitmap = await createImageBitmap(result.blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    return { bytes: new Uint8Array(await readArrayBuffer(jpeg)), mime: 'image/jpeg', width: canvas.width, height: canvas.height };
  }

  $('make-pdf').addEventListener('click', async function () {
    const status = $('pdf-status');
    try {
      setStatus(status, 'Building PDF...');
      const images = [];
      for (const r of results) images.push(await toPdfImage(r));
      const pdf = await ImageCore.imagesToPdf(images, { pageSize: $('pdf-size').value, margin: Number($('pdf-margin').value) });
      downloadBlob(pdf, 'images.pdf', 'application/pdf');
      setStatus(status, 'Done. Saved images.pdf (' + formatBytes(pdf.length) + ').', 'ok');
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });
})();
