/**
 * Slotwise, the automatic plan.
 * Reads the sprint from Jira (with the browser's Jira sign-in) and keeps a
 * "Jira plan" calendar in Google Calendar in step with it. Uses the planning
 * rules in plan.js, which are the same ones the Apps Script version uses.
 *
 * The first block is pure and unit tested. The second talks to Jira and Google.
 */

function localDate(d) {
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function barColor(item) {
  return item.future ? '8' : item.group === 1 ? '10' : '2'; // grey, dark green, light green
}

/** The Google Calendar event for one automatic bar. */
function allDayEventBody(item) {
  return {
    summary: item.title,
    description: item.description,
    start: { date: item.startDate },
    end: { date: item.endDate },
    transparency: 'transparent', // shows as free: it never blocks the person's time
    colorId: barColor(item),
    reminders: { useDefault: false },
    extendedProperties: { private: { jsc: '1', jscKey: item.key } }
  };
}

/**
 * The event for a ticket dropped by hand. `startMin` null means all day;
 * otherwise an event at that time lasting `minutes` (an hour by default),
 * `offset` being the calendar's time zone such as '+03:00'.
 */
function timedEventBody(ticket, date, startMin, offset, minutes) {
  var body = {
    summary: JSC.ticketTitle(ticket),
    description: ticket.url,
    extendedProperties: { private: { jscManual: '1', jscKey: ticket.key } }
  };
  if (startMin === null || startMin === undefined) {
    body.start = { date: date };
    body.end = { date: addDays_(date, 1) };
    return body;
  }
  var stamp = function (minutes) {
    var day = addDays_(date, Math.floor(minutes / 1440));
    var m = minutes % 1440;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return day + 'T' + pad(Math.floor(m / 60)) + ':' + pad(m % 60) + ':00' + offset;
  };
  body.start = { dateTime: stamp(startMin) };
  body.end = { dateTime: stamp(startMin + (minutes || 60)) };
  return body;
}

/**
 * Compares the bars on the calendar with the bars the plan wants.
 * `existing` is [{id, key, start, end, summary, colorId}], `desired` is the
 * output of buildFullPlan. Returns what to keep, create, remove and trim.
 * Bars from earlier days are never removed: they are the record of the plan.
 */
function diffPlan(existing, desired, today) {
  var used = {};
  var out = { keep: [], create: [], remove: [], trim: [] };
  existing.forEach(function (e) {
    if (e.start < today) {
      if (e.end > today) out.trim.push({ id: e.id, end: today });
      return;
    }
    var match = -1;
    desired.forEach(function (item, i) {
      if (match === -1 && !used[i] && item.key === e.key && item.startDate === e.start &&
          item.endDate === e.end && item.title === e.summary && barColor(item) === e.colorId) match = i;
    });
    if (match === -1) out.remove.push(e);
    else { used[match] = true; out.keep.push(e); }
  });
  desired.forEach(function (item, i) { if (!used[i]) out.create.push(item); });
  return out;
}

/** The Jira result without the tickets the person has placed by hand. */
function withoutTickets(jira, keys) {
  var skip = {};
  keys.forEach(function (k) { skip[k] = true; });
  var keep = function (t) { return !skip[t.key]; };
  return {
    tickets: jira.tickets.filter(keep),
    sprintStart: jira.sprintStart,
    sprintEnd: jira.sprintEnd,
    future: (jira.future || []).map(function (s) {
      return { id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, tickets: s.tickets.filter(keep) };
    })
  };
}

/** A short text that changes whenever the plan would. Used to skip needless work. */
function planFingerprint(jira, manualKeys, today, settings) {
  var brief = function (t) { return [t.key, t.summary, t.status, t.points, t.estimateSeconds]; };
  return JSON.stringify([
    today, jira.sprintStart, jira.sprintEnd,
    jira.tickets.map(brief),
    (jira.future || []).map(function (s) { return [s.id, s.startDate, s.endDate, s.tickets.map(brief)]; }),
    manualKeys.slice().sort(),
    settings ? [settings.scope, settings.workingDays, settings.activeStatuses, settings.skipStatuses, settings.fallbackDays] : null
  ]);
}

/**
 * Sample tickets, for trying the extension with no Jira ("demo" as the
 * address). Answers the same questions Jira would, for a sprint that started
 * on Monday and ends on Friday of next week. Returns {ok, status, data}.
 */
function demoResponse(path, now) {
  var decoded = decodeURIComponent(String(path));
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  var start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 9).toISOString();
  var end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 11, 17).toISOString();
  var active = [{ id: 1, name: 'Sprint 12', state: 'active', boardId: 1, startDate: start, endDate: end }];
  var next = [{ id: 2, name: 'Sprint 13', state: 'future', boardId: 1 }];
  var issue = function (key, summary, status, category, points, sprint) {
    return { key: key, fields: {
      summary: summary, status: { name: status, statusCategory: { key: category } },
      timeoriginalestimate: null, customfield_10016: points, customfield_10020: sprint
    } };
  };
  var sprint = [
    issue('APP-212', 'Checkout redesign', 'In Progress', 'indeterminate', 3, active),
    issue('APP-198', 'Fix export bug', 'In Progress', 'indeterminate', 1, active),
    issue('APP-205', 'Search filters', 'In Review', 'indeterminate', 1, active),
    issue('APP-220', 'Audit log', 'To Do', 'new', 3, active),
    issue('APP-231', 'Onboarding emails', 'To Do', 'new', 1, active),
    issue('APP-240', 'Billing page copy', 'To Do', 'new', 1, active)
  ];
  var future = [
    issue('APP-251', 'Dark mode', 'To Do', 'new', 2, next),
    issue('APP-252', 'Export to CSV', 'To Do', 'new', 1, next)
  ];
  var other = [
    issue('APP-150', 'Refactor billing module', 'Backlog', 'new', null, null),
    issue('APP-163', 'Upgrade test runner', 'Backlog', 'new', null, null)
  ];
  var ok = function (data) { return { ok: true, status: 200, data: data }; };

  if (decoded.indexOf('/rest/api/3/myself') === 0) return ok({ displayName: 'Sample user' });
  if (decoded.indexOf('/rest/api/3/field') === 0) {
    return ok([
      { id: 'customfield_10020', name: 'Sprint', schema: { custom: SPRINT_FIELD_TYPE } },
      { id: 'customfield_10016', name: 'Story Points' }
    ]);
  }
  if (decoded.indexOf('/rest/agile/1.0/board/') === 0) return ok({ values: next });
  if (decoded.indexOf('/rest/api/3/search/jql') !== 0) return { ok: false, status: 404, data: null };

  var jql = (/[?&]jql=([^&]*)/.exec(String(path)) || ['', ''])[1];
  jql = decodeURIComponent(jql);
  var all = sprint.concat(future, other);
  var found;
  var key = /key = "([^"]+)"/.exec(jql);
  var words = /summary ~ "([^"]*?)\*"/.exec(jql);
  if (key) found = all.filter(function (i) { return i.key === key[1]; });
  else if (words) {
    var q = words[1].toLowerCase();
    found = all.filter(function (i) { return i.fields.summary.toLowerCase().indexOf(q) !== -1; });
  }
  else if (jql.indexOf('futureSprints()') !== -1) found = future;
  else if (jql.indexOf('sprint is EMPTY') !== -1) found = other.concat(future);
  else if (jql.indexOf('openSprints()') !== -1) found = sprint;
  else found = all;
  return ok({ issues: found });
}

