const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { planSource } = require('../scripts/sync-plan.js');

// Load the extension's background code the way the browser does: plan.js, lib.js, sync.js.
const ctx = { console };
for (const f of ['plan.js', 'lib.js', 'sync.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8'), ctx, { filename: f });
}
const { JSC, diffPlan, allDayEventBody, timedEventBody, planFingerprint, withoutTickets, localDate } = ctx;

test('extension/plan.js is an exact copy of the planning code in Code.gs', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'extension', 'plan.js'), 'utf8'), planSource(),
    'run `npm run sync`');
});

test('gmtOffset reads the time zone label Google Calendar shows beside the grid', () => {
  assert.equal(JSC.gmtOffset('GMT+3'), '+03:00');
  assert.equal(JSC.gmtOffset('GMT+03'), '+03:00');
  assert.equal(JSC.gmtOffset('GMT-5'), '-05:00');
  assert.equal(JSC.gmtOffset('GMT+5:30'), '+05:30');
  assert.equal(JSC.gmtOffset('GMT+05:30'), '+05:30');
  assert.equal(JSC.gmtOffset('GMT'), '+00:00');
  assert.equal(JSC.gmtOffset('Istanbul'), null);
  assert.equal(JSC.gmtOffset(''), null);
});

const item = (key, start, end, extra) => ({
  key, title: key + ' title', description: 'In Progress · https://x.atlassian.net/browse/' + key,
  url: 'https://x.atlassian.net/browse/' + key, startDate: start, endDate: end, group: 1, future: false, ...extra
});
const existing = (id, key, start, end, extra) => ({
  id, key, start, end, summary: key + ' title', colorId: '10', ...extra
});

test('diffPlan keeps bars that are already right, adds missing ones and removes stale ones', () => {
  const d = diffPlan(
    [existing('e1', 'A', '2026-11-16', '2026-11-18'), existing('e2', 'B', '2026-11-18', '2026-11-19')],
    [item('A', '2026-11-16', '2026-11-18'), item('C', '2026-11-18', '2026-11-20')],
    '2026-11-16');
  assert.deepEqual(d.keep.map(e => e.id), ['e1']);
  assert.deepEqual(d.remove.map(e => e.id), ['e2']);
  assert.deepEqual(d.create.map(i => i.key), ['C']);
  assert.deepEqual(d.trim, []);
});

test('diffPlan: a bar whose dates, title or colour changed is replaced', () => {
  const d = diffPlan(
    [existing('e1', 'A', '2026-11-16', '2026-11-18'), existing('e2', 'B', '2026-11-16', '2026-11-17', { summary: 'old' }),
      existing('e3', 'C', '2026-11-16', '2026-11-17', { colorId: '2' })],
    [item('A', '2026-11-16', '2026-11-19'), item('B', '2026-11-16', '2026-11-17'), item('C', '2026-11-16', '2026-11-17')],
    '2026-11-16');
  assert.deepEqual(d.remove.map(e => e.id), ['e1', 'e2', 'e3']);
  assert.deepEqual(d.create.map(i => i.key), ['A', 'B', 'C']);
});

test('diffPlan: a bar that began before today is cut to end yesterday, and one already over is left alone', () => {
  const d = diffPlan(
    [existing('e1', 'A', '2026-11-12', '2026-11-18'), existing('e2', 'B', '2026-11-10', '2026-11-13')],
    [item('A', '2026-11-16', '2026-11-18')],
    '2026-11-16');
  assert.deepEqual(d.trim, [{ id: 'e1', end: '2026-11-16' }]);
  assert.deepEqual(d.remove, []);
  assert.deepEqual(d.create.map(i => i.key), ['A']);
});

test('diffPlan: an empty plan removes every future bar', () => {
  const d = diffPlan([existing('e1', 'A', '2026-11-16', '2026-11-18')], [], '2026-11-16');
  assert.deepEqual(d.remove.map(e => e.id), ['e1']);
  assert.deepEqual(d.create, []);
});

