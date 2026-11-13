import React from 'react';
import {AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, spring, useVideoConfig, interpolate} from 'remotion';
import {C, tween, appear} from './theme';
import {page, ui, shadow, sec, Clip, Tag, Fade, Mark, H, gradText} from './shared';

// The voice-over, line by line: [file, length in seconds, words shown on screen]
const VO = {
  hook: ['l1', 4.49, 'Jira knows what you promised. Your calendar knows where your time goes. They never meet!'],
  pain: ['l2', 5.69, "On a remote team, nobody sees you're heads-down. So an empty slot looks free, meetings pile on, and real work slips."],
  name: ['l3', 1.20, 'Meet Slotwise!'],
  pool: ['l4', 2.87, 'Your Jira tickets, right beside your Google Calendar.'],
  drag: ['l5', 3.53, 'Search. Drag it onto a slot. Stretch it to fit.'],
  plan: ['l6', 5.88, 'Or hit Auto-plan, and your whole week is laid out. Work in progress first, sized by story points.'],
  team: ['l7', 6.69, "Every ticket is a real calendar event. So across time zones, your team sees what you're on, and when not to book you."],
  values: ['l8', 3.60, 'Transparency first. Respect for time. Real focus.'],
  start: ['l9', 3.94, 'No token. No server. Free, and open source. Get Slotwise!'],
};

// Scene lengths in seconds.
const LEN = {hook: 5.0, pain: 6.2, name: 2.0, pool: 3.4, drag: 4.4, plan: 7.0, team: 7.1, custom: 2.4, values: 4.4, start: 6.6};
export const PROMO_FRAMES = sec(Object.values(LEN).reduce((a, b) => a + b, 0));

/**
 * Plays one voice-over line. With `show`, its words appear as they are
 * spoken: said words in white, the word being said in yellow, the rest dim.
 */
const Say = ({line, at = 0.25, show = true, size = 46, bottom = 34}) => {
  const f = useCurrentFrame();
  const [file, seconds, text] = VO[line];
  const words = text.split(' ');
  const total = text.length;
  let seen = 0;
  return (
    <>
      <Sequence from={sec(at)}><Audio src={staticFile(`vo/${file}.mp3`)} /></Sequence>
      {show ? (
        <div style={{position: 'absolute', left: 150, right: 150, bottom, textAlign: 'center', fontSize: size, fontWeight: 800,
          letterSpacing: -1, lineHeight: 1.22}}>
          {words.map((w, i) => {
            const start = sec(at) + (seen / total) * sec(seconds) * 0.95;
            const end = sec(at) + ((seen + w.length + 1) / total) * sec(seconds) * 0.95;
            seen += w.length + 1;
            const said = appear(f, start, 4);
            const now = f >= start && f < end + 2;
            return <span key={i} style={{display: 'inline-block', marginRight: '0.26em', color: now ? H.yellow : said > 0 ? H.text : H.faint,
              transform: `translateY(${(1 - said) * 8}px) scale(${now ? 1.08 : 1})`}}>{w}</span>;
          })}
        </div>
      ) : null}
    </>
  );
};

const KIND = {doing: [C.doing, C.doingBg], review: [C.review, C.reviewBg], todo: [C.todo, C.todoBg]};
const Ticket = ({k, summary, status, kind}) => (
  <div style={{background: C.card, border: `1px solid ${C.line}`, borderLeft: `6px solid ${KIND[kind][0]}`, borderRadius: 10,
    padding: '9px 12px', marginBottom: 10}}>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <span style={{color: C.blue, fontWeight: 700, fontSize: 16}}>{k}</span>
      <span style={{background: KIND[kind][1], color: KIND[kind][0], fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20}}>{status}</span>
    </div>
    <div style={{fontSize: 16, marginTop: 4}}>{summary}</div>
  </div>
);

