// The product, redrawn for the sales video: the Slotwise panel (same sizes,
// colours and icons as the extension) beside a plain week, month or day.
// Drawn in code so every move is smooth and nothing private is on screen.
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {tween, appear, along} from './theme';
import {S, mono, Mark, Tag} from './shared';

const W = 1560, H = 850, GUT = 70, HEAD = 84, ALL = 44, HOUR = 66, FIRST = 8;
const colW = (W - GUT) / 7;
const colX = (c) => GUT + c * colW;
const hourY = (h) => HEAD + ALL + (h - FIRST) * HOUR;
const PANEL = {x: W - 20 - 392, y: 16, w: 392, h: 818};
const TAB = {x: W - 20 - 56, y: 20, s: 56};
const CARD = 80; // a ticket card and the gap under it

// Where things are, in window pixels, for the pointer to aim at.
const AT = {
  tab: [TAB.x + 28, TAB.y + 30],
  sliders: [PANEL.x + 318, PANEL.y + 38],
  chevron: [PANEL.x + 358, PANEL.y + 38],
  search: [PANEL.x + 150, PANEL.y + 92],
  card: (i) => [PANEL.x + 170, PANEL.y + 158 + i * CARD + 40],
  plan: [PANEL.x + 196, PANEL.y + 753],
  saturday: [PANEL.x + 16 + 5.5 * 52, PANEL.y + 236],
  drop: [PANEL.x + 196, PANEL.y + 566],
};

const INK = '#172b4d', MUTED = '#626f86', LINE = '#dcdfe4', SOFT = '#f1f2f4', BLUE = '#0c66e4', GREEN = '#1f845a';
const KIND = {doing: ['#0c66e4', '#e9f2ff'], review: ['#974f0c', '#fff7d6'], todo: ['#626f86', '#f1f2f4']};
const TICKETS = [
  ['APP-212', 'Checkout redesign', 'In Progress', 'doing'],
  ['APP-198', 'Fix export bug', 'In Progress', 'doing'],
  ['APP-205', 'Search filters', 'In Review', 'review'],
  ['APP-220', 'Audit log', 'To Do', 'todo'],
  ['APP-231', 'Onboarding emails', 'To Do', 'todo'],
];

const ICONS = {
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  sliders: ['M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'],
  chevron: ['m9 18 6-6-6-6'],
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0', 'm21 21-4.3-4.3'],
  plan: ['M8 2v4', 'M16 2v4', 'M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8', 'M3 10h18', 'M16 19h6', 'M19 16v6'],
  stop: ['M7 7h10v10H7z'],
  check: ['M20 6 9 17l-5-5'],
};
const Icon = ({name, size = 22, color = MUTED, fill = 'none'}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{display: 'block', flexShrink: 0}}>
    {ICONS[name].map((d) => <path key={d} d={d} />)}
  </svg>
);

const TicketCard = ({t, placed, hover, style}) => (
  <div style={{height: placed ? CARD + 14 : CARD - 8, boxSizing: 'border-box', padding: '10px 13px', borderRadius: 13,
    border: `1px solid ${hover ? BLUE : LINE}`, background: placed ? '#f7f8f9' : '#fff',
    boxShadow: hover ? '0 3px 10px rgba(9,30,66,.14)' : 'none', ...style}}>
    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <span style={{width: 10, height: 10, borderRadius: 5, background: KIND[t[3]][0]}} />
      <span style={{flex: 1, fontFamily: mono, fontSize: 15, fontWeight: 500, color: MUTED}}>{t[0]}</span>
      <span style={{background: KIND[t[3]][1], color: KIND[t[3]][0], fontSize: 14, fontWeight: 500, padding: '3px 10px', borderRadius: 8}}>{t[2]}</span>
    </div>
    <div style={{fontSize: 17, marginTop: 7, color: placed ? MUTED : INK}}>{t[1]}</div>
    {placed ? (
      <div style={{display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 14, fontWeight: 500, color: GREEN}}>
        <Icon name="check" size={16} color={GREEN} /> On your calendar
      </div>
    ) : null}
  </div>
);