test('allDayEventBody: free, no reminders, tagged as an automatic bar, coloured by kind', () => {
  const b = allDayEventBody(item('A', '2026-11-16', '2026-11-18'));
  assert.equal(b.summary, 'A title');
  assert.deepEqual(b.start, { date: '2026-11-16' });
  assert.deepEqual(b.end, { date: '2026-11-18' });
  assert.equal(b.transparency, 'transparent');
  assert.equal(b.reminders.useDefault, false);
  assert.equal(b.extendedProperties.private.jsc, '1');
  assert.equal(b.extendedProperties.private.jscKey, 'A');
  assert.equal(b.colorId, '10');
  assert.equal(allDayEventBody(item('A', 'x', 'y', { group: 2 })).colorId, '2');
  assert.equal(allDayEventBody(item('A', 'x', 'y', { future: true })).colorId, '8');
});

test('timedEventBody: a one-hour event at the dropped time in the calendar time zone, tagged as placed by hand', () => {
  const b = timedEventBody({ key: 'APP-1', summary: 'Login', url: 'https://x.atlassian.net/browse/APP-1' },
    '2026-11-16', 600, '+03:00');
  assert.equal(b.summary, 'APP-1 Login');
  assert.equal(b.description, 'https://x.atlassian.net/browse/APP-1');
  assert.deepEqual(b.start, { dateTime: '2026-11-16T10:00:00+03:00' });
  assert.deepEqual(b.end, { dateTime: '2026-11-16T11:00:00+03:00' });
  assert.equal(b.extendedProperties.private.jscManual, '1');
  assert.equal(b.extendedProperties.private.jscKey, 'APP-1');
});

test('timedEventBody: an event late in the evening ends the next day; no time means all day', () => {
  const late = timedEventBody({ key: 'A', summary: 's', url: 'u' }, '2026-12-31', 1410, '-05:00');
  assert.deepEqual(late.end, { dateTime: '2027-01-01T00:30:00-05:00' });
  const allDay = timedEventBody({ key: 'A', summary: 's', url: 'u' }, '2026-11-30', null, null);
  assert.deepEqual(allDay.start, { date: '2026-11-30' });
  assert.deepEqual(allDay.end, { date: '2026-12-01' });
});

test('withoutTickets drops tickets the person has placed by hand, in the sprint and in future sprints', () => {
  const jira = { tickets: [{ key: 'A' }, { key: 'B' }], sprintStart: 's', sprintEnd: 'e',
    future: [{ id: 1, name: 'N', tickets: [{ key: 'C' }, { key: 'D' }] }] };
  const out = withoutTickets(jira, ['B', 'C']);
  assert.deepEqual(out.tickets.map(t => t.key), ['A']);
  assert.deepEqual(out.future[0].tickets.map(t => t.key), ['D']);
  assert.equal(out.sprintEnd, 'e');
  assert.equal(jira.tickets.length, 2); // the input is not changed
});

test('planFingerprint changes when a ticket moves, and not when nothing did', () => {
  const jira = () => ({ tickets: [{ key: 'A', status: 'To Do', points: 1 }], sprintEnd: '2026-11-20', future: [] });
  const a = planFingerprint(jira(), [], '2026-11-16');
  assert.equal(planFingerprint(jira(), [], '2026-11-16'), a);
  const moved = jira(); moved.tickets[0].status = 'In Progress';
  assert.notEqual(planFingerprint(moved, [], '2026-11-16'), a);
  assert.notEqual(planFingerprint(jira(), [], '2026-11-17'), a);   // a new day
  assert.notEqual(planFingerprint(jira(), ['A'], '2026-11-16'), a); // placed by hand since
});

test('localDate gives the calendar date in local time', () => {
  assert.equal(localDate(new Date(2026, 10, 16, 23, 59)), '2026-11-16');
  assert.equal(localDate(new Date(2027, 0, 3, 0, 1)), '2027-01-03');
});
