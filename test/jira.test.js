const { test } = require('node:test');
const assert = require('node:assert'); // loose mode: values come from another vm context
const { load } = require('./load');

const { DEFAULTS, pickFieldIds, parseIssues, parseFutureIssues, mergeSprintOrder, collectPages, assertOk, fetchTicketsWith, checkSettings } = load();

test('pickFieldIds finds sprint and both points fields', () => {
  const ids = pickFieldIds([
    { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
    { id: 'customfield_10016', name: 'Story point estimate' },
    { id: 'customfield_10028', name: 'Story Points' }, { id: 'summary', name: 'Summary' },
  ]);
  assert.equal(ids.sprint, 'customfield_10020');
  assert.deepEqual(ids.points, ['customfield_10028', 'customfield_10016']);
});

test('pickFieldIds copes with a site that has neither field', () => {
  const ids = pickFieldIds([{ id: 'summary', name: 'Summary' }]);
  assert.equal(ids.sprint, null);
  assert.deepEqual(ids.points, []);
});

const ids = { sprint: 'customfield_10020', points: ['customfield_10028', 'customfield_10016'] };
const issue = (key, f) => ({
  key, fields: {
    summary: 'S ' + key,
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    timeoriginalestimate: null, ...f
  }
});

test('parseIssues maps fields, takes the first filled points field and the active sprint end', () => {
  const out = parseIssues([
    issue('A', {
      customfield_10028: null, customfield_10016: 2,
      customfield_10020: [{ state: 'closed', endDate: '2026-10-30T05:00:00.000Z' },
        { state: 'active', endDate: '2026-11-14T05:00:00.000Z' }]
    }),
    issue('B', { timeoriginalestimate: 3600 }),
  ], ids, null);
  assert.equal(out.sprintEnd, '2026-11-14');
  assert.deepEqual(out.tickets[0], {
    key: 'A', summary: 'S A', status: 'In Progress',
    category: 'indeterminate', points: 2, estimateSeconds: null
  });
  assert.equal(out.tickets[1].points, null);
  assert.equal(out.tickets[1].estimateSeconds, 3600);
});

test('parseIssues: a points override wins, and no active sprint gives a null end', () => {
  const out = parseIssues([issue('A', { customfield_10028: 5, customfield_99: 8 })], ids, 'customfield_99');
  assert.equal(out.tickets[0].points, 8);
  assert.equal(out.sprintEnd, null);
});

test('parseIssues: missing summary or status does not crash', () => {
  const out = parseIssues([{ key: 'A', fields: {} }], ids, null);
  assert.equal(out.tickets[0].summary, '');
  assert.equal(out.tickets[0].category, 'new');
});

test('collectPages follows nextPageToken', () => {
  const pages = { undefined: { issues: [1, 2], nextPageToken: 'p2' }, p2: { issues: [3] } };
  assert.deepEqual(collectPages(tok => pages[tok]), [1, 2, 3]);
});

test('assertOk names the setting to check', () => {
  assert.throws(() => assertOk(401, '', 'Jira search'), /JIRA_EMAIL.*JIRA_TOKEN/);
  assert.throws(() => assertOk(403, '', 'Jira search'), /JIRA_EMAIL.*JIRA_TOKEN/);
  assert.throws(() => assertOk(404, '', 'Jira search'), /JIRA_SITE/);
  assert.throws(() => assertOk(500, 'boom', 'Jira search'), /500/);
  assert.doesNotThrow(() => assertOk(200, '', 'Jira search'));
});

test('parseIssues: the sprint end is converted to the local date when a converter is given', () => {
  const out = parseIssues(
    [issue('A', { customfield_10020: [{ state: 'active', endDate: '2026-11-19T22:00:00.000Z' }] })],
    ids, null, iso => (iso === '2026-11-19T22:00:00.000Z' ? '2026-11-20' : 'wrong'));
  assert.equal(out.sprintEnd, '2026-11-20');
});

// A fake Jira. `routes` maps a path fragment to a response, or to a function of the path.
const FIELDS = [
  { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
  { id: 'customfield_10028', name: 'Story Points' },
];
function fakeJira(routes) {
  const calls = [];
  const get = (path, what, allowCodes) => {
    const decoded = decodeURIComponent(path);
    calls.push(decoded);
    for (const [fragment, reply] of routes) {
      if (decoded.includes(fragment)) {
        const value = typeof reply === 'function' ? reply(decoded, allowCodes || []) : reply;
        if (value instanceof Error) throw value;
        return value;
      }
    }
    if (decoded.includes('futureSprints')) return { issues: [] };
    if (decoded.includes('/rest/agile/')) return null; // as if the board could not be read
    throw new Error('unexpected call: ' + decoded);
  };
  return { get, calls };
}
const settings = { ...DEFAULTS, site: 'https://x.atlassian.net', pointsField: null };
const sprintIssue = issue('A', {
  customfield_10028: 3,
  customfield_10020: [{ state: 'active', endDate: '2026-11-20T05:00:00.000Z' }]
});

test('fetchTicketsWith: checks the sign-in first, so a bad token stops everything', () => {
  const jira = fakeJira([['/myself', new Error('Check JIRA_EMAIL and JIRA_TOKEN')]]);
  assert.throws(() => fetchTicketsWith(jira.get, settings), /JIRA_TOKEN/);
  assert.equal(jira.calls.length, 1);
});

test('fetchTicketsWith: returns the open sprint tickets', () => {
  const jira = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['statusCategory != Done', { issues: [sprintIssue] }],
  ]);
  const out = fetchTicketsWith(jira.get, settings);
  assert.equal(out.tickets.length, 1);
  assert.equal(out.tickets[0].points, 3);
  assert.equal(out.sprintEnd, '2026-11-20');
});

