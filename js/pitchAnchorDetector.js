/**
 * pitchAnchorDetector.js
 * Automatically detects the 4 primary kinematic anchor frames across the full pitch.
 */

export function detectPitchAnchors(framesData, armSide = 'RHP') {
  if (!framesData || framesData.length < 20) return null;

  const totalFrames = framesData.length;
  const leadKneeIdx = armSide === 'RHP' ? 25 : 26;
  const leadAnkleIdx = armSide === 'RHP' ? 27 : 28;
  const leadHeelIdx = armSide === 'RHP' ? 29 : 30;
  const throwWristIdx = armSide === 'RHP' ? 16 : 15;
  const throwElbowIdx = armSide === 'RHP' ? 14 : 13;
  const throwShoulderIdx = armSide === 'RHP' ? 12 : 11;

  // 1. Peak Leg Lift: Highest elevation (minimum Y value) of lead knee across the first 75% of the clip
  let peakLiftFrame = 0;
  let minY = 999;
  const maxLiftSearch = Math.floor(totalFrames * 0.75);

  for (let f = 0; f < maxLiftSearch; f++) {
    const knee = framesData[f]?.landmarks?.[leadKneeIdx];
    if (knee && knee.y < minY) {
      minY = knee.y;
      peakLiftFrame = f;
    }
  }

  // 2. Ball Release (BR): Locate the global maximum wrist linear velocity AFTER peak lift
  // (Ball release is the most distinct kinematic event in the entire clip)
  let releaseFrame = peakLiftFrame + 10;
  let maxWristVelocity = -1;

  for (let f = peakLiftFrame; f < totalFrames - 1; f++) {
    const w1 = framesData[f]?.landmarks?.[throwWristIdx];
    const w2 = framesData[f + 1]?.landmarks?.[throwWristIdx];
    const s = framesData[f]?.landmarks?.[throwShoulderIdx];

    if (w1 && w2 && s) {
      const v = Math.hypot(w2.x - w1.x, w2.y - w1.y);
      // Hand must be past or level with shoulder towards the plate
      const isForward = armSide === 'RHP' ? (w1.x > s.x - 0.05) : (w1.x < s.x + 0.05);
      if (v > maxWristVelocity && isForward) {
        maxWristVelocity = v;
        releaseFrame = f;
      }
    }
  }

  // 3. Foot Contact (FC): Occurs BETWEEN Peak Lift and Ball Release
  // Lead heel / ankle reaches lowest point and decelerates to stationary ground impact
  let footContactFrame = Math.floor((peakLiftFrame + releaseFrame) / 2);
  let maxFootY = -1;

  for (let f = peakLiftFrame; f < releaseFrame; f++) {
    const heel = framesData[f]?.landmarks?.[leadHeelIdx] || framesData[f]?.landmarks?.[leadAnkleIdx];
    if (heel && heel.y > maxFootY) {
      maxFootY = heel.y;
      footContactFrame = f;
    }
  }

  // 4. Max External Rotation (MER): Peak layback (wrist lowest/deepest behind elbow) between FC and Release
  let merFrame = Math.max(footContactFrame + 1, releaseFrame - 4);
  let maxLayback = -999;

  for (let f = footContactFrame; f <= releaseFrame; f++) {
    const w = framesData[f]?.landmarks?.[throwWristIdx];
    const e = framesData[f]?.landmarks?.[throwElbowIdx];
    if (w && e) {
      const layback = w.y - e.y;
      if (layback > maxLayback) {
        maxLayback = layback;
        merFrame = f;
      }
    }
  }

  return {
    peakLift: peakLiftFrame,
    footContact: footContactFrame,
    mer: merFrame,
    release: releaseFrame
  };
}