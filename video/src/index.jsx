import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {Promo, PROMO_FRAMES} from './Promo';
import {Recording, RECORDING_FRAMES} from './Recording';
import {Mark} from './shared';

const Icon = () => <Mark size={512} />;

const Root = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={PROMO_FRAMES} fps={30} width={1920} height={1080} />
 <Composition id="Icon" component={Icon} durationInFrames={1} fps={30} width={512} height={512} />
    <Composition id="Recording" component={Recording} durationInFrames={RECORDING_FRAMES} fps={30} width={1920} height={1080} />
  </>
);

registerRoot(Root);