const Field = ({label, children}) => (
  <div style={{marginBottom: 18}}>
    <div style={{fontSize: 15, fontWeight: 500, marginBottom: 6}}>{label}</div>
    {children}
  </div>
);
const Box = ({children, glow}) => (
  <div style={{height: 46, boxSizing: 'border-box', border: `1px solid ${glow ? BLUE : LINE}`, borderRadius: 13, padding: '0 14px',
    display: 'flex', alignItems: 'center', fontSize: 17, boxShadow: glow ? '0 0 0 4px #e9f2ff' : 'none'}}>{children}</div>
);

/** The panel. `open` 0..1, `custom` 0..1 (the settings showing), `placed` {key: 0..1}. */
const Panel = ({open = 1, query = '', placed = {}, hover = -1, custom = 0, saturday = false, dropLen = '1 hour', dropGlow,
  plan = 'Plan tasks', stop, help = '5 tickets are not on your calendar yet.', pressed = 0, typing}) => {
  const shown = TICKETS.filter((t) => !query || t[1].toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <div style={{position: 'absolute', left: TAB.x, top: TAB.y, width: TAB.s, height: TAB.s, borderRadius: 14, background: '#fff',
        border: `1px solid ${LINE}`, boxShadow: '0 3px 10px rgba(9,30,66,.14)', display: 'grid', placeItems: 'center',
        opacity: 1 - open, transform: `scale(${1 - 0.2 * open})`}}>
        <Mark size={34} />
      </div>
      <div style={{position: 'absolute', left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h, boxSizing: 'border-box', padding: 16,
        background: '#fff', border: `1px solid ${LINE}`, borderRadius: 21, color: INK,
        boxShadow: '0 10px 30px rgba(9,30,66,.16), 0 1px 2px rgba(9,30,66,.1)',
        opacity: open, transform: `scale(${0.3 + 0.7 * open})`, transformOrigin: `${PANEL.w - 28}px 34px`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, height: 44}}>
          <Mark size={36} />
          <div style={{flex: 1, fontSize: 23, fontWeight: 600, letterSpacing: -0.4}}>Slotwise</div>
          {['refresh', 'sliders', 'chevron'].map((name) => (
            <div key={name} style={{width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center',
              background: name === 'sliders' && custom > 0.5 ? '#e9f2ff' : 'transparent'}}>
              <Icon name={name} color={name === 'sliders' && custom > 0.5 ? BLUE : MUTED} />
            </div>
          ))}
        </div>

        <div style={{position: 'absolute', left: 16, right: 16, top: 70, bottom: 150, opacity: 1 - custom}}>
          <div style={{height: 46, boxSizing: 'border-box', border: `1px solid ${typing ? BLUE : LINE}`, borderRadius: 13, background: '#f7f8f9',
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', fontSize: 17, color: query ? INK : MUTED,
            boxShadow: typing ? '0 0 0 4px #e9f2ff' : 'none'}}>
            <Icon name="search" size={19} />
            <span>{query || 'Search tickets'}{typing ? <span style={{color: BLUE}}>|</span> : null}</span>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px', fontSize: 15.5, fontWeight: 500, color: MUTED}}>
            This sprint
            <span style={{background: SOFT, borderRadius: 12, padding: '2px 9px', fontSize: 14}}>{shown.length}</span>
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8, height: 470, overflow: 'hidden'}}>
            {shown.map((t, i) => <TicketCard key={t[0]} t={t} placed={(placed[t[0]] || 0) > 0.5} hover={hover === i} />)}
          </div>
        </div>

        <div style={{position: 'absolute', left: 16, right: 16, top: 70, opacity: custom}}>
          <div style={{fontSize: 18, fontWeight: 600, margin: '4px 0 16px'}}>Customise</div>
          <Field label="Plan tasks uses"><Box>My current sprint</Box></Field>
          <Field label="Working days">
            <div style={{display: 'flex', gap: 6}}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => {
                const on = i < 5 || (i === 5 && saturday);
                return <div key={i} style={{flex: 1, height: 42, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 500,
                  background: on ? BLUE : '#fff', color: on ? '#fff' : MUTED, border: `1px solid ${on ? BLUE : LINE}`}}>{d}</div>;
              })}
            </div>
          </Field>
          <Field label="Statuses that go first"><Box>In Progress</Box></Field>
          <Field label="Statuses to leave out"><Box><span style={{color: MUTED}}>For example: Ready for QA</span></Box></Field>
          <Field label="A dropped ticket lasts"><Box glow={dropGlow}>{dropLen}</Box></Field>
        </div>

        <div style={{position: 'absolute', left: 16, right: 16, bottom: 16, borderTop: `1px solid ${LINE}`, paddingTop: 15}}>
          <div style={{height: 52, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 18.5, fontWeight: 500,
            background: stop ? '#fff' : pressed ? '#0055cc' : BLUE, color: stop ? INK : '#fff',
            boxShadow: stop ? `inset 0 0 0 1px ${LINE}` : '0 1px 2px rgba(9,30,66,.2)', transform: `scale(${1 - 0.03 * pressed})`}}>
            {stop ? <Icon name="stop" size={20} color="#c9372c" fill="#c9372c" /> : <Icon name="plan" color="#fff" />}
            {plan}
          </div>
          <div style={{fontSize: 15, color: MUTED, marginTop: 9}}>{help}</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: MUTED, marginTop: 8}}>
            <span style={{width: 16, height: 16, borderRadius: 4, background: BLUE, display: 'grid', placeItems: 'center'}}>
              <Icon name="check" size={12} color="#fff" />
            </span>
            Save a dropped ticket straight away
          </div>
        </div>
      </div>
    </>
  );
};

