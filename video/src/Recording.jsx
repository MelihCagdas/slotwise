import React from 'react';
import {AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, interpolate} from 'remotion';
import {C, appear} from './theme';
import {page, sec, Clip, Tag, Fade, Mark, S} from './shared';

// The real screen recording, trimmed, with a line saying what is happening.
// [clip, start in clip (s), length shown (s), playback speed, label, crop ratio]
const PARTS = [
  ['c1', 0, 4.6, 1, 'Your Jira tickets sit beside Google Calendar, coloured by status'],
  ['c2', 0, 4.7, 1, 'Search: type a word or a ticket number'],
  ['c3', 0, 3.9, 1, 'Drag a ticket onto a slot'],
  ['c4a', 0, 2.0, 1, 'It is saved as a normal calendar event'],
  ['c4b', 0, 5.2, 1, 'Stretch it to the time it needs'],
  ['c5', 0, 13.5, 1, 'Customise: which tickets, working days, statuses, event length'],
  ['c6', 0, 2.4, 1, 'Press Auto-plan my tickets'],
  ['c6b', 0, 7.5, 8, 'Each remaining ticket is placed in turn', 1002 / 460, 'Sped up 8x'],
  ['c7', 7.6, 8.0, 1, 'The week is planned: work in progress first, sized by story points'],
  ['c8', 0, 12.0, 1, 'Month view: this sprint, and the next one in the weeks after', 510 / 1520],
];
const INTRO = 3.2, OUTRO = 3.0;
export const RECORDING_FRAMES = sec(INTRO + PARTS.reduce((s, p) => s + p[2], 0) + OUTRO);

const Label = ({text}) => {
  const f = useCurrentFrame();
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 40, textAlign: 'center', fontSize: 38, fontWeight: 500,
      letterSpacing: -0.6, color: S.ink, opacity: appear(f, 2, 10), transform: `translateY(${(1 - appear(f, 2, 12)) * 12}px)`}}>{text}</div>
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
        : <Clip name={name} from={from} rate={rate} ratio={ratio || 876 / 1520} top={ratio ? 200 : 40} />}
      {tag ? <Tag left={ratio && ratio > 1 ? 1180 : 276} top={64}>{tag}</Tag> : null}
      <Label text={label} />
    </AbsoluteFill>
  )));
  add(OUTRO, <Card title="Slotwise" lines={['github.com/MelihCagdas/slotwise', 'Free and open source']} />, true);
  return (
    <AbsoluteFill style={{background: S.bg}}>
      <Audio src={staticFile('music/bed.mp3')} loop
        volume={(f) => interpolate(f, [0, 15, RECORDING_FRAMES - 60, RECORDING_FRAMES - 4], [0, 0.22, 0.22, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      {out}
    </AbsoluteFill>
  );
};
