/**
 * pitchAnchorDetector.js
 * Identifies the 4 primary kinematic anchor frames across MediaPipe landmark history.
 */

export function detectPitchAnchors(framesData, armSide = 'RHP') {
  if (!framesData || framesData.length < 15) return null;

  const leadKneeIdx = armSide === 'RHP' ? 25 : 26;
  const leadAnkleIdx = armSide === 'RHP' ? 27 : 28;
  const leadHeelIdx = armSide === 'RHP' ? 29 : 30;
  const throwWristIdx = armSide === 'RHP' ? 16 : 15;
  const throwElbowIdx = armSide === 'RHP' ? 14 : 13;
  const throwShoulderIdx = armSide === 'RHP' ? 12 : 11;

  // 1. Peak Leg Lift: Highest point (lowest Y) of lead knee
  let peakLiftFrame = 0;
  let minY = 999;
  const searchLiftWindow = Math.min(framesData.length, 60);

  for (let f = 0; f < searchLiftWindow; f++) {
    const knee = framesData[f]?.landmarks?.[leadKneeIdx];
    if (knee && knee.y < minY) {
      minY = knee.y;
      peakLiftFrame = f;
    }
  }

  // 2. Foot Contact (FC): Instant lead heel/ankle decelerates to near-zero downward velocity
  let footContactFrame = peakLiftFrame + 10;
  let maxFootDecel = 0;

  for (let f = peakLiftFrame + 5; f < framesData.length - 10; f++) {
    const cur = framesData[f]?.landmarks?.[leadHeelIdx] || framesData[f]?.landmarks?.[leadAnkleIdx];
    const nxt = framesData[f + 1]?.landmarks?.[leadHeelIdx] || framesData[f + 1]?.landmarks?.[leadAnkleIdx];
    const prv = framesData[f - 1]?.landmarks?.[leadHeelIdx] || framesData[f - 1]?.landmarks?.[leadAnkleIdx];

    if (cur && nxt && prv) {
      const vPrev = Math.abs(cur.y - prv.y);
      const vNext = Math.abs(nxt.y - cur.y);
      const decel = vPrev - vNext; // sharp deceleration at impact
      if (decel > maxFootDecel && cur.y > 0.6) { // ground half of screen
        maxFootDecel = decel;
        footContactFrame = f;
      }
    }
  }

  // 3. Ball Release (BR): Peak linear wrist velocity in the throwing direction ahead of shoulder
  let releaseFrame = footContactFrame + 8;
  let maxWristVelocity = -1;

  for (let f = footContactFrame; f < Math.min(framesData.length - 1, footContactFrame + 45); f++) {
    const w1 = framesData[f]?.landmarks?.[throwWristIdx];
    const w2 = framesData[f + 1]?.landmarks?.[throwWristIdx];
    const s = framesData[f]?.landmarks?.[throwShoulderIdx];

    if (w1 && w2 && s) {
      const v = Math.hypot(w2.x - w1.x, w2.y - w1.y);
      // Gated: hand must be past the shoulder line toward the target
      const isPastShoulder = armSide === 'RHP' ? (w1.x > s.x) : (w1.x < s.x);
      if (v > maxWristVelocity && isPastShoulder) {
        maxWristVelocity = v;
        releaseFrame = f;
      }
    }
  }

  // 4. Max External Rotation (MER): Peak forearm layback between FC and Release
  let merFrame = Math.max(footContactFrame + 1, releaseFrame - 4);
  let maxLaybackOffset = -999;

  for (let f = footContactFrame; f <= releaseFrame; f++) {
    const w = framesData[f]?.landmarks?.[throwWristIdx];
    const e = framesData[f]?.landmarks?.[throwElbowIdx];
    if (w && e) {
      // Layback in side open-view drops wrist down/back relative to elbow
      const laybackMetric = (w.y - e.y);
      if (laybackMetric > maxLaybackOffset) {
        maxLaybackOffset = laybackMetric;
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