/* PDF Fill & Sign - user interface. Coordinate maths and saving live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, bindTabs, readArrayBuffer, downloadBlob, baseName, el } = OT;
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // PDF.js draws the page picture. Its worker script is loaded locally; when the
  // page is opened from disk (file://) browsers refuse Web Workers, and PDF.js
  // automatically falls back to running the worker in the page.
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  const state = {
    bytes: null,
    name: '',
    doc: null,
    pageCount: 0,
    pageNo: 1,
    zoom: 1.25,
    infos: [],
    items: [],
    images: {},
    tool: 'select',
    selectedId: null,
    signature: null,
    fieldValues: {},
    renderTask: null,
    renderToken: 0,
    nextId: 1,
  };

  const HINTS = {
    select: 'Choose a tool above, then click on the page where it should go. Drag the ✥ handle to move an item.',
    text: 'Click on the page where the text should start, then type.',
    date: 'Click on the page where today’s date should go.',
    check: 'Click on the page where the tick should go.',
    signature: 'Click on the page where your signature should go.',
  };

  // ------------------------------------------------------------- Loading
  bindDropzone($('drop'), $('file-input'), async function (files) {
    const file = files[0];
    try {
      setStatus($('status'), 'Opening ' + file.name + '...');
      const bytes = new Uint8Array(await readArrayBuffer(file));
      if (state.doc) state.doc.destroy();
      // PDF.js takes ownership of the buffer it is given, so hand it a copy.
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      Object.assign(state, {
        bytes: bytes,
        name: file.name,
        doc: doc,
        pageCount: doc.numPages,
        pageNo: 1,
        infos: [],
        items: [],
        images: {},
        selectedId: null,
        fieldValues: {},
        tool: 'select',
      });
      $('editor').hidden = false;
      setTool('select');
      await renderPage();
      await buildFormFields();
      setStatus($('status'), file.name + ' - ' + doc.numPages + ' page(s). Ready.', 'ok');
    } catch (err) {
      const msg =
        err && err.name === 'PasswordException'
          ? 'This PDF is password-protected. Remove the password first, then open it again.'
          : 'Could not open that PDF. It may be damaged.';
      setStatus($('status'), msg, 'error');
    }
  });

  async function getInfo(index) {
    if (!state.infos[index]) {
      const page = await state.doc.getPage(index + 1);
      const v = page.view;
      state.infos[index] = { x0: v[0], y0: v[1], width: v[2] - v[0], height: v[3] - v[1], rotation: page.rotate };
    }
    return state.infos[index];
  }

  // ------------------------------------------------------------ Rendering
  async function renderPage() {
    const token = ++state.renderToken;
    if (state.renderTask) state.renderTask.cancel();
    const page = await state.doc.getPage(state.pageNo);
    await getInfo(state.pageNo - 1);
    const viewport = page.getViewport({ scale: state.zoom });
    const canvas = $('page-canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    $('page-stack').style.width = viewport.width + 'px';
    $('page-stack').style.height = viewport.height + 'px';
    $('page-label').textContent = 'Page ' + state.pageNo + ' of ' + state.pageCount;
    $('prev').disabled = state.pageNo <= 1;
    $('next').disabled = state.pageNo >= state.pageCount;
    renderOverlay();
    try {
      state.renderTask = page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      });
      await state.renderTask.promise;
    } catch (err) {
      if (!err || err.name !== 'RenderingCancelledException') setStatus($('status'), 'Could not draw this page.', 'error');
    }
    if (token === state.renderToken) state.renderTask = null;
  }

  $('prev').addEventListener('click', () => changePage(-1));
  $('next').addEventListener('click', () => changePage(1));
  function changePage(delta) {
    const next = state.pageNo + delta;
    if (next < 1 || next > state.pageCount) return;
    state.pageNo = next;
    select(null);
    renderPage();
  }
  $('zoom').addEventListener('change', function () {
    state.zoom = Number($('zoom').value);
    renderPage();
  });

  // --------------------------------------------------------------- Tools
  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    $('overlay').classList.toggle('placing', tool !== 'select');
    $('tool-hint').textContent = HINTS[tool];
  }

  document.querySelectorAll('[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const tool = btn.dataset.tool;
      setTool(tool);
      if (tool === 'signature' && !state.signature) openSignaturePanel();
    });
  });

  function select(id) {
    state.selectedId = id;
    $('overlay')
      .querySelectorAll('.item')
      .forEach((n) => n.classList.toggle('selected', Number(n.dataset.id) === id));
    ['smaller', 'larger', 'delete'].forEach((b) => ($(b).disabled = id === null));
  }

  const itemById = (id) => state.items.find((i) => i.id === id);

  function measureText(text, sizePx) {
    const ctx = measureText.ctx || (measureText.ctx = document.createElement('canvas').getContext('2d'));
    ctx.font = sizePx + 'px Helvetica, Arial, sans-serif';
    return ctx.measureText(text || 'M').width;
  }

  /** Keep item.w / item.h in sync with what is on screen (used for clamping). */
  function syncBox(item) {
    if (item.type === 'text') {
      item.w = measureText(item.text, item.size) + 2;
      item.h = item.size;
    } else if (item.type === 'check') {
      item.w = item.h = item.size;
    }
  }

  // --------------------------------------------------------------- Overlay
  function renderOverlay() {
    const overlay = $('overlay');
    overlay.textContent = '';
    state.items.filter((i) => i.page === state.pageNo - 1).forEach((i) => overlay.appendChild(buildItemElement(i)));
    select(state.items.some((i) => i.id === state.selectedId && i.page === state.pageNo - 1) ? state.selectedId : null);
  }

  function position(node, item) {
    const z = state.zoom;
    node.style.left = item.x * z + 'px';
    node.style.top = item.y * z + 'px';
    node.style.width = item.w * z + 'px';
    node.style.height = item.h * z + 'px';
  }

  function buildItemElement(item) {
    syncBox(item);
    const node = el('div', { class: 'item ' + item.type, 'data-id': String(item.id) });
    const move = el('button', { type: 'button', class: 'move', title: 'Drag to move', 'aria-label': 'Move item', text: '✥' });
    const del = el('button', {
      type: 'button',
      title: 'Delete',
      'aria-label': 'Delete item',
      text: '✕',
      onclick: () => removeItem(item.id),
    });
    node.appendChild(el('span', { class: 'controls' }, [move, del]));

    if (item.type === 'text') {
      const input = el('input', { type: 'text', class: 'text', 'aria-label': 'Text on page', value: item.text });
      input.style.fontSize = item.size * state.zoom + 'px';
      input.addEventListener('input', function () {
        item.text = input.value;
        syncBox(item);
        position(node, item);
      });
      input.addEventListener('focus', () => select(item.id));
      node.appendChild(input);
    } else if (item.type === 'check') {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      const line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('points', '10,55 40,88 92,12');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', '#000');
      line.setAttribute('stroke-width', '11');
      svg.appendChild(line);
      node.appendChild(svg);
    } else {
      node.appendChild(el('img', { src: item.dataUrl, alt: 'Your signature', draggable: 'false' }));
    }
    position(node, item);

    node.addEventListener('pointerdown', function (e) {
      select(item.id);
      // Text boxes are moved with the handle; ticks and signatures by their body.
      const grab = e.target === move || (item.type !== 'text' && !del.contains(e.target));
      if (grab) startDrag(e, item, node);
    });
    return node;
  }

  function startDrag(e, item, node) {
    e.preventDefault();
    const info = state.infos[item.page];
    const start = { x: e.clientX, y: e.clientY, ix: item.x, iy: item.y };
    node.setPointerCapture(e.pointerId);
    const onMove = function (ev) {
      item.x = start.ix + (ev.clientX - start.x) / state.zoom;
      item.y = start.iy + (ev.clientY - start.y) / state.zoom;
      Object.assign(item, FillCore.clampBox(item, info));
      position(node, item);
    };
    const onUp = function () {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
    };
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  }

  function removeItem(id) {
    state.items = state.items.filter((i) => i.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    renderOverlay();
  }

  $('delete').addEventListener('click', () => state.selectedId !== null && removeItem(state.selectedId));

  function resizeSelected(factor) {
    const item = itemById(state.selectedId);
    if (!item) return;
    if (item.type === 'signature') {
      const w = Math.min(400, Math.max(40, item.w * factor));
      item.h = item.h * (w / item.w);
      item.w = w;
    } else {
      item.size = Math.min(item.type === 'text' ? 72 : 60, Math.max(item.type === 'text' ? 6 : 8, item.size * factor));
    }
    renderOverlay();
  }
  $('smaller').addEventListener('click', () => resizeSelected(0.9));
  $('larger').addEventListener('click', () => resizeSelected(1.1));

  document.addEventListener('keydown', function (e) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === 'Escape') {
      setTool('select');
      select(null);
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      state.selectedId !== null &&
      tag !== 'INPUT' &&
      tag !== 'TEXTAREA' &&
      tag !== 'SELECT'
    ) {
      e.preventDefault();
      removeItem(state.selectedId);
    }
  });

  // -------------------------------------------------------------- Placing
  $('overlay').addEventListener('pointerdown', function (e) {
    if (e.target !== $('overlay')) return;
    if (state.tool === 'select') return select(null);
    // Without this the browser moves focus to the page after our pointerdown,
    // which would immediately take focus away from the new text box.
    e.preventDefault();
    const rect = $('overlay').getBoundingClientRect();
    const u = (e.clientX - rect.left) / state.zoom;
    const v = (e.clientY - rect.top) / state.zoom;
    place(state.tool, u, v);
  });

  function place(tool, u, v) {
    const base = { id: state.nextId++, page: state.pageNo - 1 };
    let item;
    if (tool === 'text' || tool === 'date') {
      const text = tool === 'date' ? FillCore.formatDate(new Date(), $('date-format').value) : '';
      item = Object.assign(base, { type: 'text', size: 12, text: text, x: u, y: v - 6 });
    } else if (tool === 'check') {
      item = Object.assign(base, { type: 'check', size: 16, x: u - 8, y: v - 8 });
    } else if (tool === 'signature') {
      if (!state.signature) return openSignaturePanel();
      const w = 150;
      const h = w * state.signature.ratio;
      item = Object.assign(base, {
        type: 'signature',
        imageId: state.signature.id,
        dataUrl: state.signature.dataUrl,
        w: w,
        h: h,
        x: u - w / 2,
        y: v - h / 2,
      });
    } else return;
    syncBox(item);
    Object.assign(item, FillCore.clampBox(item, state.infos[item.page]));
    state.items.push(item);
    state.selectedId = item.id;
    setTool('select');
    renderOverlay();
    if (item.type === 'text' && !item.text) {
      const input = $('overlay').querySelector('.item[data-id="' + item.id + '"] input');
      if (input) setTimeout(() => input.focus(), 0);
    }
  }

  // ------------------------------------------------------------- Signature
  const pad = $('sig-pad');
  const padCtx = pad.getContext('2d');
  let drawing = false;
  let hasInk = false;
  let sigMode = 'draw';

  bindTabs($('sig-tabs'), function (panelId) {
    sigMode = panelId === 'sig-type' ? 'type' : 'draw';
    pad.classList.toggle('typed', sigMode === 'type');
    $('sig-draw').hidden = false; // the canvas is shared; only the hint differs
    $('sig-type').hidden = sigMode !== 'type';
    clearPad();
    if (sigMode === 'type') drawTyped();
  });

  function openSignaturePanel() {
    $('sig-panel').hidden = false;
    clearPad();
    $('sig-panel').scrollIntoView({ block: 'nearest' });
  }

  function clearPad() {
    padCtx.clearRect(0, 0, pad.width, pad.height);
    hasInk = false;
    setStatus($('sig-status'), '');
  }

  function padPoint(e) {
    const r = pad.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * pad.width) / r.width, y: ((e.clientY - r.top) * pad.height) / r.height };
  }

  pad.addEventListener('pointerdown', function (e) {
    if (sigMode !== 'draw') return;
    drawing = true;
    pad.setPointerCapture(e.pointerId);
    const p = padPoint(e);
    padCtx.strokeStyle = $('sig-color').value;
    padCtx.lineWidth = 3;
    padCtx.lineCap = 'round';
    padCtx.lineJoin = 'round';
    padCtx.beginPath();
    padCtx.moveTo(p.x, p.y);
    padCtx.lineTo(p.x + 0.1, p.y + 0.1); // a tap leaves a dot
    padCtx.stroke();
    hasInk = true;
  });
  pad.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    const p = padPoint(e);
    padCtx.lineTo(p.x, p.y);
    padCtx.stroke();
  });
  ['pointerup', 'pointercancel'].forEach((t) => pad.addEventListener(t, () => (drawing = false)));

  function drawTyped() {
    padCtx.clearRect(0, 0, pad.width, pad.height);
    const text = $('sig-text').value.trim();
    hasInk = text.length > 0;
    if (!hasInk) return;
    let size = 100;
    const family = '"Segoe Script", "Brush Script MT", "Snell Roundhand", "Lucida Handwriting", cursive';
    do {
      padCtx.font = 'italic ' + size + 'px ' + family;
      size -= 4;
    } while (padCtx.measureText(text).width > pad.width - 40 && size > 20);
    padCtx.fillStyle = $('sig-color').value;
    padCtx.textBaseline = 'middle';
    padCtx.fillText(text, 20, pad.height / 2);
  }
  $('sig-text').addEventListener('input', drawTyped);
  $('sig-color').addEventListener('change', () => sigMode === 'type' && drawTyped());
  $('sig-clear').addEventListener('click', function () {
    $('sig-text').value = '';
    clearPad();
  });
  $('sig-cancel').addEventListener('click', function () {
    $('sig-panel').hidden = true;
    setTool('select');
  });

  /** Crop transparent margins so the signature fits its box tightly. */
  function trimmedCanvas(source) {
    const { width, height } = source;
    const data = source.getContext('2d').getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < 0) return null;
    const pad4 = 4;
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1 + pad4 * 2;
    out.height = maxY - minY + 1 + pad4 * 2;
    out.getContext('2d').drawImage(source, minX, minY, maxX - minX + 1, maxY - minY + 1, pad4, pad4, maxX - minX + 1, maxY - minY + 1);
    return out;
  }

  $('sig-use').addEventListener('click', async function () {
    if (!hasInk) return setStatus($('sig-status'), sigMode === 'type' ? 'Type your name first.' : 'Draw your signature first.', 'error');
    const trimmed = trimmedCanvas(pad);
    if (!trimmed) return setStatus($('sig-status'), 'The signature area is empty.', 'error');
    const blob = await new Promise((resolve) => trimmed.toBlob(resolve, 'image/png'));
    const id = 'sig' + state.nextId++;
    const bytes = new Uint8Array(await readArrayBuffer(blob));
    state.images[id] = bytes;
    state.signature = { id: id, dataUrl: trimmed.toDataURL('image/png'), ratio: trimmed.height / trimmed.width };
    $('sig-panel').hidden = true;
    setTool('signature');
  });

  // ------------------------------------------------------------ Form fields
  async function buildFormFields() {
    const box = $('fields');
    box.textContent = '';
    let fields = [];
    try {
      fields = await FillCore.listFormFields(state.bytes);
    } catch (e) {
      fields = [];
    }
    fields = fields.filter((f) => !f.readOnly);
    $('fields-card').hidden = fields.length === 0;
    fields.forEach(function (f, i) {
      const id = 'field-' + i;
      let control;
      if (f.type === 'checkbox') {
        control = el('input', { type: 'checkbox', id: id });
        control.checked = !!f.value;
        control.addEventListener('change', () => (state.fieldValues[f.name] = control.checked));
        box.appendChild(el('div', {}, [el('label', { class: 'inline', for: id }, [control, f.name])]));
        return;
      }
      if (f.type === 'dropdown' || f.type === 'radio') {
        control = el(
          'select',
          { id: id },
          [el('option', { value: '', text: '(not set)' })].concat(f.options.map((o) => el('option', { value: o, text: o }))),
        );
        control.value = f.value || '';
      } else {
        control = el('input', { type: 'text', id: id, value: f.value || '' });
      }
      control.addEventListener('input', () => (state.fieldValues[f.name] = control.value));
      control.addEventListener('change', () => (state.fieldValues[f.name] = control.value));
      box.appendChild(el('div', {}, [el('label', { for: id, text: f.name }), control]));
    });
  }

  // ------------------------------------------------------------------ Save
  $('save').addEventListener('click', async function () {
    const button = $('save');
    try {
      button.disabled = true;
      setStatus($('save-status'), 'Saving...');
      const pages = [];
      for (const p of new Set(state.items.map((i) => i.page))) pages[p] = await getInfo(p);
      state.items.forEach(syncBox);
      const out = await FillCore.applyEdits(state.bytes, {
        items: state.items,
        images: state.images,
        pages: pages,
        fields: state.fieldValues,
        flatten: $('flatten').checked,
      });
      downloadBlob(out, baseName(state.name) + '-signed.pdf', 'application/pdf');
      setStatus($('save-status'), 'Saved ' + baseName(state.name) + '-signed.pdf. Your original file was not changed.', 'ok');
    } catch (err) {
      setStatus($('save-status'), err.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
