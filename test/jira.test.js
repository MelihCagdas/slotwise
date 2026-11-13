const { test } = require('node:test');
const assert = require('node:assert'); // loose mode: values come from another vm context
const { load } = require('./load');

const { pickFieldIds, parseIssues, collectPages, assertOk } = load();

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
