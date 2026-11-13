/**
 * Jira Sprint Calendar, the panel inside Google Calendar.
 * Lists your Jira tickets, lets you search, and lets you drag a ticket onto
 * a day or an hour. The drop opens Google Calendar's own new-event page,
 * already filled in, and saves it. From then on it is an ordinary event.
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
    jira: function (site, path) {
      return chrome.runtime.sendMessage({ type: 'jsc-jira', site: site, path: path });
    }
  };

  var state = { site: null, open: true, autoSave: true, sprint: [], other: [], found: null, query: '', dragging: null };
  var ui = {};

  // ---- Finishing a drop ---------------------------------------------------
  // A drop opens Google's new-event page. This watcher presses Save there,
  // then goes back to the view the drop was made in (Google would otherwise
  // show today). Its progress is kept in sessionStorage, so it carries on
  // whether Google swaps the page in place or loads it afresh.

  function readPending() {
    try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; }
  }
  function writePending(p) { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); }
  function clearPending() { sessionStorage.removeItem(PENDING_KEY); }

  function watchPending() {
    var p = readPending();
    if (!p) return;
    var now = Date.now();
    if (now - p.at > 600000) { clearPending(); return; }

    if (location.pathname.indexOf('/eventedit') !== -1) {
      if (p.stage !== 'editing') { p.stage = 'editing'; p.editAt = now; writePending(p); }
      if (p.auto && !p.pressed) {
        var save = document.getElementById('xSaveBu');
        var title = document.querySelector('input[aria-label="Title"], input[aria-label*="itle"]');
        // Only press Save on the page this extension filled in.
        if (save && title && title.value === p.title) {
          p.pressed = true; writePending(p);
          save.click();
        } else if (now - p.editAt > 8000) {
          p.pressed = true; writePending(p); // not found: leave it for the person to save
        }
      }
      return;
    }

    if (p.stage === 'opening') {
      if (now - p.at > 15000) clearPending(); // the new-event page never opened
      return;
    }
    // The new-event page has been left: saved or closed. Go back.
    if (!p.returnTo || location.pathname === p.returnTo) { clearPending(); return; }
    if (p.stage === 'editing') { p.stage = 'returning'; p.leftAt = now; p.tries = 0; writePending(p); return; }
    if (now - (p.lastTry || p.leftAt) < 1200) return; // let Google finish its own move first
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

    var title = JSC.ticketTitle(ticket);
    var url = JSC.eventEditUrl(JSC.accountBase(location.pathname), {
      title: title,
      details: ticket.url,
      date: slot.date,
      startMin: slot.startMin,
      durationMin: 60
    });
    writePending({
      title: title, at: Date.now(), auto: state.autoSave, stage: 'opening',
      returnTo: location.pathname.indexOf('/calendar/') === 0 ? location.pathname : ''
    });
    location.assign(url);
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
      return Promise.all([search(SPRINT_JQL), search(OTHER_JQL)]).then(function (lists) {
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

  // ---- The panel ------------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(text, isProblem) {
    ui.status.textContent = text;
    ui.status.hidden = !text;
    ui.status.classList.toggle('jsc-problem', !!isProblem);
    ui.signin.hidden = !(isProblem && state.site);
    if (state.site) ui.signin.href = state.site;
  }

  function ticketRow(ticket) {
    var row = el('li', 'jsc-ticket' + (ticket.category === 'indeterminate' ? ' jsc-started' : ''));
    row.draggable = true;
    row.title = 'Drag onto the calendar';
    var top = el('div', 'jsc-ticket-top');
    var link = el('a', 'jsc-key', ticket.key);
    link.href = ticket.url; link.target = '_blank'; link.rel = 'noopener';
    link.draggable = false;
    top.appendChild(link);
    top.appendChild(el('span', 'jsc-status', ticket.status));
    row.appendChild(top);
    row.appendChild(el('div', 'jsc-summary', ticket.summary));
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
    ui.auto.checked = state.autoSave;
    ui.lists.textContent = '';
    var sprint = JSC.filterTickets(state.sprint, state.query);
    var other = JSC.filterTickets(state.other, state.query);
    ui.lists.appendChild(section('This sprint', sprint));
    ui.lists.appendChild(section(state.sprint.length ? 'Your other tickets' : 'Your open tickets', other));
    if (state.found && state.found.length) ui.lists.appendChild(section('More from Jira', state.found));
    var nothing = !sprint.length && !other.length && !(state.found && state.found.length);
    ui.empty.hidden = !nothing || !ui.status.hidden;
    ui.empty.textContent = state.query.trim() ? 'No ticket matches.' : 'No open tickets assigned to you.';
  }

  function build() {
    ui.root = el('div'); ui.root.id = 'jsc-root';
    // Match Google Calendar's own light or dark theme, not the computer's.
    var rgb = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255]).map(Number);
    if ((rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 < 110) ui.root.classList.add('jsc-dark');
    ui.toggle = el('button', 'jsc-toggle'); ui.toggle.type = 'button';
    ui.toggle.addEventListener('click', function () {
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
    var connect = el('button', 'jsc-button', 'Show my tickets'); connect.type = 'submit';
    ui.setup.appendChild(connect);
    ui.setup.appendChild(el('p', 'jsc-note', 'It uses the Jira sign-in this browser already has. Nothing is sent anywhere else.'));
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

    var foot = el('div', 'jsc-foot');
    var autoLabel = el('label', 'jsc-check');
    ui.auto = el('input'); ui.auto.type = 'checkbox'; ui.auto.id = 'jsc-auto';
    ui.auto.addEventListener('change', function () {
      state.autoSave = ui.auto.checked;
      api.set({ jscAutoSave: state.autoSave });
    });
    autoLabel.appendChild(ui.auto);
    autoLabel.appendChild(document.createTextNode(' Save the event straight away'));
    foot.appendChild(autoLabel);
    var row = el('div', 'jsc-foot-row');
    ui.site = el('span', 'jsc-site');
    row.appendChild(ui.site);
    var refresh = el('button', 'jsc-text-button', 'Refresh'); refresh.type = 'button';
    refresh.addEventListener('click', loadTickets);
    row.appendChild(refresh);
    var change = el('button', 'jsc-text-button', 'Change'); change.type = 'button';
    change.addEventListener('click', function () {
      state.site = null; state.sprint = []; state.other = [];
      api.set({ jscSite: null });
      render();
    });
    row.appendChild(change);
    foot.appendChild(row);
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
    watchPending();
    setInterval(watchPending, 300);
    build();
    Promise.resolve(api.get(['jscSite', 'jscOpen', 'jscAutoSave'])).then(function (saved) {
      saved = saved || {};
      state.site = JSC.normalizeSite(saved.jscSite) || null;
      state.open = saved.jscOpen !== false;
      state.autoSave = saved.jscAutoSave !== false;
      render();
      if (state.site) loadTickets();
    });
  }

  start();
})();
