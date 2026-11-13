import React from 'react';
import {AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {C, tween, appear} from './theme';
import {page, ui, shadow, sec, Clip, Tag, Fade, Mark, S, mono} from './shared';

// The voice-over, line by line: [file, length in seconds, key phrases].
// A key phrase is [where in the line it is spoken (0 to 1), the words to show].
// Only the phrases that matter appear on screen, not every word.
const VO = {
  hook: ['l1', 5.15, []],
  pain: ['l2', 7.37, [[0.02, 'Nobody sees you are heads-down'], [0.40, 'An empty slot looks free'], [0.64, 'Meetings pile on'], [0.83, 'Real work slips']]],
  name: ['l3', 1.15, []],
  pool: ['l4', 3.06, [[0.05, 'Your tickets, beside your calendar']]],
  drag: ['l5', 2.93, [[0.0, 'Search'], [0.22, 'Drag onto a slot'], [0.62, 'Stretch to fit']]],
  plan: ['l6', 6.16, [[0.08, 'Auto-plan'], [0.30, 'Your whole week, laid out'], [0.58, 'Work in progress first'], [0.80, 'Sized by story points']]],
  team: ['l7', 6.92, [[0.0, 'A real calendar event'], [0.42, 'Visible across time zones'], [0.76, 'They know when not to book you']]],
  values: ['l8', 3.11, []],
  start: ['l9', 3.71, []],
};

// Scene lengths in seconds.
const LEN = {hook: 5.9, pain: 8.0, name: 2.2, pool: 4.0, drag: 4.6, plan: 7.2, team: 7.6, custom: 2.8, values: 4.4, start: 6.8};
export const PROMO_FRAMES = sec(Object.values(LEN).reduce((a, b) => a + b, 0));

const rise = (f, at, len = 10) => ({opacity: appear(f, at, len), transform: `translateY(${(1 - appear(f, at, len)) * 12}px)`});

/**
 * Plays one voice-over line and flashes up its key phrases as they are
 * spoken, one at a time, marked with the calendar's red "now" dot.
 */
const Say = ({line, at = 0.2, bottom = 56, size = 54}) => {
  const f = useCurrentFrame();
  const [file, seconds, keys] = VO[line];
  const audio = <Sequence from={sec(at)}><Audio src={staticFile(`vo/${file}.mp3`)} /></Sequence>;
  if (!keys.length) return audio;
  const starts = keys.map(([where]) => sec(at) + where * sec(seconds));
  let current = -1;
  starts.forEach((start, i) => { if (f >= start) current = i; });
  if (current === -1) return audio;
  const a = appear(f, starts[current], 7);
  return (
    <>
      {audio}
      <div style={{position: 'absolute', left: 0, right: 0, bottom, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20,
        opacity: a, transform: `translateY(${(1 - a) * 10}px)`}}>
        <span style={{width: 14, height: 14, borderRadius: 7, background: S.now, flexShrink: 0}} />
        <span style={{fontSize: size, fontWeight: 600, letterSpacing: -1.6}}>{keys[current][1]}</span>
      </div>
    </>
  );
};

const KIND = {doing: [C.doing, C.doingBg], review: [C.review, C.reviewBg], todo: [C.todo, C.todoBg]};
const Ticket = ({k, summary, status, kind}) => (
  <div style={{background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${KIND[kind][0]}`, borderRadius: 8,
    padding: '8px 12px', marginBottom: 8}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <span style={{color: C.blue, fontWeight: 600, fontSize: 16}}>{k}</span>
      <span style={{background: KIND[kind][1], color: KIND[kind][0], fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 10}}>{status}</span>
    </div>
    <div style={{fontSize: 16, marginTop: 4}}>{summary}</div>
  </div>
);

// 1. Jira and the calendar never meet. The red line between them is the gap.
const Hook = () => {
  const f = useCurrentFrame();
  const apart = tween(f, 118, 144, 0, 96);
  const card = {...ui, position: 'absolute', top: 500, width: 520, height: 320, background: S.surface, borderRadius: 16,
    border: `1px solid ${S.line}`, boxShadow: shadow, padding: 24, boxSizing: 'border-box'};
  const gap = tween(f, 122, 146, 0, 1);
  return (
    <AbsoluteFill style={page}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center'}}>
        <div style={{fontSize: 56, fontWeight: 500, letterSpacing: -1.4, color: S.secondary, ...rise(f, 8)}}>Jira knows what you promised</div>
        <div style={{fontSize: 56, fontWeight: 500, letterSpacing: -1.4, color: S.secondary, marginTop: 8, ...rise(f, 60)}}>Your calendar knows where your time goes</div>
        <div style={{fontSize: 120, fontWeight: 600, letterSpacing: -4.5, marginTop: 20, color: S.brand, ...rise(f, 119, 8)}}>They never meet</div>
      </div>
      <div style={{...card, left: 420 - apart, opacity: appear(f, 10, 10)}}>
        <div style={{fontWeight: 600, fontSize: 20, marginBottom: 12}}>Sprint board</div>
        <Ticket k="APP-212" summary="Checkout redesign" status="In Progress" kind="doing" />
        <Ticket k="APP-198" summary="Fix export bug" status="In Progress" kind="doing" />
        <Ticket k="APP-205" summary="Search filters" status="In Review" kind="review" />
      </div>
      <div style={{...card, left: 980 + apart, opacity: appear(f, 62, 10)}}>
        <div style={{fontWeight: 600, fontSize: 20, marginBottom: 12}}>This week</div>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, height: 228}}>
          {[[12, 40], [68, 60], [32, 48], [100, 60], [52, 40]].map(([top, h], i) => (
            <div key={i} style={{background: '#f3f4f6', borderRadius: 6, position: 'relative', overflow: 'hidden'}}>
              <div style={{position: 'absolute', left: 4, right: 4, top, height: h, background: '#dfe5ee', borderRadius: 4}} />
              <div style={{position: 'absolute', left: 4, right: 4, top: top + h + 20, height: 28, background: '#dfe5ee', borderRadius: 4}} />
            </div>
          ))}
        </div>
      </div>
      {/* the gap */}
      <div style={{position: 'absolute', left: 959, top: 500 + 160 * (1 - gap), width: 3, height: 320 * gap, background: S.now}} />
      <div style={{position: 'absolute', left: 955, top: 500 + 160 * (1 - gap) - 5, width: 11, height: 11, borderRadius: 6, background: S.now, opacity: gap > 0 ? 1 : 0}} />
      <Say line="hook" />
    </AbsoluteFill>
  );
};

// 2. An empty slot looks free, so meetings land on the work nobody can see.
const Pain = () => {
  const f = useCurrentFrame();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const W = 248, HH = 60, X0 = 340, Y0 = 132;
  const meetings = [[0, 1, 1, 'Standup', 0], [3, 2, 1.5, 'Customer call', 0], [1, 1.5, 1.5, 'Quick sync?', 146], [1, 3, 1, 'Catch-up', 158], [2, 2, 1.5, 'Planning review', 166], [1, 0.4, 1, 'Got 5 mins?', 174]];
  const pushed = tween(f, 192, 216, 0, 1);
  return (
    <AbsoluteFill style={page}>
      <div style={{position: 'absolute', left: X0 - 20, top: 44, width: 5 * W + 40, height: 612, background: S.surface, borderRadius: 16,
        border: `1px solid ${S.line}`, boxShadow: shadow}} />
      {days.map((d, i) => (
        <div key={d} style={{position: 'absolute', left: X0 + i * W, top: 68, width: W, textAlign: 'center', fontFamily: mono, fontSize: 16,
          color: S.muted, borderLeft: i ? `1px solid ${S.line}` : 'none', height: 572}}>{d}</div>
      ))}
      {Array.from({length: 8}, (_, i) => (
        <div key={i} style={{position: 'absolute', left: X0, width: 5 * W, top: Y0 + i * HH, borderTop: `1px solid ${S.line}`}} />
      ))}
      <div style={{position: 'absolute', left: X0 + W + 8, top: Y0 + 1.5 * HH + 2, width: W - 16, height: 2.5 * HH - 4, boxSizing: 'border-box',
        border: `2px dashed ${pushed > 0.3 ? S.now : S.event}`, borderRadius: 8, padding: '8px 12px', fontSize: 18, fontWeight: 600,
        color: pushed > 0.3 ? S.now : S.event, background: S.surface, opacity: appear(f, 4, 10) * (1 - 0.4 * pushed),
        transform: `translateY(${pushed * 248}px)`}}>
        APP-212 Checkout redesign
        <div style={{fontWeight: 400, fontSize: 15, marginTop: 4}}>{pushed > 0.3 ? 'Pushed to next week' : 'Planned, but only in Jira'}</div>
      </div>
      {meetings.map(([d, h, len, label, at], i) => {
        const a = appear(f, at, 8);
        return a <= 0 ? null : (
          <div key={i} style={{position: 'absolute', left: X0 + d * W + 8, top: Y0 + h * HH + 2, width: W - 16, height: len * HH - 4, boxSizing: 'border-box',
            background: '#e4e9f1', color: '#2f3b4c', borderRadius: 8, padding: '8px 12px', fontSize: 18, fontWeight: 500,
            border: `1px solid ${S.surface}`, opacity: a, transform: `translateY(${(1 - a) * -12}px)`}}>{label}</div>
        );
      })}
      <Say line="pain" bottom={110} />
    </AbsoluteFill>
  );
};

// 3. The name.
const Name = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 36, ...rise(f, 2, 8)}}>
        <Mark size={132} />
        <div style={{fontSize: 164, fontWeight: 600, letterSpacing: -7}}>Slotwise</div>
      </div>
      <div style={{fontSize: 40, color: S.secondary, marginTop: 28, ...rise(f, 12, 8)}}>Your Jira tickets, on your calendar</div>
      <Say line="name" at={0.3} />
    </AbsoluteFill>
  );
};

/** A scene built from the real recording, with the spoken line underneath. */
const Shot = ({line, children}) => (
  <AbsoluteFill style={page}>
    {children}
    <Say line={line} at={0.2} bottom={64} size={50} />
  </AbsoluteFill>
);

const Cut = ({from, length, children}) => (
  <Sequence from={sec(from)} durationInFrames={sec(length)}><Fade length={sec(length)}>{children}</Fade></Sequence>
);

// 8. The three promises, laid out the way the product lays out work: as slots in a day.
const Values = () => {
  const f = useCurrentFrame();
  const rows = [['09:00', 'Transparency first', 6], ['10:00', 'Respect for time', 40], ['11:00', 'Real focus', 73]];
  const X = 420, Y = 276, RH = 176;
  return (
    <AbsoluteFill style={page}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{position: 'absolute', left: X + 150, right: 420, top: Y + i * RH, borderTop: `1px solid ${S.line}`}} />
      ))}
      {rows.map(([time, text, at], i) => (
        <React.Fragment key={time}>
          <div style={{position: 'absolute', left: X, top: Y + i * RH - 14, fontFamily: mono, fontSize: 24, color: S.muted}}>{time}</div>
          <div style={{position: 'absolute', left: X + 168, right: 440, top: Y + i * RH + 12, height: RH - 24, boxSizing: 'border-box',
            background: S.surface, border: `1px solid ${S.line}`, borderLeft: `6px solid ${S.event}`, borderRadius: 12,
            padding: '0 36px', display: 'flex', alignItems: 'center', fontSize: 76, fontWeight: 600, letterSpacing: -2.6, ...rise(f, at, 9)}}>{text}</div>
        </React.Fragment>
      ))}
      <Say line="values" />
    </AbsoluteFill>
  );
};

const Start = () => {
  const f = useCurrentFrame();
  const facts = [['No token', 6], ['No server', 28], ['Free and open source', 53]];
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 28, ...rise(f, 0, 8)}}>
        <Mark size={104} />
        <div style={{fontSize: 128, fontWeight: 600, letterSpacing: -5.5}}>Slotwise</div>
      </div>
      <div style={{display: 'flex', gap: 40, marginTop: 44, fontSize: 38, color: S.secondary}}>
        {facts.map(([text, at], i) => (
          <div key={text} style={{display: 'flex', alignItems: 'center', gap: 40, ...rise(f, at, 8)}}>
            {i ? <span style={{width: 1, height: 32, background: S.line}} /> : null}
            <span>{text}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop: 64, fontFamily: mono, fontSize: 40, color: S.surface, background: S.brand, padding: '20px 40px', borderRadius: 12, ...rise(f, 88, 10)}}>
        github.com/MelihCagdas/slotwise
      </div>
      <Say line="start" />
    </AbsoluteFill>
  );
};

export const Promo = () => {
  let at = 0;
  const out = [];
  const add = (key, node, last) => {
    const length = sec(LEN[key]);
    out.push(<Sequence key={key} from={at} durationInFrames={length}><Fade length={length} last={last}>{node}</Fade></Sequence>);
    at += length;
  };
  add('hook', <Hook />);
  add('pain', <Pain />);
  add('name', <Name />);
  add('pool', <Shot line="pool"><Clip name="c1" rate={1.1} zoom={1.14} focus={[0.86, 0.3]} length={sec(LEN.pool)} /></Shot>);
  add('drag', (
    <Shot line="drag">
      <Cut from={0} length={1.05}><Clip name="c2" from={1.2} rate={2.6} zoom={1.3} focus={[0.88, 0.12]} length={30} /></Cut>
      <Cut from={1.05} length={1.15}><Clip name="c3" from={0.3} rate={3.0} /></Cut>
      <Cut from={2.2} length={2.4}><Clip name="c4b" from={0.6} rate={1.8} zoom={1.35} focus={[0.36, 0.45]} length={60} /></Cut>
    </Shot>
  ));
  add('plan', (
    <Shot line="plan">
      <Cut from={0} length={1.5}><Clip name="c6" from={0.3} rate={1.4} zoom={1.25} focus={[0.88, 0.85]} length={42} /></Cut>
      <Cut from={1.5} length={2.2}>
        <Clip name="c6b" rate={26} width={380} ratio={1002 / 460} top={44} />
        <Tag left={1180} top={64}>Sped up</Tag>
      </Cut>
      <Cut from={3.7} length={3.5}><Clip name="c7" from={7.6} rate={2.2} zoom={1.08} focus={[0.3, 0.1]} length={sec(3.5)} /></Cut>
    </Shot>
  ));
  add('team', (
    <Shot line="team">
      <Clip name="c8" from={1.0} rate={1.0} ratio={510 / 1520} top={220} zoom={1.05} focus={[0.3, 0.3]} length={sec(LEN.team)} />
      <Tag left={276} top={160}>Month view</Tag>
    </Shot>
  ));
  add('custom', (
    <AbsoluteFill style={page}>
      <Clip name="c5" from={0.8} rate={4.4} zoom={1.35} focus={[0.9, 0.35]} length={sec(LEN.custom)} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 64, textAlign: 'center', fontSize: 50, fontWeight: 600, letterSpacing: -1.6}}>
        Customise how it plans
      </div>
    </AbsoluteFill>
  ));
  add('values', <Values />);
  add('start', <Start />, true);
  return (
    <AbsoluteFill style={{background: S.bg}}>
      <Audio src={staticFile('music/bed.mp3')}
        volume={(f) => interpolate(f, [0, 12, PROMO_FRAMES - 50, PROMO_FRAMES - 4], [0, 0.07, 0.07, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      {out}
    </AbsoluteFill>
  );
};
