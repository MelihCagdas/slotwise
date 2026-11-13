/**
 * Jira Sprint Calendar, background worker.
 * Reads Jira for the panel, and, once Google Calendar is connected, creates
 * events directly and keeps the automatic plan up to date.
 * It only reads Jira. It only changes events it created itself.
 */
importScripts('plan.js', 'lib.js', 'sync.js');

var REFRESH_ALARM = 'jsc-refresh';
var REFRESH_MINUTES = 15;

async function refreshIfWanted() {
  var saved = await chrome.storage.local.get('jscAuto');
  if (!saved.jscAuto || !(await googleToken(false))) return;
  try {
    await planSprint({ onlyIfChanged: true });
  } catch (e) {
    console.warn('Jira Sprint Calendar: plan not refreshed.', explain(e));
  }
}

async function setAuto(on) {
  await chrome.storage.local.set({ jscAuto: !!on });
  if (on) chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
  else chrome.alarms.clear(REFRESH_ALARM);
}

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === REFRESH_ALARM) refreshIfWanted();
});

var handlers = {
  'jsc-jira': function (message) {
    return jiraFetch(message.site, message.path);
  },
  'jsc-google-status': async function () {
    var saved = await chrome.storage.local.get('jscAuto');
    return { registered: isRegistered(), connected: !!(await googleToken(false)), auto: !!saved.jscAuto };
  },
  'jsc-google-connect': async function () {
    var token = await googleToken(true);
    return { ok: !!token, message: token ? '' : 'Google Calendar was not connected.' };
  },
  'jsc-plan': function () {
    return planSprint({});
  },
  // The plan as a list, for the panel to place through Google's own page
  // when Google Calendar is not connected. `skip` holds tickets already placed.
  'jsc-plan-preview': async function (message) {
    var site = JSC.normalizeSite((await chrome.storage.local.get('jscSite')).jscSite);
    if (!site) throw new Error('no-site');
    var jira = withoutTickets(await readJira(site), message.skip || []);
    var settings = Object.assign({}, DEFAULTS, { site: JSC.linkBase(site) });
    return { ok: true, items: buildFullPlan(jira, localDate(new Date()), settings, []) };
  },
  // Which tickets already have an event from this extension, from today on.
  'jsc-placed': async function () {
    if (!(await googleToken(false))) return { ok: true, keys: [] };
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    var keys = (await listTagged('primary', 'jscManual=1', start)).map(function (e) { return e.key; });
    var saved = (await chrome.storage.local.get('jscCalendarId')).jscCalendarId;
    if (saved) {
      try {
        keys = keys.concat((await listTagged(saved, 'jsc=1', start)).map(function (e) { return e.key; }));
      } catch (e) { /* the plan calendar is gone: nothing placed there */ }
    }
    return { ok: true, keys: keys.filter(function (k) { return !!k; }) };
  },
  'jsc-create': function (message) {
    return createManualEvent(message);
  },
  'jsc-auto': async function (message) {
    await setAuto(message.on);
    if (message.on) refreshIfWanted();
    return { ok: true };
  },
  'jsc-opened': async function () {
    refreshIfWanted(); // Calendar was opened: catch up in the background
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  var handler = message && handlers[message.type];
  if (!handler) return false;
  Promise.resolve()
    .then(function () { return handler(message); })
    .then(sendResponse)
    .catch(function (error) { sendResponse({ ok: false, message: explain(error) }); });
  return true; // the answer is sent later
});
