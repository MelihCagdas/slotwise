// GENERATED from Code.gs by scripts/sync-plan.js. Do not edit; run `npm run sync`.
/**
 * Jira Sprint Calendar
 * Shows your open Jira sprint tickets as all-day bars in a separate
 * "Jira plan" Google calendar. See README.md for setup.
 *
 * Run `setup` once. It then refreshes every morning.
 * Run `remove` to take everything away again.
 */

var CALENDAR_NAME = 'Jira plan';
var PLAN_HORIZON_DAYS = 120; // how far ahead bars are drawn and redrawn

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

/** Places tickets on the given working days. `note` is added to each description. */
function planOnDays_(tickets, days, settings, note, isFuture) {
  var ordered = weighTickets(orderTickets(tickets, settings));
  if (!ordered.length || !days.length) return [];
  return spreadTickets(ordered, days.length).map(function (slot) {
    var t = slot.ticket;
    var url = settings.site + '/browse/' + t.key;
    var title = t.key + ' ' + t.summary;
    if (hasEffort_(t.points)) title += ' (' + formatPoints_(t.points) + ' pt)';
    return {
      key: t.key,
      title: title,
      description: t.status + ' · ' + url + (note ? '\n' + note : ''),
      url: url,
      startDate: days[slot.start],
      endDate: addDays_(days[slot.end - 1], 1),
      group: t.group,
      future: !!isFuture
    };
  });
}

/**
 * Turns the active sprint's tickets into calendar entries.
 * `sprintEnd` is the last day of the sprint, or null when there is no sprint.
 * Returns [{key, title, description, url, startDate, endDate, group, future}].
 */
function buildPlan(tickets, today, sprintEnd, settings, skipDates) {
  var days = sprintEnd
    ? workingDays(today, sprintEnd, settings, skipDates)
    : nextWorkingDays(today, settings.fallbackDays, settings, skipDates);
  if (!days.length) days = nextWorkingDays(today, 1, settings, skipDates);
  return planOnDays_(tickets, days, settings, '', false);
}

/**
 * The whole plan: the active sprint, then each future sprint after it.
 * Jira gives a sprint its dates only when it starts, so a future sprint
 * without dates is assumed to follow straight on and to last as many
 * working days as the active one. It corrects itself once the sprint starts.
 * `jira` is {tickets, sprintStart, sprintEnd, future: [{id, name, startDate, endDate, tickets}]}.
 */
function buildFullPlan(jira, today, settings, skipDates) {
  var plan = buildPlan(jira.tickets, today, jira.sprintEnd, settings, skipDates);

  var length = settings.fallbackDays;
  if (jira.sprintStart && jira.sprintEnd) {
    length = workingDays(jira.sprintStart, jira.sprintEnd, settings, []).length || length;
  }
  var yesterday = addDays_(today, -1);
  var after = jira.sprintEnd && jira.sprintEnd > yesterday ? jira.sprintEnd : yesterday;
  var horizon = addDays_(today, PLAN_HORIZON_DAYS);

  (jira.future || []).forEach(function (sprint) {
    var hasDates = sprint.startDate && sprint.endDate && sprint.endDate >= today;
    var days = hasDates
      ? workingDays(sprint.startDate > today ? sprint.startDate : today, sprint.endDate, settings, skipDates)
      : nextWorkingDays(addDays_(after, 1), length, settings, skipDates);
    if (!days.length || days[0] > horizon) return;
    after = days[days.length - 1];
    var note = 'Planned for ' + sprint.name + (hasDates ? '.' : ' (dates estimated until the sprint starts).');
    plan = plan.concat(planOnDays_(sprint.tickets, days, settings, note, true));
  });
  return plan;
}

// ---------------------------------------------------------------------------
// Jira. Everything down to jiraGet_ is pure and unit tested.
// ---------------------------------------------------------------------------

var SPRINT_FIELD_TYPE = 'com.pyxis.greenhopper.jira:gh-sprint';
var POINTS_FIELD_NAMES = ['story points', 'story point estimate'];

/** Finds the sprint field and the story points fields in Jira's field list. */
function pickFieldIds(fields) {
  var sprint = null;
  var byName = {};
  (fields || []).forEach(function (f) {
    if (!sprint && f.schema && f.schema.custom === SPRINT_FIELD_TYPE) sprint = f.id;
    var name = String(f.name || '').trim().toLowerCase();
    if (POINTS_FIELD_NAMES.indexOf(name) !== -1 && !byName[name]) byName[name] = f.id;
  });
  var points = POINTS_FIELD_NAMES
    .map(function (name) { return byName[name]; })
    .filter(function (id) { return !!id; });
  return { sprint: sprint, points: points };
}

/**
 * Turns Jira issues into tickets and finds the active sprint's last day.
 * `toLocalDate` turns Jira's UTC timestamp into a local 'YYYY-MM-DD'.
 */
