/**
 * Slotwise, the panel inside Google Calendar.
 *
 * The panel is the pool: your Jira tickets, coloured by status. Drag one
 * onto a day or an hour, or press "Auto-plan my tickets" to spread the tickets
 * that are still in the pool across the coming days. Either way they become ordinary
 * calendar events.
 *
 * Events are created through Google Calendar's own new-event page, or
 * directly when Google Calendar has been connected.
 */
(function () {
  if (window.__jscLoaded) return;
  window.__jscLoaded = true;

  var PENDING_KEY = 'jsc-pending';
  var SPRINT_JQL = 'assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done ORDER BY Rank ASC';
  var OTHER_JQL = 'assignee = currentUser() AND statusCategory != Done AND (sprint is EMPTY OR sprint not in openSprints()) ORDER BY Rank ASC';
  var OPEN_JQL = 'assignee = currentUser() AND statusCategory != Done ORDER BY Rank ASC';

  // The browser's extension services. A test page can supply its own.
  var api = window.__JSC_TEST_API__ || {
    get: function (keys) { return chrome.storage.local.get(keys); },
    set: function (values) { return chrome.storage.local.set(values); },
    send: function (message) { return chrome.runtime.sendMessage(message); },
    jira: function (site, path) {
      return chrome.runtime.sendMessage({ type: 'jsc-jira', site: site, path: path });
    }
  };
  function send(message) {
    return api.send ? Promise.resolve(api.send(message)).catch(function () { return null; }) : Promise.resolve(null);
  }

  var state = {
    site: null, open: true, autoSave: true,
    sprint: [], other: [], found: null, query: '',
    placed: {},                                   // ticket key -> true, for tickets on the calendar
    google: { registered: false, connected: false, auto: false },
    settings: JSC.cleanSettings(null), customising: false,
    dragging: null, busy: false
  };
  var ui = {};

  // ---- Remembering what is on the calendar ----------------------------------

  function markPlaced(key) {
    if (!key || state.placed[key]) return;
    state.placed[key] = true;
    return Promise.resolve(api.get(['jscPlaced'])).then(function (saved) {
      var all = (saved && saved.jscPlaced) || {};
      all[key] = Date.now();
      return api.set({ jscPlaced: all });
    });
  }

  function loadPlaced() {
    return Promise.resolve(api.get(['jscPlaced'])).then(function (saved) {
      state.placed = {};
      Object.keys((saved && saved.jscPlaced) || {}).forEach(function (k) { state.placed[k] = true; });
      return send({ type: 'jsc-placed' });
    }).then(function (res) {
      ((res && res.keys) || []).forEach(function (k) { state.placed[k] = true; });
    });
  }

  // ---- Placing through Google's own new-event page --------------------------
  // A drop, or "Auto-plan my tickets", becomes a queue of events. For each one the
  // watcher opens Google's new-event page filled in, presses Save, and moves
  // on; at the end it returns to the view the person was in. Progress is kept
  // in sessionStorage, so it carries on whether Google swaps the page in
  // place or loads it afresh.

  function readPending() {
    try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; }
  }
  function writePending(p) { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
  function clearPending() { sessionStorage.removeItem(PENDING_KEY); }

  function editorUrl(p, item) {
    return JSC.eventEditUrl(p.base, {
      title: item.title, details: item.details, date: item.date,
      startMin: item.startMin, durationMin: item.minutes || 60, endDate: item.endDate
    });
  }

  function startQueue(items) {
    var p = {
      queue: items, index: 0, stage: 'opening', at: Date.now(), auto: state.autoSave || items.length > 1,
      base: JSC.accountBase(location.pathname),
      returnTo: location.pathname.indexOf('/calendar/') === 0 ? location.pathname : ''
    };
    writePending(p);
    location.assign(editorUrl(p, items[0]));
  }

  function watchPending() {
    var p = readPending();
    if (!p || !p.queue || !p.queue.length) { if (p) clearPending(); return; }
    var now = Date.now();
    if (now - p.at > 600000) { clearPending(); return; }
    var item = p.queue[p.index];

    if (location.pathname.indexOf('/eventedit') !== -1) {
      if (p.stage !== 'editing') { p.stage = 'editing'; p.editAt = now; writePending(p); }
      if (p.auto && !p.pressed) {
        var save = document.getElementById('xSaveBu');
        var title = document.querySelector('input[aria-label="Title"], input[aria-label*="itle"]');
        // Only press Save on the page this extension filled in.
        if (save && title && title.value === item.title) {
          p.pressed = true; p.saved = true; writePending(p);
          save.click();
        } else if (now - p.editAt > 8000) {
          // Not found: leave this one for the person to save, and stop the queue.
          p.pressed = true; p.stopped = true; writePending(p);
        }
      }
      return;
    }

    if (p.stage === 'opening') {
      // The new-event page is not up yet. Google sometimes drops a page change
      // made while it is busy with its own, so ask again a few times.
      if (now - (p.lastTry || p.at) < 4000) return;
      if ((p.tries || 0) >= 4) { clearPending(); render(); return; }
      p.tries = (p.tries || 0) + 1; p.lastTry = now; writePending(p);
      location.assign(editorUrl(p, item));
      return;
    }
    if (p.stage === 'editing') {
      // The new-event page has been left: this one is saved, or was closed.
      if (p.saved) markPlaced(item.key);
      p.stage = 'leaving'; p.leftAt = now; writePending(p);
      return;
    }
    if (p.stage === 'leaving') {
      if (now - p.leftAt < 1500) return; // let Google finish its own move first
      if (!p.stopped && p.index + 1 < p.queue.length) {
        p.index++; p.stage = 'opening'; p.at = now; p.pressed = false; p.saved = false;
        p.tries = 0; p.lastTry = now;
        writePending(p);
        location.assign(editorUrl(p, p.queue[p.index]));
        return;
      }
      p.stage = 'returning'; p.tries = 0; p.lastTry = 0; writePending(p);
      return;
    }
    // Returning: Google shows today after a save. Go back to the view they were in.
    if (!p.returnTo || location.pathname === p.returnTo) { clearPending(); render(); return; }
    if (now - (p.lastTry || 0) < 1200) return;
    if (p.tries >= 4) { clearPending(); render(); return; }
    p.tries++; p.lastTry = now; writePending(p);
    location.assign(p.returnTo);
  }

  // ---- Where a drop lands ---------------------------------------------------

  function scrollParent(el) {
    for (var p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 50 && getComputedStyle(p).overflowY !== 'visible') return p;
    }
    return null;
  }

  /** Returns {date, startMin} for a point on the calendar, or null. startMin null = all day. */
  function slotAt(x, y) {
    // Week and day view: one tall column per day.
    var columns = document.querySelectorAll('[role="gridcell"][data-datekey]');
    for (var i = 0; i < columns.length; i++) {
      var rect = columns[i].getBoundingClientRect();
      if (rect.height < 400 || x < rect.left || x >= rect.right) continue;
      var date = JSC.dateFromKey(columns[i].getAttribute('data-datekey'));
      if (!date) continue;
      var scroller = scrollParent(columns[i]);
      var visibleTop = scroller ? scroller.getBoundingClientRect().top : rect.top;
      if (y < visibleTop) {
        // Above the hours, in the all-day strip under the date.
        return y > visibleTop - 90 ? { date: date, startMin: null } : null;
      }
      if (y > rect.bottom) return null;
      return { date: date, startMin: JSC.minutesFromOffset(y, rect.top, rect.height) };
    }
    // Month view: one box per day.
    var stack = document.elementsFromPoint(x, y);
    for (var j = 0; j < stack.length; j++) {
      var cell = stack[j].closest && stack[j].closest('[data-datekey]');
      if (cell && !ui.root.contains(cell)) {
        var day = JSC.dateFromKey(cell.getAttribute('data-datekey'));
        if (day) return { date: day, startMin: null };
      }
    }
    return null;
  }

  /** The calendar's time zone as '+03:00', read from the label beside the grid. */
  function calendarOffset() {
    var found = null;
    var nodes = document.evaluate("//*[not(*) and starts-with(normalize-space(text()), 'GMT')]",
      document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (var i = 0; i < nodes.snapshotLength; i++) {
      var offset = JSC.gmtOffset(nodes.snapshotItem(i).textContent);
      if (offset) found = offset; // with two time zones shown, the main one is last
    }
    return found;
  }

  function onDragOver(event) {
    if (!state.dragging) return;
    var slot = slotAt(event.clientX, event.clientY);
    if (slot) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      ui.hint.textContent = JSC.formatSlot(slot.date, slot.startMin);
      ui.hint.style.left = (event.clientX + 14) + 'px';
      ui.hint.style.top = (event.clientY + 14) + 'px';
      ui.hint.hidden = false;
    } else {
      ui.hint.hidden = true;
    }
  }

  function onDrop(event) {
    if (!state.dragging) return;
    var ticket = state.dragging;
    var slot = slotAt(event.clientX, event.clientY);
    endDrag();
    if (!slot) return;
    event.preventDefault();
    event.stopPropagation();

    var viaPage = function () {
      startQueue([{ key: ticket.key, title: JSC.ticketTitle(ticket), details: ticket.url,
        date: slot.date, startMin: slot.startMin, minutes: state.settings.dropMinutes }]);
    };
    var offset = slot.startMin === null ? null : calendarOffset();
    if (!state.google.connected || (slot.startMin !== null && !offset)) { viaPage(); return; }

    // Google Calendar is connected: create the event directly.
    setNote('Adding ' + ticket.key + '…');
    send({ type: 'jsc-create', ticket: ticket, date: slot.date, startMin: slot.startMin, offset: offset,
      minutes: state.settings.dropMinutes })
      .then(function (res) {
        if (!res || !res.ok) { viaPage(); return; }
        markPlaced(ticket.key);
        setNote(ticket.key + ' added, ' + JSC.formatSlot(slot.date, slot.startMin) + '.');
        render();
        showOnCalendar(ticket.key);
      });
  }

  /** Google's page does not always show a new event at once; reload if it has not. */
  function showOnCalendar(text) {
    setTimeout(function () {
      var shown = [].some.call(document.querySelectorAll('[data-eventchip]'), function (chip) {
        return chip.textContent.indexOf(text) !== -1;
      });
      if (!shown) location.reload();
    }, 1800);
  }

  function endDrag() {
    state.dragging = null;
    ui.hint.hidden = true;
    ui.root.classList.remove('jsc-dragging');
  }

  // ---- Jira -----------------------------------------------------------------

  function search(jql, max) {
    var path = '/rest/api/3/search/jql?maxResults=' + (max || 50) +
      '&fields=summary,status&jql=' + encodeURIComponent(jql);
    return api.jira(state.site, path).then(function (res) {
      return res && res.ok ? JSC.parseTickets(res.data, JSC.linkBase(state.site)) : null;
    });
  }

  function loadTickets() {
    setStatus('Loading your tickets…');
    return api.jira(state.site, '/rest/api/3/myself').then(function (me) {
      if (!me || !me.ok) {
        state.sprint = []; state.other = [];
        render();
        setStatus(me && (me.status === 401 || me.status === 403)
          ? 'You are not signed in to Jira in this browser.'
          : 'Could not reach Jira. Check the address.', true);
        return;
      }
      return Promise.all([search(SPRINT_JQL), search(OTHER_JQL), loadPlaced()]).then(function (lists) {
        if (lists[0] === null) {
          // This Jira has no sprints: show all open tickets in one list.
          return search(OPEN_JQL).then(function (all) { state.sprint = []; state.other = all || []; });
        }
        state.sprint = lists[0];
        state.other = lists[1] || [];
      }).then(function () {
        setStatus('');
        render();
      });
    }).catch(function () {
      setStatus('Could not reach Jira. Reload the page and try again.', true);
    });
  }

  var searchTimer = null;
  function onSearchInput() {
    state.query = ui.search.value;
    state.found = null;
    render();
    clearTimeout(searchTimer);
    var q = state.query.trim();
    if (q.length < 3 || !state.site) return;
    searchTimer = setTimeout(function () {
      search(JSC.searchJql(q), 15).then(function (found) {
        if (ui.search.value.trim() !== q) return;
        var mine = {};
        state.sprint.concat(state.other).forEach(function (t) { mine[t.key] = true; });
        state.found = (found || []).filter(function (t) { return !mine[t.key]; });
        render();
      });
    }, 350);
  }

  // ---- Auto-plan my tickets -------------------------------------------------

  function planSprint() {
    if (state.busy) return;
    state.busy = true;
    setNote('Reading your tickets…');
    render();
    var done = function (text, isProblem) { state.busy = false; setNote(text, isProblem); render(); };

    if (state.google.connected) {
      send({ type: 'jsc-plan' }).then(function (res) {
        if (!res || !res.ok) { done((res && res.message) || 'Your tickets could not be planned.', true); return; }
        done('Planned ' + res.planned + ' ticket' + (res.planned === 1 ? '' : 's') +
          (res.upcoming ? ' and ' + res.upcoming + ' in coming sprints' : '') +
          (res.byHand ? '. ' + res.byHand + ' you placed yourself stayed put' : '') + '.');
        loadPlaced().then(render);
        if (res.changed) setTimeout(function () { location.reload(); }, 1500);
      });
      return;
    }

    // Not connected: place the tickets still in the pool, one after another,
    // through Google's own new-event page.
    send({ type: 'jsc-plan-preview', skip: Object.keys(state.placed) }).then(function (res) {
      if (!res || !res.ok) { done((res && res.message) || 'Your tickets could not be read.', true); return; }
      if (!res.items.length) { done('Every ticket is already on your calendar.'); return; }
      startQueue(res.items.map(function (item) {
        return { key: item.key, title: item.title, details: item.description,
          date: item.startDate, endDate: item.endDate, startMin: null };
      }));
    });
  }

  // ---- The panel ------------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text, onClick) {
    var b = el('button', className, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function setStatus(text, isProblem) {
    ui.status.textContent = text;
    ui.status.hidden = !text;
    ui.status.classList.toggle('jsc-problem', !!isProblem);
    ui.signin.hidden = !(isProblem && state.site && state.site !== JSC.DEMO_SITE);
    if (state.site) ui.signin.href = state.site;
  }

  function setNote(text, isProblem) {
    ui.note.textContent = text || '';
    ui.note.hidden = !text;
    ui.note.classList.toggle('jsc-problem', !!isProblem);
  }

  function ticketRow(ticket) {
    var kind = JSC.statusKind(ticket);
    var row = el('li', 'jsc-ticket jsc-' + kind + (state.placed[ticket.key] ? ' jsc-placed' : ''));
    row.draggable = true;
    row.title = 'Drag onto the calendar';
    var top = el('div', 'jsc-ticket-top');
    var link = el('a', 'jsc-key', ticket.key);
    link.href = ticket.url; link.target = '_blank'; link.rel = 'noopener';
    link.draggable = false;
    top.appendChild(link);
    top.appendChild(el('span', 'jsc-pill', ticket.status || 'No status'));
    row.appendChild(top);
    row.appendChild(el('div', 'jsc-summary', ticket.summary));
    if (state.placed[ticket.key]) row.appendChild(el('div', 'jsc-onc', '✓ On your calendar'));
    row.addEventListener('dragstart', function (event) {
      state.dragging = ticket;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', JSC.ticketTitle(ticket));
      // Let the calendar show through while dragging.
      setTimeout(function () { ui.root.classList.add('jsc-dragging'); }, 0);
    });
    row.addEventListener('dragend', endDrag);
    return row;
  }

  function section(title, tickets) {
    var frag = document.createDocumentFragment();
    if (!tickets.length) return frag;
    frag.appendChild(el('h3', 'jsc-heading', title + ' (' + tickets.length + ')'));
    var list = el('ul', 'jsc-list');
    tickets.forEach(function (t) { list.appendChild(ticketRow(t)); });
    frag.appendChild(list);
    return frag;
  }

  function render() {
    ui.root.classList.toggle('jsc-closed', !state.open);
    ui.toggle.textContent = state.open ? '›' : 'Slotwise';
    ui.toggle.title = state.open ? 'Hide Jira tickets' : 'Show Jira tickets';
    ui.setup.hidden = !!state.site;
    ui.main.hidden = !state.site;
    if (!state.site) return;

    fillCustomise();
    ui.site.textContent = state.site === JSC.DEMO_SITE ? 'Sample tickets' : state.site.replace('https://', '');
    ui.lists.textContent = '';
    var sprint = JSC.filterTickets(state.sprint, state.query);
    var other = JSC.filterTickets(state.other, state.query);
    ui.lists.appendChild(section('This sprint', sprint));
    ui.lists.appendChild(section(state.sprint.length ? 'Your other tickets' : 'Your open tickets', other));
    if (state.found && state.found.length) ui.lists.appendChild(section('More from Jira', state.found));
    var nothing = !sprint.length && !other.length && !(state.found && state.found.length);
    ui.empty.hidden = !nothing || !ui.status.hidden;
    ui.empty.textContent = state.query.trim() ? 'No ticket matches.' : 'No open tickets assigned to you.';

    // Customise
    ui.custom.hidden = !state.customising;
    ui.lists.hidden = state.customising;
    ui.search.hidden = state.customising;
    ui.legend.hidden = state.customising;
    if (state.customising) ui.empty.hidden = true;
    ui.customise.textContent = state.customising ? 'Done' : 'Customise';

    // Auto-plan my tickets
    var pending = readPending();
    var placing = pending && pending.queue && pending.queue.length > 1;
    ui.plan.disabled = state.busy || !!placing;
    ui.plan.textContent = placing
      ? 'Placing ' + (pending.index + 1) + ' of ' + pending.queue.length + '…'
      : state.busy ? 'Planning…' : 'Auto-plan my tickets';
    var pool = state.settings.scope === 'all' || !state.sprint.length ? state.sprint.concat(state.other) : state.sprint;
    var inPool = pool.filter(function (t) { return !state.placed[t.key]; }).length;
    ui.planHelp.textContent = pool.length
      ? (inPool ? inPool + ' ticket' + (inPool === 1 ? ' is' : 's are') + ' not on your calendar yet.'
        : 'Every ticket is on your calendar.')
      : 'Spreads your tickets across the coming working days.';

    // Google Calendar connection
    ui.connect.hidden = !state.google.registered || state.google.connected;
    ui.autoRow.hidden = !state.google.connected;
    ui.keep.checked = state.google.auto;
    ui.saveRow.hidden = state.google.connected; // drops are instant once connected
    ui.auto.checked = state.autoSave;
    ui.forget.hidden = state.google.connected || !Object.keys(state.placed).length;
  }

  // ---- Customise ------------------------------------------------------------

  function saveSettings(change) {
    state.settings = JSC.cleanSettings(Object.assign({}, state.settings, change));
    api.set({ jscSettings: state.settings });
    render();
  }

  function field(labelText, control, help) {
    var wrap = el('div', 'jsc-field');
    var label = el('label', 'jsc-label', labelText);
    if (control.id) label.htmlFor = control.id;
    wrap.appendChild(label);
    wrap.appendChild(control);
    if (help) wrap.appendChild(el('div', 'jsc-help', help));
    return wrap;
  }

  function select(id, options, onChange) {
    var s = el('select', 'jsc-input'); s.id = id;
    options.forEach(function (o) {
      var opt = el('option', '', o[1]); opt.value = o[0];
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function buildCustomise() {
    var box = el('div', 'jsc-custom'); box.hidden = true;
    box.appendChild(el('div', 'jsc-heading', 'Customise'));

    ui.setScope = select('jsc-scope', [['sprint', 'My current sprint'], ['all', 'All my open tickets']],
      function (v) { saveSettings({ scope: v }); loadPlaced().then(render); });
    box.appendChild(field('Auto-plan uses', ui.setScope));

    var days = el('div', 'jsc-days'); days.id = 'jsc-days';
    ui.setDays = [];
    [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']].forEach(function (d) {
      var b = button('jsc-day', d[1], function () {
        var on = state.settings.workingDays.indexOf(d[0]) !== -1;
        var next = state.settings.workingDays.filter(function (x) { return x !== d[0]; });
        if (!on) next.push(d[0]);
        if (next.length) saveSettings({ workingDays: next });
      });
      b.title = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d[0]];
      ui.setDays.push([d[0], b]);
      days.appendChild(b);
    });
    box.appendChild(field('Working days', days));

    ui.setFirst = el('input', 'jsc-input'); ui.setFirst.id = 'jsc-first';
    ui.setFirst.addEventListener('change', function () { saveSettings({ activeStatuses: ui.setFirst.value }); });
    box.appendChild(field('Statuses that go first', ui.setFirst, 'Separate several with commas.'));

    ui.setSkip = el('input', 'jsc-input'); ui.setSkip.id = 'jsc-skip'; ui.setSkip.placeholder = 'For example: Ready for QA';
    ui.setSkip.addEventListener('change', function () { saveSettings({ skipStatuses: ui.setSkip.value }); });
    box.appendChild(field('Statuses to leave out', ui.setSkip));

    ui.setSpread = el('input', 'jsc-input'); ui.setSpread.id = 'jsc-spread';
    ui.setSpread.type = 'number'; ui.setSpread.min = '1'; ui.setSpread.max = '60';
    ui.setSpread.addEventListener('change', function () { saveSettings({ fallbackDays: ui.setSpread.value }); });
    box.appendChild(field('With no sprint, spread over', ui.setSpread, 'Working days.'));

    ui.setDrop = select('jsc-drop', [[30, '30 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours']],
      function (v) { saveSettings({ dropMinutes: v }); });
    box.appendChild(field('A dropped ticket lasts', ui.setDrop));
    return box;
  }

  function fillCustomise() {
    var s = state.settings;
    ui.setScope.value = s.scope;
    ui.setDays.forEach(function (pair) {
      var on = s.workingDays.indexOf(pair[0]) !== -1;
      pair[1].classList.toggle('jsc-on', on);
      pair[1].setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (document.activeElement !== ui.setFirst) ui.setFirst.value = s.activeStatuses.join(', ');
    if (document.activeElement !== ui.setSkip) ui.setSkip.value = s.skipStatuses.join(', ');
    if (document.activeElement !== ui.setSpread) ui.setSpread.value = s.fallbackDays;
    ui.setDrop.value = String(s.dropMinutes);
  }

  function build() {
    ui.root = el('div'); ui.root.id = 'jsc-root';
    // Match Google Calendar's own light or dark theme, not the computer's.
    var rgb = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255]).map(Number);
    if ((rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 110) ui.root.classList.add('jsc-dark');

    ui.toggle = button('jsc-toggle', '', function () {
      state.open = !state.open;
      api.set({ jscOpen: state.open });
      render();
    });
    ui.root.appendChild(ui.toggle);

    var panel = el('div', 'jsc-panel');
    var brand = el('div', 'jsc-title', 'Slotwise');
    brand.appendChild(el('span', 'jsc-subtitle', 'Jira tickets'));
    panel.appendChild(brand);

    // First run: ask for the Jira address.
    ui.setup = el('form', 'jsc-setup');
    ui.setup.appendChild(el('label', 'jsc-label', 'Your Jira address'));
    var siteInput = el('input', 'jsc-input'); siteInput.id = 'jsc-site-input';
    siteInput.placeholder = 'your-team.atlassian.net'; siteInput.autocomplete = 'off';
    ui.setup.appendChild(siteInput);
    var siteError = el('div', 'jsc-status jsc-problem'); siteError.hidden = true;
    ui.setup.appendChild(siteError);
    var show = el('button', 'jsc-button', 'Show my tickets'); show.type = 'submit';
    ui.setup.appendChild(show);
    ui.setup.appendChild(el('p', 'jsc-help', 'It uses the Jira sign-in this browser already has. Nothing is sent anywhere else.'));
    ui.setup.appendChild(el('p', 'jsc-help', 'No Jira to hand? Type demo to try it with sample tickets.'));
    ui.setup.addEventListener('submit', function (event) {
      event.preventDefault();
      var site = JSC.normalizeSite(siteInput.value);
      if (!site) {
        siteError.textContent = 'Enter an address like your-team.atlassian.net, or type demo';
        siteError.hidden = false;
        return;
      }
      siteError.hidden = true;
      state.site = site;
      api.set({ jscSite: site });
      render();
      loadTickets();
    });
    panel.appendChild(ui.setup);

    ui.main = el('div', 'jsc-main');
    ui.search = el('input', 'jsc-input'); ui.search.id = 'jsc-search';
    ui.search.type = 'search'; ui.search.placeholder = 'Search tickets';
    ui.search.addEventListener('input', onSearchInput);
    ui.main.appendChild(ui.search);
    ui.status = el('div', 'jsc-status'); ui.status.hidden = true;
    ui.main.appendChild(ui.status);
    ui.signin = el('a', 'jsc-link', 'Open Jira to sign in, then press Refresh');
    ui.signin.target = '_blank'; ui.signin.rel = 'noopener'; ui.signin.hidden = true;
    ui.main.appendChild(ui.signin);
    ui.lists = el('div', 'jsc-lists');
    ui.main.appendChild(ui.lists);
    ui.empty = el('div', 'jsc-status'); ui.empty.hidden = true;
    ui.main.appendChild(ui.empty);

    var legend = ui.legend = el('div', 'jsc-legend');
    [['todo', 'To do'], ['doing', 'In progress'], ['review', 'In review']].forEach(function (pair) {
      var item = el('span', 'jsc-legend-item jsc-' + pair[0]);
      item.appendChild(el('span', 'jsc-dot'));
      item.appendChild(document.createTextNode(pair[1]));
      legend.appendChild(item);
    });
    ui.main.appendChild(legend);
    ui.custom = buildCustomise();
    ui.main.appendChild(ui.custom);

    var foot = el('div', 'jsc-foot');
    ui.plan = button('jsc-button', 'Auto-plan my tickets', planSprint);
    foot.appendChild(ui.plan);
    ui.planHelp = el('div', 'jsc-help');
    foot.appendChild(ui.planHelp);
    ui.note = el('div', 'jsc-note'); ui.note.hidden = true;
    ui.note.setAttribute('role', 'status');
    foot.appendChild(ui.note);

    ui.connect = button('jsc-text-button jsc-connect', 'Connect Google Calendar for instant drops', function () {
      send({ type: 'jsc-google-connect' }).then(function (res) {
        if (res && res.ok) { state.google.connected = true; loadPlaced().then(render); }
        else setNote((res && res.message) || 'Google Calendar was not connected.', true);
        render();
      });
    });
    foot.appendChild(ui.connect);

    ui.autoRow = el('label', 'jsc-check');
    ui.keep = el('input'); ui.keep.type = 'checkbox'; ui.keep.id = 'jsc-keep';
    ui.keep.addEventListener('change', function () {
      state.google.auto = ui.keep.checked;
      send({ type: 'jsc-auto', on: ui.keep.checked });
    });
    ui.autoRow.appendChild(ui.keep);
    ui.autoRow.appendChild(document.createTextNode(' Keep the plan up to date when Jira changes'));
    foot.appendChild(ui.autoRow);

    ui.saveRow = el('label', 'jsc-check');
    ui.auto = el('input'); ui.auto.type = 'checkbox'; ui.auto.id = 'jsc-auto';
    ui.auto.addEventListener('change', function () {
      state.autoSave = ui.auto.checked;
      api.set({ jscAutoSave: state.autoSave });
    });
    ui.saveRow.appendChild(ui.auto);
    ui.saveRow.appendChild(document.createTextNode(' Save a dropped ticket straight away'));
    foot.appendChild(ui.saveRow);

    var row = el('div', 'jsc-foot-row');
    ui.site = el('span', 'jsc-site');
    row.appendChild(ui.site);
    ui.customise = button('jsc-text-button', 'Customise', function () {
      state.customising = !state.customising;
      render();
    });
    row.appendChild(ui.customise);
    row.appendChild(button('jsc-text-button', 'Refresh', loadTickets));
    row.appendChild(button('jsc-text-button', 'Change', function () {
      state.site = null; state.sprint = []; state.other = [];
      api.set({ jscSite: null });
      render();
    }));
    foot.appendChild(row);
    ui.forget = button('jsc-text-button', 'Clear the "on your calendar" marks', function () {
      state.placed = {};
      api.set({ jscPlaced: {} });
      render();
    });
    foot.appendChild(ui.forget);
    ui.main.appendChild(foot);
    panel.appendChild(ui.main);
    ui.root.appendChild(panel);

    ui.hint = el('div', 'jsc-hint'); ui.hint.hidden = true;
    ui.root.appendChild(ui.hint);
    document.body.appendChild(ui.root);

    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
  }

  function start() {
    build();
    watchPending();
    setInterval(watchPending, 300);
    Promise.resolve(api.get(['jscSite', 'jscOpen', 'jscAutoSave', 'jscSettings'])).then(function (saved) {
      saved = saved || {};
      state.settings = JSC.cleanSettings(saved.jscSettings);
      fillCustomise();
      state.site = JSC.normalizeSite(saved.jscSite) || null;
      state.open = saved.jscOpen !== false;
      state.autoSave = saved.jscAutoSave !== false;
      render();
      return send({ type: 'jsc-google-status' });
    }).then(function (google) {
      if (google) state.google = { registered: !!google.registered, connected: !!google.connected, auto: !!google.auto };
      render();
      if (state.site) loadTickets();
      send({ type: 'jsc-opened' });
    });
  }

  start();
})();
