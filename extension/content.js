/**
 * Slotwise, the panel inside Google Calendar.
 *
 * The panel is the pool: your Jira tickets, coloured by status. Drag one
 * onto a day or an hour, or press "Plan tasks" to spread the tickets
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
  // After the extension is updated or reloaded, a page that was already open
  // keeps this panel but loses its link to the extension: every call throws.
  // `safely` turns that into a quiet failure, and `alive` lets the panel say so.
  function alive() {
    try { return !!chrome.runtime.id; } catch (e) { return false; }
  }
  function safely(call, fallback) {
    return function () {
      var args = arguments;
      return Promise.resolve().then(function () { return call.apply(null, args); })
        .catch(function () { return fallback; });
    };
  }
  var api = window.__JSC_TEST_API__ || {
    get: safely(function (keys) { return chrome.storage.local.get(keys); }, {}),
    set: safely(function (values) { return chrome.storage.local.set(values); }),
    send: safely(function (message) { return chrome.runtime.sendMessage(message); }, null),
    jira: safely(function (site, path) {
      return chrome.runtime.sendMessage({ type: 'jsc-jira', site: site, path: path });
    }, null),
    alive: alive
  };
  function send(message) {
    return api.send ? Promise.resolve(api.send(message)).catch(function () { return null; }) : Promise.resolve(null);
  }
  /** True, with a message in the panel, when this page has lost the extension. */
  function lostExtension() {
    if (!api.alive || api.alive()) return false;
    state.sprint = []; state.other = []; state.found = null; state.busy = false;
    setStatus('Slotwise was updated. Reload this page to carry on.', true);
    ui.signin.hidden = true;
    render();
    return true;
  }

  var state = {
    site: null, open: true, autoSave: true,
    sprint: [], other: [], found: null, query: '',
    placed: {},                                   // ticket key -> true, for tickets on the calendar
    google: { registered: false, connected: false, auto: false, headsUp: false, lastHeadsUp: null },
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
  // A drop, or "Plan tasks", becomes a queue of events. For each one the
  // watcher opens Google's new-event page filled in, presses Save, and moves
  // on; at the end it returns to the view the person was in. Progress is kept
  // in sessionStorage, so it carries on whether Google swaps the page in
  // place or loads it afresh.

  function readPending() {
    try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; }
  }
  function writePending(p) { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
  function clearPending() { sessionStorage.removeItem(PENDING_KEY); }

  function squash(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

  function editorUrl(p, item) {
    return JSC.eventEditUrl(p.base, {
      title: item.title, details: item.details, date: item.date,
      startMin: item.startMin, durationMin: item.minutes || 60, endDate: item.endDate
    });
  }

  function startQueue(items) {
    var p = {
      queue: items, index: 0, stage: 'opening', at: Date.now(), auto: state.autoSave || items.length > 1,
      dark: ui.root.classList.contains('jsc-dark'),
      base: JSC.accountBase(location.pathname),
      returnTo: location.pathname.indexOf('/calendar/') === 0 ? location.pathname : ''
    };
    writePending(p);
    location.assign(editorUrl(p, items[0]));
  }

  var pressedHere = false; // Save was pressed by this copy of the page

  /** Opens the next ticket in the queue, or starts the way back to their view. */
  function advance(p, now) {
    pressedHere = false;
    if (!p.stopped && p.index + 1 < p.queue.length) {
      p.index++; p.stage = 'opening'; p.at = now; p.pressed = false; p.saved = false; p.pressedAt = 0;
      p.tries = 0; p.lastTry = now;
      writePending(p);
      location.assign(editorUrl(p, p.queue[p.index]));
      return;
    }
    p.stage = 'returning'; p.tries = 0; p.lastTry = 0; writePending(p);
  }

  // The planning screen (cover.js) hides Google's new-event pages while tickets are placed.
  var cover = window.__jscCover || null;

  function watchPending() {
    watchQueue();
    if (cover) cover.sync(readPending());
  }

  function watchQueue() {
    var p = readPending();
    if (!p || !p.queue || !p.queue.length) { if (p) clearPending(); return; }
    var now = Date.now();
    if (now - p.at > 600000) { clearPending(); return; }
    var item = p.queue[p.index];

    if (location.pathname.indexOf('/eventedit') !== -1 && p.stage !== 'returning') {
      if (p.stage === 'editing' && p.auto && p.pressed && !p.stopped && !pressedHere) {
        // Save was pressed, then the page was loaded again (a reload at just
        // that moment). The event is saved: move on rather than save it twice.
        markPlaced(item.key);
        advance(p, now);
        return;
      }
      if (p.stage !== 'editing') { p.stage = 'editing'; p.editAt = now; writePending(p); }
      var save = document.getElementById('xSaveBu');
      if (save && !save.__jscWatched) {
        // When the person presses Save themselves, the ticket counts as placed too.
        save.__jscWatched = true;
        save.addEventListener('click', function () {
          var q = readPending();
          if (q) { q.saved = true; writePending(q); }
        });
      }
      if (p.auto && !p.pressed) {
        // Only press Save on the page this extension filled in: one whose title
        // box holds this ticket. The box is found by what it holds, not by its
        // label, because the label is in the person's own language.
        var want = squash(item.title);
        var filled = [].some.call(document.querySelectorAll('input'), function (box) {
          return squash(box.value) === want;
        });
        if (save && filled) {
          p.pressed = true; p.saved = true; p.pressedAt = now; writePending(p);
          pressedHere = true;
          save.click();
        } else if (now - p.editAt > 8000) {
          // Not found: leave this one for the person to save, and stop the queue.
          p.pressed = true; p.stopped = true; writePending(p);
        }
      }
      if (p.pressedAt && !p.stopped && now - p.pressedAt > 15000) {
        // Save was pressed but Google is still on this page: hand it to the person.
        p.stopped = true; p.saved = false; writePending(p);
      }
      if ((!p.auto || p.stopped) && !p.told && save) {
        p.told = true; writePending(p);
        setNote('Check the event, then press Save to add ' + item.key + '.');
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
      setNote('');
      p.stage = 'leaving'; p.leftAt = now; p.told = false; writePending(p);
      return;
    }
    if (p.stage === 'leaving') {
      if (now - p.leftAt < 1500) return; // let Google finish its own move first
      advance(p, now);
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

  /**
   * The calendar's offset on the day of the drop. The label beside the grid
   * gives today's offset; when the browser is in the same time zone, the
   * browser knows the offset for any other day, summer time included.
   */
  function offsetOn(date, startMin, label) {
    if (!label) return null;
    var fmt = function (minutes) {
      var a = Math.abs(minutes);
      return (minutes < 0 ? '-' : '+') + (a < 600 ? '0' : '') + Math.floor(a / 60) + ':' + (a % 60 < 10 ? '0' : '') + (a % 60);
    };
    if (fmt(-new Date().getTimezoneOffset()) !== label) return label; // another zone: the label is the best there is
    var p = date.split('-').map(Number);
    return fmt(-new Date(p[0], p[1] - 1, p[2], 0, startMin).getTimezoneOffset());
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
    var offset = slot.startMin === null ? null : offsetOn(slot.date, slot.startMin, calendarOffset());
    if (!state.google.connected || (slot.startMin !== null && !offset)) { viaPage(); return; }

    // Google Calendar is connected: create the event directly.
    setNote('Adding ' + ticket.key + '…');
    var before = chipCount(ticket.key);
    send({ type: 'jsc-create', ticket: ticket, date: slot.date, startMin: slot.startMin, offset: offset,
      minutes: state.settings.dropMinutes })
      .then(function (res) {
        if (!res || !res.ok) { viaPage(); return; }
        markPlaced(ticket.key);
        setNote(ticket.key + ' added, ' + JSC.formatSlot(slot.date, slot.startMin) + '.');
        render();
        showOnCalendar(ticket.key, before);
      });
  }

  /** Google's page does not always show a new event at once; reload if it has not. */
  function chipCount(text) {
    return [].filter.call(document.querySelectorAll('[data-eventchip]'), function (chip) {
      return chip.textContent.indexOf(text) !== -1;
    }).length;
  }
  function showOnCalendar(text, before) {
    setTimeout(function () {
      if (chipCount(text) <= before) location.reload();
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
      if (res && res.ok) return JSC.parseTickets(res.data, JSC.linkBase(state.site));
      // 400 means Jira did not understand the question (a site with no sprints).
      if (res && res.status === 400) return null;
      throw new Error(String((res && res.status) || 0));
    });
  }

  function jiraProblem(status) {
    if (status === 401 || status === 403) return 'You are not signed in to Jira in this browser.';
    if (status === 429) return 'Jira is busy. Wait a minute, then press Refresh.';
    if (status >= 500) return 'Jira has a problem right now (' + status + '). Press Refresh in a minute.';
    if (status === 404) return 'Jira was not found at this address. Press Change to correct it.';
    return 'Could not reach Jira. Check the address and your connection.';
  }

  function loadTickets() {
    if (lostExtension()) return Promise.resolve();
    setStatus('Loading your tickets…');
    var failed = function (status) {
      if (lostExtension()) return;
      state.sprint = []; state.other = [];
      setStatus(jiraProblem(status), true);
      render();
    };
    return api.jira(state.site, '/rest/api/3/myself').then(function (me) {
      if (!me || !me.ok) { failed(me ? me.status : 0); return; }
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
    }).catch(function (error) {
      failed(Number(error && error.message) || 0);
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
      }).catch(function () { /* a search Jira could not answer finds nothing */ });
    }, 350);
  }

  // ---- Plan tasks -------------------------------------------------

  function planSprint() {
    var running = readPending();
    if (running && running.queue && running.queue.length > 1) {
      // Pressed while placing: stop. What is already on the calendar stays.
      // The queue is cut to nothing more to place, and the watcher takes the
      // person back to the view they started in.
      running.queue = [running.queue[running.index]]; running.index = 0;
      running.stage = 'returning'; running.stopped = true; running.tries = 0; running.lastTry = 0;
      running.at = Date.now();
      writePending(running);
      setNote('Stopped. The tickets already placed stay on your calendar.');
      render();
      return;
    }
    if (state.busy || lostExtension()) return;
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

  var SVG = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var node = document.createElementNS(SVG, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  // Line icons, 24 by 24. Drawn here because the calendar page allows no outside files.
  var ICONS = {
    refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5',
      'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
    sliders: ['M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'],
    chevron: ['m9 18 6-6-6-6'],
    search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0', 'm21 21-4.3-4.3'],
    plan: ['M8 2v4', 'M16 2v4', 'M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8', 'M3 10h18', 'M16 19h6', 'M19 16v6'],
    stop: ['M7 7h10v10H7z'],
    check: ['M20 6 9 17l-5-5'],
    edit: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z']
  };
  function icon(name, size) {
    var node = svg('svg', { viewBox: '0 0 24 24', width: size || 16, height: size || 16, fill: 'none',
      stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', 'class': 'jsc-icon' });
    ICONS[name].forEach(function (d) { node.appendChild(svg('path', { d: d })); });
    return node;
  }

  /** The Slotwise mark: a calendar page holding two ticket cards. */
  function logo(size) {
    var node = svg('svg', { viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true', 'class': 'jsc-logo' });
    var rect = function (x, y, w, h, r, fill) {
      node.appendChild(svg('rect', { x: x, y: y, width: w, height: h, rx: r, fill: fill }));
    };
    rect(0, 0, 100, 100, 24, '#0c66e4');
    rect(27, 7, 8, 15, 4, '#fff'); rect(65, 7, 8, 15, 4, '#fff');
    rect(13, 27, 74, 60, 9, '#fff');
    rect(21, 36, 52, 16, 3.5, '#1a73e8'); rect(21, 36, 8.5, 16, 3.5, '#fbbc04');
    rect(35, 60, 44, 16, 3.5, '#34a853'); rect(35, 60, 8.5, 16, 3.5, '#172b4d');
    return node;
  }

  function iconButton(id, name, label, onClick) {
    var b = button('jsc-icon-button', '', onClick);
    b.id = id; b.title = label; b.setAttribute('aria-label', label);
    b.appendChild(icon(name, 17));
    return b;
  }

  function setOpen(open) {
    state.open = open;
    api.set({ jscOpen: open });
    render();
  }

  /** The label and icon of the main button. */
  function setPlan(text, name) {
    ui.plan.textContent = '';
    ui.plan.appendChild(icon(name, 17));
    ui.plan.appendChild(el('span', '', text));
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
    top.appendChild(el('span', 'jsc-dot'));
    var link = el('a', 'jsc-key', ticket.key);
    link.href = ticket.url; link.target = '_blank'; link.rel = 'noopener';
    link.draggable = false;
    top.appendChild(link);
    top.appendChild(el('span', 'jsc-pill', ticket.status || 'No status'));
    row.appendChild(top);
    row.appendChild(el('div', 'jsc-summary', ticket.summary));
    if (state.placed[ticket.key]) {
      var onc = el('div', 'jsc-onc');
      onc.appendChild(icon('check', 13));
      onc.appendChild(el('span', '', 'On your calendar'));
      row.appendChild(onc);
    }
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
    var heading = el('h3', 'jsc-heading', title + ' ');
    heading.appendChild(el('span', 'jsc-count', String(tickets.length)));
    frag.appendChild(heading);
    var list = el('ul', 'jsc-list');
    tickets.forEach(function (t) { list.appendChild(ticketRow(t)); });
    frag.appendChild(list);
    return frag;
  }

  function render() {
    ui.root.classList.toggle('jsc-closed', !state.open);
    ui.refresh.hidden = ui.customise.hidden = !state.site;
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
    ui.searchWrap.hidden = state.customising;
    ui.legend.hidden = state.customising;
    if (state.customising) ui.empty.hidden = true;
    ui.customise.classList.toggle('jsc-active', state.customising);
    ui.customise.setAttribute('aria-pressed', state.customising ? 'true' : 'false');

    // Plan tasks
    var pending = readPending();
    var placing = pending && pending.queue && pending.queue.length > 1;
    ui.plan.disabled = state.busy;
    ui.plan.classList.toggle('jsc-stop', !!placing);
    if (placing) setPlan('Placing ' + (pending.index + 1) + ' of ' + pending.queue.length + ' · Stop', 'stop');
    else setPlan(state.busy ? 'Planning…' : 'Plan tasks', 'plan');
    var pool = state.settings.scope === 'all' || !state.sprint.length ? state.sprint.concat(state.other) : state.sprint;
    var inPool = pool.filter(function (t) { return !state.placed[t.key]; }).length;
    ui.planHelp.textContent = pool.length
      ? (inPool ? inPool + ' ticket' + (inPool === 1 ? ' is' : 's are') + ' not on your calendar yet.'
        : 'Every ticket is on your calendar.')
      : 'Spreads your tickets across the coming working days.';

    // Google Calendar connection
    ui.connect.hidden = !state.google.registered || state.google.connected;
    ui.connectHelp.hidden = ui.connect.hidden;
    ui.autoRow.hidden = !state.google.connected;
    ui.keep.checked = state.google.auto;
    ui.headsRow.hidden = !state.google.connected;
    ui.autoBox.hidden = !state.google.connected;
    ui.heads.checked = state.google.headsUp;
    var lastNote = state.google.lastHeadsUp;
    ui.headsLast.hidden = !state.google.connected || !state.google.headsUp || !lastNote;
    if (lastNote) ui.headsLast.textContent = 'Last heads-up: ' + lastNote.to + ', about ' + lastNote.meeting + '.';
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
    box.appendChild(field('Plan tasks uses', ui.setScope));

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
    ui.autoRow = el('label', 'jsc-check');
    ui.keep = el('input'); ui.keep.type = 'checkbox'; ui.keep.id = 'jsc-keep';
    ui.keep.addEventListener('change', function () {
      state.google.auto = ui.keep.checked;
      send({ type: 'jsc-auto', on: ui.keep.checked });
    });
    ui.autoRow.appendChild(ui.keep);
    ui.autoRow.appendChild(document.createTextNode(' Keep my plan up to date when Jira changes'));

    ui.headsRow = el('label', 'jsc-check');
    ui.heads = el('input'); ui.heads.type = 'checkbox'; ui.heads.id = 'jsc-heads';
    ui.heads.addEventListener('change', function () {
      state.google.headsUp = ui.heads.checked;
      send({ type: 'jsc-headsup', on: ui.heads.checked }).then(function (res) {
        if (res && res.ok === false) setNote(res.message || 'The heads-up could not be sent.', true);
        else if (res && res.sent) { state.google.lastHeadsUp = res.last; setNote(res.sent + ' heads-up' + (res.sent === 1 ? '' : 's') + ' sent.'); }
        render();
      });
    });
    ui.headsRow.appendChild(ui.heads);
    ui.headsRow.appendChild(document.createTextNode(' Tell people when their meeting lands on a ticket'));
    ui.autoBox = el('div', 'jsc-field');
    ui.autoBox.appendChild(el('div', 'jsc-label', 'Done for you'));
    ui.autoBox.appendChild(ui.autoRow);
    ui.autoBox.appendChild(ui.headsRow);
    box.appendChild(ui.autoBox);
    box.appendChild(button('jsc-button jsc-quiet', 'Done', function () { state.customising = false; render(); }));
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

    // Folded away: a small tab with the logo brings the panel back.
    ui.toggle = button('jsc-toggle', '', function () { setOpen(true); });
    ui.toggle.title = 'Show Slotwise'; ui.toggle.setAttribute('aria-label', 'Show Slotwise');
    ui.toggle.appendChild(logo(26));
    ui.root.appendChild(ui.toggle);

    var panel = el('div', 'jsc-panel');
    var head = el('div', 'jsc-head');
    head.appendChild(logo(28));
    head.appendChild(el('div', 'jsc-title', 'Slotwise'));
    var tools = el('div', 'jsc-tools');
    ui.refresh = iconButton('jsc-refresh', 'refresh', 'Refresh tickets', function () { loadTickets(); });
    ui.customise = iconButton('jsc-customise', 'sliders', 'Customise', function () {
      state.customising = !state.customising;
      render();
    });
    tools.appendChild(ui.refresh);
    tools.appendChild(ui.customise);
    tools.appendChild(iconButton('jsc-collapse', 'chevron', 'Hide Slotwise', function () { setOpen(false); }));
    head.appendChild(tools);
    panel.appendChild(head);

    // First run: ask for the Jira address.
    ui.setup = el('form', 'jsc-setup');
    ui.setup.appendChild(el('p', 'jsc-lead', 'Your Jira tickets, on your calendar.'));
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
    ui.searchWrap = el('div', 'jsc-search');
    ui.searchWrap.appendChild(icon('search', 15));
    ui.searchWrap.appendChild(ui.search);
    ui.main.appendChild(ui.searchWrap);
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
    ui.plan = button('jsc-button jsc-plan', '', planSprint); ui.plan.id = 'jsc-plan';
    setPlan('Plan tasks', 'plan');
    foot.appendChild(ui.plan);
    ui.planHelp = el('div', 'jsc-help');
    foot.appendChild(ui.planHelp);
    ui.note = el('div', 'jsc-note'); ui.note.hidden = true;
    ui.note.setAttribute('role', 'status');
    foot.appendChild(ui.note);

    ui.connect = button('jsc-button jsc-quiet jsc-connect', 'Connect Google Calendar', function () {
      send({ type: 'jsc-google-connect' }).then(function (res) {
        if (res && res.ok) {
          // Connected: the plan keeps itself up to date and heads-ups go out, with nothing to switch on.
          state.google.connected = true; state.google.auto = true; state.google.headsUp = true;
          setNote('Connected. Drops are instant, your plan stays up to date, and people get a heads-up.');
          loadPlaced().then(render);
        }
        else setNote((res && res.message) || 'Google Calendar was not connected.', true);
        send({ type: 'jsc-debug' }).then(function (d) { ui.root.setAttribute('data-debug', JSON.stringify(d || null)); });
        render();
      });
    });
    foot.appendChild(ui.connect);
    ui.connectHelp = el('div', 'jsc-help', 'Instant drops, a plan that follows Jira, and a heads-up to anyone who books over a ticket.');
    foot.appendChild(ui.connectHelp);

    ui.headsLast = el('div', 'jsc-help'); ui.headsLast.hidden = true;
    foot.appendChild(ui.headsLast);

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
    var change = iconButton('jsc-change', 'edit', 'Change the Jira address', function () {
      state.site = null; state.sprint = []; state.other = []; state.customising = false;
      api.set({ jscSite: null });
      render();
    });
    row.appendChild(change);
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

  // For the person building Slotwise: lets a test page ask the extension a question or reload it.
  function devHooks() {
    document.addEventListener('jsc-dev', function (event) {
      var ask = String((event && event.detail) || '');
      var message = ask === 'reload' ? { type: 'jsc-dev-reload' } : { type: 'jsc-debug', run: ask };
      send(message).then(function (res) { ui.root.setAttribute('data-debug', JSON.stringify(res || null)); });
    });
  }

  function start() {
    build();
    devHooks();
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
      if (google) {
        state.google = { registered: !!google.registered, connected: !!google.connected, auto: !!google.auto,
          headsUp: !!google.headsUp, lastHeadsUp: google.lastHeadsUp || null };
        ui.root.setAttribute('data-debug', JSON.stringify(google.debug || null));
      }
      render();
      if (state.site) loadTickets();
      send({ type: 'jsc-opened' });
    });
  }

  start();
})();