// 1. Jira and the calendar never meet.
const Hook = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const line = (at, text) => (
    <div style={{fontSize: 62, fontWeight: 700, letterSpacing: -1.5, color: H.dim, opacity: appear(f, at, 8),
      transform: `translateY(${(1 - appear(f, at, 10)) * 24}px)`}}>{text}</div>
  );
  const slam = spring({frame: f - 104, fps, config: {damping: 11, stiffness: 190}});
  const apart = tween(f, 100, 128, 0, 120);
  const card = {...ui, position: 'absolute', top: 520, width: 520, height: 330, background: C.card, borderRadius: 24,
    boxShadow: shadow, padding: 22, boxSizing: 'border-box'};
  return (
    <AbsoluteFill style={{...page, alignItems: 'center'}}>
      <div style={{marginTop: 70, textAlign: 'center', lineHeight: 1.22}}>
        {line(8, 'Jira knows what you promised.')}
        {line(48, 'Your calendar knows where your time goes.')}
        <div style={{fontSize: 132, fontWeight: 800, letterSpacing: -5, marginTop: 10, opacity: Math.min(1, slam * 1.4),
          transform: `scale(${0.6 + 0.4 * slam})`, ...gradText()}}>They never meet.</div>
      </div>
      <div style={{...card, left: 400 - apart, opacity: appear(f, 10, 10), transform: `rotate(${-tween(f, 100, 128, 0, 4)}deg)`}}>
        <div style={{fontWeight: 800, fontSize: 22, marginBottom: 12}}>Sprint board</div>
        <Ticket k="APP-212" summary="Checkout redesign" status="In Progress" kind="doing" />
        <Ticket k="APP-198" summary="Fix export bug" status="In Progress" kind="doing" />
        <Ticket k="APP-205" summary="Search filters" status="In Review" kind="review" />
      </div>
      <div style={{...card, left: 1000 + apart, opacity: appear(f, 50, 10), transform: `rotate(${tween(f, 100, 128, 0, 4)}deg)`}}>
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
      <Say line="hook" show={false} />
    </AbsoluteFill>
  );
};

// 2. An empty slot looks free, so meetings land on the work nobody can see.
const Pain = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const W = 250, H2 = 62, X0 = 335, Y0 = 136;
  const drop = (at) => spring({frame: f - at, fps, config: {damping: 11, stiffness: 190}});
  const meetings = [[0, 1, 1, 'Standup', 0], [3, 2, 1.5, 'Customer call', 0], [1, 1.5, 1.5, 'Quick sync?', 104], [1, 3, 1, 'Catch-up', 116], [2, 2, 1.5, 'Planning review', 124], [1, 0.4, 1, '"Got 5 mins?"', 132]];
  const pushed = tween(f, 142, 168, 0, 1);
  return (
    <AbsoluteFill style={page}>
      <div style={{...ui, position: 'absolute', left: X0 - 20, top: 46, width: 5 * W + 40, height: 620, background: C.card, borderRadius: 24, boxShadow: shadow}} />
      {days.map((d, i) => (
        <div key={d} style={{...ui, position: 'absolute', left: X0 + i * W, top: 70, width: W, textAlign: 'center', fontSize: 15,
          letterSpacing: 1.5, color: C.muted, fontWeight: 700, borderLeft: i ? `1px solid ${C.line}` : 'none', height: 580}}>{d}</div>
      ))}
      {Array.from({length: 8}, (_, i) => (
        <div key={i} style={{position: 'absolute', left: X0, width: 5 * W, top: Y0 + i * H2, borderTop: `1px solid ${C.soft}`}} />
      ))}
      <div style={{...ui, position: 'absolute', left: X0 + W + 8, top: Y0 + 1.5 * H2, width: W - 16, height: 2.5 * H2 - 6, boxSizing: 'border-box',
        border: `3px dashed ${pushed > 0.3 ? '#d93025' : C.blue}`, borderRadius: 10, padding: '8px 12px', fontSize: 19, fontWeight: 700,
        color: pushed > 0.3 ? '#d93025' : C.blue, background: pushed > 0.3 ? '#fde8e6' : '#eef4ff', opacity: appear(f, 4, 10) * (1 - 0.45 * pushed),
        transform: `translate(${pushed * 40}px, ${pushed * 270}px) rotate(${pushed * 7}deg)`}}>
        APP-212 Checkout redesign
        <div style={{fontWeight: 600, fontSize: 15, marginTop: 4}}>{pushed > 0.3 ? 'Pushed out. Again.' : 'Heads-down, but nobody can see it'}</div>
      </div>
      {meetings.map(([d, h, len, label, at], i) => {
        const s = drop(at);
        return s <= 0 ? null : (
          <div key={i} style={{...ui, position: 'absolute', left: X0 + d * W + 8, top: Y0 + h * H2 + 2, width: W - 16, height: len * H2 - 6, boxSizing: 'border-box',
            background: at ? '#ffe2c2' : C.meeting, color: at ? '#8a4b00' : C.meetingInk, borderRadius: 10, padding: '8px 12px', fontSize: 19, fontWeight: 700,
            opacity: Math.min(1, s), transform: `translateY(${(1 - s) * -80}px) rotate(${at ? (i % 2 ? 1.5 : -1.5) : 0}deg)`,
            boxShadow: at ? '0 12px 26px rgba(138,75,0,.28)' : 'none'}}>{label}</div>
        );
      })}
      <Say line="pain" bottom={70} size={48} />
    </AbsoluteFill>
  );
};

