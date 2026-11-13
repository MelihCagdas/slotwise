const { test } = require('node:test');
const assert = require('node:assert'); // loose mode: values come from another vm context
const { load } = require('./load');

const { DEFAULTS, orderTickets, weighTickets } = load();

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
