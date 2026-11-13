const { test } = require('node:test');
const assert = require('node:assert'); // loose mode: values come from another vm context
const { load } = require('./load');

const { DEFAULTS, orderTickets, weighTickets, workingDays, spreadTickets, buildPlan } = load();

const t = (key, status, category, points = null, estimateSeconds = null) =>
  ({ key, summary: key, status, category, points, estimateSeconds });

test('orderTickets: active status first, other in-progress next, to-do last, rank kept', () => {
  const out = orderTickets([
    t('A', 'Ready to QA', 'indeterminate'), t('B', 'Backlog', 'new'),
    t('C', 'In Progress', 'indeterminate'), t('D', 'in progress', 'indeterminate'),
  ], DEFAULTS);
  assert.deepEqual(out.map(x => x.key), ['C', 'D', 'A', 'B']);
  assert.deepEqual(out.map(x => x.group), [1, 1, 2, 3]);
});

test('orderTickets: skipStatuses are dropped', () => {
  const out = orderTickets(
    [t('A', 'Ready to QA', 'indeterminate'), t('C', 'In Progress', 'indeterminate')],
    { ...DEFAULTS, skipStatuses: ['ready to qa'] });
  assert.deepEqual(out.map(x => x.key), ['C']);
});

test('weighTickets: points win, unpointed get the average', () => {
  const w = weighTickets([t('A', 's', 'new', 3), t('B', 's', 'new', null, 7200), t('C', 's', 'new', 1)]);
  assert.deepEqual(w.map(x => x.weight), [3, 2, 1]);
});

test('weighTickets: estimates used only when no ticket has points', () => {
  const w = weighTickets([t('A', 's', 'new', null, 3600), t('B', 's', 'new'), t('C', 's', 'new', null, 7200)]);
  assert.deepEqual(w.map(x => x.weight), [3600, 5400, 7200]);
});

test('weighTickets: no effort anywhere, or all zero, means equal weights', () => {
  assert.deepEqual(weighTickets([t('A', 's', 'new'), t('B', 's', 'new')]).map(x => x.weight), [1, 1]);
  assert.deepEqual(weighTickets([t('A', 's', 'new', 0), t('B', 's', 'new', 0)]).map(x => x.weight), [1, 1]);
});

test('workingDays: skips weekends and skip dates, inclusive end', () => {
  assert.deepEqual(workingDays('2026-11-13', '2026-11-18', DEFAULTS, ['2026-11-17']),
    ['2026-11-13', '2026-11-16', '2026-11-18']);
});

test('spreadTickets: worked example from the design', () => {
  const w = [3, 1.5, 1.5, 2, 1, 0.5, 1, 1, 2].map((weight, i) => ({ key: 'T' + i, weight }));
  const s = spreadTickets(w, 5);
  assert.deepEqual(s.map(x => [x.start, x.end]),
    [[0, 1], [1, 2], [2, 3], [2, 3], [3, 4], [3, 4], [4, 5], [4, 5], [4, 5]]);
});

test('spreadTickets: one big ticket spans all days; more tickets than days all get a day', () => {
  assert.deepEqual(spreadTickets([{ weight: 5 }], 3).map(x => [x.start, x.end]), [[0, 3]]);
  const s = spreadTickets([1, 1, 1, 1, 1, 1].map(weight => ({ weight })), 2);
  assert.ok(s.every(x => x.end - x.start === 1 && x.start >= 0 && x.end <= 2));
});

test('buildPlan: dates, exclusive end across a weekend, title and link', () => {
  const p = buildPlan([t('ZN-1', 'In Progress', 'indeterminate', 3), t('ZN-2', 'Backlog', 'new', 1)],
    '2026-11-13', '2026-11-17', { ...DEFAULTS, site: 'https://x.atlassian.net' }, []);
  // days: Fri 13, Mon 16, Tue 17. ZN-1 share 2.25 days -> [0,2); ZN-2 -> [2,3)
  assert.equal(p[0].startDate, '2026-11-13'); assert.equal(p[0].endDate, '2026-11-17');
  assert.equal(p[1].startDate, '2026-11-17'); assert.equal(p[1].endDate, '2026-11-18');
  assert.equal(p[0].title, 'ZN-1 ZN-1 (3 pt)');
  assert.equal(p[1].title, 'ZN-2 ZN-2 (1 pt)');
  assert.equal(p[0].url, 'https://x.atlassian.net/browse/ZN-1');
  assert.equal(p[0].group, 1);
});

test('buildPlan: a ticket with no points has no points suffix', () => {
  const p = buildPlan([t('A', 'In Progress', 'indeterminate')], '2026-11-16', '2026-11-16',
    { ...DEFAULTS, site: 's' }, []);
  assert.equal(p[0].title, 'A A');
});

test('buildPlan: no tickets gives an empty plan', () => {
  assert.deepEqual(buildPlan([], '2026-11-13', '2026-11-20', { ...DEFAULTS, site: 's' }, []), []);
});

test('buildPlan: no sprint uses the next 10 working days', () => {
  const p = buildPlan([t('A', 'In Progress', 'indeterminate')], '2026-11-13', null, { ...DEFAULTS, site: 's' }, []);
  assert.equal(p[0].startDate, '2026-11-13'); assert.equal(p[0].endDate, '2026-11-27');
});

test('buildPlan: sprint already over or only a weekend left lands on the next working day', () => {
  const p = buildPlan([t('A', 'In Progress', 'indeterminate')], '2026-11-14', '2026-11-14', { ...DEFAULTS, site: 's' }, []);
  assert.equal(p[0].startDate, '2026-11-16'); assert.equal(p[0].endDate, '2026-11-17');
});
