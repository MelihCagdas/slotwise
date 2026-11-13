/**
 * Slotwise, the planning screen.
 *
 * Placing a ticket goes through Google Calendar's own new-event page, one
 * page load for every ticket. This file covers that with a calm screen: the
 * logo, a progress bar, the tickets ticking off, and a Stop button. It runs
 * before the page is drawn, so the pages behind it are never seen.
 */
(function () {
  if (window.__jscCover) return;

  var KEY = 'jsc-pending';
  var SHOWN = 'jsc-cover-shown'; // set while the screen is up, so it only "arrives" once
  var SVG = 'http://www.w3.org/2000/svg';
  var el = null, ui = {}, drawn = -1, last = null, leaving = false;

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  /** The screen shows only while Slotwise is saving for the person. */
  function active(p) {
    return !!(p && p.auto && !p.stopped && p.queue && p.queue.length);
  }

  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVG, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function logo(size) {
    var n = svg('svg', { viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true' });
    [[0, 0, 100, 100, 24, '#0c66e4'], [27, 7, 8, 15, 4, '#fff'], [65, 7, 8, 15, 4, '#fff'], [13, 27, 74, 60, 9, '#fff'],
      [21, 36, 52, 16, 3.5, '#1a73e8'], [21, 36, 8.5, 16, 3.5, '#fbbc04'], [35, 60, 44, 16, 3.5, '#34a853'],
      [35, 60, 8.5, 16, 3.5, '#172b4d']].forEach(function (r) {
      n.appendChild(svg('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: r[4], fill: r[5] }));
    });
    return n;
  }
  function check() {
    var n = svg('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor',
      'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    n.appendChild(svg('path', { d: 'M20 6 9 17l-5-5' }));
    return n;
  }

  function build(p) {
    el = node('div'); el.id = 'jsc-cover';
    el.setAttribute('role', 'status');
    if (p.dark) el.classList.add('jsc-cover-dark');
    if (!sessionStorage.getItem(SHOWN)) el.classList.add('jsc-cover-arrive');
    sessionStorage.setItem(SHOWN, '1');

    var card = node('div', 'jsc-cover-card');
    var head = node('div', 'jsc-cover-head');
    head.appendChild(logo(40));
    var titles = node('div', 'jsc-cover-titles');
    ui.title = node('div', 'jsc-cover-title');
    ui.sub = node('div', 'jsc-cover-sub');
    titles.appendChild(ui.title); titles.appendChild(ui.sub);
    head.appendChild(titles);
    card.appendChild(head);

    ui.track = node('div', 'jsc-cover-track');
    ui.bar = node('div', 'jsc-cover-bar');
    ui.track.appendChild(ui.bar);
    card.appendChild(ui.track);

    ui.rows = node('ul', 'jsc-cover-rows');
    card.appendChild(ui.rows);

    var foot = node('div', 'jsc-cover-foot');
    foot.appendChild(node('span', 'jsc-cover-hint', 'Keep this tab open.'));
    ui.stop = node('button', 'jsc-cover-stop', 'Stop'); ui.stop.type = 'button'; ui.stop.id = 'jsc-cover-stop';
    ui.stop.addEventListener('click', stop);
    foot.appendChild(ui.stop);
    card.appendChild(foot);

    el.appendChild(card);
    (document.body || document.documentElement).appendChild(el);
    drawn = -1;
  }

  function row(item, state) {
    var li = node('li', 'jsc-cover-row jsc-cover-' + state);
    var mark = node('span', 'jsc-cover-mark');
    if (state === 'done') mark.appendChild(check());
    li.appendChild(mark);
    li.appendChild(node('span', 'jsc-cover-name', item.title || item.key));
    return li;
  }

  function draw(p) {
    var n = p.queue.length, i = Math.min(p.index, n - 1);
    var many = n > 1;
    var finished = p.stage === 'returning';
    ui.title.textContent = finished ? 'On your calendar' : many ? 'Planning your tasks' : 'Adding to your calendar';
    ui.sub.textContent = finished ? (many ? n + ' tickets placed' : p.queue[0].key + ' is placed')
      : many ? 'Ticket ' + (i + 1) + ' of ' + n : p.queue[0].key;
    ui.stop.hidden = finished || !many;
    el.classList.toggle('jsc-cover-finished', finished);

    var step = finished ? n : i;
    if (step === drawn) return;
    var first = drawn === -1;
    drawn = step;

    // The bar starts where the last page left it and moves on while this ticket is saved.
    ui.bar.style.transition = 'none';
    ui.bar.style.width = (finished ? 100 : (i / n) * 100) + '%';
    if (!finished) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          ui.bar.style.transition = 'width 2.6s cubic-bezier(.2,.7,.2,1)';
          ui.bar.style.width = ((i + 0.85) / n) * 100 + '%';
        });
      });
    }

    // A window of five tickets around the one being placed.
    ui.rows.textContent = '';
    var from = Math.max(0, Math.min(step - 2, n - 5));
    for (var k = from; k < Math.min(n, from + 5); k++) {
      var state = k < step ? 'done' : k === step ? 'now' : 'next';
      var li = row(p.queue[k], state);
      if (k === step - 1 && !first) li.classList.add('jsc-cover-pop');
      ui.rows.appendChild(li);
    }
    ui.rows.hidden = !many;
  }

  function remove() {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null; leaving = false; drawn = -1;
    sessionStorage.removeItem(SHOWN);
  }

  /** Fades the screen out. `after` waits first, so a finished run can be read. */
  function leave(after) {
    if (!el || leaving) return;
    leaving = true;
    setTimeout(function () {
      if (!el) return;
      el.classList.add('jsc-cover-leave');
      setTimeout(remove, 260);
    }, after || 0);
  }

  /** Shows, updates or removes the screen to match the queue `p` (or null). */
  function sync(p) {
    if (active(p)) {
      if (leaving) return;
      if (!el) build(p);
      draw(p);
      last = p;
      return;
    }
    if (!el) { sessionStorage.removeItem(SHOWN); return; }
    // The queue has ended. A run that reached the end shows "done" for a moment.
    var finished = !p && last && last.stage === 'returning' && !last.stopped;
    leave(finished ? 650 : 0);
  }

  /** Stops the queue: nothing more is placed, and the watcher goes back to their view. */
  function stop() {
    var p = read();
    if (!p || !p.queue || !p.queue.length) return;
    p.queue = [p.queue[Math.min(p.index, p.queue.length - 1)]]; p.index = 0;
    p.stage = 'returning'; p.stopped = true; p.tries = 0; p.lastTry = 0; p.at = Date.now();
    sessionStorage.setItem(KEY, JSON.stringify(p));
    sync(p);
  }

  window.__jscCover = { sync: sync, stop: stop };
  sync(read()); // before the page is drawn
})();