const DAYS = [['SUN', 15], ['MON', 16], ['TUE', 17], ['WED', 18], ['THU', 19], ['FRI', 20], ['SAT', 21]];
const eventStyle = {position: 'absolute', background: '#1a73e8', color: '#fff', borderRadius: 8, boxSizing: 'border-box', overflow: 'hidden'};

/** A week. `events` are timed blocks, `bars` are all-day bars; each has `a` 0..1 for its arrival. */
const Week = ({events = [], bars = [], only}) => (
  <>
    {DAYS.map(([name, n], c) => (only === undefined || only === c) ? (
      <div key={name} style={{position: 'absolute', left: only === undefined ? colX(c) : GUT, width: only === undefined ? colW : 160, top: 10, textAlign: 'center'}}>
        <div style={{fontSize: 14, fontWeight: 500, color: MUTED, letterSpacing: 0.6}}>{name}</div>
        <div style={{fontSize: 32, color: INK, marginTop: 2}}>{n}</div>
      </div>
    ) : null)}
    <div style={{position: 'absolute', left: 0, right: 0, top: HEAD + ALL, borderTop: `1px solid ${LINE}`}} />
    {Array.from({length: 11}, (_, i) => (
      <React.Fragment key={i}>
        <div style={{position: 'absolute', left: 0, width: GUT - 12, top: hourY(FIRST + i) - 9, textAlign: 'right', fontSize: 13, color: MUTED}}>
          {i ? ((FIRST + i - 1) % 12) + 1 + (FIRST + i < 12 ? ' AM' : ' PM') : ''}
        </div>
        {i ? <div style={{position: 'absolute', left: GUT, right: 0, top: hourY(FIRST + i), borderTop: `1px solid ${SOFT}`}} /> : null}
      </React.Fragment>
    ))}
    {only === undefined ? DAYS.map((d, c) => (
      <div key={c} style={{position: 'absolute', left: colX(c), top: HEAD, bottom: 0, borderLeft: `1px solid ${LINE}`}} />
    )) : <div style={{position: 'absolute', left: GUT, top: HEAD, bottom: 0, borderLeft: `1px solid ${LINE}`}} />}
    {bars.map((b) => (
      <div key={b.title} style={{...eventStyle, left: (only === undefined ? colX(b.col) : GUT) + 4, width: (only === undefined ? colW * b.span : W - GUT - 440) - 8,
        top: HEAD + 7, height: 30, padding: '0 12px', lineHeight: '30px', fontSize: 15.5, fontWeight: 500, whiteSpace: 'nowrap',
        opacity: b.a, transform: `translateY(${(1 - b.a) * -10}px) scaleX(${0.9 + 0.1 * b.a})`, transformOrigin: 'left center'}}>{b.title}</div>
    ))}
    {events.map((e) => (
      <div key={e.title} style={{...eventStyle, left: (only === undefined ? colX(e.col) : GUT) + 4, width: (only === undefined ? colW : 520) - 14,
        top: hourY(e.start) + 2, height: e.hours * HOUR - 4, padding: '8px 12px',
        opacity: e.a, transform: `scale(${0.92 + 0.08 * e.a})`, boxShadow: '0 2px 6px rgba(9,30,66,.2)'}}>
        <div style={{fontSize: 15.5, fontWeight: 600}}>{e.title}</div>
        <div style={{fontSize: 14, opacity: 0.92, marginTop: 2}}>{e.label}</div>
      </div>
    ))}
  </>
);

