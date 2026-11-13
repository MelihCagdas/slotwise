/**
 * Slotwise, browser extension.
 * Pure helpers: no browser or network calls, so they can be unit tested.
 */
var JSC = (function () {
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * Google Calendar marks each day cell with a packed number:
   * (year - 1970) * 512 + month * 32 + day. Returns 'YYYY-MM-DD' or null.
   */
  function dateFromKey(key) {
    var n = Number(key);
    if (!isFinite(n) || n <= 0) return null;
    var day = n & 31;
    var month = (n >> 5) & 15;
    var year = (n >> 9) + 1970;
    if (day < 1 || month < 1 || month > 12) return null;
    return year + '-' + pad(month) + '-' + pad(day);
  }

  /**
   * A day column covers 24 hours from `top` over `height` pixels.
   * Returns minutes after midnight for a drop at `y`, snapped down to `snap`
   * and kept early enough for a one-hour event to fit in the day.
   */
  function minutesFromOffset(y, top, height, snap) {
    snap = snap || 30;
    var raw = (y - top) / height * 1440 + 2; // +2 absorbs sub-pixel rounding
    var minutes = Math.floor(raw / snap) * snap;
    return Math.max(0, Math.min(minutes, 1440 - 60));
  }

  function addDays(dateString, days) {
    var d = new Date(dateString + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function stamp(dateString, minutes) {
    var date = addDays(dateString, Math.floor(minutes / 1440));
    var m = minutes % 1440;
    return date.replace(/-/g, '') + 'T' + pad(Math.floor(m / 60)) + pad(m % 60) + '00';
  }

  /**
   * The address of Google Calendar's own "new event" page, filled in.
   * `event` is {title, details, date, startMin, durationMin}; startMin null
   * means an all-day event (optionally with `endDate`, the day after the
   * last day). Times are the calendar's local time.
   */
  function eventEditUrl(basePath, event) {
    var dates;
    if (event.startMin === null || event.startMin === undefined) {
      // All day. `endDate` is the day after the last day, for a bar across several days.
      dates = event.date.replace(/-/g, '') + '/' + (event.endDate || addDays(event.date, 1)).replace(/-/g, '');
    } else {
      dates = stamp(event.date, event.startMin) + '/' +
        stamp(event.date, event.startMin + (event.durationMin || 60));
    }
    return basePath + '/r/eventedit' +
      '?text=' + encodeURIComponent(event.title) +
      '&dates=' + dates +
      '&details=' + encodeURIComponent(event.details || '');
  }

  /** '/calendar/u/2/r/week' -> '/calendar/u/2' (the signed-in account in use). */
  function accountBase(pathname) {
    var m = /^\/calendar\/u\/(\d+)/.exec(pathname || '');
    return '/calendar/u/' + (m ? m[1] : '0');
  }

  var DEMO_SITE = 'demo';

  /** Where ticket links point: the Jira site, or a placeholder for the sample tickets. */
  function linkBase(site) {
    return site === DEMO_SITE ? 'https://example.atlassian.net' : site;
  }

  /** Returns 'https://name.atlassian.net', 'demo', or null if it is neither. */
  function normalizeSite(input) {
    var text = String(input || '').trim().toLowerCase();
    if (!text) return null;
    if (text === DEMO_SITE) return DEMO_SITE; // sample tickets, no Jira needed
    text = text.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
    return /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/.test(text) ? 'https://' + text : null;
  }

  function parseTickets(json, site) {
    return ((json && json.issues) || []).map(function (issue) {
      var f = issue.fields || {};
      var status = f.status || {};
      return {
        key: issue.key,
        summary: f.summary || '',
        status: status.name || '',
        category: (status.statusCategory && status.statusCategory.key) || 'new',
        url: site + '/browse/' + issue.key
      };
    });
  }

  function filterTickets(tickets, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(function (t) {
      return (t.key + ' ' + t.summary).toLowerCase().indexOf(q) !== -1;
    });
  }

  /** JQL for the search box: an exact ticket key, or words from the summary. */
  function searchJql(query) {
    var q = String(query || '').trim();
    if (/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(q)) return 'key = "' + q.toUpperCase() + '"';
    var safe = q.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return 'summary ~ "' + safe + '*" AND statusCategory != Done ORDER BY updated DESC';
  }

  function ticketTitle(ticket) {
    return (ticket.key + ' ' + ticket.summary).trim();
  }

  /** 'Mon 16 Nov, 10:00' or 'Mon 16 Nov, all day'. */
  function formatSlot(dateString, minutes) {
    var d = new Date(dateString + 'T00:00:00Z');
    var day = DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
    if (minutes === null || minutes === undefined) return day + ', all day';
    return day + ', ' + pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
  }

  /**
   * Google Calendar shows its time zone beside the grid as 'GMT+3' or
   * 'GMT+05:30'. Returns '+03:00' / '+05:30', or null if it is not such a label.
   */
  function gmtOffset(label) {
    var m = /^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/.exec(String(label || '').trim());
    if (!m) return null;
    if (!m[1]) return '+00:00';
    return m[1] + pad(Number(m[2])) + ':' + (m[3] || '00');
  }

  /**
   * Which colour a ticket gets in the list: 'doing' (being worked on),
   * 'review' (started but waiting, such as QA or review), 'done' or 'todo'.
   */
  function statusKind(ticket) {
    var name = String(ticket.status || '').toLowerCase();
    if (ticket.category === 'done') return 'done';
    if (ticket.category === 'indeterminate') {
      return /review|qa|test|verif|approv|wait|block|hold/.test(name) ? 'review' : 'doing';
    }
    return 'todo';
  }

  var DROP_MINUTES = [30, 60, 90, 120];

  function nameList(value) {
    var parts = Array.isArray(value) ? value : String(value || '').split(',');
    return parts.map(function (s) { return String(s).trim(); }).filter(function (s) { return s !== ''; });
  }

  /**
   * The person's choices from the Customise panel, with anything missing or
   * unusable replaced by the default.
   */
  function cleanSettings(raw) {
    raw = raw || {};
    var days = (Array.isArray(raw.workingDays) ? raw.workingDays : []).map(Number)
      .filter(function (d, i, all) { return d % 1 === 0 && d >= 0 && d <= 6 && all.indexOf(d) === i; })
      .sort(function (a, b) { return a - b; });
    var spread = Number(raw.fallbackDays);
    var first = nameList(raw.activeStatuses);
    return {
      scope: raw.scope === 'all' ? 'all' : 'sprint',
      workingDays: days.length ? days : [1, 2, 3, 4, 5],
      activeStatuses: first.length ? first : ['In Progress'],
      skipStatuses: nameList(raw.skipStatuses),
      fallbackDays: spread % 1 === 0 && spread >= 1 && spread <= 60 ? spread : 10,
      dropMinutes: DROP_MINUTES.indexOf(Number(raw.dropMinutes)) !== -1 ? Number(raw.dropMinutes) : 60
    };
  }

  return {
    DROP_MINUTES: DROP_MINUTES,
    cleanSettings: cleanSettings,
    DEMO_SITE: DEMO_SITE,
    linkBase: linkBase,
    statusKind: statusKind,
    gmtOffset: gmtOffset,
    dateFromKey: dateFromKey,
    minutesFromOffset: minutesFromOffset,
    eventEditUrl: eventEditUrl,
    accountBase: accountBase,
    normalizeSite: normalizeSite,
    parseTickets: parseTickets,
    filterTickets: filterTickets,
    searchJql: searchJql,
    ticketTitle: ticketTitle,
    formatSlot: formatSlot
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = JSC;
