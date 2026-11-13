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
const { JSC, diffPlan, allDayEventBody, timedEventBody, planFingerprint, withoutTickets, localDate, demoResponse,
  pickFieldIds, parseIssues, parseFutureIssues, buildFullPlan, DEFAULTS } = ctx;

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

test('the sample tickets answer like Jira and plan across the sample sprint', () => {
  const now = new Date(2026, 10, 13, 12); // Friday 13 November 2026
  const q = (jql) => demoResponse('/rest/api/3/search/jql?maxResults=100&fields=summary&jql=' + encodeURIComponent(jql), now).data.issues;
  assert.equal(demoResponse('/rest/api/3/myself', now).ok, true);
  const ids = pickFieldIds(demoResponse('/rest/api/3/field', now).data);
  assert.equal(ids.sprint, 'customfield_10020');

  const sprint = q('assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done ORDER BY Rank ASC');
  assert.deepEqual(sprint.map(i => i.key), ['APP-212', 'APP-198', 'APP-205', 'APP-220', 'APP-231', 'APP-240']);
  assert.equal(q('assignee = currentUser() AND sprint in futureSprints() AND statusCategory != Done').length, 2);
  assert.ok(q('assignee = currentUser() AND statusCategory != Done AND (sprint is EMPTY OR sprint not in openSprints())').length >= 2);
  assert.deepEqual(q('summary ~ "export*" AND statusCategory != Done ORDER BY updated DESC').map(i => i.key).sort(), ['APP-198', 'APP-252']);
  assert.deepEqual(q('key = "APP-220"').map(i => i.key), ['APP-220']);

  const toLocal = iso => localDate(new Date(iso));
  const active = parseIssues(sprint, ids, null, toLocal);
  assert.equal(active.sprintStart, '2026-11-09');
  assert.equal(active.sprintEnd, '2026-11-20');
  active.future = parseFutureIssues(q('sprint in futureSprints()'), ids, null, toLocal);
  const plan = buildFullPlan(active, '2026-11-13', { ...DEFAULTS, site: JSC.linkBase('demo') }, []);
  assert.equal(plan.filter(p => !p.future).length, 6);
  assert.equal(plan[0].key, 'APP-212');              // in progress first
  assert.equal(plan[0].startDate, '2026-11-13');
  assert.ok(plan.filter(p => !p.future).every(p => p.endDate <= '2026-11-21'));
  assert.equal(plan.filter(p => p.future).length, 2);
  assert.match(plan[0].url, /^https:\/\/example\.atlassian\.net\/browse\/APP-212$/);
});

test('normalizeSite accepts "demo" for the sample tickets', () => {
  assert.equal(JSC.normalizeSite(' Demo '), 'demo');
  assert.equal(JSC.linkBase('demo'), 'https://example.atlassian.net');
  assert.equal(JSC.linkBase('https://x.atlassian.net'), 'https://x.atlassian.net');
});

test('timedEventBody: the length of a dropped ticket can be chosen', () => {
  const b = timedEventBody({ key: 'A', summary: 's', url: 'u' }, '2026-11-16', 600, '+03:00', 90);
  assert.deepEqual(b.end, { dateTime: '2026-11-16T11:30:00+03:00' });
});

test('gmtOffset accepts the real minus sign some languages use', () => {
  assert.equal(JSC.gmtOffset('GMT−03'), '-03:00');
});

test('planFingerprint changes when a ticket is renamed or a Customise choice changes', () => {
  const jira = { tickets: [{ key: 'A-1', summary: 'Old name', status: 'To Do', points: 1, estimateSeconds: null }],
    sprintStart: null, sprintEnd: null, future: [] };
  const settings = JSC.cleanSettings(null);
  const base = planFingerprint(jira, [], '2026-11-16', settings);
  const renamed = { ...jira, tickets: [{ ...jira.tickets[0], summary: 'New name' }] };
  assert.notEqual(planFingerprint(renamed, [], '2026-11-16', settings), base);
  assert.notEqual(planFingerprint(jira, [], '2026-11-16', { ...settings, workingDays: [1, 2, 3] }), base);
  assert.equal(planFingerprint(jira, [], '2026-11-16', JSC.cleanSettings(null)), base);
});

test('jiraFetch refuses anything that is not a plain Jira Cloud data address', async () => {
  for (const [site, p] of [
    ['https://acme.atlassian.net', '/rest/api/3/../../secure/admin'],
    ['https://acme.atlassian.net', '/secure/Dashboard.jspa'],
    ['https://evil.example.com', '/rest/api/3/myself'],
    ['https://acme.atlassian.net.evil.com', '/rest/api/3/myself'],
    ['http://acme.atlassian.net', '/rest/api/3/myself']]) {
    const res = await ctx.jiraFetch(site, p);
    assert.equal(res.ok, false, site + p);
    assert.equal(res.status, 0);
  }
});

