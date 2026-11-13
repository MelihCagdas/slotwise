// Loads the real extension into a real Chromium and puts it in front of a
// stand-in Google Calendar and a stand-in Jira. Nothing leaves this computer:
// every web address is answered here.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const EXTENSION = path.join(__dirname, '..', '..', 'extension');
const CAL = 'https://calendar.google.com';

/**
 * The stand-in Google Calendar. One page that draws a week, a month, or the
 * new-event page, by its address, the way the real one does. What it copies
 * from the real one: day cells marked with data-datekey, tall day columns in
 * a scrolling box, the GMT label, the Save button id, a title box whose label
 * is in the person's language, and a jump to another view after a save.
 */
function calendarPage(options) {
  const o = Object.assign({ titleLabel: 'Title', dark: false, gmt: 'GMT+03', saveDelay: 150, editDelay: 250, titleSuffix: '' }, options);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Fake Calendar</title>
<style>
  body { margin: 0; font: 13px Arial; background: ${o.dark ? '#1b1b1b' : '#fff'}; color: ${o.dark ? '#eee' : '#111'}; }
  #top { height: 64px; border-bottom: 1px solid #ccc; }
  #allday { height: 60px; display: flex; border-bottom: 1px solid #ccc; }
  #allday div, .col { flex: 1; border-right: 1px solid #ddd; }
  #scroller { height: 600px; overflow-y: auto; }
  #cols { display: flex; height: 1152px; }
  #month { display: grid; grid-template-columns: repeat(7, 1fr); }
  #month div { height: 110px; border: 1px solid #ddd; }
  #left { position: fixed; left: 0; top: 64px; width: 60px; }
  #grid { margin-left: 60px; margin-right: 360px; }
</style></head><body>
<div id="top">Fake Calendar</div>
<div id="left"><span>${o.gmt}</span></div>
<div id="grid"></div>
<script>
  var OPTIONS = ${JSON.stringify(o)};
  function key(d) { return (d.getFullYear() - 1970) * 512 + (d.getMonth() + 1) * 32 + d.getDate(); }
  function events() { return JSON.parse(localStorage.getItem('fake-events') || '[]'); }
  function chips() {
    var box = document.createElement('div'); box.id = 'chips';
    events().forEach(function (e) {
      var c = document.createElement('div'); c.setAttribute('data-eventchip', ''); c.textContent = e.title; box.appendChild(c);
    });
    return box;
  }
  function draw() {
    var grid = document.getElementById('grid'); grid.textContent = '';
    var path = location.pathname;
    var now = new Date();
    if (path.indexOf('/eventedit') !== -1) {
      var q = new URLSearchParams(location.search);
      setTimeout(function () {
        var input = document.createElement('input'); input.setAttribute('aria-label', OPTIONS.titleLabel);
        input.id = 'fake-title'; input.value = (q.get('text') || '') + OPTIONS.titleSuffix; input.style.width = '600px';
        var save = document.createElement('button'); save.id = 'xSaveBu'; save.textContent = 'Save';
        var close = document.createElement('button'); close.id = 'fake-close'; close.textContent = 'X';
        var go = function () {
          // Like the real one: after the new-event page it shows today's week.
          history.pushState(null, '', location.pathname.replace(/\\/r\\/.*$/, '/r/week'));
          draw();
        };
        save.addEventListener('click', function () {
          var all = events();
          all.push({ title: input.value, dates: q.get('dates'), details: q.get('details') || '' });
          localStorage.setItem('fake-events', JSON.stringify(all));
          setTimeout(go, OPTIONS.saveDelay);
        });
        close.addEventListener('click', go);
        grid.appendChild(close); grid.appendChild(input); grid.appendChild(save);
      }, OPTIONS.editDelay);
      return;
    }
    if (path.indexOf('/r/month') !== -1) {
      var m = document.createElement('div'); m.id = 'month';
      var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (var i = 1; i <= days; i++) {
        var cell = document.createElement('div'); cell.setAttribute('role', 'gridcell');
        cell.setAttribute('data-datekey', key(new Date(now.getFullYear(), now.getMonth(), i)));
        cell.textContent = i; m.appendChild(cell);
      }
      grid.appendChild(m); grid.appendChild(chips());
      return;
    }
    // Week (also the default): an all-day strip, then tall columns in a scrolling box.
    var sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    var strip = document.createElement('div'); strip.id = 'allday';
    var scroller = document.createElement('div'); scroller.id = 'scroller';
    var cols = document.createElement('div'); cols.id = 'cols';
    for (var d = 0; d < 7; d++) {
      var day = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + d);
      var top = document.createElement('div'); top.textContent = day.getDate(); strip.appendChild(top);
      var col = document.createElement('div'); col.className = 'col';
      col.setAttribute('role', 'gridcell'); col.setAttribute('data-datekey', key(day));
      cols.appendChild(col);
    }
    scroller.appendChild(cols);
    grid.appendChild(strip); grid.appendChild(scroller); grid.appendChild(chips());
    scroller.scrollTop = 384; // 08:00 at the top, as the real one opens
  }
  window.addEventListener('popstate', draw);
  draw();
