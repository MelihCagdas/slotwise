// Browser tests: the real extension, in a real Chromium, used the way a
// person uses it. Run with `npm run test:e2e`. See harness.js for the set-up.
const { test } = require('node:test');
const assert = require('node:assert');
const { open, issue } = require('./harness.js');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
const now = new Date();
const weekDay = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + n);
const TUE = ymd(weekDay(2));
const WED = ymd(weekDay(3));

// Places on the stand-in calendar (see harness.js): Tuesday's column, at 10:00, and so on.
const AT = { tue10: { x: 410, y: 226 }, tueAllDay: { x: 410, y: 95 }, tue2330: { x: 410, y: 700 },
  month10: { x: 410, y: 229 }, topBar: { x: 410, y: 20 } };

async function until(check, what, ms) {
  const end = Date.now() + (ms || 15000);
  let last;
  while (Date.now() < end) {
    try { last = await check(); if (last) return last; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timed out waiting for: ' + what + ' (last: ' + last + ')');
}

async function useSite(b, site) {
  await b.page.fill('#jsc-site-input', site);
  await b.page.click('.jsc-setup button[type=submit]');
  await until(() => b.page.locator('.jsc-ticket').count(), 'tickets in the panel');
}

async function drag(b, key, to) {
  await b.page.locator('.jsc-ticket', { hasText: key }).first().dragTo(b.page.locator('body'), { targetPosition: to });
}

const text = (b, selector) => b.page.locator(selector).allTextContents();
const idle = (b) => until(() => b.page.evaluate(() => !sessionStorage.getItem('jsc-pending')), 'placing to finish', 90000);

/** Runs one test in a fresh browser and checks nothing broke quietly. */
function browserTest(name, options, body) {
  test(name, { timeout: 180000 }, async () => {
    const b = await open(options);
    try {
      await b.goto(options.view || 'week');
      await body(b);
      assert.deepEqual(b.errors, [], 'no script errors on the page');
      assert.deepEqual(b.outside, [], 'nothing was sent anywhere but Jira and the calendar');
    } finally { await b.close(); }
  });
}

// ---- First run, and what is remembered ------------------------------------

browserTest('first run: asks for the address, refuses a wrong one, shows the sample tickets for "demo"', {}, async (b) => {
  assert.equal(await b.page.locator('.jsc-setup').isVisible(), true);
  await b.page.fill('#jsc-site-input', 'not a jira address');
  await b.page.click('.jsc-setup button[type=submit]');
  assert.match((await text(b, '.jsc-setup .jsc-problem')).join(), /your-team\.atlassian\.net/);
  await useSite(b, '  DEMO ');
  assert.deepEqual(await text(b, '.jsc-heading:visible'), ['This sprint 6', 'Your other tickets 4']);
  assert.equal(await b.page.locator('.jsc-ticket.jsc-doing').count(), 2);
  assert.equal(await b.page.locator('.jsc-ticket.jsc-review').count(), 1);
  assert.equal(await b.page.locator('.jsc-ticket.jsc-todo').count(), 7);
  assert.equal(b.jiraCalls.length, 0, 'the sample tickets never call Jira');
});

browserTest('the address, the folded state and the settings survive a reload; Change asks again', {}, async (b) => {
  await useSite(b, 'https://Acme.atlassian.net/jira/software/projects/WEB/boards/7');
  assert.deepEqual(await text(b, '.jsc-site'), ['acme.atlassian.net']);
  await b.page.click('#jsc-customise');
  await b.page.selectOption('#jsc-drop', '90');
  await b.page.click('.jsc-day[title=Saturday]');
  await b.page.click('#jsc-collapse');
  await b.page.reload();
  await b.page.waitForSelector('#jsc-root.jsc-closed', { state: 'attached' });
  await b.page.click('.jsc-toggle');
  await until(() => b.page.locator('.jsc-ticket').count(), 'tickets after reload');
  await b.page.click('#jsc-customise');
  assert.equal(await b.page.inputValue('#jsc-drop'), '90');
  assert.equal(await b.page.getAttribute('.jsc-day[title=Saturday]', 'aria-pressed'), 'true');
  await b.page.click('button:text-is("Done")');
  await b.page.click('#jsc-change');
  assert.equal(await b.page.locator('.jsc-setup').isVisible(), true);
});

browserTest('the panel follows a dark calendar', { calendar: { dark: true } }, async (b) => {
  assert.equal(await b.page.locator('#jsc-root.jsc-dark').count(), 1);
});

// ---- Reading Jira ----------------------------------------------------------

browserTest('Jira: sprint tickets and other tickets are listed apart', {}, async (b) => {
  await useSite(b, 'acme.atlassian.net');
  assert.deepEqual(await text(b, '.jsc-heading:visible'), ['This sprint 2', 'Your other tickets 1']);
  assert.equal(await b.page.getAttribute('.jsc-key >> nth=0', 'href'), 'https://acme.atlassian.net/browse/WEB-1');
});

browserTest('Jira: signed out says so and offers the way to sign in', { jira: { myself: { status: 401, body: {} } } }, async (b) => {
  await b.page.fill('#jsc-site-input', 'acme.atlassian.net');
  await b.page.click('.jsc-setup button[type=submit]');
  await until(async () => /not signed in to Jira/.test((await text(b, '.jsc-status:visible')).join()), 'the signed-out message');
  assert.equal(await b.page.getAttribute('.jsc-link:visible', 'href'), 'https://acme.atlassian.net');
});

browserTest('Jira: a sign-in page instead of data is reported, not shown as "no tickets"', { jira: { html: true } }, async (b) => {
  await b.page.fill('#jsc-site-input', 'acme.atlassian.net');
  await b.page.click('.jsc-setup button[type=submit]');
  await until(async () => (await text(b, '.jsc-status.jsc-problem:visible')).length, 'a problem message');
  assert.doesNotMatch((await text(b, '.jsc-status:visible')).join(), /No open tickets/);
});

browserTest('Jira: a failing search is reported, not shown as "no tickets"', { jira: { searchStatus: 500 } }, async (b) => {
  await b.page.fill('#jsc-site-input', 'acme.atlassian.net');
  await b.page.click('.jsc-setup button[type=submit]');
  await until(async () => (await text(b, '.jsc-status.jsc-problem:visible')).length, 'a problem message');
  assert.doesNotMatch((await text(b, '.jsc-status:visible')).join(), /No open tickets/);
});

browserTest('Jira: a site without sprints shows one list, and Auto-plan still works', { jira: { noSprints: true } }, async (b) => {
  await useSite(b, 'acme.atlassian.net');
  assert.deepEqual(await text(b, '.jsc-heading:visible'), ['Your open tickets 3']);
  await b.page.click('#jsc-plan');
  await until(async () => (await b.events()).length === 3, 'three events');
  await idle(b);
  assert.deepEqual((await b.events()).map((e) => e.title.split(' ')[0]).sort(), ['WEB-1', 'WEB-2', 'WEB-9']);
});

browserTest('Jira: nobody has tickets says so plainly', { jira: { sprint: [], other: [] } }, async (b) => {
  await b.page.fill('#jsc-site-input', 'acme.atlassian.net');
  await b.page.click('.jsc-setup button[type=submit]');
  await until(async () => /No open tickets assigned to you/.test((await text(b, '.jsc-status:visible')).join()), 'the empty message');
});

// ---- Search ----------------------------------------------------------------

browserTest('search: filters the lists, finds more in Jira, and says when nothing matches',
  { jira: { search: [issue('OPS-77', 'Rotate the keys', 'To Do', 'new', null)] } }, async (b) => {
    await useSite(b, 'acme.atlassian.net');
    await b.page.fill('#jsc-search', 'second');
    assert.deepEqual(await text(b, '.jsc-ticket .jsc-key'), ['WEB-2']);
    await b.page.fill('#jsc-search', 'rotate');
    await until(async () => (await text(b, '.jsc-heading:visible')).join() === 'More from Jira 1', 'the Jira result');
    await b.page.fill('#jsc-search', 'fix (login" OR 1=1');
    await new Promise((r) => setTimeout(r, 700));
    await b.page.fill('#jsc-search', '');
    assert.equal(await b.page.locator('.jsc-ticket').count(), 3);
  });

browserTest('search: no match', { jira: { search: [] } }, async (b) => {
  await useSite(b, 'acme.atlassian.net');
  await b.page.fill('#jsc-search', 'zzzzzz');
  await until(async () => /No ticket matches/.test((await text(b, '.jsc-status:visible')).join()), 'the no-match message');
});

// ---- Drag and drop ---------------------------------------------------------

browserTest('drop on an hour: a one-hour event at that time, saved, and back in the week', {}, async (b) => {
  await useSite(b, 'demo');
  await drag(b, 'APP-212', AT.tue10);
  await until(async () => (await b.events()).length === 1, 'the event');
  await idle(b);
  assert.deepEqual(await b.events(), [{ title: 'APP-212 Checkout redesign',
    dates: TUE + 'T100000/' + TUE + 'T110000', details: 'https://example.atlassian.net/browse/APP-212' }]);
  assert.match(b.page.url(), /\/calendar\/u\/0\/r\/week$/);
  await until(() => b.page.locator('.jsc-ticket.jsc-placed', { hasText: 'APP-212' }).count(), 'the "on your calendar" mark');
});

browserTest('drop in the strip under the date: an all-day event', {}, async (b) => {
  await useSite(b, 'demo');
  await drag(b, 'APP-198', AT.tueAllDay);
  await until(async () => (await b.events()).length === 1, 'the event');
  assert.equal((await b.events())[0].dates, TUE + '/' + WED);
});

browserTest('drop late in the evening: the event may run past midnight, never an impossible time', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.evaluate(() => { document.getElementById('scroller').scrollTop = 552; }); // show the evening
  await drag(b, 'APP-198', AT.tue2330);
  await until(async () => (await b.events()).length === 1, 'the event');
  assert.match((await b.events())[0].dates, new RegExp('^' + TUE + 'T2[23]\\d{2}00/(' + TUE + 'T23\\d{2}00|' + WED + 'T00\\d{2}00)$'));
});

browserTest('drop outside the calendar: nothing happens', {}, async (b) => {
  await useSite(b, 'demo');
  await drag(b, 'APP-198', AT.topBar);
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(await b.events(), []);
  assert.match(b.page.url(), /\/r\/week$/);
});

browserTest('month view: a drop makes an all-day event and returns to the month', { view: 'month' }, async (b) => {
  await useSite(b, 'demo');
  await drag(b, 'APP-205', AT.month10);
  await until(async () => (await b.events()).length === 1, 'the event');
  await idle(b);
  const day10 = new Date(now.getFullYear(), now.getMonth(), 10);
  const day11 = new Date(now.getFullYear(), now.getMonth(), 11);
  assert.equal((await b.events())[0].dates, ymd(day10) + '/' + ymd(day11));
  assert.match(b.page.url(), /\/r\/month$/);
});

browserTest('Google Calendar in another language: the drop is still saved', { calendar: { titleLabel: 'Başlık' } }, async (b) => {
  await useSite(b, 'demo');
  await drag(b, 'APP-212', AT.tue10);
  await until(async () => (await b.events()).length === 1, 'the event');
});

browserTest('a second Google account: the event goes to that account and returns there', { account: 2 }, async (b) => {
  await useSite(b, 'demo');
  const seen = [];
  b.page.on('framenavigated', (f) => seen.push(f.url()));
  await drag(b, 'APP-212', AT.tue10);
  await until(async () => (await b.events()).length === 1, 'the event');
  await idle(b);
  assert.ok(seen.some((u) => u.indexOf('/calendar/u/2/r/eventedit') !== -1), 'opened account 2: ' + seen.join(' '));
  assert.match(b.page.url(), /\/calendar\/u\/2\/r\/week$/);
});

browserTest('the chosen length is used for a dropped ticket', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.click('#jsc-customise');
  await b.page.selectOption('#jsc-drop', '30');
  await b.page.click('button:text-is("Done")');
  await drag(b, 'APP-212', AT.tue10);
  await until(async () => (await b.events()).length === 1, 'the event');
  assert.equal((await b.events())[0].dates, TUE + 'T100000/' + TUE + 'T103000');
});

