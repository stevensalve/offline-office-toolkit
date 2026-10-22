/* File Converter - user interface. Conversion logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, bindTabs, readArrayBuffer, readText, downloadBlob, baseName, extension, formatBytes, el } = OT;
  const $ = (id) => document.getElementById(id);
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  bindTabs($('tabs'));

  // ------------------------------------------------------- Data converter
  const state = { name: '', kind: '', text: '', workbook: null, rows: null };

  /** Rows (array of arrays, first row = headers) for the current file. */
  function currentRows() {
    if (state.kind === 'xlsx') {
      return XLSX.utils.sheet_to_json(state.workbook.Sheets[$('data-sheet').value], {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false,
        rawNumbers: true,
      });
    }
    if (state.kind === 'json') return ConvertCore.jsonToRows(JSON.parse(state.text));
    return ConvertCore.parseCsv(state.text);
  }

  function buildOutput(rows) {
    const target = $('data-target').value;
    if (target === 'csv' || target === 'tsv') {
      const delim = target === 'tsv' ? '\t' : $('csv-delim').value;
      // The BOM helps Excel read accented characters correctly.
      const text = '\ufeff' + ConvertCore.stringifyCsv(rows, delim, { protect: $('csv-protect').checked });
      return { text: text, blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), ext: target };
    }
    if (target === 'json') {
      const objects = ConvertCore.rowsToObjects(rows, { inferTypes: $('json-infer').checked });
      const text = JSON.stringify(objects, null, $('json-pretty').checked ? 2 : 0);
      return { text: text, blob: new Blob([text], { type: 'application/json' }), ext: 'json' };
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return { text: null, blob: new Blob([bytes], { type: XLSX_MIME }), ext: 'xlsx', rows: rows.length };
  }

  function syncDataOptions() {
    const t = $('data-target').value;
    $('opt-csv').hidden = t !== 'csv' && t !== 'tsv';
    $('csv-delim').parentElement.querySelector('label[for="csv-delim"]').hidden = t === 'tsv';
    $('csv-delim').hidden = t === 'tsv';
    $('opt-json').hidden = t !== 'json';
    refreshPreview();
  }

  function refreshPreview() {
    const box = $('data-preview');
    if (!state.kind) return;
    try {
      const out = buildOutput(currentRows());
      box.textContent =
        out.text !== null
          ? out.text.slice(0, 3000) + (out.text.length > 3000 ? '\n... (preview truncated)' : '')
          : 'Excel file ready (' + out.rows + ' rows incl. header, ' + formatBytes(out.blob.size) + '). Click "Convert and download".';
      setStatus($('data-status'), '');
    } catch (err) {
      box.textContent = '';
      setStatus($('data-status'), friendly(err), 'error');
    }
  }

  function friendly(err) {
    return err instanceof SyntaxError ? 'That file is not valid JSON: ' + err.message : err.message;
  }

  ['data-target', 'csv-delim', 'csv-protect', 'json-infer', 'json-pretty', 'data-sheet'].forEach((id) =>
    $(id).addEventListener('change', syncDataOptions),
  );

  bindDropzone($('data-drop'), $('data-input'), async function (files) {
    const file = files[0];
    const ext = extension(file.name);
    try {
      setStatus($('data-status'), 'Reading ' + file.name + '...');
      state.name = file.name;
      state.workbook = null;
      if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
        state.kind = 'xlsx';
        state.workbook = XLSX.read(await readArrayBuffer(file), { type: 'array' });
        $('data-sheet').textContent = '';
        state.workbook.SheetNames.forEach((n) => $('data-sheet').appendChild(el('option', { value: n, text: n })));
        $('sheet-box').hidden = state.workbook.SheetNames.length < 2;
      } else {
        state.kind = ext === 'json' ? 'json' : 'csv';
        state.text = await readText(file);
        $('sheet-box').hidden = true;
      }
      $('data-info').textContent = file.name + ' (' + formatBytes(file.size) + ') detected as ' + state.kind.toUpperCase() + '.';
      $('data-run').disabled = false;
      refreshPreview();
    } catch (err) {
      state.kind = '';
      $('data-run').disabled = true;
      setStatus($('data-status'), 'Could not open that file: ' + friendly(err), 'error');
    }
  });

  $('data-run').addEventListener('click', function () {
    try {
      const out = buildOutput(currentRows());
      downloadBlob(out.blob, baseName(state.name) + '.' + out.ext);
      setStatus($('data-status'), 'Saved ' + baseName(state.name) + '.' + out.ext + '.', 'ok');
    } catch (err) {
      setStatus($('data-status'), friendly(err), 'error');
    }
  });

  syncDataOptions();

  // ----------------------------------------------------------- Text to PDF
  bindDropzone($('pdf-drop'), $('pdf-input'), async function (files) {
    try {
      $('pdf-text').value = await readText(files[0]);
      setStatus($('pdf-status'), 'Loaded ' + files[0].name + '.', 'ok');
    } catch (err) {
      setStatus($('pdf-status'), err.message, 'error');
    }
  });

  $('pdf-run').addEventListener('click', async function () {
    try {
      const bytes = await ConvertCore.textToPdf($('pdf-text').value, {
        font: $('pdf-font').value,
        fontSize: Number($('pdf-size').value),
        pageSize: $('pdf-page').value,
      });
      downloadBlob(bytes, 'text.pdf', 'application/pdf');
      setStatus($('pdf-status'), 'Saved text.pdf (' + formatBytes(bytes.length) + ').', 'ok');
    } catch (err) {
      setStatus($('pdf-status'), err.message, 'error');
    }
  });
})();