</script></body></html>`;
}

/** Sample Jira answers. `jira` in open() can replace any of them. */
function issue(key, summary, status, category, sprint, points) {
  return { key, fields: { summary, status: { name: status, statusCategory: { key: category } },
    timeoriginalestimate: null, customfield_10016: points === undefined ? null : points, customfield_10020: sprint || null } };
}

function fakeJira(overrides) {
  const now = new Date();
  const iso = (offset) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12).toISOString();
  const active = [{ id: 1, name: 'Sprint 1', state: 'active', boardId: 7, startDate: iso(-3), endDate: iso(9) }];
  const base = {
    myself: { status: 200, body: { displayName: 'Tester' } },
    fields: { status: 200, body: [
      { id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
      { id: 'customfield_10016', name: 'Story Points' }] },
    sprint: [issue('WEB-1', 'First ticket', 'In Progress', 'indeterminate', active, 3),
      issue('WEB-2', 'Second ticket', 'To Do', 'new', active, 2)],
    other: [issue('WEB-9', 'Backlog item', 'Backlog', 'new', null)],
    future: [],
    search: [],
    searchStatus: 200,
    active
  };
  const j = Object.assign(base, overrides || {});
  return function (url) {
    const u = new URL(url);
    const reply = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (j.html) return { status: 200, contentType: 'text/html', body: '<html>Log in</html>' };
    if (u.pathname === '/rest/api/3/myself') return reply(j.myself.status, j.myself.body);
    if (u.pathname === '/rest/api/3/field') return reply(j.fields.status, j.fields.body);
    if (u.pathname.indexOf('/rest/agile/1.0/board/') === 0) return reply(200, { values: [] });
    if (u.pathname === '/rest/api/3/search/jql') {
      const jql = u.searchParams.get('jql') || '';
      if (j.searchStatus !== 200) return reply(j.searchStatus, { errorMessages: ['nope'] });
      if (j.noSprints && /sprint/i.test(jql)) return reply(400, { errorMessages: ["Field 'sprint' does not exist"] });
      if (/summary ~|key =/.test(jql)) return reply(200, { issues: j.search });
      if (jql.indexOf('futureSprints()') !== -1) return reply(200, { issues: j.future });
      if (jql.indexOf('sprint is EMPTY') !== -1) return reply(200, { issues: j.other });
      if (jql.indexOf('openSprints()') !== -1) return reply(200, { issues: j.sprint });
      return reply(200, { issues: j.sprint.concat(j.other) });
    }
    return reply(404, {});
  };
}

/**
 * Starts a browser with the extension loaded and a fresh profile.
 * Returns {context, page, goto(view), events(), jiraCalls, close()}.
 */
async function open(options) {
  const o = Object.assign({ calendar: {}, jira: null, account: 0 }, options);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'slotwise-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: !process.env.HEADED, viewport: { width: 1400, height: 900 },
    args: ['--disable-extensions-except=' + EXTENSION, '--load-extension=' + EXTENSION]
  });
  const jira = fakeJira(o.jira);
  const jiraCalls = [];
  const outside = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.indexOf(CAL + '/calendar/') === 0) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: calendarPage(o.calendar) });
    }
    if (/^https:\/\/[a-z0-9-]+\.atlassian\.net\//.test(url)) {
      jiraCalls.push(url);
      return route.fulfill(jira(url));
    }
    outside.push(url);
    return route.abort();
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const base = CAL + '/calendar/u/' + o.account + '/r/';
  return {
    context, page, jiraCalls, outside, errors,
    goto: async (view) => { await page.goto(base + (view || 'week')); await page.waitForSelector('#jsc-root'); },
    events: () => page.evaluate(() => JSON.parse(localStorage.getItem('fake-events') || '[]')),
    close: async () => { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  };
}

module.exports = { open, issue, CAL };