/** A month: this sprint in one row, the next sprint in the weeks after. `a` brings the bars in. */
const Month = ({a = 1}) => {
  const rowH = (H - 46) / 5;
  const starts = [1, 8, 15, 22, 29];
  const bar = (row, col, span, title, delay, soft) => {
    const k = Math.max(0, Math.min(1, a * 6 - delay));
    return (
      <div key={title + row} style={{...eventStyle, left: col * (W / 7) + 5, width: span * (W / 7) - 10, top: 46 + row * rowH + 44, height: 30,
        padding: '0 12px', lineHeight: '30px', fontSize: 15.5, fontWeight: 500, whiteSpace: 'nowrap',
        background: soft ? '#7baaf7' : '#1a73e8', opacity: k, transform: `scaleX(${0.85 + 0.15 * k})`, transformOrigin: 'left center'}}>{title}</div>
    );
  };
  return (
    <>
      {DAYS.map(([name], c) => (
        <div key={name} style={{position: 'absolute', left: c * (W / 7), width: W / 7, top: 14, textAlign: 'center', fontSize: 14, fontWeight: 500, color: MUTED, letterSpacing: 0.6}}>{name}</div>
      ))}
      {starts.map((first, r) => DAYS.map((d, c) => (
        <div key={r + '-' + c} style={{position: 'absolute', left: c * (W / 7), width: W / 7, top: 46 + r * rowH, height: rowH, boxSizing: 'border-box',
          borderTop: `1px solid ${LINE}`, borderLeft: c ? `1px solid ${LINE}` : 'none', textAlign: 'center', paddingTop: 10, fontSize: 16, color: INK}}>
          {first + c > 30 ? (first + c - 30 === 1 ? 'Dec 1' : first + c - 30) : first + c}
        </div>
      )))}
      {bar(2, 1, 1, 'APP-205 Search filters', 0)}
      {bar(2, 2, 2, 'APP-220 Audit log (3 pt)', 1)}
      {bar(2, 4, 1, 'APP-231 Onboarding emails', 2)}
      {bar(3, 1, 6, 'APP-251 Dark mode (2 pt)  ·  next sprint', 3, true)}
      {bar(4, 0, 3, 'APP-251 Dark mode (2 pt)', 3.6, true)}
      {bar(4, 3, 3, 'APP-252 Export to CSV (1 pt)', 4.4, true)}
    </>
  );
};

const Pointer = ({x, y, click = 0}) => (
  <>
    <div style={{position: 'absolute', left: x - 24, top: y - 24, width: 48, height: 48, borderRadius: 24, border: `3px solid ${BLUE}`,
      opacity: click > 0 && click < 1 ? 1 - click : 0, transform: `scale(${0.4 + click})`}} />
    <svg width="30" height="36" viewBox="0 0 34 40" style={{position: 'absolute', left: x - 4, top: y - 2, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))'}}>
      <path d="M4 2 L4 30 L11.5 23.5 L16.5 35 L21.5 33 L16.5 21.5 L27 21.5 Z" fill="#111" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  </>
);

/** The window everything sits in. `zoom` and `focus` (window pixels) move the camera. */
const Stage = ({zoom = 1, focus = [W / 2, H / 2], children}) => (
  <div style={{position: 'absolute', left: (1920 - W) / 2, top: 36, width: W, height: H, background: '#fff', borderRadius: 18,
    border: `1px solid ${S.line}`, overflow: 'hidden', boxShadow: '0 1px 2px rgba(21,23,26,.06), 0 14px 36px rgba(21,23,26,.1)'}}>
    <div style={{position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: `${focus[0]}px ${focus[1]}px`}}>{children}</div>
  </div>
);

const click = (f, at) => (f < at ? 0 : Math.min(1, (f - at) / 10));
const path = (f, keys) => along(f, keys.map(([frame, p]) => ({f: frame, x: p[0], y: p[1]})));

