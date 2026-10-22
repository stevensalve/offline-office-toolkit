'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../js/core.js');

test('addTask validates, sets defaults and never mutates', () => {
  const s0 = d.emptyState();
  const s1 = d.addTask(s0, { title: '  Write report  ', due: '2026-11-01', priority: 'high' });
  assert.equal(s0.tasks.length, 0);
  assert.equal(s1.tasks.length, 1);
  assert.deepEqual(s1.tasks[0], {
    id: 't1',
    title: 'Write report',
    status: 'todo',
    priority: 'high',
    due: '2026-11-01',
    notes: '',
    created: 0,
  });
  assert.equal(s1.nextId, 2);
  assert.throws(() => d.addTask(s0, { title: '   ' }), /what needs to be done/);
  const odd = d.addTask(s0, { title: 'x', priority: 'urgent!', due: 'tomorrow', status: 'weird' }).tasks[0];
  assert.deepEqual([odd.priority, odd.due, odd.status], ['medium', '', 'todo']);
});

test('updateTask / deleteTask / shiftStatus', () => {
  let s = d.addTask(d.emptyState(), { title: 'A' });
  s = d.updateTask(s, 't1', { title: 'B', priority: 'low', due: '2026-12-01', status: 'doing' });
  assert.deepEqual([s.tasks[0].title, s.tasks[0].priority, s.tasks[0].due, s.tasks[0].status], ['B', 'low', '2026-12-01', 'doing']);
  assert.throws(() => d.updateTask(s, 't1', { title: ' ' }), /needs a title/);
  assert.throws(() => d.updateTask(s, 'nope', {}), /no longer exists/);
  assert.equal(d.shiftStatus(s, 't1', 1).tasks[0].status, 'done');
  assert.equal(d.shiftStatus(s, 't1', -1).tasks[0].status, 'todo');
  assert.equal(d.shiftStatus(d.shiftStatus(s, 't1', 1), 't1', 1).tasks[0].status, 'done', 'stays at the last column');
  assert.equal(d.deleteTask(s, 't1').tasks.length, 0);
});

test('sortTasks and filterTasks', () => {
  let s = d.emptyState();
  s = d.addTask(s, { title: 'no date', priority: 'low' });
  s = d.addTask(s, { title: 'late', due: '2026-12-01', priority: 'high' });
  s = d.addTask(s, { title: 'soon', due: '2026-11-01', priority: 'medium', status: 'done' });
  assert.deepEqual(
    d.sortTasks(s.tasks, 'due').map((t) => t.title),
    ['soon', 'late', 'no date'],
  );
  assert.deepEqual(
    d.sortTasks(s.tasks, 'priority').map((t) => t.title),
    ['late', 'soon', 'no date'],
  );
  assert.deepEqual(
    d.sortTasks(s.tasks, 'created').map((t) => t.title),
    ['no date', 'late', 'soon'],
  );
  assert.deepEqual(
    d.filterTasks(s.tasks, 'open').map((t) => t.title),
    ['no date', 'late'],
  );
  assert.deepEqual(
    d.filterTasks(s.tasks, 'done').map((t) => t.title),
    ['soon'],
  );
  assert.equal(d.filterTasks(s.tasks, 'all').length, 3);
});

test('dueLabel', () => {
  assert.deepEqual(d.dueLabel('2026-10-20', '2026-10-22'), { text: 'Overdue by 2 days', overdue: true });
  assert.deepEqual(d.dueLabel('2026-10-21', '2026-10-22'), { text: 'Overdue by 1 day', overdue: true });
  assert.equal(d.dueLabel('2026-10-22', '2026-10-22').text, 'Due today');
  assert.equal(d.dueLabel('2026-10-23', '2026-10-22').text, 'Due tomorrow');
  assert.equal(d.dueLabel('2026-10-30', '2026-10-22').text, 'Due in 8 days');
  assert.deepEqual(d.dueLabel('', '2026-10-22'), { text: '', overdue: false });
});

test('notes: newest first, defaults, update, delete', () => {
  let s = d.addNote(d.emptyState(), { title: '', body: 'one' });
  s = d.addNote(s, { title: 'Two', body: 'b' });
  assert.deepEqual(
    s.notes.map((n) => n.title),
    ['Two', 'Untitled'],
  );
  s = d.updateNote(s, 'n1', { body: 'changed' });
  assert.equal(s.notes.find((n) => n.id === 'n1').body, 'changed');
  assert.equal(d.deleteNote(s, 'n1').notes.length, 1);
});

const S = d.DEFAULT_SETTINGS;

