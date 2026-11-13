const { test } = require('node:test');
const assert = require('node:assert');
const JSC = require('../extension/lib.js');

test('dateFromKey decodes the date Google Calendar puts on each day cell', () => {
  assert.equal(JSC.dateFromKey(29040), '2026-11-16');
  assert.equal(JSC.dateFromKey('29025'), '2026-11-01');
  assert.equal(JSC.dateFromKey(((2027 - 1970) << 9) | (1 << 5) | 3), '2027-01-03');
  assert.equal(JSC.dateFromKey('nonsense'), null);
});

test('minutesFromOffset turns a drop position in a day column into a time, snapped to 30 minutes', () => {
  // A column 1152px tall is 48px an hour.
  assert.equal(JSC.minutesFromOffset(480, 0, 1152), 600);          // 10:00
  assert.equal(JSC.minutesFromOffset(480 + 20, 0, 1152), 600);     // 10:25 snaps down to 10:00
  assert.equal(JSC.minutesFromOffset(480 + 30, 0, 1152), 630);     // 10:37 snaps to 10:30
  assert.equal(JSC.minutesFromOffset(-50, 0, 1152), 0);            // above the column
  assert.equal(JSC.minutesFromOffset(5000, 0, 1152), 1380);        // below: last slot that still fits an hour
  assert.equal(JSC.minutesFromOffset(292, -188, 1153), 600);       // column scrolled up by 188px
});

test('eventEditUrl builds a timed event', () => {
  const url = JSC.eventEditUrl('/calendar/u/0', {
    title: 'APP-12 Login flow', details: 'https://x.atlassian.net/browse/APP-12',
    date: '2026-11-16', startMin: 600, durationMin: 60
  });
  const u = new URL('https://calendar.google.com' + url);
  assert.equal(u.pathname, '/calendar/u/0/r/eventedit');
  assert.equal(u.searchParams.get('text'), 'APP-12 Login flow');
  assert.equal(u.searchParams.get('dates'), '20261116T100000/20261116T110000');
  assert.equal(u.searchParams.get('details'), 'https://x.atlassian.net/browse/APP-12');
});

test('eventEditUrl builds an all-day event ending the next day, across a month end', () => {
  const url = JSC.eventEditUrl('/calendar/u/1', { title: 'T', details: '', date: '2026-11-30', startMin: null });
  const u = new URL('https://calendar.google.com' + url);
  assert.equal(u.pathname, '/calendar/u/1/r/eventedit');
  assert.equal(u.searchParams.get('dates'), '20261130/20261201');
});

test('eventEditUrl: an event that would run past midnight ends at midnight of the next day', () => {
  const url = JSC.eventEditUrl('/calendar/u/0', { title: 'T', details: '', date: '2026-12-31', startMin: 1410, durationMin: 60 });
  assert.equal(new URL('https://calendar.google.com' + url).searchParams.get('dates'), '20261231T233000/20270101T003000');
});

test('accountBase keeps the Google account the calendar is open under', () => {
  assert.equal(JSC.accountBase('/calendar/u/2/r/week/2026/11/16'), '/calendar/u/2');
  assert.equal(JSC.accountBase('/calendar/r/week'), '/calendar/u/0');
});

test('normalizeSite accepts a Jira Cloud address in any common form and rejects anything else', () => {
  assert.equal(JSC.normalizeSite('your-team.atlassian.net'), 'https://your-team.atlassian.net');
  assert.equal(JSC.normalizeSite(' https://Your-Team.atlassian.net/jira/boards/1 '), 'https://your-team.atlassian.net');
  assert.equal(JSC.normalizeSite('https://evil.example.com'), null);
  assert.equal(JSC.normalizeSite('atlassian.net.evil.com'), null);
  assert.equal(JSC.normalizeSite(''), null);
});

test('parseTickets reads Jira search results', () => {
  const out = JSC.parseTickets({ issues: [
    { key: 'APP-1', fields: { summary: 'Login', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } } },
    { key: 'APP-2', fields: {} },
  ] }, 'https://x.atlassian.net');
  assert.deepEqual(out[0], { key: 'APP-1', summary: 'Login', status: 'In Progress',
    category: 'indeterminate', url: 'https://x.atlassian.net/browse/APP-1' });
  assert.equal(out[1].summary, '');
  assert.deepEqual(JSC.parseTickets(null, 'https://x.atlassian.net'), []);
});

test('filterTickets matches key or summary, ignoring case, and keeps everything for an empty search', () => {
  const list = [{ key: 'APP-1', summary: 'Login flow' }, { key: 'APP-22', summary: 'Export bug' }];
  assert.deepEqual(JSC.filterTickets(list, 'login').map(t => t.key), ['APP-1']);
  assert.deepEqual(JSC.filterTickets(list, 'app-2').map(t => t.key), ['APP-22']);
  assert.equal(JSC.filterTickets(list, '  ').length, 2);
});

test('searchJql looks up a ticket key exactly and escapes quotes in free text', () => {
  assert.equal(JSC.searchJql('app-12'), 'key = "APP-12"');
  assert.equal(JSC.searchJql('say "hi"'),
    'summary ~ "say \\"hi\\"*" AND statusCategory != Done ORDER BY updated DESC');
});

test('formatSlot describes where a ticket will land', () => {
  assert.equal(JSC.formatSlot('2026-11-16', 600), 'Mon 16 Nov, 10:00');
  assert.equal(JSC.formatSlot('2026-11-16', null), 'Mon 16 Nov, all day');
});
