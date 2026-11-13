import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {Promo, TOTAL_FRAMES} from './Promo';

const Root = () => (
  <Composition id="Promo" component={Promo} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
);

registerRoot(Root);