// ---- Heads-up: a meeting has landed on a ticket ----------------------------

var TICKET_TITLE = /^[A-Z][A-Z0-9_]+-\d+\b/;

/** True for an event the person put on their own calendar for a ticket. */
function isTicketBlock(e) {
  if (!e || e.status === 'cancelled' || !e.start || !e.start.dateTime) return false; // all-day bars never clash
  var tags = (e.extendedProperties && e.extendedProperties.private) || {};
  if (tags.jscManual === '1') return true;
  // Placed through Google's own page: no tag, so go by the title, on an event that is theirs alone.
  var others = (e.attendees || []).filter(function (a) { return !a.self; });
  var mine = !e.organizer || e.organizer.self;
  return mine && !others.length && TICKET_TITLE.test(String(e.summary || ''));
}

/** True for an invitation from someone else that the person has not answered. */
function isOpenInvite(e) {
  if (!e || e.status === 'cancelled' || !e.start || !e.start.dateTime) return false;
  if (!e.organizer || e.organizer.self) return false;
  return (e.attendees || []).some(function (a) { return a.self && a.responseStatus === 'needsAction'; });
}

/**
 * Pairs each unanswered invitation with the first ticket block it overlaps.
 * `done` holds the ids already handled. Returns [{invite, ticket}].
 */