test('timer: start, pause and tick keep accurate time', () => {
  let t = d.newTimer(S);
  assert.equal(t.remainingMs, 25 * 60000);
  t = d.startTimer(t, 1000);
  const r = d.tickTimer(t, 1000 + 60000, S);
  assert.equal(r.completed, null);
  assert.equal(r.timer.remainingMs, 24 * 60000);
  const paused = d.pauseTimer(r.timer, 1000 + 60000);
  assert.equal(paused.running, false);
  assert.equal(paused.remainingMs, 24 * 60000);
  assert.equal(d.tickTimer(paused, 9e9, S).completed, null, 'paused timers never complete');
});

test('timer: phases cycle work -> short ... -> long -> work', () => {
  let t = d.newTimer(S);
  const seen = [];
  for (let i = 0; i < 8; i++) {
    t = d.startTimer(t, 0);
    const r = d.tickTimer(t, 1e9, S); // far in the future: phase is over
    seen.push(r.completed);
    t = r.timer;
    assert.equal(t.running, false, 'waits for the user to start the next phase');
  }
  assert.deepEqual(seen, ['work', 'short', 'work', 'short', 'work', 'short', 'work', 'long']);
  assert.equal(t.phase, 'work');
  assert.equal(t.round, 1);
});

test('timer: late ticks (background tab) still complete exactly once', () => {
  let t = d.startTimer(d.newTimer(S), 0);
  const r = d.tickTimer(t, 99 * 60000, S);
  assert.equal(r.completed, 'work');
  assert.equal(r.timer.phase, 'short');
  assert.equal(d.tickTimer(r.timer, 100 * 60000, S).completed, null);
});

test('skipPhase / resetTimer / formatClock', () => {
  const t = d.newTimer(S);
  assert.equal(d.skipPhase(t, S).phase, 'short');
  const running = d.startTimer(t, 0);
  const reset = d.resetTimer(d.tickTimer(running, 60000, S).timer, S);
  assert.deepEqual([reset.running, reset.remainingMs], [false, 25 * 60000]);
  assert.equal(d.formatClock(90500), '01:31');
  assert.equal(d.formatClock(0), '00:00');
  assert.equal(d.formatClock(1), '00:01');
  assert.equal(d.formatClock(-5), '00:00');
});

test('sessions: stats for today and the last 7 days; old ones pruned', () => {
  let s = d.emptyState();
  s = d.recordSession(s, '2026-10-22', 25);
  s = d.recordSession(s, '2026-10-22', 25);
  s = d.recordSession(s, '2026-10-17', 25); // within 7 days
  s = d.recordSession(s, '2026-10-10', 25); // older than a week
  assert.deepEqual(d.focusStats(s, '2026-10-22'), { todaySessions: 2, todayMinutes: 50, weekSessions: 3, weekMinutes: 75 });
  s = d.recordSession(s, '2027-03-01', 25);
  assert.ok(!s.sessions.some((x) => x.date === '2026-10-10'), 'sessions older than 90 days are dropped');
});

test('export then import round-trips', () => {
  let s = d.addTask(d.emptyState(), { title: 'A', priority: 'high', due: '2026-11-01', status: 'doing', created: 5 });
  s = d.addNote(s, { title: 'N', body: 'text', updated: 9 });
  s = d.recordSession(s, '2026-10-22', 25);
  const back = d.importState(d.exportState(s));
  assert.equal(back.tasks[0].title, 'A');
  assert.equal(back.tasks[0].created, 5);
  assert.equal(back.tasks[0].status, 'doing');
  assert.equal(back.notes[0].body, 'text');
  assert.equal(back.sessions.length, 1);
});

test('importState rejects bad files and cleans hostile data', () => {
  assert.throws(() => d.importState('not json'), /not valid JSON/);
  assert.throws(() => d.importState('{"hello":1}'), /not a Focus Desk/);
  assert.throws(() => d.importState('{"version":99}'), /newer version/);
  const cleaned = d.importState({
    version: 1,
    tasks: [{ title: '<img src=x onerror=alert(1)>', priority: 'nope', id: '__proto__' }, { title: '' }, null, 'junk'],
    notes: [{ title: 5, body: { a: 1 } }],
    settings: { work: 9999, short: -3, rounds: 'x' },
    sessions: [
      { date: 'bad', minutes: 5 },
      { date: '2026-10-22', minutes: 25 },
      { date: '2026-10-22', minutes: -1 },
    ],
  });
  assert.equal(cleaned.tasks.length, 1);
  assert.equal(cleaned.tasks[0].title, '<img src=x onerror=alert(1)>', 'text is kept as plain text (the UI never uses innerHTML)');
  assert.equal(cleaned.tasks[0].priority, 'medium');
  assert.equal(cleaned.tasks[0].id, 't1', 'ids are re-issued, never trusted');
  assert.deepEqual(cleaned.settings, { work: 120, short: 1, long: 15, rounds: 4 });
  assert.equal(cleaned.sessions.length, 1);
  assert.equal(cleaned.notes.length, 1);
});
