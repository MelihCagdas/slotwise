import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {loadFont as loadDisplay} from '@remotion/google-fonts/BricolageGrotesque';
import {C, fontFamily, appear} from './theme';

export const FPS = 30;
export const sec = (s) => Math.round(s * FPS);

// Headlines and spoken words use a characterful display face; the product UI keeps Inter.
export const display = loadDisplay().fontFamily;

// Colours for text and accents on the dark stage.
export const H = {
  text: '#ffffff', dim: 'rgba(255,255,255,.62)', faint: 'rgba(255,255,255,.26)',
  pink: '#ff5c9a', amber: '#ffb020', yellow: '#ffd23f', mint: '#3ee6b5', violet: '#8b7bff',
  grad: 'linear-gradient(92deg, #ff5c9a 0%, #ffb020 55%, #ffd23f 100%)',
  gradCool: 'linear-gradient(92deg, #8b7bff 0%, #3ee6b5 100%)',
};

/** Text filled with a gradient. */
export const gradText = (gradient = H.grad) => ({
  backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
});

export const page = {
  fontFamily: display, color: H.text,
  background: 'radial-gradient(1100px 700px at 8% -5%, rgba(139,123,255,.55) 0%, rgba(139,123,255,0) 62%), ' +
    'radial-gradient(900px 620px at 100% 8%, rgba(255,92,154,.42) 0%, rgba(255,92,154,0) 60%), ' +
    'radial-gradient(1000px 700px at 70% 115%, rgba(62,230,181,.30) 0%, rgba(62,230,181,0) 60%), #0b1024',
};
export const ui = {fontFamily, color: C.ink}; // for mock product pieces drawn on the stage
export const shadow = '0 30px 80px rgba(0,0,0,.45)';

/**
 * The Slotwise mark: a calendar page holding two ticket cards.
 * A calendar (rings on top, a white page) with tickets slotted into it.
 */
export const Mark = ({size = 120, flat = false}) => (
  <div style={{width: size, height: size, borderRadius: size * 0.24, background: 'linear-gradient(140deg, #6d5cff 0%, #ff5c9a 100%)',
    position: 'relative', boxShadow: flat ? 'none' : '0 18px 50px rgba(255,92,154,.45)'}}>
    {[27, 65].map((left) => (
      <div key={left} style={{position: 'absolute', left: `${left}%`, top: '7%', width: '8%', height: '15%', borderRadius: size * 0.04, background: '#fff'}} />
    ))}
    <div style={{position: 'absolute', left: '13%', right: '13%', top: '27%', bottom: '13%', borderRadius: size * 0.09, background: '#fff', overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: '11%', top: '15%', width: '70%', height: '27%', borderRadius: size * 0.035, background: '#0b57d0'}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: '16%', background: '#ffd23f', borderRadius: `${size * 0.035}px 0 0 ${size * 0.035}px`}} />
      </div>
      <div style={{position: 'absolute', left: '30%', top: '55%', width: '59%', height: '27%', borderRadius: size * 0.035, background: '#3ee6b5'}}>
        <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: '19%', background: '#0b1024', opacity: 0.85, borderRadius: `${size * 0.035}px 0 0 ${size * 0.035}px`}} />
      </div>
    </div>
  </div>
);

/**
 * A clip of the real screen recording in a rounded window.
 * `from` is where in the clip to start (seconds), `rate` the playback speed,
 * `zoom`/`focus` an optional push-in towards a point (0..1 of the frame).
 */
export const Clip = ({name, from = 0, rate = 1, width = 1400, ratio = 876 / 1520, top = 40, zoom = 1, focus = [0.5, 0.5], length = 90}) => {
  const f = useCurrentFrame();
  const z = 1 + (zoom - 1) * Math.min(1, f / Math.max(1, length));
  const height = Math.round(width * ratio);
  return (
    <div style={{position: 'absolute', left: (1920 - width) / 2, top, width, height, borderRadius: 24, overflow: 'hidden',
      boxShadow: `0 0 0 3px rgba(255,255,255,.16), 0 0 70px rgba(139,123,255,.35), ${shadow}`, background: '#fff'}}>
      <OffthreadVideo src={staticFile(`rec/${name}.mp4`)} startFrom={sec(from)} playbackRate={rate} muted
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', transform: `scale(${z})`,
          transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`}} />
    </div>
  );
};

/** A small label on a clip, such as "Sped up". */
export const Tag = ({children, left = 290, top = 66}) => (
  <div style={{position: 'absolute', left, top, background: H.yellow, color: '#1a1300', fontSize: 24, fontWeight: 800,
    padding: '8px 20px', borderRadius: 26, boxShadow: '0 10px 26px rgba(0,0,0,.35)'}}>{children}</div>
);

/** Fades a scene in and out. */
export const Fade = ({length, last, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: Math.min(appear(f, 0, 5), last ? 1 : 1 - appear(f, length - 5, 5))}}>{children}</AbsoluteFill>;
};
