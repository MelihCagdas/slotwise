/**
 * Jira Sprint Calendar
 * Shows your open Jira sprint tickets as all-day bars in a separate
 * "Jira plan" Google calendar. See README.md for setup.
 *
 * Run `setup` once. It then refreshes every morning.
 * Run `remove` to take everything away again.
 */

var CALENDAR_NAME = 'Jira plan';

var DEFAULTS = {
  workingDays: [1, 2, 3, 4, 5], // 0 = Sunday ... 6 = Saturday
  activeStatuses: ['In Progress'],
  skipStatuses: [],
  fallbackDays: 10,
  fallbackTickets: 20
};

// ---------------------------------------------------------------------------
// Planning logic. Pure functions: no Google or Jira calls below this line
// until the "Jira" section. Dates are 'YYYY-MM-DD' strings, end dates exclusive.
// ---------------------------------------------------------------------------

function lowerList_(list) {
  return (list || []).map(function (s) { return String(s).trim().toLowerCase(); });
}

/**
 * Drops skipped statuses, then sorts into three groups, keeping Jira rank
 * order inside each: 1 = active status, 2 = other in-progress, 3 = to do.
 */
function orderTickets(tickets, settings) {
  var active = lowerList_(settings.activeStatuses);
  var skip = lowerList_(settings.skipStatuses);
  var out = [];
  tickets.forEach(function (ticket, index) {
    var status = String(ticket.status || '').trim().toLowerCase();
    if (skip.indexOf(status) !== -1) return;
    var group = 3;
    if (active.indexOf(status) !== -1) group = 1;
    else if (ticket.category === 'indeterminate') group = 2;
    var copy = Object.assign({}, ticket, { group: group });
    out.push({ ticket: copy, index: index });
  });
  out.sort(function (a, b) { return a.ticket.group - b.ticket.group || a.index - b.index; });
  return out.map(function (x) { return x.ticket; });
}

function hasEffort_(value) {
  return typeof value === 'number' && isFinite(value) && value > 0;
}

/**
 * Adds a `weight` to every ticket. One unit is used for the whole set:
 * story points if any ticket has them, else time estimates, else all equal.
 * A ticket with no value in that unit gets the average of those that have one.
 */
function weighTickets(tickets) {
  var unit = null;
  if (tickets.some(function (t) { return hasEffort_(t.points); })) unit = 'points';
  else if (tickets.some(function (t) { return hasEffort_(t.estimateSeconds); })) unit = 'estimateSeconds';

  var average = 1;
  if (unit) {
    var values = tickets.map(function (t) { return t[unit]; }).filter(hasEffort_);
    average = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }
  return tickets.map(function (t) {
    var weight = unit && hasEffort_(t[unit]) ? t[unit] : average;
    return Object.assign({}, t, { weight: weight });
  });
}

function toDate_(dateString) {
  return new Date(dateString + 'T00:00:00Z');
}

function toDateString_(date) {
  return date.toISOString().slice(0, 10);
}

function addDays_(dateString, days) {
  var d = toDate_(dateString);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString_(d);
}

function isWorkingDay_(dateString, settings, skipDates) {
  return settings.workingDays.indexOf(toDate_(dateString).getUTCDay()) !== -1 &&
    (skipDates || []).indexOf(dateString) === -1;
}

/** Working dates from `fromDate` to `toDate`, both included. */
function workingDays(fromDate, toDate, settings, skipDates) {
  var out = [];
  for (var d = fromDate; d <= toDate; d = addDays_(d, 1)) {
    if (isWorkingDay_(d, settings, skipDates)) out.push(d);
  }
  return out;
}

/** The next `count` working dates starting at `fromDate`. */
function nextWorkingDays(fromDate, count, settings, skipDates) {
  var out = [];
  if (!settings.workingDays.length) return out;
  // The 400-day cap stops a runaway loop if every day is skipped.
  for (var d = fromDate, i = 0; out.length < count && i < 400; d = addDays_(d, 1), i++) {
    if (isWorkingDay_(d, settings, skipDates)) out.push(d);
  }
  return out;
}

/**
 * Lays weighted tickets end to end along `dayCount` days, each taking a share
 * equal to its share of the total weight, snapped to whole days.
 * Returns [{ticket, start, end}] with day indexes, `end` exclusive.
 */
function spreadTickets(weighted, dayCount) {
  var total = weighted.reduce(function (sum, t) { return sum + t.weight; }, 0);
  var cursor = 0;
  return weighted.map(function (ticket) {
    var share = dayCount * ticket.weight / total;
    var start = Math.min(Math.round(cursor), dayCount - 1);
    var end = Math.min(Math.max(Math.round(cursor + share), start + 1), dayCount);
    cursor += share;
    return { ticket: ticket, start: start, end: end };
  });
}

function formatPoints_(points) {
  return String(Math.round(points * 100) / 100);
}

/**
 * Turns Jira tickets into calendar entries.
 * `sprintEnd` is the last day of the sprint, or null when there is no sprint.
 * Returns [{key, title, description, url, startDate, endDate, group}].
 */
function buildPlan(tickets, today, sprintEnd, settings, skipDates) {
  var ordered = weighTickets(orderTickets(tickets, settings));
  if (!ordered.length) return [];

  var days = sprintEnd
    ? workingDays(today, sprintEnd, settings, skipDates)
    : nextWorkingDays(today, settings.fallbackDays, settings, skipDates);
  if (!days.length) days = nextWorkingDays(today, 1, settings, skipDates);
  if (!days.length) return [];

  return spreadTickets(ordered, days.length).map(function (slot) {
    var t = slot.ticket;
    var url = settings.site + '/browse/' + t.key;
    var title = t.key + ' ' + t.summary;
    if (hasEffort_(t.points)) title += ' (' + formatPoints_(t.points) + ' pt)';
    return {
      key: t.key,
      title: title,
      description: t.status + ' · ' + url,
      url: url,
      startDate: days[slot.start],
      endDate: addDays_(days[slot.end - 1], 1),
      group: t.group
    };
  });
}
