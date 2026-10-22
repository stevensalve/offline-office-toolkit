/* Text Toolkit - user interface. All text logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, bindTabs, copyText, el } = OT;
  const $ = (id) => document.getElementById(id);

  bindTabs($('tabs'));

  // Every "Copy result" button copies the textarea named in data-target.
  document.querySelectorAll('button.copy').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const ok = await copyText($(btn.dataset.target).value);
      const old = btn.textContent;
      btn.textContent = ok ? 'Copied!' : 'Press Ctrl+C to copy';
      setTimeout(() => (btn.textContent = old), 1500);
    });
  });

  // -------------------------------------------------------------- Case
  const CASES = [
    ['upper', 'UPPERCASE'],
    ['lower', 'lowercase'],
    ['title', 'Title Case'],
    ['sentence', 'Sentence case'],
    ['toggle', 'tOGGLE cASE'],
    ['camel', 'camelCase'],
    ['pascal', 'PascalCase'],
    ['snake', 'snake_case'],
    ['kebab', 'kebab-case'],
    ['constant', 'CONSTANT_CASE'],
  ];
  CASES.forEach(([mode, label]) =>
    $('case-buttons').appendChild(
      el('button', {
        type: 'button',
        text: label,
        onclick: () => {
          $('case-out').value = TextCore.convertCase($('case-in').value, mode);
        },
      }),
    ),
  );

  // ------------------------------------------------------------- Count
  function renderCount() {
    const s = TextCore.countStats($('count-in').value);
    const items = [
      ['Words', s.words],
      ['Characters', s.characters],
      ['Characters (no spaces)', s.charactersNoSpaces],
      ['Sentences', s.sentences],
      ['Paragraphs', s.paragraphs],
      ['Lines', s.lines],
      ['Reading time', TextCore.formatMinutes(s.readingMinutes)],
      ['Speaking time', TextCore.formatMinutes(s.speakingMinutes)],
    ];
    const box = $('count-stats');
    box.textContent = '';
    items.forEach(([k, v]) => box.appendChild(el('div', {}, [el('dt', { text: k }), el('dd', { text: String(v) })])));
  }
  $('count-in').addEventListener('input', renderCount);
  renderCount();

  // ------------------------------------------------------------- Lines
  function renderLines() {
    const input = $('lines-in').value;
    const out = TextCore.cleanLines(input, {
      trim: $('l-trim').checked,
      collapse: $('l-collapse').checked,
      removeEmpty: $('l-empty').checked,
      dedupe: $('l-dedupe').checked,
      reverse: $('l-reverse').checked,
      number: $('l-number').checked,
      sort: $('l-sort').value,
    });
    $('lines-out').value = out;
    const count = (t) => (t === '' ? 0 : t.split('\n').length);
    $('lines-info').textContent = input ? '(' + count(input.replace(/\r\n?/g, '\n')) + ' lines in, ' + count(out) + ' out)' : '';
  }
  document.querySelectorAll('#panel-lines input, #panel-lines select, #panel-lines textarea').forEach((c) => {
    c.addEventListener('input', renderLines);
    c.addEventListener('change', renderLines);
  });

  // ----------------------------------------------------------- Replace
  $('rep-run').addEventListener('click', function () {
    try {
      const r = TextCore.findReplace($('rep-in').value, $('rep-find').value, $('rep-with').value, {
        matchCase: $('rep-case').checked,
        wholeWord: $('rep-word').checked,
        regex: $('rep-regex').checked,
      });
      $('rep-out').value = r.text;
      setStatus($('rep-status'), r.count + ' replacement(s) made.', r.count ? 'ok' : 'warn');
    } catch (err) {
      setStatus($('rep-status'), err.message, 'error');
    }
  });

  // -------------------------------------------------------------- Diff
  $('diff-run').addEventListener('click', function () {
    const out = $('diff-out');
    out.textContent = '';
    try {
      const ops = TextCore.diffLines($('diff-a').value, $('diff-b').value, {
        ignoreCase: $('diff-case').checked,
        ignoreSpace: $('diff-space').checked,
      });
      const sum = TextCore.diffSummary(ops);
      const sym = { same: ' ', add: '+', del: '-' };
      ops.forEach((o) =>
        out.appendChild(
          el('div', { class: o.type }, [el('span', { class: 'sym', text: sym[o.type], 'aria-hidden': 'true' }), o.text || ' ']),
        ),
      );
      setStatus(
        $('diff-status'),
        sum.add + ' line(s) added, ' + sum.del + ' removed, ' + sum.same + ' unchanged.',
        sum.add + sum.del ? 'warn' : 'ok',
      );
    } catch (err) {
      setStatus($('diff-status'), err.message, 'error');
    }
  });

  // ----------------------------------------------------------- Extract
  function renderExtract() {
    const fn = { emails: TextCore.extractEmails, urls: TextCore.extractUrls, numbers: TextCore.extractNumbers }[$('ext-type').value];
    const found = fn($('ext-in').value);
    $('ext-out').value = found.join('\n');
    $('ext-info').textContent = '(' + found.length + ' unique)';
  }
  $('ext-in').addEventListener('input', renderExtract);
  $('ext-type').addEventListener('change', renderExtract);
})();
