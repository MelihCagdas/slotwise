import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, spring, useVideoConfig} from 'remotion';
import {C, fontFamily, tween, appear, along} from './theme';

// 60 seconds at 30 frames a second.
const HOOK = 150, TITLE = 90, APP = 1080, WHY = 240, START = 240;
export const TOTAL_FRAMES = HOOK + TITLE + APP + WHY + START;

const TICKETS = [
  {key: 'APP-212', summary: 'Checkout redesign', status: 'In Progress', kind: 'doing'},
  {key: 'APP-198', summary: 'Fix export bug', status: 'In Progress', kind: 'doing'},
  {key: 'APP-205', summary: 'Search filters', status: 'In Review', kind: 'review'},
  {key: 'APP-220', summary: 'Audit log', status: 'To Do', kind: 'todo'},
  {key: 'APP-231', summary: 'Onboarding emails', status: 'To Do', kind: 'todo'},
  {key: 'APP-240', summary: 'Billing page copy', status: 'To Do', kind: 'todo'},
];
const KIND = {
  doing: [C.doing, C.doingBg], review: [C.review, C.reviewBg], todo: [C.todo, C.todoBg],
};

const page = {fontFamily, color: C.ink, background: C.bg};

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const Pill = ({kind, children, size = 15}) => (
  <span style={{background: KIND[kind][1], color: KIND[kind][0], fontSize: size, fontWeight: 700,
    padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap'}}>{children}</span>
);

const TicketCard = ({t, placed, style}) => (
  <div style={{background: C.card, border: `1px solid ${C.line}`, borderLeft: `6px solid ${KIND[t.kind][0]}`,
    borderRadius: 10, padding: '9px 12px', height: 74, boxSizing: 'border-box', ...style}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <span style={{color: C.blue, fontWeight: 700, fontSize: 16}}>{t.key}</span>
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
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center', opacity: o,
      transform: `translateY(${(1 - appear(f, at, 14)) * 16}px)`}}>
      <div style={{fontSize: 50, fontWeight: 800, letterSpacing: -1}}>{title}</div>
      <div style={{fontSize: 27, color: C.muted, marginTop: 8}}>{sub}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The product: a calendar week with the ticket panel beside it
// ---------------------------------------------------------------------------

const STAGE = {w: 1640, h: 790};
const GUTTER = 70, COL = 250, HEAD = 86, ALLDAY = 74, HOUR = 62, FIRST = 8;
const GRID_TOP = HEAD + ALLDAY;
const PANEL_X = 1340;
const DAYS = [['MON', 16], ['TUE', 17], ['WED', 18], ['THU', 19], ['FRI', 20]];
const MEETINGS = [
  [0, 9, 9.5, 'Standup'], [1, 9, 9.5, 'Standup'], [2, 9, 9.5, 'Standup'], [3, 9, 9.5, 'Standup'], [4, 9, 9.5, 'Standup'],
  [0, 14, 15, 'Sprint planning'], [2, 13, 14, 'Design review'], [3, 11, 12, '1:1'], [4, 15, 16, 'Demo'], [1, 15, 16, 'Customer call'],
];
// What "Plan my sprint" places: [ticket index, first day, days, row]
const PLAN = [[1, 0, 1, 0], [2, 1, 1, 0], [3, 2, 2, 0], [4, 4, 1, 0], [5, 4, 1, 1]];

const colX = (d) => GUTTER + d * COL;
const hourY = (h) => GRID_TOP + (h - FIRST) * HOUR;

/** "Tue 17 Nov, 10:00" for a point on the grid, as the real extension shows it. */
const slotLabel = (x, y) => {
  const d = Math.max(0, Math.min(4, Math.floor((x - GUTTER) / COL)));
  const mins = Math.max(0, Math.floor(((y - GRID_TOP) / HOUR * 60 + FIRST * 60) / 30) * 30);
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return `${names[d]} ${DAYS[d][1]} Nov, ${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
};

// Local timeline of the product part, in frames.
const T = {
  searchMove: 210, type: 245, filter: 266, clear: 352,
  grabMove: 392, press: 430, drop: 515, edgeMove: 560, stretch: 600, stretchEnd: 650,
  planMove: 722, click: 766, bars: [800, 838, 876, 914, 952], planned: 985,
};
const SEARCH_AT = {x: PANEL_X + 150, y: 86};
const ROW_Y = (i) => 128 + i * 84;
const GRAB = {x: PANEL_X + 120, y: ROW_Y(0) + 40};
const DROP = {x: colX(1) + 110, y: hourY(10) + 12};
const EDGE = {x: colX(1) + 120, y: hourY(11) - 4};
const EDGE_END = {x: colX(1) + 120, y: hourY(12.5) - 4};
const PLAN_BTN = {x: PANEL_X + 150, y: 668};

const CURSOR_PATH = [
  {f: 150, x: 900, y: 520}, {f: T.searchMove + 30, ...SEARCH_AT}, {f: T.clear, ...SEARCH_AT},
  {f: T.grabMove + 34, ...GRAB}, {f: T.press + 4, ...GRAB}, {f: T.drop - 4, ...DROP}, {f: T.drop + 30, ...DROP},
  {f: T.edgeMove + 34, ...EDGE}, {f: T.stretch, ...EDGE}, {f: T.stretchEnd, ...EDGE_END}, {f: T.stretchEnd + 40, ...EDGE_END},
  {f: T.planMove + 38, ...PLAN_BTN}, {f: T.planned, ...PLAN_BTN}, {f: T.planned + 60, x: 1180, y: 600},
];

const Product = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cur = along(f, CURSOR_PATH);
  const dragging = f >= T.press && f < T.drop;
  const down = dragging || (f >= T.stretch && f < T.stretchEnd) || (f >= T.click && f < T.click + 8);

  // Search
  const typed = f >= T.clear ? '' : 'export'.slice(0, Math.max(0, Math.min(6, Math.floor((f - T.type) / 7))));
  const filtered = appear(f, T.filter, 10) - appear(f, T.clear, 10);
  // Placement marks
  const placedAt = [T.drop + 6, T.bars[0], T.bars[1], T.bars[2], T.bars[3], T.bars[4]];
  const barsDone = T.bars.filter((b) => f >= b).length;
  const inPool = 6 - placedAt.filter((p) => f >= p + 6).length;
  const planning = f >= T.click + 6 && f < T.planned;
  // The dropped event
  const eventIn = spring({frame: f - T.drop, fps, config: {damping: 14, stiffness: 180}});
  const eventH = HOUR * tween(f, T.stretch, T.stretchEnd, 1, 2.5) - 4;
  const panelDim = dragging ? tween(f, T.press, T.press + 10, 1, 0.3) : tween(f, T.drop, T.drop + 10, 0.3, 1);

  const enter = spring({frame: f, fps, config: {damping: 200}});
  return (
    <AbsoluteFill style={page}>
      <div style={{position: 'absolute', left: (1920 - STAGE.w) / 2, top: 44, width: STAGE.w, height: STAGE.h,
        opacity: enter, transform: `translateY(${(1 - enter) * 40}px)`}}>
        {/* Calendar */}
        <div style={{position: 'absolute', left: 0, top: 0, width: PANEL_X - 20, height: STAGE.h, background: C.card,
          borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: '0 20px 50px rgba(16,24,40,.10)', overflow: 'hidden'}}>
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
          {/* Bars placed by "Plan my sprint" */}
          {PLAN.map(([ti, d, span, row], i) => {
            const s = spring({frame: f - T.bars[i], fps, config: {damping: 15, stiffness: 160}});
            return s <= 0 ? null : (
              <div key={i} style={{position: 'absolute', left: colX(d) + 6, top: HEAD + 6 + row * 32, width: span * COL - 14, height: 27,
                background: C.event, color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 15, fontWeight: 700, boxSizing: 'border-box',
                opacity: s, transform: `scaleX(${0.6 + 0.4 * s})`, transformOrigin: 'left center', whiteSpace: 'nowrap', overflow: 'hidden'}}>
                {TICKETS[ti].key} {TICKETS[ti].summary}
              </div>
            );
          })}
          {/* The ticket dropped by hand */}
          {f >= T.drop ? (
            <div style={{position: 'absolute', left: colX(1) + 6, top: hourY(10) + 2, width: COL - 16, height: eventH,
              background: C.event, color: '#fff', borderRadius: 8, padding: '6px 10px', boxSizing: 'border-box', fontWeight: 700, fontSize: 16,
              transform: `scale(${0.7 + 0.3 * eventIn})`, opacity: eventIn, boxShadow: '0 6px 16px rgba(26,115,232,.35)'}}>
              APP-212 Checkout redesign
              <div style={{fontWeight: 500, fontSize: 14, opacity: 0.9}}>10:00 – {f < T.stretch ? '11:00' : slotLabel(0, EDGE.y + 4 + (eventH + 4 - HOUR)).slice(-5)}</div>
            </div>
          ) : null}
        </div>

        {/* Panel */}
        <div style={{position: 'absolute', left: PANEL_X, top: 0, width: 300, height: STAGE.h, background: C.card, borderRadius: 18,
          border: `1px solid ${C.line}`, boxShadow: '0 20px 50px rgba(16,24,40,.14)', padding: 16, boxSizing: 'border-box',
          opacity: panelDim * appear(f, 24, 16), transform: `translateX(${(1 - appear(f, 24, 20)) * 60 + (1 - panelDim) * 60}px)`}}>
          <div style={{fontSize: 21, fontWeight: 800}}>Jira tickets</div>
          <div style={{marginTop: 10, height: 40, borderRadius: 10, border: `1.5px solid ${typed ? C.blue : C.line}`, padding: '0 12px',
            display: 'flex', alignItems: 'center', fontSize: 16, color: typed ? C.ink : C.muted}}>{typed || 'Search tickets'}</div>
          <div style={{fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.muted, margin: '12px 0 6px'}}>THIS SPRINT</div>
          <div style={{position: 'relative', height: 500}}>
            {TICKETS.map((t, i) => {
              const hide = t.key === 'APP-198' ? 0 : filtered;
              const y = (t.key === 'APP-198' ? i * 84 * (1 - filtered) : i * 84);
              const o = appear(f, 50 + i * 9, 14) * (1 - hide) * (i === 0 && dragging ? 0.35 : 1);
              return <TicketCard key={t.key} t={t} placed={appear(f, placedAt[i] + 6, 10)}
                style={{position: 'absolute', left: 0, right: 0, top: y, opacity: o, transform: `translateY(${(1 - appear(f, 50 + i * 9, 14)) * 18}px)`}} />;
            })}
          </div>
          <div style={{position: 'absolute', left: 16, right: 16, bottom: 16}}>
            <div style={{height: 46, borderRadius: 23, background: C.blue, color: '#fff', fontSize: 17, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: planning ? 0.75 : 1,
              transform: `scale(${f >= T.click && f < T.click + 8 ? 0.96 : 1})`}}>
              {planning ? `Placing ${Math.min(5, barsDone + 1)} of 5…` : 'Plan my sprint'}
            </div>
            <div style={{fontSize: 13.5, color: C.muted, marginTop: 8, textAlign: 'center'}}>
              {inPool > 0 ? `${inPool} sprint ticket${inPool === 1 ? ' is' : 's are'} not on your calendar yet.` : 'Every sprint ticket is on your calendar.'}
            </div>
          </div>
        </div>

        {/* Ticket being dragged, with the slot label the extension shows */}
        {dragging ? (
          <>
            <TicketCard t={TICKETS[0]} placed={0} style={{position: 'absolute', left: cur.x - 110, top: cur.y - 30, width: 268,
              transform: 'rotate(-2deg)', boxShadow: '0 18px 36px rgba(16,24,40,.28)'}} />
            {cur.x < PANEL_X - 60 ? (
              <div style={{position: 'absolute', left: cur.x + 40, top: cur.y + 52, background: C.ink, color: '#fff', fontWeight: 700,
                fontSize: 17, padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap'}}>{slotLabel(cur.x, cur.y)}</div>
            ) : null}
          </>
        ) : null}
        {f >= T.click + 6 && f < T.planned + 40 ? (
          <div style={{position: 'absolute', left: 16, top: STAGE.h - 40, fontSize: 13, color: C.muted, background: C.soft,
            padding: '3px 10px', borderRadius: 12, opacity: Math.min(appear(f, T.click + 6), 1 - appear(f, T.planned + 28, 12))}}>Sped up</div>
        ) : null}
        {f > 150 ? <Cursor x={cur.x} y={cur.y} down={down} /> : null}
      </div>

      <Caption f={f} at={40} until={T.searchMove} title="Your Jira tickets, beside your calendar"
        sub="Coloured by status. No token: it uses the Jira sign-in your browser already has." />
      <Caption f={f} at={T.searchMove + 6} until={T.grabMove} title="Search any ticket"
        sub="Type a word or a ticket number." />
      <Caption f={f} at={T.grabMove + 6} until={T.edgeMove} title="Drag it onto a slot"
        sub="Drop on an hour for a timed event, or on a day for an all-day one." />
      <Caption f={f} at={T.edgeMove + 6} until={T.planMove} title="It is an ordinary calendar event"
        sub="Stretch it, move it, invite people. It shows as busy to anyone booking you." />
      <Caption f={f} at={T.planMove + 6} until={APP} title="Or press Plan my sprint"
        sub="It spreads what is left across the sprint: work in progress first, sized by story points." />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Opening, title, why, and how to start
// ---------------------------------------------------------------------------

const Hook = () => {
  const f = useCurrentFrame();
  const line = (at, text, strong) => (
    <div style={{fontSize: strong ? 96 : 60, fontWeight: strong ? 800 : 600, letterSpacing: strong ? -3 : -1,
      color: strong ? C.ink : C.muted, opacity: appear(f, at, 14), transform: `translateY(${(1 - appear(f, at, 16)) * 24}px)`}}>{text}</div>
  );
  const apart = tween(f, 92, 130, 0, 70);
  const card = {position: 'absolute', top: 560, width: 520, height: 330, background: C.card, borderRadius: 22,
    border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(16,24,40,.12)', padding: 22, boxSizing: 'border-box'};
  return (
    <AbsoluteFill style={{...page, alignItems: 'center'}}>
      <div style={{marginTop: 110, textAlign: 'center', lineHeight: 1.25}}>
        {line(6, 'Jira knows what you promised.')}
        {line(40, 'Your calendar knows where your time goes.')}
        <div style={{height: 14}} />
        {line(88, 'They never meet.', true)}
      </div>
      <div style={{...card, left: 400 - apart, opacity: appear(f, 14, 16)}}>
        <div style={{fontWeight: 800, fontSize: 22, marginBottom: 12}}>Sprint board</div>
        {TICKETS.slice(0, 3).map((t) => <TicketCard key={t.key} t={t} placed={0} style={{marginBottom: 10}} />)}
      </div>
      <div style={{...card, left: 1000 + apart, opacity: appear(f, 48, 16)}}>
        <div style={{fontWeight: 800, fontSize: 22, marginBottom: 12}}>This week</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, height: 236}}>
          {[[10, 40], [70, 60], [30, 50], [110, 70], [50, 40]].map(([top, h], i) => (
            <div key={i} style={{background: C.soft, borderRadius: 8, position: 'relative'}}>
              <div style={{position: 'absolute', left: 5, right: 5, top, height: h, background: C.meeting, borderRadius: 6}} />
              <div style={{position: 'absolute', left: 5, right: 5, top: top + h + 26, height: 34, background: C.meeting, borderRadius: 6}} />
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
      <div style={{fontSize: 104, fontWeight: 800, letterSpacing: -4, marginTop: 34, opacity: appear(f, 10, 16)}}>Jira Sprint Calendar</div>
      <div style={{fontSize: 44, color: C.muted, marginTop: 6, opacity: appear(f, 26, 16)}}>Your sprint, on your calendar.</div>
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
    <AbsoluteFill style={{...page, padding: '120px 220px'}}>
      <div style={{fontSize: 76, fontWeight: 800, letterSpacing: -2.5, opacity: appear(f, 4, 14)}}>Why it helps</div>
      <div style={{marginTop: 54, display: 'flex', flexDirection: 'column', gap: 30}}>
        {rows.map(([head, text], i) => {
          const a = appear(f, 30 + i * 48, 16);
          return (
            <div key={head} style={{display: 'flex', alignItems: 'center', gap: 34, background: C.card, border: `1px solid ${C.line}`,
              borderRadius: 24, padding: '30px 40px', opacity: a, transform: `translateX(${(1 - a) * 50}px)`,
              boxShadow: '0 14px 36px rgba(16,24,40,.07)'}}>
              <div style={{width: 64, height: 64, borderRadius: 32, background: C.blueSoft, color: C.blue, fontSize: 32, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>{i + 1}</div>
              <div>
                <div style={{fontSize: 42, fontWeight: 800, letterSpacing: -1}}>{head}</div>
                <div style={{fontSize: 30, color: C.muted, marginTop: 4}}>{text}</div>
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
  const steps = ['Load the extension from GitHub', 'Enter your Jira address', 'Drag a ticket, or press Plan my sprint'];
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
      <div style={{opacity: appear(f, 0, 14)}}><Mark size={84} /></div>
      <div style={{fontSize: 80, fontWeight: 800, letterSpacing: -3, marginTop: 26, opacity: appear(f, 8, 14)}}>Start in a minute</div>
      <div style={{display: 'flex', gap: 26, marginTop: 44}}>
        {steps.map((s, i) => {
          const a = appear(f, 34 + i * 26, 14);
          return (
            <div key={s} style={{width: 420, background: C.card, border: `1px solid ${C.line}`, borderRadius: 22, padding: '28px 26px',
              opacity: a, transform: `translateY(${(1 - a) * 26}px)`, boxShadow: '0 14px 36px rgba(16,24,40,.07)'}}>
              <div style={{fontSize: 26, fontWeight: 800, color: C.blue}}>Step {i + 1}</div>
              <div style={{fontSize: 31, fontWeight: 700, marginTop: 8, lineHeight: 1.25}}>{s}</div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 54, fontSize: 40, fontWeight: 800, color: C.blue, opacity: appear(f, 120, 16)}}>
        github.com/MelihCagdas/jira-sprint-calendar
      </div>
      <div style={{marginTop: 12, fontSize: 28, color: C.muted, opacity: appear(f, 136, 16)}}>Free and open source · MIT licence</div>
    </AbsoluteFill>
  );
};

const Fade = ({length, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: Math.min(appear(f, 0, 10), 1 - appear(f, length - 10, 10))}}>{children}</AbsoluteFill>;
};

export const Promo = () => {
  let at = 0;
  const part = (length, node) => {
    const seq = <Sequence key={at} from={at} durationInFrames={length}><Fade length={length}>{node}</Fade></Sequence>;
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
