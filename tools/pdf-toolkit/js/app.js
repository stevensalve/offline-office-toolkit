/* PDF Toolkit - user interface. Pure logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, bindTabs, readArrayBuffer, formatBytes, downloadBlob, el } = OT;

  bindTabs(document.getElementById('tabs'));

  // ---------------------------------------------------------------- Merge
  const mergeState = []; // [{ name, size, pages, bytes }]
  const mergeList = document.getElementById('merge-list');
  const mergeRun = document.getElementById('merge-run');
  const mergeClear = document.getElementById('merge-clear');
  const mergeStatus = document.getElementById('merge-status');

  function renderMerge() {
    mergeList.textContent = '';
    mergeState.forEach(function (item, i) {
      const move = function (delta) {
        const j = i + delta;
        if (j < 0 || j >= mergeState.length) return;
        mergeState.splice(j, 0, mergeState.splice(i, 1)[0]);
        renderMerge();
      };
      mergeList.appendChild(
        el('li', {}, [
          el('span', { class: 'name', text: i + 1 + '. ' + item.name }),
          el('span', { class: 'meta', text: item.pages + ' pages, ' + formatBytes(item.size) }),
          el('span', { class: 'row-actions' }, [
            el('button', { type: 'button', 'aria-label': 'Move ' + item.name + ' up', text: '↑', onclick: () => move(-1) }),
            el('button', { type: 'button', 'aria-label': 'Move ' + item.name + ' down', text: '↓', onclick: () => move(1) }),
            el('button', {
              type: 'button',
              class: 'danger',
              'aria-label': 'Remove ' + item.name,
              text: '✕',
              onclick: function () {
                mergeState.splice(i, 1);
                renderMerge();
              },
            }),
          ]),
        ]),
      );
    });
    mergeRun.disabled = mergeState.length < 2;
    mergeClear.disabled = mergeState.length === 0;
  }

  bindDropzone(document.getElementById('merge-drop'), document.getElementById('merge-input'), async function (files) {
    setStatus(mergeStatus, 'Reading files...');
    const problems = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await readArrayBuffer(file));
        const pages = await PdfCore.pageCount(bytes);
        mergeState.push({ name: file.name, size: file.size, pages: pages, bytes: bytes });
      } catch (err) {
        problems.push(file.name + ': ' + err.message);
      }
    }
    renderMerge();
    if (problems.length) setStatus(mergeStatus, problems.join(' '), 'error');
    else setStatus(mergeStatus, '');
  });

  mergeClear.addEventListener('click', function () {
    mergeState.length = 0;
    renderMerge();
    setStatus(mergeStatus, '');
  });

  mergeRun.addEventListener('click', async function () {
    try {
      mergeRun.disabled = true;
      setStatus(mergeStatus, 'Merging...');
      const out = await PdfCore.mergePdfs(mergeState.map((m) => m.bytes));
      downloadBlob(out, 'merged.pdf', 'application/pdf');
      setStatus(mergeStatus, 'Done. Saved merged.pdf (' + formatBytes(out.length) + ').', 'ok');
    } catch (err) {
      setStatus(mergeStatus, err.message, 'error');
    } finally {
      mergeRun.disabled = mergeState.length < 2;
    }
  });

  // ------------------------------------------------- Single-file tools
  /**
   * Builds a panel for tools that work on one PDF. `config.run(bytes, values,
   * info)` must return the list of files to download: [{ bytes, name }].
   */
  function buildSinglePanel(panelId, config) {
    const panel = document.getElementById(panelId);
    panel.appendChild(document.getElementById('single-tpl').content.cloneNode(true));
    panel.querySelector('h2').textContent = config.title;
    panel.querySelector('.help').textContent = config.help;
    const run = panel.querySelector('.run');
    run.textContent = config.button;
    const status = panel.querySelector('.status');
    const info = panel.querySelector('.fileinfo');
    const fieldBox = panel.querySelector('.fields');
    const state = { name: '', bytes: null, pages: 0 };
    const inputs = {};

    config.fields.forEach(function (f) {
      const id = panelId + '-' + f.id;
      const control =
        f.type === 'select'
          ? el(
              'select',
              { id: id },
              f.options.map((o) => el('option', { value: o[0], text: o[1] })),
            )
          : el('input', { id: id, type: f.type || 'text', placeholder: f.placeholder || '', value: f.value || '' });
      inputs[f.id] = control;
      fieldBox.appendChild(
        el('div', {}, [el('label', { for: id, text: f.label }), control, el('p', { class: 'hint', text: f.hint || '' })]),
      );
    });

    bindDropzone(panel.querySelector('.dropzone'), panel.querySelector('input[type=file]'), async function (files) {
      const file = files[0];
      try {
        setStatus(status, 'Reading file...');
        state.bytes = new Uint8Array(await readArrayBuffer(file));
        state.pages = await PdfCore.pageCount(state.bytes);
        state.name = file.name;
        info.textContent = file.name + ' - ' + state.pages + ' page(s), ' + formatBytes(file.size);
        run.disabled = false;
        setStatus(status, '');
      } catch (err) {
        state.bytes = null;
        info.textContent = '';
        run.disabled = true;
        setStatus(status, err.message, 'error');
      }
    });

    run.addEventListener('click', async function () {
      try {
        run.disabled = true;
        setStatus(status, 'Working...');
        const values = {};
        Object.keys(inputs).forEach((k) => (values[k] = inputs[k].value));
        const outputs = await config.run(state.bytes, values, state);
        for (const out of outputs) downloadBlob(out.bytes, out.name, 'application/pdf');
        setStatus(status, 'Done. Saved ' + outputs.length + ' file(s).', 'ok');
      } catch (err) {
        setStatus(status, err.message, 'error');
      } finally {
        run.disabled = !state.bytes;
      }
    });
  }

  const pagesField = function (hint) {
    return { id: 'pages', label: 'Pages', placeholder: 'e.g. 1-3, 5, 8-', hint: hint };
  };

  buildSinglePanel('panel-extract', {
    title: 'Extract or re-order pages',
    help: 'Keep only the pages you list - in the order you list them. "3,1,2" puts page 3 first.',
    button: 'Extract and download',
    fields: [pagesField('Leave empty for all pages. Examples: 1-3, 5, 8-  or  3,1,2')],
    run: async function (bytes, v, s) {
      const idx = PdfCore.parsePageSpec(v.pages, s.pages);
      return [{ bytes: await PdfCore.extractPages(bytes, idx), name: PdfCore.outputName(s.name, 'extract') }];
    },
  });

  buildSinglePanel('panel-delete', {
    title: 'Delete pages',
    help: 'Remove the pages you list and keep the rest.',
    button: 'Delete and download',
    fields: [pagesField('Examples: 2, 4-6')],
    run: async function (bytes, v, s) {
      if (!v.pages.trim()) throw new Error('Enter the pages to delete.');
      const idx = PdfCore.parsePageSpec(v.pages, s.pages);
      return [{ bytes: await PdfCore.deletePages(bytes, idx), name: PdfCore.outputName(s.name, 'edited') }];
    },
  });

  buildSinglePanel('panel-rotate', {
    title: 'Rotate pages',
    help: 'Turn pages clockwise. Leave Pages empty to rotate the whole document.',
    button: 'Rotate and download',
    fields: [
      pagesField('Leave empty for all pages.'),
      {
        id: 'angle',
        label: 'Rotate clockwise by',
        type: 'select',
        options: [
          ['90', '90 degrees'],
          ['180', '180 degrees'],
          ['270', '270 degrees (90 counter-clockwise)'],
        ],
      },
    ],
    run: async function (bytes, v, s) {
      const idx = PdfCore.parsePageSpec(v.pages, s.pages);
      return [{ bytes: await PdfCore.rotatePages(bytes, idx, Number(v.angle)), name: PdfCore.outputName(s.name, 'rotated') }];
    },
  });

  buildSinglePanel('panel-split', {
    title: 'Split into several PDFs',
    help: 'Cut a long PDF into smaller files with the same number of pages each. Your browser may ask permission to download multiple files.',
    button: 'Split and download',
    fields: [{ id: 'size', label: 'Pages per file', type: 'number', value: '1', hint: '1 = one file per page.' }],
    run: async function (bytes, v, s) {
      const parts = await PdfCore.splitEvery(bytes, Number(v.size));
      if (parts.length > 50)
        throw new Error('That would create ' + parts.length + ' files. Choose a larger number of pages per file (max 50 files).');
      return parts.map((p) => ({ bytes: p.bytes, name: PdfCore.outputName(s.name, 'pages-' + p.from + '-' + p.to) }));
    },
  });
})();