function findClashes(events, done) {
  var blocks = (events || []).filter(isTicketBlock);
  var at = function (e, side) { return new Date(e[side].dateTime).getTime(); };
  var out = [];
  (events || []).filter(isOpenInvite).forEach(function (invite) {
    if (done && done[invite.id]) return;
    var hit = null;
    blocks.forEach(function (b) {
      if (!hit && at(invite, 'start') < at(b, 'end') && at(invite, 'end') > at(b, 'start')) hit = b;
    });
    if (hit) out.push({ invite: invite, ticket: hit });
  });
  return out;
}

/** The note the organiser reads. Times are as the calendar shows them. */
function headsUpNote(ticket) {
  var clock = function (side) { return String(ticket[side].dateTime).slice(11, 16); };
  return 'Heads-up: I have ' + String(ticket.summary || 'focus work').trim() + ' planned ' + clock('start') + ' to ' + clock('end') +
    ' then. I can still join if it is needed. (Sent by Slotwise)';
}

/**
 * The guest list with the person's own entry answered "Maybe" and the note
 * added. Google tells the organiser about an answer, but not about a note on
 * its own, so the two go together. Nobody else's entry changes, and the
 * person can still change the answer to Yes or No.
 */
function withNote(attendees, note) {
  return (attendees || []).map(function (a) {
    if (!a.self) return a;
    var copy = {};
    Object.keys(a).forEach(function (k) { copy[k] = a[k]; });
    copy.comment = note;
    copy.responseStatus = 'tentative';
    return copy;
  });
}

// ---------------------------------------------------------------------------
// Jira and Google. Everything below runs in the extension's background worker.
// ---------------------------------------------------------------------------

var GCAL = 'https://www.googleapis.com/calendar/v3';
var CLIENT_ID_PLACEHOLDER = 'REPLACE_WITH_GOOGLE_CLIENT_ID';
var SITE_PATTERN = /^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/;

/** One read-only call to Jira, using the sign-in the browser already has. */
function jiraFetch(site, path) {
  if (site === JSC.DEMO_SITE) return Promise.resolve(demoResponse(path, new Date()));
  if (!SITE_PATTERN.test(String(site)) || !/^\/rest\/(api\/3|agile\/1\.0)\//.test(String(path)) ||
      String(path).indexOf('..') !== -1) {
    return Promise.resolve({ ok: false, status: 0, error: 'Not a Jira Cloud address.' });
  }
  return fetch(site + path, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = JSON.parse(text); } catch (e) { /* not JSON, for example a sign-in page */ }
        // A web page where data was expected is Jira's sign-in page.
        if (response.ok && data === null) return { ok: false, status: 401, data: null };
        return { ok: response.ok, status: response.status, data: data };
      });
    })
    .catch(function (error) {
      return { ok: false, status: 0, error: String(error && error.message || error) };
    });
}

/**
 * Reads the open sprint, future sprints and their order. Same steps as the
 * script. With scope 'all' it reads every open ticket and ignores sprints.
 */
