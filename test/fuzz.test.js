// Randomised checks: thousands of made-up sprints, each tested against rules
// that must always hold. The random numbers are seeded, so a failure repeats.
const { test } = require('node:test');
const assert = require('node:assert');
const { load } = require('./load.js');

const gs = load();

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STATUSES = [
  ['In Progress', 'indeterminate'], ['in progress ', 'indeterminate'], ['Ready to QA', 'indeterminate'],
  ['To Do', 'new'], ['Backlog', 'new'], ['Blocked', 'indeterminate'], ['', 'new']
];
const ODD_POINTS = [null, undefined, 0, -3, NaN, Infinity, '5', 0.5, 1, 2, 3, 5, 8, 13, 100];

function randomCase(r) {
  const pick = (list) => list[Math.floor(r() * list.length)];
  const count = Math.floor(r() * 40);
  const tickets = [];
  for (let i = 0; i < count; i++) {
    const s = pick(STATUSES);
    tickets.push({
      key: 'T-' + i, summary: 'Ticket ' + i, status: s[0], category: s[1],
      points: pick(ODD_POINTS), estimateSeconds: pick([null, 0, 3600, 28800, -1])
    });
  }
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  let workingDays = allDays.filter(() => r() < 0.6);
  if (!workingDays.length) workingDays = [pick(allDays)];
  const settings = Object.assign({}, gs.DEFAULTS, {
    site: 'https://x.atlassian.net', workingDays,
    skipStatuses: r() < 0.3 ? ['Blocked'] : [], fallbackDays: 1 + Math.floor(r() * 20)
  });
  const month = 1 + Math.floor(r() * 12);
  const day = 1 + Math.floor(r() * 28);
  const today = '2028-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const sprintEnd = r() < 0.2 ? null : gs.addDays_(today, Math.floor(r() * 30) - 5); // may already be over
  const skipDates = [];
  for (let d = 0; d < 20; d++) if (r() < 0.15) skipDates.push(gs.addDays_(today, d));
  return { tickets, settings, today, sprintEnd, skipDates };
}

test('fuzz: every plan obeys the planning rules', () => {
  const r = rng(20261113);
  for (let n = 0; n < 3000; n++) {
    const c = randomCase(r);
    const plan = gs.buildPlan(c.tickets, c.today, c.sprintEnd, c.settings, c.skipDates);
    const label = 'case ' + n + ': ' + JSON.stringify(c);
    const skip = c.settings.skipStatuses.map((s) => s.toLowerCase());
    const wanted = c.tickets.filter((t) => skip.indexOf(String(t.status).trim().toLowerCase()) === -1);

    // Every ticket that is not skipped is placed exactly once.
    assert.deepEqual(plan.map((p) => p.key).sort(), wanted.map((t) => t.key).sort(), label);

    let lastStart = '';
    let lastGroup = 0;
    plan.forEach((p) => {
      assert.match(p.startDate, /^\d{4}-\d{2}-\d{2}$/, label);
      assert.match(p.endDate, /^\d{4}-\d{2}-\d{2}$/, label);
      assert.ok(p.endDate > p.startDate, 'a bar lasts at least one day. ' + label);
      assert.ok(p.startDate >= c.today, 'nothing is planned in the past. ' + label);
      // A bar starts and ends on a working day that is not a day off.
      assert.ok(gs.isWorkingDay_(p.startDate, c.settings, c.skipDates), 'starts on a working day. ' + label);
      assert.ok(gs.isWorkingDay_(gs.addDays_(p.endDate, -1), c.settings, c.skipDates), 'ends on a working day. ' + label);
      // Bars follow each other in order: in progress first, then the rest.
      assert.ok(p.startDate >= lastStart, 'bars are in date order. ' + label);
      assert.ok(p.group >= lastGroup, 'groups are in order. ' + label);
      lastStart = p.startDate;
      lastGroup = p.group;
      assert.ok(p.title.indexOf('NaN') === -1 && p.title.indexOf('undefined') === -1, label);
    });
    // Inside the sprint, nothing runs past its last day.
    if (c.sprintEnd && c.sprintEnd >= c.today && plan.length &&
        gs.workingDays(c.today, c.sprintEnd, c.settings, c.skipDates).length) {
      plan.forEach((p) => assert.ok(gs.addDays_(p.endDate, -1) <= c.sprintEnd, 'stays inside the sprint. ' + label));
    }
  }
});

test('fuzz: the plan fills the days it is given, with no gap at the start or the end', () => {
  const r = rng(7);
  for (let n = 0; n < 2000; n++) {
    const count = 1 + Math.floor(r() * 30);
    const days = 1 + Math.floor(r() * 30);
    const weighted = [];
    for (let i = 0; i < count; i++) weighted.push({ key: 'T-' + i, weight: [0.5, 1, 2, 3, 5, 8, 13][Math.floor(r() * 7)] });
    const slots = gs.spreadTickets(weighted, days);
    const label = 'case ' + n + ': ' + count + ' tickets on ' + days + ' days ' + JSON.stringify(weighted.map((w) => w.weight));
    assert.equal(slots[0].start, 0, 'the first ticket starts on the first day. ' + label);
    assert.equal(slots[slots.length - 1].end, days, 'the last ticket ends on the last day. ' + label);
    slots.forEach((s, i) => {
      assert.ok(s.start >= 0 && s.end <= days && s.end > s.start, label);
      if (i) assert.ok(s.start >= slots[i - 1].start, label);
      // With room for everyone, no day is left empty between two tickets.
      if (i && count <= days) assert.ok(s.start <= slots[i - 1].end, 'no empty day between tickets. ' + label);
    });
  }
});

test('fuzz: the whole plan with future sprints never goes backwards or into the past', () => {
  const r = rng(99);
  for (let n = 0; n < 1500; n++) {
    const c = randomCase(r);
    const future = [];
    const sprints = Math.floor(r() * 4);
    for (let i = 0; i < sprints; i++) {
      const dated = r() < 0.4;
      const start = gs.addDays_(c.today, Math.floor(r() * 60) - 10);
      future.push({
        id: 100 + i, name: 'Sprint ' + i,
        startDate: dated ? start : null, endDate: dated ? gs.addDays_(start, Math.floor(r() * 14)) : null,
        tickets: randomCase(r).tickets.slice(0, 5).map((t) => Object.assign({}, t, { key: 'F' + i + '-' + t.key }))
      });
    }
    const jira = { tickets: c.tickets, sprintStart: c.sprintEnd ? gs.addDays_(c.sprintEnd, -13) : null, sprintEnd: c.sprintEnd, future };
    const plan = gs.buildFullPlan(jira, c.today, c.settings, c.skipDates);
    const label = 'case ' + n + ': ' + JSON.stringify({ jira, today: c.today, settings: c.settings });
    const keys = plan.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, 'no ticket is placed twice. ' + label);
    plan.forEach((p) => {
      assert.ok(p.startDate >= c.today, 'nothing in the past. ' + label);
      assert.ok(p.endDate > p.startDate, label);
    });
  }
});
