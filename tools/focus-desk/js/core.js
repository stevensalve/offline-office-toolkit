/**
 * Focus Desk - core logic: tasks, notes, focus timer and backup validation.
 * Pure functions only (no DOM, no storage) so everything is unit-testable.
 * Every update function returns a NEW state object and never edits its input.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DeskCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const STATUSES = ['todo', 'doing', 'done'];
  const PRIORITIES = ['high', 'medium', 'low'];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const DAY = 86400000;

  const DEFAULT_SETTINGS = { work: 25, short: 5, long: 15, rounds: 4 };

  function emptyState() {
    return { version: VERSION, nextId: 1, tasks: [], notes: [], sessions: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
  }

  const clampInt = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);

  // -------------------------------------------------------------- Tasks

  /** Add a task. Throws if the title is empty. */
  function addTask(state, input) {
    const title = str(input.title, 200).trim();
    if (!title) throw new Error('Type what needs to be done.');
    const task = {
      id: 't' + state.nextId,
      title: title,
      status: STATUSES.includes(input.status) ? input.status : 'todo',
      priority: PRIORITIES.includes(input.priority) ? input.priority : 'medium',
      due: ISO_DATE.test(input.due || '') ? input.due : '',
      notes: str(input.notes, 2000),
      created: input.created || 0,
    };
    return Object.assign({}, state, { nextId: state.nextId + 1, tasks: state.tasks.concat([task]) });
  }

  function updateTask(state, id, changes) {
    if (!state.tasks.some((t) => t.id === id)) throw new Error('That task no longer exists.');
    return Object.assign({}, state, {
      tasks: state.tasks.map(function (t) {
        if (t.id !== id) return t;
        const next = Object.assign({}, t);
        if ('title' in changes) {
          const title = str(changes.title, 200).trim();
          if (!title) throw new Error('A task needs a title.');
          next.title = title;
        }
        if ('status' in changes && STATUSES.includes(changes.status)) next.status = changes.status;
        if ('priority' in changes && PRIORITIES.includes(changes.priority)) next.priority = changes.priority;
        if ('due' in changes) next.due = ISO_DATE.test(changes.due || '') ? changes.due : '';
        if ('notes' in changes) next.notes = str(changes.notes, 2000);
        return next;
      }),
    });
  }

  const deleteTask = (state, id) => Object.assign({}, state, { tasks: state.tasks.filter((t) => t.id !== id) });

  /** Move a task one column left/right on the board. direction: -1 | 1 */
  function shiftStatus(state, id, direction) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) throw new Error('That task no longer exists.');
    const next = STATUSES[STATUSES.indexOf(task.status) + direction];
    return next ? updateTask(state, id, { status: next }) : state;
  }

  /**
   * Sort for the list view. mode: "due" (earliest first, no-date last),
   * "priority" (high first) or "created" (oldest first). Ties keep their order.
   */
  function sortTasks(tasks, mode) {
    const decorated = tasks.map((t, i) => ({ t: t, i: i }));
    const cmp =
      {
        due: (a, b) => (a.t.due || '9999-99-99').localeCompare(b.t.due || '9999-99-99'),
        priority: (a, b) => PRIORITY_RANK[a.t.priority] - PRIORITY_RANK[b.t.priority],
        created: () => 0,
      }[mode] || (() => 0);
    return decorated.sort((a, b) => cmp(a, b) || a.i - b.i).map((x) => x.t);
  }

  /** filter: "all" | "open" | "done" */
  function filterTasks(tasks, filter) {
    if (filter === 'open') return tasks.filter((t) => t.status !== 'done');
    if (filter === 'done') return tasks.filter((t) => t.status === 'done');
    return tasks.slice();
  }

  /** Friendly due-date text relative to `todayIso` (both "YYYY-MM-DD"). */
  function dueLabel(due, todayIso) {
    if (!ISO_DATE.test(due || '')) return { text: '', overdue: false };
    const diff = Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(todayIso + 'T00:00:00Z')) / DAY);
    if (diff < 0) return { text: 'Overdue by ' + -diff + (diff === -1 ? ' day' : ' days'), overdue: true };
    if (diff === 0) return { text: 'Due today', overdue: false };
    if (diff === 1) return { text: 'Due tomorrow', overdue: false };
    return { text: 'Due in ' + diff + ' days', overdue: false };
  }

  // -------------------------------------------------------------- Notes

  function addNote(state, input) {
    const note = {
      id: 'n' + state.nextId,
      title: str(input.title, 120).trim() || 'Untitled',
      body: str(input.body, 20000),
      updated: input.updated || 0,
    };
    return Object.assign({}, state, { nextId: state.nextId + 1, notes: [note].concat(state.notes) });
  }

  function updateNote(state, id, changes) {
    return Object.assign({}, state, {
      notes: state.notes.map((n) =>
        n.id !== id
          ? n
          : Object.assign({}, n, {
              title: 'title' in changes ? str(changes.title, 120) : n.title,
              body: 'body' in changes ? str(changes.body, 20000) : n.body,
              updated: changes.updated || n.updated,
            }),
      ),
    });
  }

  const deleteNote = (state, id) => Object.assign({}, state, { notes: state.notes.filter((n) => n.id !== id) });

  // --------------------------------------------------------------- Timer

  /**
   * Pomodoro state machine. A timer is a plain object:
   * { phase: "work"|"short"|"long", round, running, remainingMs, endsAt }
   * `endsAt` (a clock time) is used while running so the countdown stays
   * correct even if the browser slows a background tab.
   */
  const phaseMs = (phase, s) => 60000 * (phase === 'work' ? s.work : phase === 'short' ? s.short : s.long);

  function newTimer(settings) {
    return { phase: 'work', round: 1, running: false, remainingMs: phaseMs('work', settings), endsAt: 0 };
  }

  const startTimer = (t, now) => (t.running ? t : Object.assign({}, t, { running: true, endsAt: now + t.remainingMs }));
  const pauseTimer = (t, now) =>
    t.running ? Object.assign({}, t, { running: false, remainingMs: Math.max(0, t.endsAt - now), endsAt: 0 }) : t;

  /** The timer after the current phase ends (paused, ready to start). */
  function nextPhase(t, settings) {
    if (t.phase === 'work') {
      const phase = t.round % settings.rounds === 0 ? 'long' : 'short';
      return { phase: phase, round: t.round, running: false, remainingMs: phaseMs(phase, settings), endsAt: 0 };
    }
    const round = t.phase === 'long' ? 1 : t.round + 1;
    return { phase: 'work', round: round, running: false, remainingMs: phaseMs('work', settings), endsAt: 0 };
  }

  /**
   * Advance the clock. Returns { timer, completed }. When a phase finishes,
   * `completed` is that phase's name and the timer has moved to the next one.
   */
  function tickTimer(t, now, settings) {
    if (!t.running) return { timer: t, completed: null };
    const remaining = t.endsAt - now;
    if (remaining > 0) return { timer: Object.assign({}, t, { remainingMs: remaining }), completed: null };
    return { timer: nextPhase(t, settings), completed: t.phase };
  }

  const skipPhase = (t, settings) => nextPhase(t, settings);
  const resetTimer = (t, settings) => Object.assign({}, t, { running: false, remainingMs: phaseMs(t.phase, settings), endsAt: 0 });

  /** 90500 -> "01:31" (rounds up so it never shows 00:00 while time remains). */
  function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  /** Log a finished focus session and keep only the last 90 days. */
  function recordSession(state, dateIso, minutes) {
    const cutoff = Date.parse(dateIso + 'T00:00:00Z') - 90 * DAY;
    const sessions = state.sessions
      .concat([{ date: dateIso, minutes: minutes }])
      .filter((s) => Date.parse(s.date + 'T00:00:00Z') >= cutoff);
    return Object.assign({}, state, { sessions: sessions });
  }

  function focusStats(state, todayIso) {
    const sum = (list) => list.reduce((a, s) => a + s.minutes, 0);
    const today = state.sessions.filter((s) => s.date === todayIso);
    const weekStart = Date.parse(todayIso + 'T00:00:00Z') - 6 * DAY;
    const week = state.sessions.filter((s) => Date.parse(s.date + 'T00:00:00Z') >= weekStart);
    return { todaySessions: today.length, todayMinutes: sum(today), weekSessions: week.length, weekMinutes: sum(week) };
  }

  // ------------------------------------------------------ Backup / import

  /** Safe copy of the whole state for saving to a file. */
  function exportState(state) {
    return JSON.stringify(state, null, 2);
  }

  /**
   * Validate and clean data from a backup file or from storage. Unknown or
   * malformed pieces are dropped (never trusted) and ids are re-issued.
   */
  function importState(text) {
    let raw;
    try {
      raw = typeof text === 'string' ? JSON.parse(text) : text;
    } catch (e) {
      throw new Error('That file is not valid JSON.');
    }
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') throw new Error('This is not a Focus Desk backup file.');
    if (raw.version > VERSION) throw new Error('This backup was made by a newer version of Focus Desk.');

    let state = emptyState();
    (Array.isArray(raw.tasks) ? raw.tasks : []).forEach(function (t) {
      if (!t || typeof t !== 'object' || !str(t.title, 200).trim()) return;
      state = addTask(state, t);
      state.tasks[state.tasks.length - 1].created = Number(t.created) || 0;
    });
    (Array.isArray(raw.notes) ? raw.notes.slice().reverse() : []).forEach(function (n) {
      if (!n || typeof n !== 'object') return;
      state = addNote(state, { title: n.title, body: n.body, updated: Number(n.updated) || 0 });
    });
    const s = raw.settings || {};
    state.settings = {
      work: clampInt(s.work, 1, 120, DEFAULT_SETTINGS.work),
      short: clampInt(s.short, 1, 60, DEFAULT_SETTINGS.short),
      long: clampInt(s.long, 1, 120, DEFAULT_SETTINGS.long),
      rounds: clampInt(s.rounds, 2, 12, DEFAULT_SETTINGS.rounds),
    };
    state.sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
      .filter((x) => x && ISO_DATE.test(x.date || '') && Number.isFinite(Number(x.minutes)) && Number(x.minutes) > 0)
      .map((x) => ({ date: x.date, minutes: Math.min(600, Math.round(Number(x.minutes))) }));
    return state;
  }

  return {
    VERSION: VERSION,
    STATUSES: STATUSES,
    PRIORITIES: PRIORITIES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    emptyState: emptyState,
    addTask: addTask,
    updateTask: updateTask,
    deleteTask: deleteTask,
    shiftStatus: shiftStatus,
    sortTasks: sortTasks,
    filterTasks: filterTasks,
    dueLabel: dueLabel,
    addNote: addNote,
    updateNote: updateNote,
    deleteNote: deleteNote,
    newTimer: newTimer,
    startTimer: startTimer,
    pauseTimer: pauseTimer,
    tickTimer: tickTimer,
    skipPhase: skipPhase,
    resetTimer: resetTimer,
    formatClock: formatClock,
    recordSession: recordSession,
    focusStats: focusStats,
    exportState: exportState,
    importState: importState,
  };
});