browserTest('awkward ticket names are saved exactly and never run as code', { jira: { sprint: [
  issue('WEB-1', 'Fix  "quotes" & <img src=x onerror=window.__hacked=1> 100% + émoji 🚀 /?x=1#y', 'In Progress', 'indeterminate'),
  issue('WEB-2', 'L' + 'o'.repeat(240) + 'ng', 'To Do', 'new'),
  issue('WEB-3', '', 'To Do', 'new')] } }, async (b) => {
  await useSite(b, 'acme.atlassian.net');
  assert.equal(await b.page.evaluate(() => window.__hacked), undefined);
  assert.equal(await b.page.locator('#jsc-root img').count(), 0);
  await drag(b, 'WEB-1', AT.tue10);
  await until(async () => (await b.events()).length === 1, 'the first event');
  await idle(b);
  await drag(b, 'WEB-2', AT.tue10);
  await until(async () => (await b.events()).length === 2, 'the second event');
  await idle(b);
  await drag(b, 'WEB-3', AT.tue10);
  await until(async () => (await b.events()).length === 3, 'the third event');
  const titles = (await b.events()).map((e) => e.title);
  assert.equal(titles[0], 'WEB-1 Fix  "quotes" & <img src=x onerror=window.__hacked=1> 100% + émoji 🚀 /?x=1#y');
  assert.equal(titles[1], 'WEB-2 L' + 'o'.repeat(240) + 'ng');
  assert.equal(titles[2], 'WEB-3');
});

