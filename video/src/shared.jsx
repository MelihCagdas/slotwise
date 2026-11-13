import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {C, fontFamily, appear} from './theme';

export const FPS = 30;
export const sec = (s) => Math.round(s * FPS);

export const page = {
  fontFamily, color: C.ink,
  background: `radial-gradient(1200px 700px at 15% 0%, #e7efff 0%, rgba(231,239,255,0) 60%), radial-gradient(1000px 700px at 100% 100%, #e9f7ef 0%, rgba(233,247,239,0) 55%), ${C.bg}`,
};
export const shadow = '0 24px 60px rgba(16,24,40,.14)';

/** The Slotwise mark: three slots in a rounded square. */
export const Mark = ({size = 120}) => (
  <div style={{width: size, height: size, borderRadius: size * 0.26, background: C.blue, position: 'relative',
    boxShadow: '0 16px 40px rgba(11,87,208,.35)'}}>
    <div style={{position: 'absolute', left: '18%', right: '18%', top: '24%', height: '14%', background: '#fff', borderRadius: 8}} />
    <div style={{position: 'absolute', left: '18%', width: '44%', top: '46%', height: '14%', background: '#9ec2ff', borderRadius: 8}} />
    <div style={{position: 'absolute', left: '18%', width: '30%', top: '68%', height: '14%', background: '#9ec2ff', borderRadius: 8}} />
  </div>
);

/**
 * A clip of the real screen recording in a rounded window.
 * `from` is where in the clip to start (seconds), `rate` the playback speed,
 * `zoom`/`focus` an optional slow push-in towards a point (0..1 of the frame).
 */
export const Clip = ({name, from = 0, rate = 1, width = 1400, ratio = 876 / 1520, top = 40, zoom = 1, focus = [0.5, 0.5], length = 90}) => {
  const f = useCurrentFrame();
  const z = 1 + (zoom - 1) * Math.min(1, f / Math.max(1, length));
  const height = Math.round(width * ratio);
  return (
    <div style={{position: 'absolute', left: (1920 - width) / 2, top, width, height, borderRadius: 22, overflow: 'hidden',
      border: `1px solid ${C.line}`, boxShadow: shadow, background: '#fff'}}>
      <OffthreadVideo src={staticFile(`rec/${name}.mp4`)} startFrom={sec(from)} playbackRate={rate} muted
        style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', transform: `scale(${z})`,
          transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`}} />
    </div>
  );
};

/** A small label in the corner of a clip, such as "Sped up 8x". */
export const Tag = ({children, left = 240, top = 70}) => (
  <div style={{position: 'absolute', left, top, background: C.ink, color: '#fff', fontSize: 22, fontWeight: 700,
    padding: '8px 18px', borderRadius: 24}}>{children}</div>
);

/** Fades a scene in and out. */
export const Fade = ({length, last, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: Math.min(appear(f, 0, 8), last ? 1 : 1 - appear(f, length - 8, 8))}}>{children}</AbsoluteFill>;
};