test('fetchTicketsWith: an open sprint with everything done gives no tickets, not the backlog', () => {
  const jira = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['sprint in openSprints() AND statusCategory != Done', { issues: [] }],
    ['sprint in openSprints()', { issues: [sprintIssue] }],
  ]);
  const out = fetchTicketsWith(jira.get, settings);
  assert.deepEqual(out.tickets, []);
  assert.ok(!jira.calls.some(c => c.includes('assignee = currentUser() AND statusCategory != Done')));
});

test('fetchTicketsWith: no open sprint falls back to the first 20 open tickets', () => {
  const many = Array.from({ length: 30 }, (_, i) => issue('K' + i, {}));
  const jira = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['sprint in openSprints()', { issues: [] }],
    ['assignee = currentUser() AND statusCategory != Done', { issues: many, nextPageToken: 'more' }],
  ]);
  const out = fetchTicketsWith(jira.get, settings);
  assert.equal(out.tickets.length, 20);
  assert.equal(out.sprintEnd, null);
});

test('fetchTicketsWith: a site that rejects the sprint query still falls back, but a failed fallback throws', () => {
  const ok = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['sprint in openSprints()', (path, allow) => (allow.includes(400) ? null : new Error('400'))],
    ['assignee = currentUser() AND statusCategory != Done', { issues: [issue('K1', {})] }],
  ]);
  assert.equal(fetchTicketsWith(ok.get, settings).tickets.length, 1);

  const bad = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['sprint in openSprints()', { issues: [] }],
    ['assignee = currentUser() AND statusCategory != Done',
      (path, allow) => (allow.includes(400) ? null : new Error('Jira search failed (400)'))],
  ]);
  assert.throws(() => fetchTicketsWith(bad.get, settings), /400/);
});

test('checkSettings rejects working days and run hours that are not numbers in range', () => {
  assert.doesNotThrow(() => checkSettings({ workingDays: [1, 2, 3, 4, 5], runHour: 7 }));
  assert.throws(() => checkSettings({ workingDays: [NaN, NaN], runHour: 7 }), /WORKING_DAYS/);
  assert.throws(() => checkSettings({ workingDays: [1, 7], runHour: 7 }), /WORKING_DAYS/);
  assert.throws(() => checkSettings({ workingDays: [], runHour: 7 }), /WORKING_DAYS/);
  assert.throws(() => checkSettings({ workingDays: [1], runHour: NaN }), /RUN_HOUR/);
  assert.throws(() => checkSettings({ workingDays: [1], runHour: 24 }), /RUN_HOUR/);
});

const future = (id, name, extra) => ({ id, name, state: 'future', ...extra });

