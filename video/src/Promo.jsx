import React from 'react';
import {AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, spring, useVideoConfig} from 'remotion';
import {C, tween, appear} from './theme';
import {page, shadow, sec, Clip, Tag, Fade, Mark} from './shared';

// The voice-over, line by line: [file, length in seconds, words shown on screen]
const VO = {
  hook: ['l1', 5.46, 'Jira knows what you promised. Your calendar knows where your time goes. They never meet.'],
  pain: ['l2', 5.67, 'So an empty slot looks free. Meetings land on your real work, and the task slips again.'],
  name: ['l3', 1.33, 'Meet Slotwise.'],
  pool: ['l4', 4.73, 'Your Jira tickets sit right beside your Google Calendar, coloured by status.'],
  drag: ['l5', 4.36, 'Search for a ticket, drag it onto a slot, and stretch it to the time it needs.'],
  plan: ['l6', 7.18, 'Or press Auto-plan, and your tickets are laid out across the week. Work in progress first, sized by story points.'],
  team: ['l7', 5.85, "Each one is a normal calendar event. So your team sees what you're working on, and when not to book you."],
  values: ['l8', 5.20, 'Transparency first. Respect for time. Real focus, and work that gets done.'],
  start: ['l9', 4.78, 'No token. No server. Free and open source. Set it up in a minute.'],
};

// Scene lengths in seconds. They add up to 60.
const LEN = {hook: 6.2, pain: 6.3, name: 2.6, pool: 5.2, drag: 6.9, plan: 9.0, team: 6.6, custom: 3.0, values: 6.0, start: 8.2};
export const PROMO_FRAMES = sec(Object.values(LEN).reduce((a, b) => a + b, 0));

/** Plays one voice-over line and shows its words as they are spoken. */
const Say = ({line, at = 0.3, size = 40, bottom = 40, color = C.ink}) => {
  const f = useCurrentFrame();
  const [file, seconds, text] = VO[line];
  const words = text.split(' ');
  const total = text.length;
  let seen = 0;
  return (
    <>
      <Sequence from={sec(at)}><Audio src={staticFile(`vo/${file}.mp3`)} /></Sequence>
      <div style={{position: 'absolute', left: 160, right: 160, bottom, textAlign: 'center', fontSize: size, fontWeight: 700,
        letterSpacing: -0.6, lineHeight: 1.3, color}}>
        {words.map((w, i) => {
          const start = sec(at) + (seen / total) * sec(seconds) * 0.94;
          seen += w.length + 1;
          const o = appear(f, start, 5);
          return <span key={i} style={{opacity: 0.16 + 0.84 * o, display: 'inline-block', marginRight: '0.28em',
            transform: `translateY(${(1 - o) * 6}px)`}}>{w}</span>;
        })}
      </div>
    </>
  );
};

const KIND = {doing: [C.doing, C.doingBg], review: [C.review, C.reviewBg], todo: [C.todo, C.todoBg]};
const Ticket = ({k, summary, status, kind, style}) => (
  <div style={{background: C.card, border: `1px solid ${C.line}`, borderLeft: `6px solid ${KIND[kind][0]}`, borderRadius: 10,
    padding: '9px 12px', marginBottom: 10, ...style}}>
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
  const big = (at, text, strong) => (
    <div style={{fontSize: strong ? 104 : 58, fontWeight: strong ? 800 : 600, letterSpacing: strong ? -3.5 : -1,
      color: strong ? C.ink : C.muted, opacity: appear(f, at, 12), transform: `translateY(${(1 - appear(f, at, 14)) * 24}px)`}}>{text}</div>
  );
  const apart = tween(f, 122, 160, 0, 100);
  const card = {position: 'absolute', top: 500, width: 520, height: 330, background: C.card, borderRadius: 22,
    border: `1px solid ${C.line}`, boxShadow: shadow, padding: 22, boxSizing: 'border-box'};
  return (
    <AbsoluteFill style={{...page, alignItems: 'center'}}>
      <div style={{marginTop: 80, textAlign: 'center', lineHeight: 1.25}}>
        {big(10, 'Jira knows what you promised.')}
        {big(58, 'Your calendar knows where your time goes.')}
        <div style={{height: 12}} />
        {big(126, 'They never meet.', true)}
      </div>
      <div style={{...card, left: 400 - apart, opacity: appear(f, 14, 14), transform: `rotate(${-tween(f, 122, 160, 0, 2.5)}deg)`}}>
        <div style={{fontWeight: 800, fontSize: 22, marginBottom: 12}}>Sprint board</div>
        <Ticket k="APP-212" summary="Checkout redesign" status="In Progress" kind="doing" />
        <Ticket k="APP-198" summary="Fix export bug" status="In Progress" kind="doing" />
        <Ticket k="APP-205" summary="Search filters" status="In Review" kind="review" />
      </div>
      <div style={{...card, left: 1000 + apart, opacity: appear(f, 62, 14), transform: `rotate(${tween(f, 122, 160, 0, 2.5)}deg)`}}>
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
      <Say line="hook" at={0.4} size={1} color="transparent" />
    </AbsoluteFill>
  );
};