// ---- Heads-up ----------------------------------------------------------------
const { findClashes, headsUpNote, withNote, isTicketBlock, isOpenInvite } = ctx;
const me = (status, extra) => ({ email: 'me@example.com', self: true, responseStatus: status, ...extra });
const block = (id, start, end, extra) => ({ id, summary: 'WEB-7 Fix login', organizer: { self: true },
  start: { dateTime: '2026-11-17T' + start + ':00+03:00' }, end: { dateTime: '2026-11-17T' + end + ':00+03:00' },
  extendedProperties: { private: { jscManual: '1' } }, ...extra });
const invite = (id, start, end, extra) => ({ id, summary: 'Roadmap sync', organizer: { email: 'ana@example.com' },
  attendees: [{ email: 'ana@example.com', responseStatus: 'accepted' }, me('needsAction')],
  start: { dateTime: '2026-11-17T' + start + ':00+03:00' }, end: { dateTime: '2026-11-17T' + end + ':00+03:00' }, ...extra });

test('heads-up: an unanswered invitation that overlaps a ticket is found, once', () => {
  const events = [block('b1', '10:00', '12:00'), invite('i1', '11:00', '11:30'), invite('i2', '12:00', '13:00'), invite('i3', '09:30', '10:01')];
  assert.deepEqual(findClashes(events, {}).map((c) => c.invite.id + '>' + c.ticket.id), ['i1>b1', 'i3>b1']);
  assert.deepEqual(findClashes(events, { i1: 1 }).map((c) => c.invite.id), ['i3'], 'one already handled is left alone');
});

test('heads-up: only real invitations count', () => {
  const b = block('b1', '10:00', '12:00');
  const cases = {
    'already accepted': invite('i', '11:00', '11:30', { attendees: [me('accepted')] }),
    'already declined': invite('i', '11:00', '11:30', { attendees: [me('declined')] }),
    'already has a note': invite('i', '11:00', '11:30', { attendees: [me('needsAction', { comment: 'x' })] }),
    'cancelled': invite('i', '11:00', '11:30', { status: 'cancelled' }),
    'my own meeting': invite('i', '11:00', '11:30', { organizer: { self: true } }),
    'all day': invite('i', '11:00', '11:30', { start: { date: '2026-11-17' }, end: { date: '2026-11-18' } }),
    'I am not a guest': invite('i', '11:00', '11:30', { attendees: [{ email: 'x@example.com', responseStatus: 'needsAction' }] })
  };
  Object.keys(cases).forEach((name) => assert.deepEqual(findClashes([b, cases[name]], {}), [], name));
});

test('heads-up: what counts as a ticket block', () => {
  assert.equal(isTicketBlock(block('b', '10:00', '11:00')), true, 'dropped by the extension');
  assert.equal(isTicketBlock(block('b', '10:00', '11:00', { extendedProperties: undefined })), true, 'placed through Google\'s page: by its title');
  assert.equal(isTicketBlock(block('b', '10:00', '11:00', { extendedProperties: undefined, summary: 'Lunch' })), false);
  assert.equal(isTicketBlock(block('b', '10:00', '11:00', { extendedProperties: undefined, attendees: [{ email: 'x@example.com' }] })), false, 'a meeting named like a ticket');
  assert.equal(isTicketBlock(block('b', '10:00', '11:00', { start: { date: '2026-11-17' } })), false, 'all-day plan bars never clash');
  assert.equal(isTicketBlock(block('b', '10:00', '11:00', { status: 'cancelled' })), false);
  assert.equal(isOpenInvite(block('b', '10:00', '11:00')), false);
});

test('heads-up: the note names the ticket and its time, and only the person\'s own guest entry changes', () => {
  const note = headsUpNote(block('b', '10:00', '11:30'));
  assert.equal(note, 'Heads-up: I have WEB-7 Fix login planned 10:00 to 11:30 then. I can still join if it is needed. (Sent by Slotwise)');
  const before = invite('i', '11:00', '11:30').attendees;
  const after = withNote(before, note);
  assert.deepEqual(JSON.parse(JSON.stringify(after[0])), before[0]);
  assert.equal(after[1].comment, note);
  assert.equal(after[1].responseStatus, 'needsAction', 'the answer is not changed');
  assert.equal(before[1].comment, undefined, 'the original list is not touched');
});