async function readJira(site, scope) {
  var get = async function (path, allowCodes) {
    var res = await jiraFetch(site, path);
    if (res.ok) return res.data;
    if ((allowCodes || []).indexOf(res.status) !== -1) return null;
    throw new Error(res.status === 401 || res.status === 403 ? 'jira-signin' : 'jira-' + res.status);
  };
  var search = async function (jql, fields, limit, allowCodes) {
    var all = [];
    var token = null;
    for (var page = 0; page < 50; page++) {
      var data = await get('/rest/api/3/search/jql?maxResults=' + Math.min(limit || 100, 100) +
        '&fields=' + encodeURIComponent(fields.join(',')) + '&jql=' + encodeURIComponent(jql) +
        (token ? '&nextPageToken=' + encodeURIComponent(token) : ''), allowCodes);
      if (data === null) return null;
      all = all.concat(data.issues || []);
      token = limit ? null : data.nextPageToken;
      if (!token) break;
    }
    return limit ? all.slice(0, limit) : all;
  };
  var toLocal = function (iso) { return localDate(new Date(iso)); };

  // Jira answers a signed-out browser as an anonymous visitor, with empty
  // results instead of an error. This call is the one that says so.
  await get('/rest/api/3/myself');

  var fieldIds = pickFieldIds(await get('/rest/api/3/field'));
  var fields = ['summary', 'status', 'timeoriginalestimate'].concat(fieldIds.points);
  if (fieldIds.sprint) fields.push(fieldIds.sprint);

  var future = [];
  if (fieldIds.sprint && scope !== 'all') {
    var upcoming = await search(FUTURE_JQL + ' ORDER BY Rank ASC', fields, null, [400]);
    future = parseFutureIssues(upcoming || [], fieldIds, null, toLocal);
    var boardId = future.length ? future[0].boardId : null;
    if (boardId) {
      var board = await get('/rest/agile/1.0/board/' + boardId + '/sprint?state=future&maxResults=50',
        [400, 401, 403, 404]);
      future = mergeSprintOrder(future, board && board.values, toLocal);
    }
    var issues = await search(SPRINT_JQL + ' AND statusCategory != Done ORDER BY Rank ASC', fields, null, [400]);
    if (issues && issues.length) {
      var active = parseIssues(issues, fieldIds, null, toLocal);
      active.future = future;
      return active;
    }
    if (issues) {
      var any = await search(SPRINT_JQL, ['summary', fieldIds.sprint], 1, [400]);
      if (any && any.length) {
        var done = parseIssues(any, fieldIds, null, toLocal);
        return { tickets: [], sprintStart: done.sprintStart, sprintEnd: done.sprintEnd, future: future };
      }
    }
    if (future.length) return { tickets: [], sprintStart: null, sprintEnd: null, future: future };
  }
  var open = await search(OPEN_JQL + ' ORDER BY Rank ASC', fields, DEFAULTS.fallbackTickets);
  return { tickets: parseIssues(open, fieldIds, null, toLocal).tickets, sprintStart: null, sprintEnd: null, future: [] };
}

/** The planning rules, with the person's choices from the Customise panel. */
async function planSettings(site) {
  var chosen = JSC.cleanSettings((await chrome.storage.local.get('jscSettings')).jscSettings);
  return Object.assign({}, DEFAULTS, {
    site: JSC.linkBase(site), scope: chosen.scope, workingDays: chosen.workingDays,
    activeStatuses: chosen.activeStatuses, skipStatuses: chosen.skipStatuses, fallbackDays: chosen.fallbackDays
  });
}

/** True when this copy of the extension has been registered with Google. */
function isRegistered() {
  var oauth = chrome.runtime.getManifest().oauth2;
  return !!(oauth && oauth.client_id && oauth.client_id.indexOf(CLIENT_ID_PLACEHOLDER) === -1);
}

var lastAuth = null;   // what Chrome said the last time a token was asked for
var lastGoogle = null; // the last Google Calendar call that failed

/** A Google sign-in token, or null. `interactive` may show Google's "Allow" window. */
async function googleToken(interactive) {
  if (!isRegistered()) return null;
  // Disconnected by the person: stay that way until they press Connect again.
  if (!interactive && (await chrome.storage.local.get('jscGoogleOff')).jscGoogleOff) return null;
  try {
    var result = await chrome.identity.getAuthToken({ interactive: !!interactive });
    var token = typeof result === 'string' ? result : (result && result.token) || null;
    if (token) {
      lastAuth = { ok: true, at: Date.now(), interactive: !!interactive, scopes: (result && result.grantedScopes) || null };
      // Kept so that a short refusal from Chrome does not look like "not connected".
      await chrome.storage.local.set({ jscToken: { token: token, until: Date.now() + 50 * 60000 } });
      if (interactive) await chrome.storage.local.remove('jscGoogleOff');
      return token;
    }
    lastAuth = { ok: false, at: Date.now(), interactive: !!interactive, why: 'no token returned' };
  } catch (e) {
    lastAuth = { ok: false, at: Date.now(), interactive: !!interactive, why: String(e && e.message || e) };
  }
  if (!interactive) {
    var kept = (await chrome.storage.local.get('jscToken')).jscToken;
    if (kept && kept.token && kept.until > Date.now()) return kept.token;
  }
  return null;
}