test('parseFutureIssues groups tickets by future sprint, in sprint order, keeping any planned dates', () => {
  const groups = parseFutureIssues([
    issue('C', { customfield_10020: [future(527, 'Sprint 74')] }),
    issue('A', { customfield_10028: 2, customfield_10020: [{ id: 400, state: 'closed' }, future(526, 'Sprint 73')] }),
    issue('B', { customfield_10020: [future(526, 'Sprint 73')] }),
    issue('D', { customfield_10020: [future(530, 'Sprint 75',
      { startDate: '2026-12-14T07:00:00.000Z', endDate: '2026-12-25T07:00:00.000Z' })] }),
  ], ids, null);
  assert.deepEqual(groups.map(g => g.name), ['Sprint 73', 'Sprint 74', 'Sprint 75']);
  assert.deepEqual(groups[0].tickets.map(x => x.key), ['A', 'B']);
  assert.equal(groups[0].tickets[0].points, 2);
  assert.equal(groups[0].startDate, null);
  assert.equal(groups[2].startDate, '2026-12-14');
  assert.equal(groups[2].endDate, '2026-12-25');
});

test('fetchTicketsWith: returns the active sprint dates and the future sprints', () => {
  const active = issue('A', { customfield_10020: [
    { state: 'active', startDate: '2026-11-02T07:41:00.000Z', endDate: '2026-11-14T05:00:00.000Z' }] });
  const jira = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['futureSprints', { issues: [issue('F', { customfield_10020: [future(527, 'Sprint 74')] })] }],
    ['statusCategory != Done', { issues: [active] }],
  ]);
  const out = fetchTicketsWith(jira.get, settings);
  assert.equal(out.sprintStart, '2026-11-02');
  assert.equal(out.sprintEnd, '2026-11-14');
  assert.equal(out.future.length, 1);
  assert.equal(out.future[0].tickets[0].key, 'F');
});

test('fetchTicketsWith: no open sprint but future sprint tickets means no backlog fallback', () => {
  const jira = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['futureSprints', { issues: [issue('F', { customfield_10020: [future(527, 'Sprint 74')] })] }],
    ['sprint in openSprints()', { issues: [] }],
  ]);
  const out = fetchTicketsWith(jira.get, settings);
  assert.deepEqual(out.tickets, []);
  assert.equal(out.future.length, 1);
});

test('mergeSprintOrder: empty sprints on the board keep their place, so later sprints land in the right weeks', () => {
  const mine = [{ id: 527, name: 'Sprint 74', boardId: 15, startDate: null, endDate: null, tickets: [{ key: 'T' }] }];
  const merged = mergeSprintOrder(mine, [
    { id: 526, name: 'Sprint 73', state: 'future' },
    { id: 527, name: 'Sprint 74', state: 'future' },
    { id: 528, name: 'Sprint 75', state: 'future', startDate: '2026-12-14T07:00:00.000Z', endDate: '2026-12-25T07:00:00.000Z' },
  ]);
  assert.deepEqual(merged.map(g => [g.name, g.tickets.length]), [['Sprint 73', 0], ['Sprint 74', 1], ['Sprint 75', 0]]);
  assert.equal(merged[2].startDate, '2026-12-14');
});

test('mergeSprintOrder: without a board list the sprints are left as they were', () => {
  const mine = [{ id: 527, name: 'Sprint 74', boardId: 15, startDate: null, endDate: null, tickets: [] }];
  assert.deepEqual(mergeSprintOrder(mine, null), mine);
});

test('fetchTicketsWith: reads the board so a future sprint with none of your tickets still counts', () => {
  const jira = fakeJira([
    ['/myself', {}], ['/field', FIELDS],
    ['/rest/agile/1.0/board/15/sprint', { values: [
      { id: 526, name: 'Sprint 73', state: 'future' }, { id: 527, name: 'Sprint 74', state: 'future' }] }],
    ['futureSprints', { issues: [issue('F', { customfield_10020: [future(527, 'Sprint 74', { boardId: 15 })] })] }],
    ['sprint in openSprints()', { issues: [] }],
  ]);
  const out = fetchTicketsWith(jira.get, settings);
  assert.deepEqual(out.future.map(g => g.name), ['Sprint 73', 'Sprint 74']);
});