function parseIssues(issues, fieldIds, pointsOverride, toLocalDate) {
  var pointFields = pointsOverride ? [pointsOverride] : fieldIds.points;
  var sprintEnd = null;
  var sprintStart = null;
  var localDate = function (iso) {
    return toLocalDate ? toLocalDate(iso) : String(iso).slice(0, 10);
  };
  var tickets = (issues || []).map(function (issue) {
    var f = issue.fields || {};
    var points = null;
    pointFields.forEach(function (id) {
      if (points === null && typeof f[id] === 'number') points = f[id];
    });
    var sprints = fieldIds.sprint && Array.isArray(f[fieldIds.sprint]) ? f[fieldIds.sprint] : [];
    sprints.forEach(function (s) {
      if (s && s.state === 'active' && s.endDate) {
        var end = localDate(s.endDate);
        if (!sprintEnd || end > sprintEnd) {
          sprintEnd = end;
          sprintStart = s.startDate ? localDate(s.startDate) : null;
        }
      }
    });
    var status = f.status || {};
    return {
      key: issue.key,
      summary: f.summary || '',
      status: status.name || '',
      category: (status.statusCategory && status.statusCategory.key) || 'new',
      points: points,
      estimateSeconds: typeof f.timeoriginalestimate === 'number' ? f.timeoriginalestimate : null
    };
  });
  return { tickets: tickets, sprintStart: sprintStart, sprintEnd: sprintEnd };
}

/**
 * Groups tickets by the future sprint they sit in, in sprint order.
 * Returns [{id, name, startDate, endDate, tickets}]; dates are null unless
 * the team has already given the sprint planned dates.
 */
