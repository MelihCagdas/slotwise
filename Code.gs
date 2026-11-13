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