async function gcal(method, path, body) {
  for (var attempt = 0; attempt < 2; attempt++) {
    var token = await googleToken(false);
    if (!token) throw new Error('google-signin');
    var response = await fetch(GCAL + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 401 && attempt === 0) {
      lastGoogle = { at: Date.now(), call: method + ' ' + path.split('?')[0], status: 401 };
      await chrome.identity.removeCachedAuthToken({ token: token }); // expired: get a fresh one
      await chrome.storage.local.remove('jscToken');
      continue;
    }
    if (response.status === 204) return null;
    var text = await response.text();
    if (!response.ok) {
      lastGoogle = { at: Date.now(), call: method + ' ' + path.split('?')[0], status: response.status, text: text.slice(0, 300) };
      throw new Error('google-' + response.status + ' ' + text.slice(0, 200));
    }
    return text ? JSON.parse(text) : null;
  }
  throw new Error('google-signin');
}

/** The id of the "Jira plan" calendar, creating it the first time. */
async function ensurePlanCalendar() {
  var saved = (await chrome.storage.local.get('jscCalendarId')).jscCalendarId;
  if (saved) {
    try {
      await gcal('GET', '/calendars/' + encodeURIComponent(saved));
      return saved;
    } catch (e) {
      if (!/^google-(404|410)/.test(e.message)) throw e; // the calendar was deleted: make a new one
    }
  }
  var created = await gcal('POST', '/calendars', {
    summary: CALENDAR_NAME,
    description: 'Your Jira tickets, drawn by Slotwise.'
  });
  await chrome.storage.local.set({ jscCalendarId: created.id });
  return created.id;
}