browserTest('"save straight away" off: the person saves, and the ticket is then marked', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.uncheck('#jsc-auto');
  await drag(b, 'APP-212', AT.tue10);
  await b.page.waitForSelector('#xSaveBu');
  await new Promise((r) => setTimeout(r, 2000));
  assert.deepEqual(await b.events(), [], 'nothing is saved for them');
  await b.page.click('#xSaveBu');
  await idle(b);
  await until(() => b.page.locator('.jsc-ticket.jsc-placed', { hasText: 'APP-212' }).count(), 'the mark after their own save');
});

browserTest('"save straight away" off: closing without saving leaves the ticket in the pool', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.uncheck('#jsc-auto');
  await drag(b, 'APP-212', AT.tue10);
  await b.page.waitForSelector('#fake-close');
  await b.page.click('#fake-close');
  await idle(b);
  assert.equal(await b.page.locator('.jsc-ticket.jsc-placed').count(), 0);
  assert.deepEqual(await b.events(), []);
});

browserTest('if the new-event page is not the one Slotwise filled in, it does not press Save and says what to do',
  { calendar: { titleSuffix: ' (changed)' } }, async (b) => {
    await useSite(b, 'demo');
    await drag(b, 'APP-212', AT.tue10);
    await b.page.waitForSelector('#xSaveBu');
    await until(async () => /Save/.test((await text(b, '.jsc-note:visible')).join()), 'a note telling them to press Save', 14000);
    assert.deepEqual(await b.events(), []);
  });

