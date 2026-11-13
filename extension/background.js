/**
 * Slotwise, background worker.
 * Reads Jira for the panel, and, once Google Calendar is connected, creates
 * events directly and keeps the automatic plan up to date.
 * It only reads Jira. It only changes events it created itself.
 */
importScripts('plan.js', 'lib.js', 'sync.js');

var REFRESH_ALARM = 'jsc-refresh';
var REFRESH_MINUTES = 15;

async function refreshIfWanted() {
  // On unless switched off, and only once the person has planned at least once:
  // nothing is put on a calendar that they did not ask for.
  var saved = await chrome.storage.local.get(['jscAuto', 'jscPlanned']);
  if (saved.jscAuto === false || !saved.jscPlanned || !(await googleToken(false))) return;
  try {
    await planSprint({ onlyIfChanged: true });
  } catch (e) {
    console.warn('Slotwise: plan not refreshed.', explain(e));
  }
}

async function setAuto(on) {
  await chrome.storage.local.set({ jscAuto: !!on });
}

var HEADSUP_ALARM = 'jsc-headsup';
var HEADSUP_MINUTES = 2;

async function headsUpIfWanted() {
  var saved = await chrome.storage.local.get('jscHeadsUp');
  if (saved.jscHeadsUp === false) return { ok: true, sent: 0 }; // on unless switched off
  try {
    return await sendHeadsUps();
  } catch (e) {
    console.warn('Slotwise: heads-up not sent.', explain(e));
    return { ok: false, message: explain(e) };
  }
}

async function setHeadsUp(on) {
  await chrome.storage.local.set({ jscHeadsUp: !!on });
}

// Both timers always run; each job checks for itself whether it is wanted and connected.
function ensureAlarms() {
  [[REFRESH_ALARM, REFRESH_MINUTES], [HEADSUP_ALARM, HEADSUP_MINUTES]].forEach(function (pair) {
    chrome.alarms.get(pair[0], function (existing) {
      if (!existing) chrome.alarms.create(pair[0], { periodInMinutes: pair[1] });
    });
  });
}
ensureAlarms();
chrome.runtime.onInstalled.addListener(ensureAlarms);
chrome.runtime.onStartup.addListener(ensureAlarms);

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === REFRESH_ALARM) refreshIfWanted();
  if (alarm.name === HEADSUP_ALARM) headsUpIfWanted();
});

var handlers = {
  'jsc-jira': function (message) {
    return jiraFetch(message.site, message.path);
  },
  'jsc-google-status': async function () {
    var saved = await chrome.storage.local.get(['jscAuto', 'jscHeadsUp', 'jscHeadsUpLog']);
    return { registered: isRegistered(), connected: !!(await googleToken(false)), auto: saved.jscAuto !== false,
      headsUp: saved.jscHeadsUp !== false, lastHeadsUp: (saved.jscHeadsUpLog || [])[0] || null,
      debug: { auth: lastAuth, google: lastGoogle, version: chrome.runtime.getManifest().version } };
  },
  'jsc-google-connect': async function () {
    var token = await googleToken(true);
    if (token) headsUpIfWanted();
    return { ok: !!token, message: token ? '' : 'Google Calendar was not connected.' };
  },
  'jsc-google-disconnect': function () {
    return disconnectGoogle();
  },
  'jsc-plan': async function () {
    var result = await planSprint({});
    await chrome.storage.local.set({ jscPlanned: true }); // from now on the plan follows Jira
    return result;
  },
  // The plan as a list, for the panel to place through Google's own page
  // when Google Calendar is not connected. `skip` holds tickets already placed.
  'jsc-plan-preview': async function (message) {
    var site = JSC.normalizeSite((await chrome.storage.local.get('jscSite')).jscSite);
    if (!site) throw new Error('no-site');
    var settings = await planSettings(site);
    var jira = withoutTickets(await readJira(site, settings.scope), message.skip || []);
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
  'jsc-headsup': async function (message) {
    await setHeadsUp(message.on);
    return message.on ? headsUpIfWanted() : { ok: true, sent: 0 };
  },
  // For the person building Slotwise: reload a hand-loaded copy without opening the extensions page.
  'jsc-dev-reload': async function () {
    if ('update_url' in chrome.runtime.getManifest()) return { ok: false };
    setTimeout(function () { chrome.runtime.reload(); }, 100);
    return { ok: true };
  },
  'jsc-debug': async function (message) {
    var out = { auth: lastAuth, google: lastGoogle, version: chrome.runtime.getManifest().version };
    if (message.run === 'headsup') { try { out.result = await sendHeadsUps(); } catch (e) { out.error = String(e && e.message || e); } }
    if (message.run === 'reset') await chrome.storage.local.remove('jscHeadsUpDone');
    if (message.run === 'token') { out.token = !!(await googleToken(false)); out.auth = lastAuth; }
    out.google = lastGoogle;
    return out;
  },
  'jsc-opened': async function () {
    refreshIfWanted(); // Calendar was opened: catch up in the background
    headsUpIfWanted();
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