/** Events this extension created (they carry a private tag), from `timeMin` on. */
async function listTagged(calendarId, tag, timeMin) {
  var out = [];
  var pageToken = null;
  do {
    var data = await gcal('GET', '/calendars/' + encodeURIComponent(calendarId) + '/events' +
      '?singleEvents=true&maxResults=250&timeMin=' + encodeURIComponent(timeMin) +
      '&privateExtendedProperty=' + encodeURIComponent(tag) +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    (data.items || []).forEach(function (e) {
      var tags = (e.extendedProperties && e.extendedProperties.private) || {};
      out.push({
        id: e.id, key: tags.jscKey || '', summary: e.summary || '', colorId: e.colorId || '',
        start: (e.start && e.start.date) || '', end: (e.end && e.end.date) || ''
      });
    });
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return out;
}

/**
 * Reads Jira and brings the "Jira plan" calendar in step with it.
 * Tickets the person placed by hand are left out of the automatic plan.
 * `onlyIfChanged` skips the work when nothing has moved since last time.
 */
async function planSprint(options) {
  options = options || {};
  var saved = await chrome.storage.local.get(['jscSite', 'jscFingerprint']);
  var site = JSC.normalizeSite(saved.jscSite);
  if (!site) throw new Error('no-site');

  var now = new Date();
  var today = localDate(now);
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Jira and Google are both read before anything is changed.
  var settings = await planSettings(site);
  var jira = await readJira(site, settings.scope);
  var byHand = (await listTagged('primary', 'jscManual=1', todayStart))
    .map(function (e) { return e.key; }).filter(function (k) { return !!k; });
  var fingerprint = planFingerprint(jira, byHand, today, settings);
  if (options.onlyIfChanged && fingerprint === saved.jscFingerprint) return { ok: true, changed: false };

  var plan = buildFullPlan(withoutTickets(jira, byHand), today, settings, []);
  var calendarId = await ensurePlanCalendar();
  var events = '/calendars/' + encodeURIComponent(calendarId) + '/events';
  var diff = diffPlan(await listTagged(calendarId, 'jsc=1', todayStart), plan, today);

  for (var i = 0; i < diff.trim.length; i++) {
    await gcal('PATCH', events + '/' + encodeURIComponent(diff.trim[i].id), { end: { date: diff.trim[i].end } });
  }
  for (var j = 0; j < diff.remove.length; j++) {
    await gcal('DELETE', events + '/' + encodeURIComponent(diff.remove[j].id));
  }
  for (var k = 0; k < diff.create.length; k++) {
    await gcal('POST', events, allDayEventBody(diff.create[k]));
  }
  await chrome.storage.local.set({ jscFingerprint: fingerprint });

  var upcoming = plan.filter(function (item) { return item.future; }).length;
  return {
    ok: true, changed: diff.create.length + diff.remove.length + diff.trim.length > 0,
    planned: plan.length - upcoming, upcoming: upcoming, byHand: byHand.length
  };
}

/** Puts a dropped ticket straight onto the person's own calendar. */
async function createManualEvent(message) {
  var ticket = message.ticket || {};
  if (!ticket.key || !/^\d{4}-\d{2}-\d{2}$/.test(String(message.date))) throw new Error('bad-request');
  var timed = message.startMin !== null && message.startMin !== undefined;
  if (timed && !/^[+-]\d{2}:\d{2}$/.test(String(message.offset))) throw new Error('bad-request');
  await gcal('POST', '/calendars/primary/events',
    timedEventBody(ticket, message.date, timed ? Number(message.startMin) : null, message.offset,
      JSC.cleanSettings({ dropMinutes: message.minutes }).dropMinutes));
  return { ok: true };
}

/** Turns an internal error into a sentence for the panel. */
function explain(error) {
  var text = String(error && error.message || error);
  if (text === 'jira-signin') return 'You are not signed in to Jira in this browser.';
  if (text === 'google-signin') return 'Connect Google Calendar first.';
  if (text === 'no-site') return 'Enter your Jira address first.';
  if (/^google-403/.test(text)) return 'Google refused the request. Disconnect and connect Google Calendar again.';
  if (/^jira-/.test(text)) return 'Jira could not be read (' + text.slice(5) + '). Try again in a minute.';
  if (/^google-/.test(text)) return 'Google Calendar could not be updated (' + text.slice(7, 10) + ').';
  return 'Something went wrong: ' + text.slice(0, 120);
}

/**
 * Looks at the next two weeks for invitations that overlap a ticket block and
 * answers "Maybe" with a note, which Google sends to the organiser. An
 * invitation that has an answer is never touched, so each gets one note, once.
 */
async function sendHeadsUps() {
  if (!(await googleToken(false))) return { ok: true, sent: 0 };
  var saved = await chrome.storage.local.get(['jscHeadsUpDone', 'jscHeadsUpLog']);
  var done = saved.jscHeadsUpDone || {};
  var now = new Date();
  var path = '/calendars/primary/events?singleEvents=true&maxResults=250&orderBy=startTime' +
    '&timeMin=' + encodeURIComponent(now.toISOString()) +
    '&timeMax=' + encodeURIComponent(new Date(now.getTime() + 14 * 86400000).toISOString());
  var events = [];
  var pageToken = null;
  do {
    var data = await gcal('GET', path + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    events = events.concat(data.items || []);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  var clashes = findClashes(events, done);
  var log = saved.jscHeadsUpLog || [];
  for (var i = 0; i < clashes.length; i++) {
    var c = clashes[i];
    await gcal('PATCH', '/calendars/primary/events/' + encodeURIComponent(c.invite.id) + '?sendUpdates=all',
      { attendees: withNote(c.invite.attendees, headsUpNote(c.ticket)) });
    done[c.invite.id] = Date.now();
    log.unshift({ at: Date.now(), meeting: String(c.invite.summary || 'a meeting'), ticket: String(c.ticket.summary || ''),
      to: (c.invite.organizer && (c.invite.organizer.displayName || c.invite.organizer.email)) || 'the organiser' });
  }
  // Forget invitations from more than 30 days ago, and keep the last few notes for the panel.
  Object.keys(done).forEach(function (id) { if (Date.now() - done[id] > 30 * 86400000) delete done[id]; });
  await chrome.storage.local.set({ jscHeadsUpDone: done, jscHeadsUpLog: log.slice(0, 5) });
  return { ok: true, sent: clashes.length, last: log[0] || null };
}

/** Stops using Google Calendar directly. Nothing already on the calendar is removed. */
async function disconnectGoogle() {
  var token = await googleToken(false);
  await chrome.storage.local.set({ jscGoogleOff: true });
  await chrome.storage.local.remove('jscToken');
  if (token) {
    try { await chrome.identity.removeCachedAuthToken({ token: token }); } catch (e) { /* already gone */ }
  }
  return { ok: true };
}
