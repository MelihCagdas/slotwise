/**
 * Jira Sprint Calendar, the panel inside Google Calendar.
 *
 * The panel is the pool: your Jira tickets, coloured by status. Drag one
 * onto a day or an hour, or press "Plan my sprint" to spread the tickets that
 * are still in the pool across the sprint. Either way they become ordinary
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
  // A drop, or "Plan my sprint", becomes a queue of events. For each one the
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
      startMin: item.startMin, durationMin: 60, endDate: item.endDate
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
      if (now - p.at > 15000) clearPending(); // the new-event page never opened
      return;
    }
    if (p.stage === 'editing') {
      // The new-event page has been left: this one is saved, or was closed.
      if (p.saved) markPlaced(item.key);
      p.stage = 'leaving'; p.leftAt = now; writePending(p);
      return;
    }
    if (p.stage === 'leaving') {
      if (now - p.leftAt < 900) return; // let Google finish its own move first
      if (!p.stopped && p.index + 1 < p.queue.length) {
        p.index++; p.stage = 'opening'; p.at = now; p.pressed = false; p.saved = false;
        writePending(p);
        location.assign(editorUrl(p, p.queue[p.index]));
        return;
      }
      p.stage = 'returning'; p.tries = 0; writePending(p);
      return;
    }
    // Returning: Google shows today after a save. Go back to the view they were in.
    if (!p.returnTo || location.pathname === p.returnTo) { clearPending(); render(); return; }
    if (now - (p.lastTry || 0) < 1200) return;
    if (p.tries >= 3) { clearPending(); return; }
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
        date: slot.date, startMin: slot.startMin }]);
    };
    var offset = slot.startMin === null ? null : calendarOffset();
    if (!state.google.connected || (slot.startMin !== null && !offset)) { viaPage(); return; }

    // Google Calendar is connected: create the event directly.
    setNote('Adding ' + ticket.key + '…');
    send({ type: 'jsc-create', ticket: ticket, date: slot.date, startMin: slot.startMin, offset: offset })
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
      return res && res.ok ? JSC.parseTickets(res.data, state.site) : null;
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

  // ---- Plan my sprint -------------------------------------------------------

  function planSprint() {
    if (state.busy) return;
    state.busy = true;
    setNote('Reading your sprint…');
    render();
    var done = function (text, isProblem) { state.busy = false; setNote(text, isProblem); render(); };

    if (state.google.connected) {
      send({ type: 'jsc-plan' }).then(function (res) {
        if (!res || !res.ok) { done((res && res.message) || 'The sprint could not be planned.', true); return; }
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
      if (!res || !res.ok) { done((res && res.message) || 'The sprint could not be read.', true); return; }
      if (!res.items.length) { done('Every sprint ticket is already on your calendar.'); return; }
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
    ui.signin.hidden = !(isProblem && state.site);
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
    ui.toggle.textContent = state.open ? '›' : 'Jira';
    ui.toggle.title = state.open ? 'Hide Jira tickets' : 'Show Jira tickets';
    ui.setup.hidden = !!state.site;
    ui.main.hidden = !state.site;
    if (!state.site) return;

    ui.site.textContent = state.site.replace('https://', '');
    ui.lists.textContent = '';
    var sprint = JSC.filterTickets(state.sprint, state.query);
    var other = JSC.filterTickets(state.other, state.query);
    ui.lists.appendChild(section('This sprint', sprint));
    ui.lists.appendChild(section(state.sprint.length ? 'Your other tickets' : 'Your open tickets', other));
    if (state.found && state.found.length) ui.lists.appendChild(section('More from Jira', state.found));
    var nothing = !sprint.length && !other.length && !(state.found && state.found.length);
    ui.empty.hidden = !nothing || !ui.status.hidden;
    ui.empty.textContent = state.query.trim() ? 'No ticket matches.' : 'No open tickets assigned to you.';

    // Plan my sprint
    var pending = readPending();
    var placing = pending && pending.queue && pending.queue.length > 1;
    ui.plan.disabled = state.busy || !!placing;
    ui.plan.textContent = placing
      ? 'Placing ' + (pending.index + 1) + ' of ' + pending.queue.length + '…'
      : state.busy ? 'Planning…' : 'Plan my sprint';
    var inPool = state.sprint.filter(function (t) { return !state.placed[t.key]; }).length;
    ui.planHelp.textContent = state.sprint.length
      ? (inPool ? inPool + ' sprint ticket' + (inPool === 1 ? ' is' : 's are') + ' not on your calendar yet.'
        : 'Every sprint ticket is on your calendar.')
      : 'Spreads your sprint tickets across the days of the sprint.';

    // Google Calendar connection
    ui.connect.hidden = !state.google.registered || state.google.connected;
    ui.autoRow.hidden = !state.google.connected;
    ui.keep.checked = state.google.auto;
    ui.saveRow.hidden = state.google.connected; // drops are instant once connected
    ui.auto.checked = state.autoSave;
    ui.forget.hidden = state.google.connected || !Object.keys(state.placed).length;
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
    panel.appendChild(el('div', 'jsc-title', 'Jira tickets'));

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
    ui.setup.addEventListener('submit', function (event) {
      event.preventDefault();
      var site = JSC.normalizeSite(siteInput.value);
      if (!site) {
        siteError.textContent = 'Enter an address like your-team.atlassian.net';
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

    var legend = el('div', 'jsc-legend');
    [['todo', 'To do'], ['doing', 'In progress'], ['review', 'In review']].forEach(function (pair) {
      var item = el('span', 'jsc-legend-item jsc-' + pair[0]);
      item.appendChild(el('span', 'jsc-dot'));
      item.appendChild(document.createTextNode(pair[1]));
      legend.appendChild(item);
    });
    ui.main.appendChild(legend);

    var foot = el('div', 'jsc-foot');
    ui.plan = button('jsc-button', 'Plan my sprint', planSprint);
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
    Promise.resolve(api.get(['jscSite', 'jscOpen', 'jscAutoSave'])).then(function (saved) {
      saved = saved || {};
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
