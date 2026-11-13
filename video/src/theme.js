import {interpolate, Easing} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Inter';

export const {fontFamily} = loadFont();

export const C = {
  bg: '#f4f6fb', ink: '#101828', muted: '#5b6472', line: '#dde2ea', card: '#ffffff', soft: '#f1f3f6',
  blue: '#0b57d0', blueSoft: '#d3e3fd', event: '#1a73e8',
  todo: '#5f6368', todoBg: '#e8eaed',
  doing: '#0b57d0', doingBg: '#d3e3fd',
  review: '#8a5a00', reviewBg: '#fdecc8',
  green: '#0b6b3a', meeting: '#e3ecfb', meetingInk: '#35507e',
};

export const ease = Easing.bezier(0.4, 0, 0.2, 1);

/** Clamped, eased interpolation. */
export const tween = (f, from, to, a, b, easing = ease) =>
  interpolate(f, [from, to], [a, b], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

/** 0 before `at`, rising to 1 over `len` frames. */
export const appear = (f, at, len = 14) => tween(f, at, at + len, 0, 1);

/** Position along a list of {f, x, y} keyframes. */
export const along = (f, keys) => {
  if (f <= keys[0].f) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (f <= keys[i].f) {
      const a = keys[i - 1], b = keys[i];
      return {x: tween(f, a.f, b.f, a.x, b.x), y: tween(f, a.f, b.f, a.y, b.y)};
    }
  }
  return keys[keys.length - 1];
};