// ---- Auto-plan -------------------------------------------------------------

browserTest('Auto-plan: every sample ticket lands once, as day bars, then there is nothing left to do', { view: 'month' }, async (b) => {
  await useSite(b, 'demo');
  await drag(b, 'APP-198', AT.month10);                    // one by hand first
  await until(async () => (await b.events()).length === 1, 'the hand-placed event');
  await idle(b);
  await b.page.click('#jsc-plan');
  await until(async () => /Placing \d of 7/.test((await text(b, '#jsc-root button')).join()), 'the progress count', 20000);
  await until(async () => (await b.events()).length === 8, 'all eight events', 120000);
  await idle(b);
  const events = await b.events();
  const keys = events.map((e) => e.title.split(' ')[0]);
  assert.deepEqual(keys.slice().sort(), ['APP-198', 'APP-205', 'APP-212', 'APP-220', 'APP-231', 'APP-240', 'APP-251', 'APP-252']);
  events.slice(1).forEach((e) => assert.match(e.dates, /^\d{8}\/\d{8}$/, 'a day bar: ' + e.dates));
  assert.equal(keys[1], 'APP-212', 'what is in progress comes first');
  assert.match(events[1].title, /\(3 pt\)$/);
  assert.match(b.page.url(), /\/r\/month$/, 'back in the view they started from');
  await until(async () => /Every ticket is on your calendar/.test((await text(b, '.jsc-help:visible')).join()), 'the all-placed line');
  await b.page.click('#jsc-root .jsc-foot > .jsc-button');
  await until(async () => /already on your calendar/.test((await text(b, '.jsc-note:visible')).join()), 'the nothing-to-do note');
  assert.equal((await b.events()).length, 8, 'no duplicates');
  await b.page.reload();
  await until(() => b.page.locator('.jsc-ticket.jsc-placed').count().then((n) => n === 8), 'the marks after a reload');
});

browserTest('Auto-plan follows Customise: left-out statuses are not planned', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.click('#jsc-customise');
  await b.page.fill('#jsc-skip', 'to do , In Review');
  await b.page.press('#jsc-skip', 'Tab');
  await b.page.click('button:text-is("Done")');
  await b.page.click('#jsc-plan');
  await until(async () => (await b.events()).length === 2, 'two events', 60000);
  await idle(b);
  assert.deepEqual((await b.events()).map((e) => e.title.split(' ')[0]).sort(), ['APP-198', 'APP-212']);
});

