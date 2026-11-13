/**
 * Jira Sprint Calendar, browser extension.
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
   * means an all-day event. Times are the calendar's local time.
   */
  function eventEditUrl(basePath, event) {
    var dates;
    if (event.startMin === null || event.startMin === undefined) {
      dates = event.date.replace(/-/g, '') + '/' + addDays(event.date, 1).replace(/-/g, '');
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

  /** Returns 'https://name.atlassian.net', or null if it is not a Jira Cloud address. */
  function normalizeSite(input) {
    var text = String(input || '').trim().toLowerCase();
    if (!text) return null;
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

  return {
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