function parseFutureIssues(issues, fieldIds, pointsOverride, toLocalDate) {
  var localDate = function (iso) {
    return toLocalDate ? toLocalDate(iso) : String(iso).slice(0, 10);
  };
  var byId = {};
  (issues || []).forEach(function (issue) {
    var entries = (issue.fields && issue.fields[fieldIds.sprint]) || [];
    var sprint = null;
    entries.forEach(function (s) { if (s && s.state === 'future') sprint = s; });
    if (!sprint) return;
    if (!byId[sprint.id]) {
      byId[sprint.id] = {
        id: sprint.id,
        name: sprint.name || 'the next sprint',
        boardId: sprint.boardId || null,
        startDate: sprint.startDate ? localDate(sprint.startDate) : null,
        endDate: sprint.endDate ? localDate(sprint.endDate) : null,
        issues: []
      };
    }
    byId[sprint.id].issues.push(issue);
  });
  return Object.keys(byId)
    .map(function (id) { return byId[id]; })
    .sort(function (a, b) {
      if (a.startDate && b.startDate && a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      return a.id - b.id;
    })
    .map(function (g) {
      return {
        id: g.id, name: g.name, boardId: g.boardId, startDate: g.startDate, endDate: g.endDate,
        tickets: parseIssues(g.issues, fieldIds, pointsOverride, toLocalDate).tickets
      };
    });
}

/**
 * Puts the user's future sprints into the board's own order and adds the
 * board's other future sprints as empty ones. A sprint that holds none of
 * the user's tickets still takes up its weeks, so later sprints must not
 * slide forward into them. `boardSprints` is the board's future sprint
 * list, or null when it could not be read.
 */
function mergeSprintOrder(groups, boardSprints, toLocalDate) {
  if (!boardSprints || !boardSprints.length) return groups;
  var localDate = function (iso) {
    return toLocalDate ? toLocalDate(iso) : String(iso).slice(0, 10);
  };
  var mine = {};
  groups.forEach(function (g) { mine[g.id] = g; });
  var seen = {};
  var merged = boardSprints.map(function (s) {
    seen[s.id] = true;
    return mine[s.id] || {
      id: s.id,
      name: s.name || 'a future sprint',
      boardId: s.originBoardId || null,
      startDate: s.startDate ? localDate(s.startDate) : null,
      endDate: s.endDate ? localDate(s.endDate) : null,
      tickets: []
    };
  });
  // Sprints from another board keep their place after this board's.
  return merged.concat(groups.filter(function (g) { return !seen[g.id]; }));
}

/** Reads every page. `fetchPage(token)` returns {issues, nextPageToken}. */
function collectPages(fetchPage) {
  var all = [];
  var token;
  for (var page = 0; page < 50; page++) {
    var result = fetchPage(token) || {};
    all = all.concat(result.issues || []);
    token = result.nextPageToken;
    if (!token) break;
  }
  return all;
}

/** Throws a readable error for a failed Jira call. */
function assertOk(code, body, what) {
  if (code >= 200 && code < 300) return;
  if (code === 401 || code === 403) {
    throw new Error(what + ' was refused (' + code + '). Check JIRA_EMAIL and JIRA_TOKEN in Script Properties.');
  }
  if (code === 404) {
    throw new Error(what + ' was not found (404). Check JIRA_SITE in Script Properties.');
  }
  throw new Error(what + ' failed (' + code + '): ' + String(body || '').slice(0, 300));
}

var SPRINT_JQL = 'assignee = currentUser() AND sprint in openSprints()';
var OPEN_JQL = 'assignee = currentUser() AND statusCategory != Done';
var FUTURE_JQL = 'assignee = currentUser() AND sprint in futureSprints() AND statusCategory != Done';

/**
 * Runs one search and reads every page. `get(path, what, allowCodes)` returns
 * the parsed reply, or null when Jira answered with one of `allowCodes`.
 * Returns the issues, or null when the query itself was rejected.
 */
function searchIssues(get, jql, fields, limit, allowCodes) {
  var rejected = false;
  var issues = collectPages(function (token) {
    var path = '/rest/api/3/search/jql?maxResults=' + Math.min(limit || 100, 100) +
      '&fields=' + encodeURIComponent(fields.join(',')) +
      '&jql=' + encodeURIComponent(jql) +
      (token ? '&nextPageToken=' + encodeURIComponent(token) : '');
    var page = get(path, 'Jira search', allowCodes);
    if (page === null) { rejected = true; return {}; }
    return { issues: page.issues, nextPageToken: limit ? null : page.nextPageToken };
  });
  if (rejected) return null;
  return limit ? issues.slice(0, limit) : issues;
}

/**
 * Reads the user's open sprint tickets through `get`. Returns {tickets, sprintEnd}.
 * Kept free of Google calls so it can be tested with a fake `get`.
 */
function fetchTicketsWith(get, settings, toLocalDate) {
  // Jira answers a wrong token as an anonymous visitor: searches come back
  // empty instead of failing. This call is the one that says "not signed in".
  get('/rest/api/3/myself', 'Jira sign-in');

  var fieldIds = pickFieldIds(get('/rest/api/3/field', 'Jira field list'));
  var fields = ['summary', 'status', 'timeoriginalestimate'].concat(fieldIds.points);
  if (settings.pointsField) fields.push(settings.pointsField);
  if (fieldIds.sprint) fields.push(fieldIds.sprint);

  var future = [];
  if (fieldIds.sprint) {
    // A 400 here means this site cannot answer sprint questions at all.
    var upcoming = searchIssues(get, FUTURE_JQL + ' ORDER BY Rank ASC', fields, null, [400]);
    future = parseFutureIssues(upcoming || [], fieldIds, settings.pointsField, toLocalDate);
    var boardId = future.length ? future[0].boardId : null;
    if (boardId) {
      // Not every account may read the board; without it the order above stands.
      var board = get('/rest/agile/1.0/board/' + boardId + '/sprint?state=future&maxResults=50',
        'Jira sprint list', [400, 401, 403, 404]);
      future = mergeSprintOrder(future, board && board.values, toLocalDate);
    }

    var issues = searchIssues(get, SPRINT_JQL + ' AND statusCategory != Done ORDER BY Rank ASC',
      fields, null, [400]);
    if (issues && issues.length) {
      var active = parseIssues(issues, fieldIds, settings.pointsField, toLocalDate);
      active.future = future;
      return active;
    }
    if (issues) {
      // Nothing open. If the sprint still holds finished work of theirs,
      // they are simply done: show nothing rather than pull in the backlog.
      var any = searchIssues(get, SPRINT_JQL, ['summary', fieldIds.sprint], 1, [400]);
      if (any && any.length) {
        var done = parseIssues(any, fieldIds, null, toLocalDate);
        return { tickets: [], sprintStart: done.sprintStart, sprintEnd: done.sprintEnd, future: future };
      }
    }
    // Between sprints: the next sprint's tickets are the plan.
    if (future.length) return { tickets: [], sprintStart: null, sprintEnd: null, future: future };
  }

  // No sprints at all (for example a Kanban board): take the first open tickets.
  var open = searchIssues(get, OPEN_JQL + ' ORDER BY Rank ASC', fields, settings.fallbackTickets);
  return {
    tickets: parseIssues(open, fieldIds, settings.pointsField, toLocalDate).tickets,
    sprintStart: null,
    sprintEnd: null,
    future: []
  };
}

/** Throws when an optional setting cannot be used. */
function checkSettings(settings) {
  var days = settings.workingDays;
  var daysOk = days.length > 0 && days.every(function (d) {
    return typeof d === 'number' && d % 1 === 0 && d >= 0 && d <= 6;
  });
  if (!daysOk) {
    throw new Error('WORKING_DAYS must be numbers from 0 (Sunday) to 6 (Saturday), for example 1,2,3,4,5.');
  }
  var hour = settings.runHour;
  if (!(typeof hour === 'number' && hour % 1 === 0 && hour >= 0 && hour <= 23)) {
    throw new Error('RUN_HOUR must be a whole number from 0 to 23.');
  }
}