// 2. An empty slot looks free, so meetings land on the work nobody can see.
const Pain = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const W = 250, H = 62, X0 = 335, Y0 = 150;
  const drop = (at) => spring({frame: f - at, fps, config: {damping: 12, stiffness: 170}});
  const meetings = [[0, 1, 1, 'Standup', 0], [3, 2, 1.5, 'Customer call', 0], [1, 1.5, 1.5, 'Quick sync?', 78], [1, 3, 1, 'Catch-up', 96], [2, 2, 1.5, 'Planning review', 104]];
  const pushed = tween(f, 110, 150, 0, 1);
  return (
    <AbsoluteFill style={page}>
      <div style={{position: 'absolute', left: X0 - 20, top: 60, width: 5 * W + 40, height: 620, background: C.card, borderRadius: 22,
        border: `1px solid ${C.line}`, boxShadow: shadow}} />
      {days.map((d, i) => (
        <div key={d} style={{position: 'absolute', left: X0 + i * W, top: 84, width: W, textAlign: 'center', fontSize: 15,
          letterSpacing: 1.5, color: C.muted, fontWeight: 700, borderLeft: i ? `1px solid ${C.line}` : 'none', height: 580}}>{d}</div>
      ))}
      {Array.from({length: 8}, (_, i) => (
        <div key={i} style={{position: 'absolute', left: X0, width: 5 * W, top: Y0 + i * H, borderTop: `1px solid ${C.soft}`}} />
      ))}
      {/* The real work: planned, but invisible to everyone else */}
      <div style={{position: 'absolute', left: X0 + W + 8, top: Y0 + 1.5 * H, width: W - 16, height: 2.5 * H - 6, boxSizing: 'border-box',
        border: `3px dashed ${pushed > 0.3 ? '#d93025' : C.blue}`, borderRadius: 10, padding: '8px 12px', fontSize: 19, fontWeight: 700,
        color: pushed > 0.3 ? '#d93025' : C.blue, background: pushed > 0.3 ? '#fde8e6' : '#eef4ff', opacity: appear(f, 6, 12) * (1 - 0.55 * pushed),
        transform: `translate(${pushed * 30}px, ${pushed * 250}px) rotate(${pushed * 5}deg)`}}>
        APP-212 Checkout redesign
        <div style={{fontWeight: 600, fontSize: 15, marginTop: 4}}>{pushed > 0.3 ? 'Pushed out again' : 'Planned, but only in Jira'}</div>
      </div>
      {meetings.map(([d, h, len, label, at], i) => {
        const s = drop(at);
        return s <= 0 ? null : (
          <div key={i} style={{position: 'absolute', left: X0 + d * W + 8, top: Y0 + h * H + 2, width: W - 16, height: len * H - 6, boxSizing: 'border-box',
            background: at ? '#fbe3c6' : C.meeting, color: at ? '#8a4b00' : C.meetingInk, borderRadius: 10, padding: '8px 12px', fontSize: 19, fontWeight: 700,
            opacity: s, transform: `translateY(${(1 - s) * -60}px)`, boxShadow: at ? '0 10px 22px rgba(138,75,0,.22)' : 'none'}}>{label}</div>
        );
      })}
      <Say line="pain" at={0.3} bottom={110} size={44} />
    </AbsoluteFill>
  );
};

// 3. The name.
const Name = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame: f, fps, config: {damping: 13, stiffness: 160}});
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{transform: `scale(${pop})`}}><Mark size={130} /></div>
      <div style={{fontSize: 132, fontWeight: 800, letterSpacing: -5, marginTop: 30, opacity: appear(f, 8, 12)}}>Slotwise</div>
      <div style={{fontSize: 42, color: C.muted, marginTop: 4, opacity: appear(f, 20, 12)}}>Your Jira tickets, on your calendar.</div>
      <Say line="name" at={0.35} size={1} color="transparent" />
    </AbsoluteFill>
  );
};

/** A scene built from the real recording, with the spoken line underneath. */
const Shot = ({line, at, children}) => (
  <AbsoluteFill style={page}>
    {children}
    <Say line={line} at={at} bottom={34} size={38} />
  </AbsoluteFill>
);