// 3. The name.
const Name = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame: f, fps, config: {damping: 11, stiffness: 180}});
  const word = spring({frame: f - 5, fps, config: {damping: 12, stiffness: 170}});
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{transform: `scale(${pop}) rotate(${(1 - pop) * -20}deg)`}}><Mark size={140} /></div>
      <div style={{fontSize: 170, fontWeight: 800, letterSpacing: -7, marginTop: 20, lineHeight: 1.05, opacity: Math.min(1, word * 1.3),
        transform: `scale(${0.7 + 0.3 * word})`, ...gradText()}}>Slotwise</div>
      <div style={{fontSize: 44, fontWeight: 700, color: H.text, opacity: appear(f, 16, 8)}}>Your Jira tickets, on your calendar.</div>
      <Say line="name" at={0.3} show={false} />
    </AbsoluteFill>
  );
};

/** A scene built from the real recording, with the spoken line underneath. */
const Shot = ({line, children}) => (
  <AbsoluteFill style={page}>
    {children}
    <Say line={line} at={0.15} bottom={30} size={46} />
  </AbsoluteFill>
);

const Cut = ({from, length, children}) => (
  <Sequence from={sec(from)} durationInFrames={sec(length)}><Fade length={sec(length)}>{children}</Fade></Sequence>
);

const Values = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const items = [['Transparency first.', 8, H.pink], ['Respect for time.', 44, H.yellow], ['Real focus.', 78, H.mint]];
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      {items.map(([text, at, color]) => {
        const s = spring({frame: f - at, fps, config: {damping: 12, stiffness: 190}});
        return <div key={text} style={{fontSize: 128, fontWeight: 800, letterSpacing: -5, lineHeight: 1.12, color,
          opacity: Math.min(1, s * 1.3), transform: `translateX(${(1 - s) * -80}px) scale(${0.85 + 0.15 * s})`}}>{text}</div>;
      })}
      <Say line="values" show={false} />
    </AbsoluteFill>
  );
};

