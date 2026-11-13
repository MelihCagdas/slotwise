import React from 'react';
import {AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {C, appear} from './theme';
import {page, sec, Clip, Tag, Fade, Mark, S, EventCard} from './shared';

// The real screen recording, trimmed, with a line saying what is happening.
// [clip, start in clip (s), length shown (s), playback speed, label, crop ratio]
const PARTS = [
  ['c0', 0, 4.7, 1, 'Slotwise sits folded in the corner. One click opens it'],
  ['c1', 0, 4.1, 1, 'Your Jira tickets beside Google Calendar, coloured by status'],
  ['c2', 0, 4.3, 1, 'Search: type a word or a ticket number'],
  ['c3', 0, 4.1, 1, 'Drag a ticket onto a slot'],
  ['c4a', 0.6, 3.4, 1, 'It is saved as a normal calendar event'],
  ['c4b', 0, 2.3, 1, 'Stretch it to the time it needs'],
  ['c5', 0, 13.0, 1, 'Customise: which tickets, working days, statuses, event length'],
  ['c9', 0, 5.6, 1, 'Fold it away, and bring it back, whenever you like'],
  ['c6', 0, 1.8, 1, 'Press Plan tasks'],
  ['c6b', 0, 7.5, 3, 'Each remaining ticket is placed in turn. Press Stop at any time', 994 / 460, 'Sped up 3x'],
  ['c7', 0, 5.0, 1, 'The week is planned: work in progress first, sized by story points'],
  ['c8', 0, 7.3, 1, 'Month view: this sprint, and the next one in the weeks after', 472 / 1520],
  ['c10', 0, 3.3, 1, 'Day view works the same way'],
];
const INTRO = 3.2, OUTRO = 3.0;
export const RECORDING_FRAMES = sec(INTRO + PARTS.reduce((s, p) => s + p[2], 0) + OUTRO);

const Label = ({text}) => {
  const f = useCurrentFrame();
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center'}}>
      <EventCard text={text} a={appear(f, 2, 11)} size={34} />
    </div>
  );
};

const Card = ({title, lines}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{...page, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
      <div style={{opacity: appear(f, 0, 10)}}><Mark size={96} /></div>
      <div style={{fontSize: 104, fontWeight: 600, letterSpacing: -4, marginTop: 24, opacity: appear(f, 4, 12)}}>{title}</div>
      {lines.map((l, i) => (
        <div key={l} style={{fontSize: 30, color: S.secondary, marginTop: i ? 8 : 20, opacity: appear(f, 14 + i * 8, 12)}}>{l}</div>
      ))}
    </AbsoluteFill>
  );
};

export const Recording = () => {
  let at = 0;
  const out = [];
  const add = (seconds, node, last) => {
    const length = sec(seconds);
    out.push(<Sequence key={at} from={at} durationInFrames={length}><Fade length={length} last={last}>{node}</Fade></Sequence>);
    at += length;
  };
  add(INTRO, <Card title="Slotwise in use" lines={['An actual screen recording of the extension in Google Calendar.',
    'Sample tickets. The pointer is driven by a script; everything else is the live product.']} />);
  PARTS.forEach(([name, from, seconds, rate, label, ratio, tag]) => add(seconds, (
    <AbsoluteFill style={page}>
      {ratio && ratio > 1
        ? <Clip name={name} from={from} rate={rate} width={Math.round(860 / ratio)} ratio={ratio} top={46} />
        : <Clip name={name} from={from} rate={rate} ratio={ratio || 836 / 1520} top={ratio ? 200 : 40} />}
      {tag ? <Tag left={ratio && ratio > 1 ? 1180 : 276} top={64}>{tag}</Tag> : null}
      <Label text={label} />
    </AbsoluteFill>
  )));
  add(OUTRO, <Card title="Slotwise" lines={['github.com/MelihCagdas/slotwise', 'Free and open source']} />, true);
  return (
    <AbsoluteFill style={{background: S.bg}}>
      <Audio src={staticFile('music/bed.mp3')} loop
        volume={(f) => interpolate(f, [0, 15, RECORDING_FRAMES - 60, RECORDING_FRAMES - 4], [0, 0.1, 0.1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      {out}
    </AbsoluteFill>
  );
};
