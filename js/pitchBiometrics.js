/**
 * pitchBiometrics.js
 * Geometric and kinematic calculations using MediaPipe Pose Landmarks & World Landmarks.
 * Updated with Interior Front Knee Block calculation and 5-Phase Coaching Sequence.
 */

// Helper: True Interior Angle between 3 points (Hip -> Knee -> Ankle) in degrees
export function getInteriorJointAngle(hip, knee, ankle) {
  if (!hip || !knee || !ankle) return 0;
  // Vectors from Knee -> Hip and Knee -> Ankle
  const v1 = { x: hip.x - knee.x, y: hip.y - knee.y, z: (hip.z || 0) - (knee.z || 0) };
  const v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y, z: (ankle.z || 0) - (knee.z || 0) };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);

  if (mag1 === 0 || mag2 === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.round((Math.acos(cosTheta) * 180) / Math.PI);
}

// Legacy helper compatibility
export function getJointAngle2D(a, b, c) {
  return getInteriorJointAngle(a, b, c);
}

// 1. Pelvic Tilt: Angle of pelvis line relative to horizontal
export function calculatePelvicTilt(lHip, rHip) {
  if (!lHip || !rHip) return 0;
  const dy = Math.abs(rHip.y - lHip.y);
  const dx = Math.abs(rHip.x - lHip.x);
  return Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
}

// 2. Transverse Hip-Shoulder Separation using 3D pose_world_landmarks (X-Z ground plane)
export function calculateHipShoulderSeparation(worldLandmarks) {
  if (!worldLandmarks) return 0;
  const lShoulder = worldLandmarks[11];
  const rShoulder = worldLandmarks[12];
  const lHip = worldLandmarks[23];
  const rHip = worldLandmarks[24];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

  const sVec = { x: rShoulder.x - lShoulder.x, z: rShoulder.z - lShoulder.z };
  const hVec = { x: rHip.x - lHip.x, z: rHip.z - lHip.z };

  const magS = Math.hypot(sVec.x, sVec.z);
  const magH = Math.hypot(hVec.x, hVec.z);
  if (magS === 0 || magH === 0) return 0;

  const dot = (sVec.x * hVec.x) + (sVec.z * hVec.z);
  const cosTheta = Math.max(-1, Math.min(1, dot / (magS * magH)));
  return Math.round((Math.acos(cosTheta) * 180) / Math.PI);
}

// 3. Planar Rotation Collinearity
export function calculatePlanarOffset(landmarks, armSide = 'RHP') {
  const sThrow = armSide === 'RHP' ? landmarks[12] : landmarks[11];
  const sGlove = armSide === 'RHP' ? landmarks[11] : landmarks[12];
  const elbow = armSide === 'RHP' ? landmarks[14] : landmarks[13];

  if (!sThrow || !sGlove || !elbow) return 0;

  const shoulderAngle = Math.atan2(sThrow.y - sGlove.y, sThrow.x - sGlove.x);
  const armAngle = Math.atan2(elbow.y - sThrow.y, elbow.x - sThrow.x);

  let diff = Math.abs(((armAngle - shoulderAngle) * 180) / Math.PI);
  if (diff > 180) diff = 360 - diff;
  return Math.round(diff);
}

// 4. Core 5-Phase Coaching Sequence Evaluator
export function evaluateBauerPhases(metrics) {
  const sequence = [
    {
      name: 'Leg Lift',
      pass: metrics.driftCoMDelta >= 0.04,
      actual: `Balanced balance point`,
      benchmark: 'Controlled leg lift & posture',
      cue: 'Establish balance over the rubber before moving.'
    },
    {
      name: 'Hip Drift',
      pass: metrics.pelvicTilt <= 15,
      actual: `${metrics.pelvicTilt}° pelvic tilt`,
      benchmark: 'Hips leading forward (level pelvis ≤ 15°)',
      cue: 'Lead with your back hip down the mound, keeping shoulders level.'
    },
    {
      name: 'Front Foot Land',
      pass: metrics.leadKneeAngle >= 135 && metrics.leadKneeAngle <= 170,
      actual: `${metrics.leadKneeAngle}° interior knee angle`,
      benchmark: 'Front knee braced & posting up (135°–170°)',
      cue: 'Plant firmly on a strong, braced front leg to transfer energy.'
    },
    {
      name: 'Hip Separation',
      pass: metrics.hipShoulderSeparation >= 20,
      actual: `${metrics.hipShoulderSeparation}° separation`,
      benchmark: 'Hips open before shoulders (≥ 20°)',
      cue: 'Keep your chest back toward second base as your front foot strikes.'
    },
    {
      name: 'Release',
      pass: metrics.headDisplacementRatio <= 0.15,
      actual: `Stable extension path`,
      benchmark: 'Stable head & clean arm extension',
      cue: 'Extend fully toward your target with a steady head.'
    }
  ];

  let firstFault = null;
  const phaseResults = sequence.map((phase) => {
    let status = 'PASS';
    if (!phase.pass) {
      if (!firstFault) {
        status = 'FIRST_FAULT';
        firstFault = phase;
      } else {
        status = 'SECONDARY_BLOCKED';
      }
    }
    return { ...phase, status };
  });

  return { firstFault, phases: phaseResults };
}