const Start = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const chips = [['No token', 8, H.pink], ['No server', 30, H.yellow], ['Free and open source', 52, H.mint]];
  const cta = spring({frame: f - 96, fps, config: {damping: 11, stiffness: 170}});
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
      <div style={{opacity: appear(f, 0, 8)}}><Mark size={104} /></div>
      <div style={{fontSize: 150, fontWeight: 800, letterSpacing: -6, lineHeight: 1.05, marginTop: 12, opacity: appear(f, 3, 8), ...gradText()}}>Slotwise</div>
      <div style={{display: 'flex', gap: 18, marginTop: 26}}>
        {chips.map(([text, at, color]) => (
          <div key={text} style={{fontSize: 36, fontWeight: 800, padding: '14px 32px', borderRadius: 44, color: '#0b1024', background: color,
            opacity: appear(f, at, 7), transform: `translateY(${(1 - appear(f, at, 9)) * 22}px)`, boxShadow: '0 12px 30px rgba(0,0,0,.35)'}}>{text}</div>
        ))}
      </div>
      <div style={{marginTop: 54, fontSize: 50, fontWeight: 800, color: '#0b1024', background: '#fff', padding: '20px 50px', borderRadius: 60,
        boxShadow: '0 0 0 6px rgba(255,255,255,.18), 0 20px 50px rgba(0,0,0,.45)', opacity: Math.min(1, cta * 1.3), transform: `scale(${0.8 + 0.2 * cta})`}}>
        github.com/MelihCagdas/slotwise
      </div>
      <Say line="start" show={false} />
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
  add('pool', <Shot line="pool"><Clip name="c1" rate={1.3} zoom={1.16} focus={[0.86, 0.3]} length={sec(LEN.pool)} /></Shot>);
  add('drag', (
    <Shot line="drag">
      <Cut from={0} length={1.3}><Clip name="c2" from={0.6} rate={3.0} zoom={1.3} focus={[0.88, 0.12]} length={36} /></Cut>
      <Cut from={1.3} length={1.6}><Clip name="c3" from={0.3} rate={2.2} /></Cut>
      <Cut from={2.9} length={1.5}><Clip name="c4b" from={1.0} rate={2.6} zoom={1.35} focus={[0.36, 0.45]} length={40} /></Cut>
    </Shot>
  ));
  add('plan', (
    <Shot line="plan">
      <Cut from={0} length={1.3}><Clip name="c6" from={0.3} rate={1.6} zoom={1.25} focus={[0.88, 0.85]} length={36} /></Cut>
      <Cut from={1.3} length={2.2}>
        <Clip name="c6b" rate={26} width={380} ratio={1002 / 460} top={40} />
        <Tag left={1190} top={90}>Sped up</Tag>
      </Cut>
      <Cut from={3.5} length={3.5}><Clip name="c7" from={7.6} rate={2.2} zoom={1.08} focus={[0.3, 0.1]} length={sec(3.5)} /></Cut>
    </Shot>
  ));
  add('team', (
    <Shot line="team">
      <Clip name="c8" from={1.0} rate={1.4} ratio={510 / 1520} top={210} zoom={1.06} focus={[0.3, 0.3]} length={sec(LEN.team)} />
      <Tag left={290} top={130}>Month view: this sprint and the next</Tag>
    </Shot>
  ));
  add('custom', (
    <AbsoluteFill style={page}>
      <Clip name="c5" from={0.8} rate={5.2} zoom={1.35} focus={[0.9, 0.35]} length={sec(LEN.custom)} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 34, textAlign: 'center', fontSize: 50, fontWeight: 800, letterSpacing: -1}}>
        Make it yours: <span style={gradText()}>your days, your statuses, sprint or not.</span>
      </div>
    </AbsoluteFill>
  ));
  add('values', <Values />);
  add('start', <Start />, true);
  return (
    <AbsoluteFill style={{background: '#0b1024'}}>
      <Audio src={staticFile('music/bed.mp3')}
        volume={(f) => interpolate(f, [0, 12, PROMO_FRAMES - 50, PROMO_FRAMES - 4], [0, 0.2, 0.2, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      {out}
    </AbsoluteFill>
  );
};
