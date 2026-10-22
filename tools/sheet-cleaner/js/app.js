/* Sheet Cleaner - user interface. Table logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, bindTabs, readArrayBuffer, formatBytes, downloadBlob, baseName, el } = OT;
  const $ = (id) => document.getElementById(id);
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  bindTabs($('tabs'));

  // ----------------------------------------------------------- File I/O
  function sheetToTable(workbook, sheetName) {
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: true });
    return SheetCore.fromRows(aoa);
  }

  function tablesToXlsxBlob(sheets) {
    const wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      const ws = XLSX.utils.aoa_to_sheet(SheetCore.toRows(s.table), { cellDates: true });
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
    return new Blob([out], { type: XLSX_MIME });
  }

  function tableToCsvBlob(table) {
    const ws = XLSX.utils.aoa_to_sheet(SheetCore.toRows(table), { cellDates: true });
    // The BOM makes Excel open UTF-8 CSV files with the right characters.
    return new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' });
  }

  /**
   * Builds the "choose a file + pick a sheet" widget inside `mount`.
   * Calls onLoad(table, fileName) each time a table is ready.
   */
  function createLoader(mount, idPrefix, onLoad, statusEl) {
    mount.appendChild($('loader-tpl').content.cloneNode(true));
    const zone = mount.querySelector('.dropzone');
    const input = mount.querySelector('input[type=file]');
    const meta = mount.querySelector('.loader-meta');
    const select = mount.querySelector('.sheet-select');
    const info = mount.querySelector('.loader-info');
    select.id = idPrefix + '-sheet';
    mount.querySelector('.sheet-label').setAttribute('for', select.id);
    let workbook = null;
    let fileName = '';

    function emit() {
      const table = sheetToTable(workbook, select.value);
      info.textContent = fileName + ' - ' + table.rows.length + ' rows, ' + table.headers.length + ' columns';
      onLoad(table, fileName);
    }
    select.addEventListener('change', emit);

    bindDropzone(zone, input, async function (files) {
      const file = files[0];
      try {
        setStatus(statusEl, 'Reading ' + file.name + '...');
        workbook = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
        fileName = file.name;
        select.textContent = '';
        workbook.SheetNames.forEach((n) => select.appendChild(el('option', { value: n, text: n })));
        meta.hidden = false;
        emit();
        setStatus(statusEl, formatBytes(file.size) + ' loaded.', 'ok');
      } catch (err) {
        setStatus(statusEl, 'Could not open that file. Is it a valid Excel or CSV file?', 'error');
      }
    });
  }

  /** Renders up to `limit` rows of a table into a container. */
  function renderTable(container, table, limit) {
    container.textContent = '';
    const head = el(
      'tr',
      {},
      table.headers.map((h) => el('th', { scope: 'col', text: h })),
    );
    const body = table.rows.slice(0, limit || 100).map(function (row) {
      return el(
        'tr',
        {},
        row.map((v) => {
          const text = SheetCore.formatCell(v);
          return el('td', { text: text, class: text === '' ? 'empty' : '' });
        }),
      );
    });
    container.appendChild(el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)]));
  }

  function fillSelect(select, headers) {
    select.textContent = '';
    headers.forEach((h, i) => select.appendChild(el('option', { value: String(i), text: h })));
    select.disabled = headers.length === 0;
  }

  // ------------------------------------------------------------ Clean tab
  const clean = { name: '', current: null, history: [] }; // history: [{table, label}]

  function showClean() {
    const t = clean.current;
    $('clean-tools').hidden = false;
    $('clean-preview').hidden = false;
    const selected = $('col-select').value;
    fillSelect($('col-select'), t.headers);
    if (selected && Number(selected) < t.headers.length) $('col-select').value = selected;
    renderTable($('preview'), t, 100);
    $('preview-info').textContent = 'Showing the first ' + Math.min(100, t.rows.length) + ' of ' + t.rows.length + ' rows.';
    $('undo').disabled = clean.history.length === 0;
    $('reset').disabled = clean.history.length === 0;
    const log = $('log');
    log.textContent = '';
    clean.history.forEach((h) => log.appendChild(el('li', { text: h.label })));
  }

  function applyStep(label, nextTable) {
    clean.history.push({ table: clean.current, label: label });
    clean.current = nextTable;
    showClean();
    setStatus($('clean-status'), label, 'ok');
  }

  createLoader(
    $('clean-loader'),
    'clean',
    function (table, name) {
      clean.name = name;
      clean.current = table;
      clean.history = [];
      showClean();
    },
    $('clean-status'),
  );

  $('q-apply').addEventListener('click', function () {
    try {
      let t = clean.current;
      const notes = [];
      if ($('q-trim').checked || $('q-collapse').checked) {
        t = SheetCore.trimCells(t, { collapse: $('q-collapse').checked });
        notes.push('trimmed spaces');
      }
      if ($('q-empty').checked) {
        const r = SheetCore.removeEmptyRows(t);
        t = r.table;
        notes.push('removed ' + r.removed + ' empty row(s)');
      }
      if ($('q-dupes').checked) {
        const r = SheetCore.removeDuplicates(t, []);
        t = r.table;
        notes.push('removed ' + r.removed + ' duplicate row(s)');
      }
      if (notes.length === 0) return setStatus($('clean-status'), 'Tick at least one quick-clean option.', 'warn');
      applyStep('Quick clean: ' + notes.join(', ') + '.', t);
    } catch (err) {
      setStatus($('clean-status'), err.message, 'error');
    }
  });

  function syncColumnOptions() {
    const action = $('col-action').value;
    $('opt-split').hidden = action !== 'split';
    $('opt-replace').hidden = action !== 'replace';
  }
  $('col-action').addEventListener('change', syncColumnOptions);
  syncColumnOptions();

  $('col-apply').addEventListener('click', function () {
    try {
      const t = clean.current;
      const col = Number($('col-select').value);
      const name = t.headers[col];
      switch ($('col-action').value) {
        case 'upper':
        case 'lower':
        case 'title': {
          const mode = $('col-action').value;
          applyStep('Changed "' + name + '" to ' + mode + ' case.', SheetCore.changeCase(t, col, mode));
          break;
        }
        case 'split':
          applyStep(
            'Split "' + name + '" at "' + $('split-delim').value + '".',
            SheetCore.splitColumn(t, col, $('split-delim').value, { keep: $('split-keep').checked }),
          );
          break;
        case 'replace': {
          const r = SheetCore.findReplace(t, $('find-all').checked ? -1 : col, $('find-text').value, $('replace-text').value, {
            matchCase: $('find-case').checked,
            wholeCell: $('find-whole').checked,
          });
          applyStep('Replaced "' + $('find-text').value + '" in ' + r.count + ' cell(s).', r.table);
          break;
        }
        case 'dedupe': {
          const r = SheetCore.removeDuplicates(t, [col]);
          applyStep('Removed ' + r.removed + ' row(s) with a repeated "' + name + '".', r.table);
          break;
        }
        case 'sort-asc':
        case 'sort-desc': {
          const dir = $('col-action').value === 'sort-asc' ? 'asc' : 'desc';
          applyStep('Sorted by "' + name + '" (' + dir + 'ending).', SheetCore.sortBy(t, col, dir));
          break;
        }
        case 'drop':
          applyStep('Deleted column "' + name + '".', SheetCore.dropColumns(t, [col]));
          break;
      }
    } catch (err) {
      setStatus($('clean-status'), err.message, 'error');
    }
  });

  $('undo').addEventListener('click', function () {
    const last = clean.history.pop();
    if (!last) return;
    clean.current = last.table;
    showClean();
    setStatus($('clean-status'), 'Undid: ' + last.label, 'ok');
  });

  $('reset').addEventListener('click', function () {
    if (clean.history.length === 0) return;
    clean.current = clean.history[0].table;
    clean.history = [];
    showClean();
    setStatus($('clean-status'), 'Back to the original data.', 'ok');
  });

  $('save-xlsx').addEventListener('click', () =>
    downloadBlob(tablesToXlsxBlob([{ name: 'Cleaned', table: clean.current }]), baseName(clean.name) + '-cleaned.xlsx'),
  );
  $('save-csv').addEventListener('click', () => downloadBlob(tableToCsvBlob(clean.current), baseName(clean.name) + '-cleaned.csv'));

  // ---------------------------------------------------------- Compare tab
  const cmp = { a: null, b: null, nameA: '', nameB: '', report: null };

  function syncCompareState() {
    const ready = !!(cmp.a && cmp.b);
    $('do-compare').disabled = !ready;
    $('do-lookup').disabled = !ready;
    const box = $('lookup-cols');
    box.textContent = '';
    if (cmp.b) {
      cmp.b.headers.forEach(function (h, i) {
        box.appendChild(el('label', { class: 'inline' }, [el('input', { type: 'checkbox', value: String(i) }), h]));
      });
    }
  }

  createLoader(
    $('a-loader'),
    'a',
    function (table, name) {
      cmp.a = table;
      cmp.nameA = name;
      fillSelect($('a-key'), table.headers);
      syncCompareState();
    },
    $('cmp-status'),
  );
  createLoader(
    $('b-loader'),
    'b',
    function (table, name) {
      cmp.b = table;
      cmp.nameB = name;
      fillSelect($('b-key'), table.headers);
      syncCompareState();
    },
    $('cmp-status'),
  );

  $('do-compare').addEventListener('click', function () {
    try {
      const r = SheetCore.compareTables(cmp.a, cmp.b, Number($('a-key').value), Number($('b-key').value));
      const changes = SheetCore.changesToTable(r.changed);
      cmp.report = [
        { name: 'Only in A', table: r.onlyInA },
        { name: 'Only in B', table: r.onlyInB },
        { name: 'Changed values', table: changes },
      ];
      $('cmp-results').hidden = false;
      $('cmp-summary').textContent =
        r.same +
        ' row(s) identical, ' +
        r.changed.length +
        ' row(s) changed, ' +
        r.onlyInA.rows.length +
        ' only in A, ' +
        r.onlyInB.rows.length +
        ' only in B.' +
        (r.sharedColumns.length ? '' : ' (No column names match between A and B, so values could not be compared.)');
      renderTable($('cmp-preview'), changes.rows.length ? changes : r.onlyInA.rows.length ? r.onlyInA : r.onlyInB, 100);
      setStatus($('cmp-status'), 'Comparison complete.', 'ok');
    } catch (err) {
      setStatus($('cmp-status'), err.message, 'error');
    }
  });

  $('cmp-save').addEventListener('click', () => downloadBlob(tablesToXlsxBlob(cmp.report), 'comparison-report.xlsx'));

  $('do-lookup').addEventListener('click', function () {
    try {
      const cols = Array.from($('lookup-cols').querySelectorAll('input:checked')).map((c) => Number(c.value));
      const r = SheetCore.lookupMerge(cmp.a, cmp.b, Number($('a-key').value), Number($('b-key').value), cols);
      downloadBlob(tablesToXlsxBlob([{ name: 'Lookup result', table: r.table }]), baseName(cmp.nameA) + '-with-lookup.xlsx');
      setStatus(
        $('cmp-status'),
        r.matched + ' row(s) matched, ' + r.unmatched + ' not found in B (left blank).',
        r.unmatched ? 'warn' : 'ok',
      );
    } catch (err) {
      setStatus($('cmp-status'), err.message, 'error');
    }
  });
})();