const Cut = ({from, length, children}) => (
  <Sequence from={sec(from)} durationInFrames={sec(length)}><Fade length={sec(length)}>{children}</Fade></Sequence>
);

const Values = () => {
  const f = useCurrentFrame();
  const items = [['Transparency first.', 10], ['Respect for time.', 52], ['Real focus, and work that gets done.', 90]];
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center'}}>
      {items.map(([text, at], i) => (
        <div key={text} style={{fontSize: i === 2 ? 84 : 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1.22, color: i === 2 ? C.blue : C.ink,
          opacity: appear(f, at, 12), transform: `translateY(${(1 - appear(f, at, 14)) * 28}px)`}}>{text}</div>
      ))}
      <Say line="values" at={0.3} size={1} color="transparent" />
    </AbsoluteFill>
  );
};

const Start = () => {
  const f = useCurrentFrame();
  const chips = [['No token', 12], ['No server', 30], ['Free and open source', 50]];
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
      <div style={{opacity: appear(f, 0, 10)}}><Mark size={96} /></div>
      <div style={{fontSize: 110, fontWeight: 800, letterSpacing: -4, marginTop: 22, opacity: appear(f, 4, 12)}}>Slotwise</div>
      <div style={{display: 'flex', gap: 18, marginTop: 30}}>
        {chips.map(([text, at]) => (
          <div key={text} style={{fontSize: 32, fontWeight: 700, padding: '14px 30px', borderRadius: 40, background: C.card,
            border: `1px solid ${C.line}`, boxShadow: '0 10px 26px rgba(16,24,40,.08)', opacity: appear(f, at, 10),
            transform: `translateY(${(1 - appear(f, at, 12)) * 18}px)`}}>{text}</div>
        ))}
      </div>
      <div style={{fontSize: 46, fontWeight: 800, marginTop: 44, opacity: appear(f, 86, 12)}}>Set it up in a minute.</div>
      <div style={{marginTop: 26, fontSize: 44, fontWeight: 800, color: '#fff', background: C.blue, padding: '18px 44px', borderRadius: 50,
        boxShadow: '0 16px 40px rgba(11,87,208,.35)', opacity: appear(f, 120, 12), transform: `scale(${0.9 + 0.1 * appear(f, 120, 14)})`}}>
        github.com/MelihCagdas/slotwise
      </div>
      <Say line="start" at={0.3} size={1} color="transparent" />
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
  add('pool', <Shot line="pool" at={0.2}><Clip name="c1" rate={0.9} zoom={1.12} focus={[0.86, 0.3]} length={sec(LEN.pool)} /></Shot>);
  add('drag', (
    <Shot line="drag" at={0.2}>
      <Cut from={0} length={2.0}><Clip name="c2" from={0.4} rate={2.1} zoom={1.25} focus={[0.88, 0.12]} length={60} /></Cut>
      <Cut from={2.0} length={2.3}><Clip name="c3" from={0.2} rate={1.6} /></Cut>
      <Cut from={4.3} length={2.6}><Clip name="c4b" from={0.6} rate={1.7} zoom={1.3} focus={[0.36, 0.45]} length={70} /></Cut>
    </Shot>
  ));
  add('plan', (
    <Shot line="plan" at={0.2}>
      <Cut from={0} length={1.6}><Clip name="c6" from={0.2} rate={1.4} zoom={1.2} focus={[0.88, 0.85]} length={48} /></Cut>
      <Cut from={1.6} length={2.9}>
        <Clip name="c6b" rate={19} width={395} ratio={1002 / 460} top={46} />
        <Tag left={1180} top={90}>Sped up</Tag>
      </Cut>
      <Cut from={4.5} length={4.5}><Clip name="c7" from={7.4} rate={1.6} zoom={1.08} focus={[0.3, 0.1]} length={sec(4.5)} /></Cut>
    </Shot>
  ));
  add('team', (
    <Shot line="team" at={0.2}>
      <Clip name="c8" from={1.5} rate={1} ratio={510 / 1520} top={190} zoom={1.06} focus={[0.3, 0.3]} length={sec(LEN.team)} />
      <Tag left={240} top={120}>Month view: this sprint and the next</Tag>
    </Shot>
  ));
  add('custom', (
    <AbsoluteFill style={page}>
      <Clip name="c5" from={0.8} rate={4.2} zoom={1.3} focus={[0.9, 0.35]} length={sec(LEN.custom)} />
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 44, textAlign: 'center', fontSize: 40, fontWeight: 800}}>
        Customise how it plans: your days, your statuses, sprint or not.
      </div>
    </AbsoluteFill>
  ));
  add('values', <Values />);
  add('start', <Start />, true);
  return <AbsoluteFill style={{background: C.bg}}>{out}</AbsoluteFill>;
};