// ---- The five shots ----------------------------------------------------------

/** Folded in the corner; a click opens it. */
export const OpenDemo = () => {
  const f = useCurrentFrame();
  const open = tween(f, 44, 60, 0, 1);
  const p = path(f, [[0, [1180, 420]], [12, [1180, 420]], [38, AT.tab], [78, AT.tab], [108, AT.card(1)], [135, AT.card(3)], [162, AT.card(2)]]);
  const hover = f > 104 && f < 120 ? 1 : f >= 120 && f < 148 ? 3 : f >= 148 ? 2 : -1;
  return (
    <Stage zoom={tween(f, 50, 92, 1.75, 1)} focus={[W - 40, 30]}>
      <Week />
      <Panel open={open} hover={hover} />
      <Pointer x={p.x} y={p.y} click={click(f, 42)} />
    </Stage>
  );
};

/** Search, drag onto a slot, stretch. */
export const DragDemo = () => {
  const f = useCurrentFrame();
  const word = 'export';
  const typed = f < 14 ? '' : f < 52 ? word.slice(0, Math.min(word.length, Math.floor((f - 14) / 4) + 1)) : '';
  const slot = [colX(2) + colW / 2, hourY(10) + 22];
  const edge = [colX(2) + colW / 2, hourY(11) - 4];
  const stretch = tween(f, 162, 186, 0, 1);
  const p = path(f, [[0, AT.card(2)], [10, AT.search], [52, AT.search], [66, AT.card(0)], [74, AT.card(0)], [118, slot], [128, slot],
    [150, edge], [162, edge], [186, [edge[0], hourY(12.5) - 4]], [198, [edge[0], hourY(12.5) - 4]]]);
  const dragging = f >= 74 && f < 124;
  const dropped = appear(f, 124, 8);
  const hours = 1 + 1.5 * stretch;
  const end = 11 + 1.5 * stretch;
  const label = '10:00 – ' + (end % 1 ? Math.floor(end) + ':30' : end + ':00');
  return (
    <Stage zoom={tween(f, 126, 160, 1, 1.22)} focus={[colX(2) + colW / 2, hourY(11)]}>
      <Week events={[{col: 2, start: 10, hours, title: 'APP-212 Checkout redesign', label, a: dropped}]} />
      <div style={{opacity: dragging ? 0.3 : 1}}>
        <Panel query={typed} typing={f >= 10 && f < 52} hover={f >= 62 && f < 74 ? 0 : -1} placed={{'APP-212': dropped}}
          help={dropped > 0.5 ? '4 tickets are not on your calendar yet.' : undefined} />
      </div>
      {dragging ? (
        <>
          <div style={{position: 'absolute', left: p.x - 90, top: p.y - 26, width: 360, transform: 'rotate(-2deg)'}}>
            <TicketCard t={TICKETS[0]} hover style={{boxShadow: '0 14px 30px rgba(9,30,66,.28)'}} />
          </div>
          {f > 96 ? (
            <div style={{position: 'absolute', left: p.x + 26, top: p.y + 58, background: INK, color: '#fff', borderRadius: 10, padding: '7px 12px',
              fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', opacity: appear(f, 96, 6)}}>Tue 17 Nov, 10:00</div>
          ) : null}
        </>
      ) : null}
      <Pointer x={p.x} y={p.y} click={Math.max(click(f, 10) < 1 ? click(f, 10) : 0, click(f, 124) < 1 ? click(f, 124) : 0)} />
    </Stage>
  );
};

const PLAN = [
  {col: 1, span: 1, title: 'APP-198 Fix export bug (1 pt)', key: 'APP-198'},
  {col: 2, span: 1, title: 'APP-205 Search filters (1 pt)', key: 'APP-205'},
  {col: 3, span: 2, title: 'APP-220 Audit log (3 pt)', key: 'APP-220'},
  {col: 5, span: 1, title: 'APP-231 Onboarding (1 pt)', key: 'APP-231'},
];

/** Plan tasks: the rest of the week fills in, one ticket after another. */
export const PlanDemo = () => {
  const f = useCurrentFrame();
  const START = 40, STEP = 22;
  const p = path(f, [[0, [colX(2) + colW / 2, hourY(12.5)]], [26, AT.plan], [150, AT.plan], [185, [colX(3) + 60, HEAD + 22]]]);
  const done = f >= START + PLAN.length * STEP;
  const index = Math.min(PLAN.length, Math.floor((f - START) / STEP) + 1);
  const placed = {'APP-212': 1};
  const bars = PLAN.map((b, i) => {
    const a = appear(f, START + i * STEP + 6, 10);
    placed[b.key] = a;
    return {...b, a};
  });
  const left = PLAN.filter((b) => placed[b.key] <= 0.5).length;
  return (
    <Stage zoom={tween(f, 150, 216, 1, 1.05)} focus={[colX(2), HEAD]}>
      <Week bars={bars} events={[{col: 2, start: 10, hours: 2.5, title: 'APP-212 Checkout redesign', label: '10:00 – 12:30', a: 1}]} />
      <Panel placed={placed} pressed={f >= 30 && f < 36 ? 1 : 0}
        stop={f >= 36 && !done} plan={f >= 36 && !done ? `Placing ${Math.max(1, index)} of ${PLAN.length} · Stop` : 'Plan tasks'}
        help={done ? 'Every ticket is on your calendar.' : `${left} ticket${left === 1 ? ' is' : 's are'} not on your calendar yet.`} />
      <Pointer x={p.x} y={p.y} click={click(f, 30)} />
    </Stage>
  );
};

/** The same plan in month view, then one day. */
export const ViewsDemo = () => {
  const f = useCurrentFrame();
  const toDay = tween(f, 138, 152, 0, 1);
  return (
    <>
      <Stage zoom={tween(f, 0, 138, 1, 1.04)} focus={[W / 3, H / 2]}>
        <div style={{opacity: 1 - toDay}}><Month a={tween(f, 6, 70, 0, 1)} /></div>
        <div style={{opacity: toDay}}>
          <Week only={2} bars={[{col: 2, span: 1, title: 'APP-205 Search filters (1 pt)', a: toDay}]}
            events={[{col: 2, start: 10, hours: 2.5, title: 'APP-212 Checkout redesign', label: '10:00 – 12:30', a: toDay}]} />
          <Panel placed={{'APP-212': 1, 'APP-198': 1, 'APP-205': 1, 'APP-220': 1, 'APP-231': 1}} help="Every ticket is on your calendar." />
        </div>
      </Stage>
      <Tag left={182} top={900}>{toDay > 0.5 ? 'Day view' : 'Month view'}</Tag>
    </>
  );
};

/** Settings, then fold the panel away. `part` is 0 for settings, 1 for folding. */
export const CustomDemo = ({part}) => {
  const f = useCurrentFrame();
  const allPlaced = {'APP-212': 1, 'APP-198': 1, 'APP-205': 1, 'APP-220': 1, 'APP-231': 1};
  const week = <Week bars={PLAN.map((b) => ({...b, a: 1}))} events={[{col: 2, start: 10, hours: 2.5, title: 'APP-212 Checkout redesign', label: '10:00 – 12:30', a: 1}]} />;
  if (part === 0) {
    const p = path(f, [[0, AT.plan], [16, AT.sliders], [30, AT.sliders], [46, AT.saturday], [58, AT.saturday], [72, AT.drop], [81, AT.drop]]);
    return (
      <Stage zoom={tween(f, 10, 40, 1, 1.25)} focus={[W - 60, 260]}>
        {week}
        <Panel placed={allPlaced} custom={tween(f, 20, 30, 0, 1)} saturday={f >= 50} dropLen={f >= 74 ? '1.5 hours' : '1 hour'} dropGlow={f >= 70}
          help="Every ticket is on your calendar." />
        <Pointer x={p.x} y={p.y} click={Math.max(...[18, 50, 74].map((t) => (click(f, t) < 1 ? click(f, t) : 0)))} />
      </Stage>
    );
  }
  const p = path(f, [[0, AT.drop], [18, AT.chevron], [75, AT.chevron]]);
  return (
    <Stage zoom={tween(f, 0, 30, 1.25, 1.5)} focus={[W - 40, 60]}>
      {week}
      <Panel placed={allPlaced} open={1 - tween(f, 24, 40, 0, 1)} help="Every ticket is on your calendar." />
      <Pointer x={p.x} y={p.y} click={click(f, 22)} />
    </Stage>
  );
};
