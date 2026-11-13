import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, spring, useVideoConfig} from 'remotion';
import {C, fontFamily, tween, appear, along} from './theme';

// 60 seconds at 30 frames a second.
const HOOK = 120, TITLE = 75, APP = 1230, WHY = 165, START = 210;
export const TOTAL_FRAMES = HOOK + TITLE + APP + WHY + START;

const TICKETS = [
  {key: 'APP-212', summary: 'Checkout redesign', status: 'In Progress', kind: 'doing', pt: 3},
  {key: 'APP-198', summary: 'Fix export bug', status: 'In Progress', kind: 'doing', pt: 1},
  {key: 'APP-205', summary: 'Search filters', status: 'In Review', kind: 'review', pt: 1},
  {key: 'APP-220', summary: 'Audit log', status: 'To Do', kind: 'todo', pt: 3},
  {key: 'APP-231', summary: 'Onboarding emails', status: 'To Do', kind: 'todo', pt: 1},
  {key: 'APP-240', summary: 'Billing page copy', status: 'To Do', kind: 'todo', pt: 1},
];
const KIND = {
  doing: [C.doing, C.doingBg], review: [C.review, C.reviewBg], todo: [C.todo, C.todoBg],
};

const page = {
  fontFamily, color: C.ink,
  background: `radial-gradient(1200px 700px at 15% 0%, #e7efff 0%, rgba(231,239,255,0) 60%), radial-gradient(1000px 700px at 100% 100%, #e9f7ef 0%, rgba(233,247,239,0) 55%), ${C.bg}`,
};
const shadow = '0 24px 60px rgba(16,24,40,.12)';

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const Pill = ({kind, children, size = 15}) => (
  <span style={{background: KIND[kind][1], color: KIND[kind][0], fontSize: size, fontWeight: 700,
    padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap'}}>{children}</span>
);

const TicketCard = ({t, placed = 0, glow = 0, style}) => (
  <div style={{background: C.card, border: `1px solid ${C.line}`, borderLeft: `6px solid ${KIND[t.kind][0]}`,
    borderRadius: 10, padding: '9px 12px', height: 74, boxSizing: 'border-box',
    boxShadow: glow > 0 ? `0 0 0 ${3 * glow}px ${C.blueSoft}` : 'none', ...style}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <span style={{color: C.blue, fontWeight: 700, fontSize: 16}}>{t.key}
        <span style={{color: C.muted, fontWeight: 600, fontSize: 13, marginLeft: 8}}>{t.pt} pt</span></span>
      <Pill kind={t.kind} size={12}>{t.status}</Pill>
    </div>
    <div style={{fontSize: 16, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
      {placed > 0 ? <span style={{color: C.green, fontWeight: 800, opacity: placed, marginRight: 6}}>✓</span> : null}
      {t.summary}
    </div>
  </div>
);

const Cursor = ({x, y, down}) => (
  <svg width="34" height="40" viewBox="0 0 34 40" style={{position: 'absolute', left: x, top: y,
    transform: `scale(${down ? 0.86 : 1})`, transformOrigin: '4px 2px', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,.35))'}}>
    <path d="M4 2 L4 30 L11.5 23.5 L16.5 35 L21.5 33 L16.5 21.5 L27 21.5 Z" fill="#111" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
  </svg>
);

const Caption = ({f, at, until, title, sub}) => {
  const o = Math.min(appear(f, at, 12), 1 - appear(f, until - 10, 10));
  if (o <= 0) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 40, textAlign: 'center', opacity: o,
      transform: `translateY(${(1 - appear(f, at, 14)) * 16}px)`}}>
      <div style={{fontSize: 52, fontWeight: 800, letterSpacing: -1.2}}>{title}</div>
      <div style={{fontSize: 27, color: C.muted, marginTop: 8}}>{sub}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The product: a calendar with the ticket panel beside it
// ---------------------------------------------------------------------------

const STAGE = {w: 1640, h: 790, x: 140, y: 40};
const GUTTER = 70, COL = 250, HEAD = 86, ALLDAY = 74, HOUR = 62, FIRST = 8;
const GRID_TOP = HEAD + ALLDAY;
const PANEL_X = 1340;
const CAL_W = PANEL_X - 20;
const DAYS = [['MON', 16], ['TUE', 17], ['WED', 18], ['THU', 19], ['FRI', 20]];
const MEETINGS = [
  [0, 9, 9.5, 'Standup'], [1, 9, 9.5, 'Standup'], [2, 9, 9.5, 'Standup'], [3, 9, 9.5, 'Standup'], [4, 9, 9.5, 'Standup'],
  [0, 14, 15, 'Sprint planning'], [2, 13, 14, 'Design review'], [3, 11, 12, '1:1'], [4, 15, 16, 'Demo'], [1, 15, 16, 'Customer call'],
];
// What "Plan my sprint" places: [ticket index, first day, days, row]
const PLAN = [[1, 0, 1, 0], [2, 1, 1, 0], [3, 2, 2, 0], [4, 4, 1, 0], [5, 4, 1, 1]];

const colX = (d) => GUTTER + d * COL;
const hourY = (h) => GRID_TOP + (h - FIRST) * HOUR;
const pad = (n) => (n < 10 ? '0' : '') + n;
const clock = (h) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;

/** "Tue 17 Nov, 10:00" for a point on the grid, as the real extension shows it. */
const slotLabel = (x, y) => {
  const d = Math.max(0, Math.min(4, Math.floor((x - GUTTER) / COL)));
  const mins = Math.max(0, Math.floor(((y - GRID_TOP) / HOUR * 60 + FIRST * 60) / 30) * 30);
  return `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d]} ${DAYS[d][1]} Nov, ${clock(mins / 60)}`;
};

// Local timeline of the product part, in frames.
const T = {
  searchMove: 150, type: 180, filter: 201, clear: 268,
  grabMove: 290, press: 326, drop: 400, edgeMove: 430, stretch: 462, stretchEnd: 512,
  planMove: 548, click: 590, bars: [625, 680, 735, 790, 830], planned: 860,
  month: 920, end: APP,
};
const SEARCH_AT = {x: PANEL_X + 150, y: 86};
const ROW_Y = (i) => 128 + i * 84;
const GRAB = {x: PANEL_X + 120, y: ROW_Y(0) + 40};
const DROP = {x: colX(1) + 110, y: hourY(10) + 12};
const EDGE = {x: colX(1) + 120, y: hourY(11) - 4};
const EDGE_END = {x: colX(1) + 120, y: hourY(12.5) - 4};
const PLAN_BTN = {x: PANEL_X + 150, y: 706};

const CURSOR_PATH = [
  {f: 110, x: 900, y: 520}, {f: T.searchMove + 26, ...SEARCH_AT}, {f: T.clear, ...SEARCH_AT},
  {f: T.grabMove + 30, ...GRAB}, {f: T.press + 4, ...GRAB}, {f: T.drop - 4, ...DROP}, {f: T.drop + 16, ...DROP},
  {f: T.edgeMove + 28, ...EDGE}, {f: T.stretch, ...EDGE}, {f: T.stretchEnd, ...EDGE_END}, {f: T.stretchEnd + 20, ...EDGE_END},
  {f: T.planMove + 36, ...PLAN_BTN}, {f: T.planned, ...PLAN_BTN}, {f: T.planned + 50, x: 1180, y: 560},
];

// The camera: how far the view is zoomed in, and on what. {f, s, x, y} with x,y the focus point on the stage.
const CAMERA = [
  {f: 0, s: 1, x: 820, y: 395}, {f: T.searchMove, s: 1, x: 820, y: 395},
  {f: T.searchMove + 34, s: 1.45, x: 1240, y: 270}, {f: T.clear, s: 1.45, x: 1240, y: 270},
  {f: T.grabMove + 34, s: 1.22, x: 980, y: 300}, {f: T.drop + 10, s: 1.22, x: 800, y: 320},
  {f: T.edgeMove + 30, s: 1.6, x: 520, y: 360}, {f: T.stretchEnd + 22, s: 1.6, x: 520, y: 380},
  {f: T.planMove + 36, s: 1, x: 820, y: 395}, {f: T.end, s: 1, x: 820, y: 395},
];
const camera = (f) => {
  let a = CAMERA[0], b = CAMERA[CAMERA.length - 1];
  for (let i = 1; i < CAMERA.length; i++) if (f <= CAMERA[i].f) { a = CAMERA[i - 1]; b = CAMERA[i]; break; }
  const v = (k) => tween(f, a.f, b.f, a[k], b[k]);
  return {s: v('s'), x: v('x'), y: v('y')};
};

// The three rules, shown one at a time while the bars land.
const RULES = [
  {at: T.bars[0] - 14, until: T.bars[2] - 14, n: '1', text: 'Work in progress goes first', tickets: [1]},
  {at: T.bars[2] - 14, until: T.bars[3] + 20, n: '2', text: 'Story points set how many days each one gets', tickets: [3]},
  {at: T.bars[3] + 20, until: T.planned + 44, n: '3', text: 'What you placed yourself stays where it is', tickets: [0]},
];

const WeekView = ({f, fps}) => {
  const eventIn = spring({frame: f - T.drop, fps, config: {damping: 14, stiffness: 180}});
  const hours = tween(f, T.stretch, T.stretchEnd, 1, 2.5);
  return (
    <>
      {DAYS.map(([name, num], d) => (
        <div key={name} style={{position: 'absolute', left: colX(d), top: 0, width: COL, height: STAGE.h, borderLeft: `1px solid ${C.line}`}}>
          <div style={{textAlign: 'center', paddingTop: 12, fontSize: 13, letterSpacing: 1.5, color: C.muted, fontWeight: 600}}>{name}</div>
          <div style={{textAlign: 'center', fontSize: 34, fontWeight: 500}}>{num}</div>
        </div>
      ))}
      <div style={{position: 'absolute', left: 0, right: 0, top: GRID_TOP, borderTop: `1px solid ${C.line}`}} />
      {Array.from({length: 11}, (_, i) => (
        <div key={i} style={{position: 'absolute', left: 0, right: 0, top: hourY(FIRST + i)}}>
          <div style={{position: 'absolute', left: GUTTER, right: 0, borderTop: `1px solid ${C.soft}`}} />
          <div style={{position: 'absolute', left: 0, width: GUTTER - 12, top: -9, textAlign: 'right', fontSize: 13, color: C.muted}}>{FIRST + i}:00</div>
        </div>
      ))}
      {MEETINGS.map(([d, s, e, label], i) => (
        <div key={i} style={{position: 'absolute', left: colX(d) + 6, top: hourY(s) + 2, width: COL - 16, height: (e - s) * HOUR - 5,
          background: C.meeting, color: C.meetingInk, borderRadius: 7, padding: '4px 10px', fontSize: 15, fontWeight: 600, boxSizing: 'border-box'}}>{label}</div>
      ))}
      {PLAN.map(([ti, d, span, row], i) => {
        const s = spring({frame: f - T.bars[i], fps, config: {damping: 15, stiffness: 160}});
        return s <= 0 ? null : (
          <div key={i} style={{position: 'absolute', left: colX(d) + 6, top: HEAD + 6 + row * 32, width: span * COL - 14, height: 27,
            background: C.event, color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 15, fontWeight: 700, boxSizing: 'border-box',
            opacity: s, transform: `scaleX(${0.6 + 0.4 * s})`, transformOrigin: 'left center', whiteSpace: 'nowrap', overflow: 'hidden'}}>
            {TICKETS[ti].key} {TICKETS[ti].summary} ({TICKETS[ti].pt} pt)
          </div>
        );
      })}
      {f >= T.drop ? (
        <div style={{position: 'absolute', left: colX(1) + 6, top: hourY(10) + 2, width: COL - 16, height: HOUR * hours - 4,
          background: C.event, color: '#fff', borderRadius: 8, padding: '6px 10px', boxSizing: 'border-box', fontWeight: 700, fontSize: 16,
          transform: `scale(${0.7 + 0.3 * eventIn})`, opacity: eventIn, boxShadow: '0 6px 16px rgba(26,115,232,.35)'}}>
          APP-212 Checkout redesign
          <div style={{fontWeight: 500, fontSize: 14, opacity: 0.9}}>10:00 – {clock(10 + Math.round(hours * 2) / 2)}</div>
          {f >= T.stretch - 20 && f < T.stretchEnd + 30 ? (
            <div style={{position: 'absolute', left: '50%', bottom: 3, width: 36, height: 4, marginLeft: -18, borderRadius: 2, background: 'rgba(255,255,255,.8)'}} />
          ) : null}
        </div>
      ) : null}
    </>
  );
};

const MonthView = () => {
  const weeks = [[2, 3, 4, 5, 6], [9, 10, 11, 12, 13], [16, 17, 18, 19, 20], [23, 24, 25, 26, 27]];
  const W = (CAL_W - 2) / 5, H = (STAGE.h - 50) / 4;
  const chip = {height: 25, borderRadius: 6, color: '#fff', background: C.event, fontSize: 14, fontWeight: 700,
    padding: '3px 9px', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden', position: 'absolute'};
  return (
    <>
      {DAYS.map(([name], d) => (
        <div key={name} style={{position: 'absolute', left: d * W, top: 14, width: W, textAlign: 'center', fontSize: 13,
          letterSpacing: 1.5, color: C.muted, fontWeight: 600}}>{name}</div>
      ))}
      {weeks.map((week, r) => week.map((num, d) => (
        <div key={num} style={{position: 'absolute', left: d * W, top: 50 + r * H, width: W, height: H, boxSizing: 'border-box',
          borderTop: `1px solid ${C.line}`, borderLeft: d ? `1px solid ${C.line}` : 'none'}}>
          <div style={{textAlign: 'center', paddingTop: 8, fontSize: 17, fontWeight: 600, color: r === 2 ? C.ink : C.muted}}>{num}</div>
          {r !== 2 ? <div style={{margin: '10px 12px 0', height: 20, borderRadius: 5, background: C.meeting, width: `${45 + ((num * 13) % 40)}%`}} /> : null}
        </div>
      )))}
      {PLAN.map(([ti, d, span, row], i) => (
        <div key={i} style={{...chip, left: d * W + 8, top: 50 + 2 * H + 40 + row * 30, width: span * W - 16}}>
          {TICKETS[ti].key} {TICKETS[ti].summary}
        </div>
      ))}
      <div style={{...chip, left: W + 8, top: 50 + 2 * H + 70, width: W - 16, background: C.card, color: C.event, border: `1.5px solid ${C.event}`}}>
        10:00 APP-212 Checkout redesign
      </div>
    </>
  );
};

const Product = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cur = along(f, CURSOR_PATH);
  const cam = camera(f);
  const dragging = f >= T.press && f < T.drop;
  const down = dragging || (f >= T.stretch && f < T.stretchEnd) || (f >= T.click && f < T.click + 8);

  const typed = f >= T.clear ? '' : 'export'.slice(0, Math.max(0, Math.min(6, Math.floor((f - T.type) / 7))));
  const filtered = appear(f, T.filter, 10) - appear(f, T.clear, 10);
  const placedAt = [T.drop + 6, ...T.bars];
  const barsDone = T.bars.filter((b) => f >= b).length;
  const inPool = 6 - placedAt.filter((p) => f >= p + 6).length;
  const planning = f >= T.click + 6 && f < T.planned;
  const panelDim = f < T.press ? 1 : dragging ? tween(f, T.press, T.press + 10, 1, 0.3) : tween(f, T.drop, T.drop + 10, 0.3, 1);
  const month = appear(f, T.month, 22);
  const enter = spring({frame: f, fps, config: {damping: 200}});
  const rule = RULES.find((r) => f >= r.at && f < r.until);

  return (
    <AbsoluteFill style={page}>
      {/* A fixed window onto the product, so close-ups never run under the captions */}
      <div style={{position: 'absolute', left: STAGE.x - 24, top: STAGE.y - 24, width: STAGE.w + 48, height: STAGE.h + 48,
        overflow: 'hidden', borderRadius: 30, opacity: enter}}>
      <div style={{position: 'absolute', left: 24, top: 24, width: STAGE.w, height: STAGE.h,
        transform: `translate(${(STAGE.w / 2 - cam.x) * cam.s}px, ${(STAGE.h / 2 - cam.y) * cam.s + (1 - enter) * 40}px) scale(${cam.s})`}}>
        {/* Calendar */}
        <div style={{position: 'absolute', left: 0, top: 0, width: CAL_W, height: STAGE.h, background: C.card,
          borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: shadow, overflow: 'hidden'}}>
          <div style={{position: 'absolute', inset: 0, opacity: 1 - month}}><WeekView f={f} fps={fps} /></div>
          {month > 0 ? <div style={{position: 'absolute', inset: 0, opacity: month, background: C.card}}><MonthView /></div> : null}
          {/* Week / Month switch */}
          <div style={{position: 'absolute', right: 14, top: 12, display: 'flex', background: C.soft, borderRadius: 20, padding: 3,
            fontSize: 14, fontWeight: 700, opacity: appear(f, T.month - 40, 14)}}>
            {['Week', 'Month'].map((label, i) => {
              const on = i === 1 ? month : 1 - month;
              return <div key={label} style={{padding: '5px 16px', borderRadius: 17, color: on > 0.5 ? '#fff' : C.muted,
                background: on > 0.5 ? C.blue : 'transparent'}}>{label}</div>;
            })}
          </div>
        </div>

        {/* Panel */}
        <div style={{position: 'absolute', left: PANEL_X, top: 0, width: 300, height: STAGE.h, background: C.card, borderRadius: 18,
          border: `1px solid ${C.line}`, boxShadow: shadow, padding: 16, boxSizing: 'border-box',
          opacity: panelDim * appear(f, 20, 16), transform: `translateX(${(1 - appear(f, 20, 20)) * 60 + (1 - panelDim) * 60}px)`}}>
          <div style={{fontSize: 21, fontWeight: 800}}>Jira tickets</div>
          <div style={{marginTop: 10, height: 40, borderRadius: 10, border: `1.5px solid ${typed ? C.blue : C.line}`, padding: '0 12px',
            display: 'flex', alignItems: 'center', fontSize: 16, color: typed ? C.ink : C.muted}}>{typed || 'Search tickets'}</div>
          <div style={{fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.muted, margin: '12px 0 6px'}}>THIS SPRINT</div>
          <div style={{position: 'relative', height: 500}}>
            {TICKETS.map((t, i) => {
              const hide = t.key === 'APP-198' ? 0 : filtered;
              const y = t.key === 'APP-198' ? i * 84 * (1 - filtered) : i * 84;
              const o = appear(f, 40 + i * 8, 14) * (1 - hide) * (i === 0 && dragging ? 0.35 : 1);
              const glow = rule && rule.tickets.includes(i) ? Math.min(appear(f, rule.at, 10), 1 - appear(f, rule.until - 10, 10)) : 0;
              return <TicketCard key={t.key} t={t} placed={appear(f, placedAt[i] + 6, 10)} glow={glow}
                style={{position: 'absolute', left: 0, right: 0, top: y, opacity: o, transform: `translateY(${(1 - appear(f, 40 + i * 8, 14)) * 18}px)`}} />;
            })}
          </div>
          <div style={{position: 'absolute', left: 16, right: 16, bottom: 16}}>
            <div style={{height: 46, borderRadius: 23, background: C.blue, color: '#fff', fontSize: 17, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: planning ? 0.75 : 1,
              transform: `scale(${f >= T.click && f < T.click + 8 ? 0.95 : 1})`,
              boxShadow: f >= T.planMove && f < T.click ? `0 0 0 ${5 * appear(f, T.planMove + 20, 14)}px ${C.blueSoft}` : 'none'}}>
              {planning ? `Placing ${Math.min(5, barsDone + 1)} of 5…` : 'Auto-plan my tickets'}
            </div>
            <div style={{fontSize: 13.5, color: C.muted, marginTop: 8, textAlign: 'center'}}>
              {inPool > 0 ? `${inPool} ticket${inPool === 1 ? ' is' : 's are'} not on your calendar yet.` : 'Every ticket is on your calendar.'}
            </div>
          </div>
        </div>

        {/* Ticket being dragged, with the slot label the extension shows */}
        {dragging ? (
          <>
            <TicketCard t={TICKETS[0]} style={{position: 'absolute', left: cur.x - 110, top: cur.y - 30, width: 268,
              transform: 'rotate(-2deg)', boxShadow: '0 18px 36px rgba(16,24,40,.28)'}} />
            {cur.x < PANEL_X - 60 ? (
              <div style={{position: 'absolute', left: cur.x + 40, top: cur.y + 52, background: C.ink, color: '#fff', fontWeight: 700,
                fontSize: 17, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap'}}>{slotLabel(cur.x, cur.y)}</div>
            ) : null}
          </>
        ) : null}
        {planning ? (
          <div style={{position: 'absolute', left: 14, top: STAGE.h - 38, fontSize: 13, color: C.muted, background: C.soft,
            padding: '3px 10px', borderRadius: 12}}>Sped up</div>
        ) : null}
        {f > 110 && f < T.month - 10 ? <Cursor x={cur.x} y={cur.y} down={down} /> : null}
      </div>
      </div>

      {/* The rule being applied, while the plan is drawn */}
      {rule ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 858, display: 'flex', justifyContent: 'center',
          opacity: Math.min(appear(f, rule.at, 10), 1 - appear(f, rule.until - 10, 10))}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 18, background: C.ink, color: '#fff', borderRadius: 44, padding: '14px 34px 14px 16px'}}>
            <div style={{width: 52, height: 52, borderRadius: 26, background: C.blue, fontSize: 28, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{rule.n}</div>
            <div style={{fontSize: 38, fontWeight: 800, letterSpacing: -0.8}}>{rule.text}</div>
          </div>
        </div>
      ) : null}

      <Caption f={f} at={30} until={T.searchMove} title="Your Jira tickets, beside your calendar"
        sub="Coloured by status, with their story points. No token: it uses your browser's Jira sign-in." />
      <Caption f={f} at={T.searchMove + 6} until={T.grabMove} title="Search any ticket"
        sub="Type a word or a ticket number." />
      <Caption f={f} at={T.grabMove + 6} until={T.edgeMove} title="Drag it onto a slot"
        sub="Drop on an hour for a timed event, or on a day for an all-day one." />
      <Caption f={f} at={T.edgeMove + 6} until={T.planMove} title="Stretch it to the time it needs"
        sub="It is an ordinary event: move it, invite people. It shows as busy to anyone booking you." />
      <Caption f={f} at={T.planMove + 6} until={RULES[0].at} title="Or press Auto-plan"
        sub="Whatever is still in the panel is spread across the sprint for you." />
      <Caption f={f} at={T.month - 30} until={T.end} title="Week view or month view"
        sub="It is your own calendar, so your sprint is on every device you use." />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Opening, title, why, and how to start
// ---------------------------------------------------------------------------

const Hook = () => {
  const f = useCurrentFrame();
  const line = (at, text, strong) => (
    <div style={{fontSize: strong ? 104 : 60, fontWeight: strong ? 800 : 600, letterSpacing: strong ? -3.5 : -1,
      color: strong ? C.ink : C.muted, opacity: appear(f, at, 12), transform: `translateY(${(1 - appear(f, at, 14)) * 24}px)`}}>{text}</div>
  );
  const apart = tween(f, 70, 104, 0, 90);
  const card = {position: 'absolute', top: 560, width: 520, height: 330, background: C.card, borderRadius: 22,
    border: `1px solid ${C.line}`, boxShadow: shadow, padding: 22, boxSizing: 'border-box'};
  return (
    <AbsoluteFill style={{...page, alignItems: 'center'}}>
      <div style={{marginTop: 104, textAlign: 'center', lineHeight: 1.25}}>
        {line(4, 'Jira knows what you promised.')}
        {line(30, 'Your calendar knows where your time goes.')}
        <div style={{height: 14}} />
        {line(66, 'They never meet.', true)}
      </div>
      <div style={{...card, left: 400 - apart, opacity: appear(f, 10, 14), transform: `rotate(${-tween(f, 70, 104, 0, 2)}deg)`}}>
        <div style={{fontWeight: 800, fontSize: 22, marginBottom: 12}}>Sprint board</div>
        {TICKETS.slice(0, 3).map((t) => <TicketCard key={t.key} t={t} style={{marginBottom: 10}} />)}
      </div>
      <div style={{...card, left: 1000 + apart, opacity: appear(f, 34, 14), transform: `rotate(${tween(f, 70, 104, 0, 2)}deg)`}}>
        <div style={{fontWeight: 800, fontSize: 22, marginBottom: 12}}>This week</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, height: 236}}>
          {[[10, 40], [70, 60], [30, 50], [100, 60], [50, 40]].map(([top, h], i) => (
            <div key={i} style={{background: C.soft, borderRadius: 8, position: 'relative', overflow: 'hidden'}}>
              <div style={{position: 'absolute', left: 5, right: 5, top, height: h, background: C.meeting, borderRadius: 6}} />
              <div style={{position: 'absolute', left: 5, right: 5, top: top + h + 22, height: 30, background: C.meeting, borderRadius: 6}} />
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Mark = ({size = 120}) => (
  <div style={{width: size, height: size, borderRadius: size * 0.26, background: C.blue, position: 'relative',
    boxShadow: '0 16px 40px rgba(11,87,208,.35)'}}>
    <div style={{position: 'absolute', left: '18%', right: '18%', top: '24%', height: '14%', background: '#fff', borderRadius: 8}} />
    <div style={{position: 'absolute', left: '18%', width: '44%', top: '46%', height: '14%', background: '#9ec2ff', borderRadius: 8}} />
    <div style={{position: 'absolute', left: '18%', width: '30%', top: '68%', height: '14%', background: '#9ec2ff', borderRadius: 8}} />
  </div>
);

const Title = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame: f, fps, config: {damping: 13, stiffness: 150}});
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{transform: `scale(${pop})`}}><Mark /></div>
      <div style={{fontSize: 108, fontWeight: 800, letterSpacing: -4, marginTop: 34, opacity: appear(f, 8, 14)}}>Jira Sprint Calendar</div>
      <div style={{fontSize: 44, color: C.muted, marginTop: 6, opacity: appear(f, 20, 14)}}>Your sprint, on your calendar.</div>
    </AbsoluteFill>
  );
};

const Why = () => {
  const f = useCurrentFrame();
  const rows = [
    ['One place', 'Your meetings and your sprint, in the calendar you already live in.'],
    ['Visible to others', 'People booking you see the time is taken, and what for.'],
    ['Nothing to run', 'No token, no server. It only reads Jira, from your own browser.'],
  ];
  return (
    <AbsoluteFill style={{...page, padding: '110px 220px'}}>
      <div style={{fontSize: 80, fontWeight: 800, letterSpacing: -2.5, opacity: appear(f, 2, 12)}}>Why teams want it</div>
      <div style={{marginTop: 50, display: 'flex', flexDirection: 'column', gap: 28}}>
        {rows.map(([head, text], i) => {
          const a = appear(f, 14 + i * 26, 14);
          return (
            <div key={head} style={{display: 'flex', alignItems: 'center', gap: 34, background: C.card, border: `1px solid ${C.line}`,
              borderRadius: 24, padding: '30px 40px', opacity: a, transform: `translateX(${(1 - a) * 50}px)`, boxShadow: '0 14px 36px rgba(16,24,40,.07)'}}>
              <div style={{width: 64, height: 64, borderRadius: 32, background: C.blueSoft, color: C.blue, fontSize: 32, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>{i + 1}</div>
              <div>
                <div style={{fontSize: 44, fontWeight: 800, letterSpacing: -1}}>{head}</div>
                <div style={{fontSize: 31, color: C.muted, marginTop: 4}}>{text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Start = () => {
  const f = useCurrentFrame();
  const steps = ['Load the extension from GitHub', 'Enter your Jira address', 'Drag a ticket, or press Auto-plan'];
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
      <div style={{opacity: appear(f, 0, 12)}}><Mark size={84} /></div>
      <div style={{fontSize: 84, fontWeight: 800, letterSpacing: -3, marginTop: 26, opacity: appear(f, 6, 12)}}>Start in a minute</div>
      <div style={{display: 'flex', gap: 26, marginTop: 44}}>
        {steps.map((s, i) => {
          const a = appear(f, 24 + i * 20, 14);
          return (
            <div key={s} style={{width: 420, background: C.card, border: `1px solid ${C.line}`, borderRadius: 22, padding: '28px 26px',
              opacity: a, transform: `translateY(${(1 - a) * 26}px)`, boxShadow: '0 14px 36px rgba(16,24,40,.07)'}}>
              <div style={{fontSize: 26, fontWeight: 800, color: C.blue}}>Step {i + 1}</div>
              <div style={{fontSize: 31, fontWeight: 700, marginTop: 8, lineHeight: 1.25}}>{s}</div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 54, fontSize: 42, fontWeight: 800, color: C.blue, opacity: appear(f, 92, 14)}}>
        github.com/MelihCagdas/jira-sprint-calendar
      </div>
      <div style={{marginTop: 12, fontSize: 28, color: C.muted, opacity: appear(f, 104, 14)}}>Free and open source · MIT licence</div>
    </AbsoluteFill>
  );
};

const Fade = ({length, last, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: Math.min(appear(f, 0, 9), last ? 1 : 1 - appear(f, length - 9, 9))}}>{children}</AbsoluteFill>;
};

export const Promo = () => {
  let at = 0;
  const part = (length, node, last) => {
    const seq = <Sequence key={at} from={at} durationInFrames={length}><Fade length={length} last={last}>{node}</Fade></Sequence>;
    at += length;
    return seq;
  };
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {part(HOOK, <Hook />)}
      {part(TITLE, <Title />)}
      {part(APP, <Product />)}
      {part(WHY, <Why />)}
      {part(START, <Start />)}
    </AbsoluteFill>
  );
};
