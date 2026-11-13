import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {C, fontFamily, appear} from './theme';

export const FPS = 30;
export const sec = (s) => Math.round(s * FPS);

// One family for everything, plus a mono for times and small labels.
export const mono = loadMono().fontFamily;

// The two products it joins set the palette: Jira's blue for the brand,
// Google Calendar's page grey, event blue, yellow and green, and the red
// "now" line a calendar draws at the current time.
export const S = {
  bg: '#f8fafd', surface: '#ffffff', ink: '#172b4d', secondary: '#44546f', muted: '#8993a5',
  line: 'rgba(9,30,66,.14)', brand: '#0c66e4', now: '#ea4335', event: '#1a73e8', yellow: '#fbbc04', green: '#34a853',
};
// Kept under the old names so every scene reads from the same place.
export const H = {text: S.ink, dim: S.secondary, faint: S.muted};

export const page = {fontFamily, color: S.ink, background: S.bg};
export const ui = {fontFamily, color: C.ink};
export const shadow = '0 1px 2px rgba(21,23,26,.06), 0 12px 32px rgba(21,23,26,.08)';

/** The Slotwise mark: a calendar page holding two ticket cards, on Jira blue. */
export const Mark = ({size = 120}) => {
  const r = size * 0.035;
  return (
    <div style={{width: size, height: size, borderRadius: size * 0.24, background: S.brand, position: 'relative'}}>
      {[27, 65].map((left) => (
        <div key={left} style={{position: 'absolute', left: `${left}%`, top: '7%', width: '8%', height: '15%', borderRadius: size * 0.04, background: '#fff'}} />
      ))}
      <div style={{position: 'absolute', left: '13%', right: '13%', top: '27%', bottom: '13%', borderRadius: size * 0.09, background: '#fff', overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: '11%', top: '15%', width: '70%', height: '27%', borderRadius: r, background: S.event}}>
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: '16%', background: S.yellow, borderRadius: `${r}px 0 0 ${r}px`}} />
        </div>
        <div style={{position: 'absolute', left: '30%', top: '55%', width: '59%', height: '27%', borderRadius: r, background: S.green}}>
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: '19%', background: S.ink, borderRadius: `${r}px 0 0 ${r}px`}} />
        </div>
      </div>
    </div>
  );
};

/**
 * A clip of the real screen recording in a plain window.
 * `from` is where in the clip to start (seconds), `rate` the playback speed,
 * `zoom`/`focus` an optional push-in towards a point (0..1 of the frame).
 */
export const Clip = ({name, from = 0, rate = 1, width = 1400, ratio = 876 / 1520, top = 44, zoom = 1, focus = [0.5, 0.5], length = 90}) => {
  const f = useCurrentFrame();
  const z = 1 + (zoom - 1) * Math.min(1, f / Math.max(1, length));
  const height = Math.round(width * ratio);
  return (
    <div style={{position: 'absolute', left: (1920 - width) / 2, top, width, height, borderRadius: 16, overflow: 'hidden',
      border: `1px solid ${S.line}`, boxShadow: shadow, background: S.surface}}>
      <OffthreadVideo src={staticFile(`rec/${name}.mp4`)} startFrom={sec(from)} playbackRate={rate} muted
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', transform: `scale(${z})`,
          transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`}} />
    </div>
  );
};

/** A small note on a clip, such as "Sped up". */
export const Tag = ({children, left = 276, top = 60}) => (
  <div style={{position: 'absolute', left, top, background: S.surface, color: S.secondary, fontFamily: mono, fontSize: 20,
    padding: '6px 12px', borderRadius: 8, border: `1px solid ${S.line}`}}>{children}</div>
);

/** Fades a scene in and out. */
export const Fade = ({length, last, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: Math.min(appear(f, 0, 6), last ? 1 : 1 - appear(f, length - 6, 6))}}>{children}</AbsoluteFill>;
};