browserTest('Auto-plan with Jira unreachable says so and stays usable', { jira: { searchStatus: 500 } }, async (b) => {
  await b.page.fill('#jsc-site-input', 'acme.atlassian.net');
  await b.page.click('.jsc-setup button[type=submit]');
  await new Promise((r) => setTimeout(r, 1500));
  await b.page.click('#jsc-plan');
  await until(async () => (await text(b, '.jsc-note.jsc-problem:visible')).length, 'a problem note');
  assert.equal(await b.page.locator('#jsc-plan').isEnabled(), true);
});

// ---- After an update --------------------------------------------------------

browserTest('after the extension is updated, an open page says to reload instead of failing silently', {}, async (b) => {
  await useSite(b, 'demo');
  const worker = b.context.serviceWorkers()[0];
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  await b.page.click('#jsc-refresh');
  await until(async () => /Reload this page/.test((await text(b, '.jsc-status:visible')).join()), 'the reload message');
  await b.page.click('#jsc-plan');
  assert.deepEqual(await b.events(), []);
});

// ---- Interruptions while Auto-plan is placing -------------------------------

browserTest('Auto-plan can be stopped part way; what was placed stays, and it can be finished later', { view: 'month' }, async (b) => {
  await useSite(b, 'demo');
  await b.page.click('#jsc-plan');
  await until(async () => (await b.events()).length >= 2, 'the first two events', 60000);
  await until(() => b.page.locator('#jsc-cover-stop:visible').count(), 'the Stop button on the planning screen');
  await b.page.click('#jsc-cover-stop');
  await until(() => b.page.locator('#jsc-cover').count().then((n) => n === 0), 'the planning screen to go');
  await new Promise((r) => setTimeout(r, 6000));
  const after = (await b.events()).length;
  assert.ok(after < 8, 'it stopped at ' + after);
  assert.match(b.page.url(), /\/r\/month$/, 'back in the view they started from');
  assert.equal(await b.page.evaluate(() => sessionStorage.getItem('jsc-pending')), null);
  await b.page.click('#jsc-root .jsc-foot > .jsc-button');
  await until(async () => (await b.events()).length === 8, 'the rest', 120000);
  await idle(b);
  const keys = (await b.events()).map((e) => e.title.split(' ')[0]);
  assert.equal(new Set(keys).size, 8, 'no ticket twice: ' + keys.join(' '));
});

browserTest('Auto-plan carries on after the page is reloaded part way', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.click('#jsc-plan');
  await until(async () => (await b.events()).length >= 2, 'the first two events', 60000);
  await b.page.reload();
  await until(async () => (await b.events()).length === 8, 'all eight', 120000);
  await idle(b);
  const keys = (await b.events()).map((e) => e.title.split(' ')[0]);
  assert.equal(new Set(keys).size, 8, 'no ticket twice: ' + keys.join(' '));
});

// ---- The planning screen -----------------------------------------------------

browserTest('while tickets are placed, a planning screen hides Google\'s pages and shows progress', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.click('#jsc-plan');
  await until(() => b.page.locator('#jsc-cover').isVisible(), 'the planning screen');
  await until(async () => /Ticket [2-9] of 8/.test(await b.page.locator('.jsc-cover-sub').innerText()), 'progress past the first ticket', 30000);
  // On Google's new-event page the screen is already up, with ticked-off tickets.
  await until(async () => /eventedit/.test(b.page.url()) && await b.page.locator('#jsc-cover').isVisible() &&
    await b.page.locator('.jsc-cover-done').count() > 0, 'the screen over the new-event page', 30000);
  await until(async () => (await b.events()).length === 8, 'all eight', 120000);
  await idle(b);
  await until(() => b.page.locator('#jsc-cover').count().then((n) => n === 0), 'the planning screen to go when it is done');
  assert.equal(await b.page.evaluate(() => sessionStorage.getItem('jsc-cover-shown')), null);
});

browserTest('the planning screen stays away when the person saves for themselves', {}, async (b) => {
  await useSite(b, 'demo');
  await b.page.uncheck('#jsc-auto');
  await drag(b, 'APP-212', AT.tue10);
  await b.page.waitForSelector('#xSaveBu');
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await b.page.locator('#jsc-cover').count(), 0);
});
