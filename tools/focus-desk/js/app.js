/* Focus Desk - user interface and storage. All rules live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindTabs, downloadBlob, readText, el, debounce } = OT;
  const D = DeskCore;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'offline-office-toolkit.focus-desk.v1';
  const PHASE_NAMES = { work: 'Focus', short: 'Short break', long: 'Long break' };

  bindTabs($('tabs'));

  /** Today's date in the user's own time zone, as YYYY-MM-DD. */
  const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  // ------------------------------------------------------------- Storage
  let state;
  try {
    state = D.importState(localStorage.getItem(STORAGE_KEY) || JSON.stringify(D.emptyState()));
  } catch (e) {
    state = D.emptyState();
  }
  let soundOn = true;

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, D.exportState(state));
    } catch (e) {
      /* Private mode or full storage: keep working, just without saving. */
    }
  }
  const saveSoon = debounce(saveNow, 200);
  window.addEventListener('pagehide', saveNow);

  /** Apply a state change, save it and redraw what depends on it. */
  function commit(next, parts) {
    state = next;
    saveSoon();
    (parts || ['tasks', 'board', 'notes']).forEach((p) =>
      ({ tasks: renderTasks, board: renderBoard, notes: renderNotesList, timer: renderTimer })[p](),
    );
  }

  /** Run `fn` and show a friendly message if it throws. */
  function guarded(statusEl, fn) {
    try {
      fn();
    } catch (err) {
      setStatus(statusEl, err.message, 'error');
    }
  }

  // --------------------------------------------------------------- Tasks
  function priorityPill(task) {
    return el('span', { class: 'pill ' + task.priority, text: task.priority });
  }

  function dueSpan(task) {
    const due = D.dueLabel(task.due, todayIso());
    return task.status === 'done' || !due.text ? null : el('span', { class: 'due' + (due.overdue ? ' overdue' : ''), text: due.text });
  }

  function renderTasks() {
    const list = $('task-list');
    list.textContent = '';
    const tasks = D.sortTasks(D.filterTasks(state.tasks, $('task-filter').value), $('task-sort').value);
    $('task-empty').hidden = tasks.length > 0;
    tasks.forEach(function (task) {
      const check = el('input', { type: 'checkbox', 'aria-label': 'Done: ' + task.title });
      check.checked = task.status === 'done';
      check.addEventListener('change', () => commit(D.updateTask(state, task.id, { status: check.checked ? 'done' : 'todo' })));

      const title = el('span', { class: 'title', text: task.title });
      const edit = el('button', { type: 'button', text: 'Edit', 'aria-label': 'Edit ' + task.title });
      edit.addEventListener('click', function () {
        const input = el('input', { type: 'text', class: 'title-input', value: task.title, maxlength: '200', 'aria-label': 'Task title' });
        title.replaceWith(input);
        input.focus();
        const finish = function (save) {
          if (save && input.value.trim() && input.value.trim() !== task.title) commit(D.updateTask(state, task.id, { title: input.value }));
          else renderTasks();
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        });
        input.addEventListener('blur', () => finish(true));
      });

      const status = el(
        'select',
        { 'aria-label': 'Status of ' + task.title },
        [
          ['todo', 'To do'],
          ['doing', 'Doing'],
          ['done', 'Done'],
        ].map((o) => el('option', { value: o[0], text: o[1] })),
      );
      status.value = task.status;
      status.addEventListener('change', () => commit(D.updateTask(state, task.id, { status: status.value })));

      const del = el('button', {
        type: 'button',
        class: 'danger',
        'aria-label': 'Delete ' + task.title,
        text: '✕',
        onclick: () => commit(D.deleteTask(state, task.id)),
      });
      list.appendChild(
        el(
          'li',
          { class: task.status === 'done' ? 'done' : '' },
          [check, title, priorityPill(task), dueSpan(task), status, edit, del].filter(Boolean),
        ),
      );
    });
  }

  $('task-form').addEventListener('submit', function (e) {
    e.preventDefault();
    guarded($('task-status'), function () {
      commit(
        D.addTask(state, {
          title: $('task-title').value,
          priority: $('task-priority').value,
          due: $('task-due').value,
          created: Date.now(),
        }),
      );
      $('task-title').value = '';
      $('task-due').value = '';
      $('task-title').focus();
      setStatus($('task-status'), 'Task added.', 'ok');
    });
  });
  ['task-filter', 'task-sort'].forEach((id) => $(id).addEventListener('change', renderTasks));

  // --------------------------------------------------------------- Board
  const COLUMNS = [
    ['todo', 'To do'],
    ['doing', 'Doing'],
    ['done', 'Done'],
  ];

  function renderBoard() {
    const board = $('board');
    board.textContent = '';
    COLUMNS.forEach(function (col) {
      const items = D.sortTasks(
        state.tasks.filter((t) => t.status === col[0]),
        'priority',
      );
      const column = el('div', { class: 'column', 'data-status': col[0] }, [el('h2', { text: col[1] + ' (' + items.length + ')' })]);
      column.addEventListener('dragover', (e) => {
        e.preventDefault();
        column.classList.add('over');
      });
      column.addEventListener('dragleave', () => column.classList.remove('over'));
      column.addEventListener('drop', function (e) {
        e.preventDefault();
        column.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        if (state.tasks.some((t) => t.id === id)) guarded($('task-status'), () => commit(D.updateTask(state, id, { status: col[0] })));
      });
      items.forEach(function (task) {
        const left = el('button', {
          type: 'button',
          text: '←',
          'aria-label': 'Move ' + task.title + ' left',
          onclick: () => commit(D.shiftStatus(state, task.id, -1)),
        });
        const right = el('button', {
          type: 'button',
          text: '→',
          'aria-label': 'Move ' + task.title + ' right',
          onclick: () => commit(D.shiftStatus(state, task.id, 1)),
        });
        left.disabled = task.status === 'todo';
        right.disabled = task.status === 'done';
        const del = el('button', {
          type: 'button',
          class: 'danger',
          text: '✕',
          'aria-label': 'Delete ' + task.title,
          onclick: () => commit(D.deleteTask(state, task.id)),
        });
        const card = el('div', { class: 'card-task', draggable: 'true' }, [
          el('div', { text: task.title }),
          el('div', { class: 'meta' }, [priorityPill(task), dueSpan(task)].filter(Boolean)),
          el('div', { class: 'actions' }, [left, right, del]),
        ]);
        card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', task.id));
        column.appendChild(card);
      });
      board.appendChild(column);
    });
  }

  // --------------------------------------------------------------- Notes
  let currentNote = null;

  function renderNotesList() {
    const list = $('notes-list');
    list.textContent = '';
    state.notes.forEach(function (n) {
      const b = el('button', { type: 'button', text: n.title || 'Untitled', 'aria-current': String(n.id === currentNote) });
      b.addEventListener('click', () => openNote(n.id));
      list.appendChild(el('li', {}, [b]));
    });
    const note = state.notes.find((n) => n.id === currentNote);
    $('note-editor').hidden = !note;
  }

  function openNote(id) {
    currentNote = id;
    const n = state.notes.find((x) => x.id === id);
    if (n) {
      $('note-title').value = n.title;
      $('note-body').value = n.body;
    }
    renderNotesList();
  }

  $('note-new').addEventListener('click', function () {
    state = D.addNote(state, { title: 'New note', body: '', updated: Date.now() });
    saveSoon();
    openNote(state.notes[0].id);
    $('note-title').select();
  });

  // Typing updates the note without redrawing the editor (so the cursor stays put).
  const updateCurrentNote = function () {
    if (!currentNote) return;
    state = D.updateNote(state, currentNote, { title: $('note-title').value, body: $('note-body').value, updated: Date.now() });
    saveSoon();
    const btn = $('notes-list').querySelector('[aria-current="true"]');
    if (btn) btn.textContent = $('note-title').value || 'Untitled';
  };
  $('note-title').addEventListener('input', updateCurrentNote);
  $('note-body').addEventListener('input', updateCurrentNote);

  $('note-delete').addEventListener('click', function () {
    if (!currentNote || !window.confirm('Delete this note?')) return;
    const id = currentNote;
    currentNote = null;
    commit(D.deleteNote(state, id), ['notes']);
  });

  // --------------------------------------------------------------- Timer
  let timer = D.newTimer(state.settings);
  let ticker = null;
  let audio = null;

  function beep() {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach(function (offset) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.2, audio.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.2);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(audio.currentTime + offset);
        osc.stop(audio.currentTime + offset + 0.22);
      });
    } catch (e) {
      /* No audio available: the on-screen message still tells the user. */
    }
  }

  function renderTimer() {
    const s = state.settings;
    $('timer-clock').textContent = D.formatClock(timer.remainingMs);
    $('timer-phase').textContent = PHASE_NAMES[timer.phase];
    $('timer-round').textContent = 'Round ' + timer.round + ' of ' + s.rounds;
    $('timer-toggle').textContent = timer.running ? 'Pause' : 'Start';
    document.title = timer.running
      ? D.formatClock(timer.remainingMs) + ' ' + PHASE_NAMES[timer.phase] + ' - Focus Desk'
      : 'Focus Desk - to-do list, board, focus timer and notes (offline)';
    const st = D.focusStats(state, todayIso());
    $('timer-stats').textContent =
      st.todaySessions + ' focus session(s), ' + st.todayMinutes + ' min today. ' + st.weekMinutes + ' min in the last 7 days.';
    ['work', 'short', 'long', 'rounds'].forEach((k) => ($('set-' + k).value = s[k]));
  }

  function tick() {
    const r = D.tickTimer(timer, Date.now(), state.settings);
    timer = r.timer;
    if (r.completed) {
      stopTicker();
      if (r.completed === 'work') {
        state = D.recordSession(state, todayIso(), state.settings.work);
        saveSoon();
      }
      beep();
      setStatus(
        $('timer-status'),
        r.completed === 'work' ? 'Focus session complete. Time for a break!' : 'Break over. Ready when you are.',
        'ok',
      );
    }
    renderTimer();
  }

  function startTicker() {
    if (!ticker) ticker = setInterval(tick, 250);
  }
  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  $('timer-toggle').addEventListener('click', function () {
    setStatus($('timer-status'), '');
    if (timer.running) {
      timer = D.pauseTimer(timer, Date.now());
      stopTicker();
    } else {
      timer = D.startTimer(timer, Date.now());
      startTicker();
      // Browsers only allow sound after a click, so wake the audio engine now.
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        audio.resume();
      } catch (e) {
        audio = null;
      }
    }
    renderTimer();
  });
  $('timer-skip').addEventListener('click', function () {
    stopTicker();
    timer = D.skipPhase(timer, state.settings);
    renderTimer();
  });
  $('timer-reset').addEventListener('click', function () {
    stopTicker();
    timer = D.resetTimer(timer, state.settings);
    renderTimer();
  });
  $('set-sound').addEventListener('change', () => (soundOn = $('set-sound').checked));
  $('set-apply').addEventListener('click', function () {
    const merged = D.importState({
      version: D.VERSION,
      settings: { work: $('set-work').value, short: $('set-short').value, long: $('set-long').value, rounds: $('set-rounds').value },
    });
    state = Object.assign({}, state, { settings: merged.settings });
    saveSoon();
    stopTicker();
    timer = D.newTimer(state.settings);
    renderTimer();
    setStatus($('timer-status'), 'Settings saved.', 'ok');
  });

  // ---------------------------------------------------------------- Data
  $('data-export').addEventListener('click', function () {
    downloadBlob(new Blob([D.exportState(state)], { type: 'application/json' }), 'focus-desk-backup-' + todayIso() + '.json');
    setStatus($('data-status'), 'Backup saved.', 'ok');
  });

  $('data-import').addEventListener('change', async function () {
    const file = $('data-import').files[0];
    $('data-import').value = '';
    if (!file) return;
    try {
      const next = D.importState(await readText(file));
      if (
        !window.confirm(
          'Replace everything in Focus Desk with this backup (' + next.tasks.length + ' tasks, ' + next.notes.length + ' notes)?',
        )
      )
        return;
      currentNote = null;
      timer = D.newTimer(next.settings);
      commit(next, ['tasks', 'board', 'notes', 'timer']);
      setStatus($('data-status'), 'Backup restored.', 'ok');
    } catch (err) {
      setStatus($('data-status'), err.message, 'error');
    }
  });

  $('data-erase').addEventListener('click', function () {
    if (!window.confirm('Erase all tasks, notes and statistics from this browser? This cannot be undone.')) return;
    currentNote = null;
    stopTicker();
    timer = D.newTimer(D.DEFAULT_SETTINGS);
    commit(D.emptyState(), ['tasks', 'board', 'notes', 'timer']);
    setStatus($('data-status'), 'Everything was erased.', 'ok');
  });

  // ------------------------------------------------------------ Start up
  commit(state, ['tasks', 'board', 'notes', 'timer']);
})();
