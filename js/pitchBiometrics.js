/**
 * pitchBiometrics.js
 * Geometric and kinematic calculations using MediaPipe Pose Landmarks & World Landmarks.
 */

// Helper: 2D angle between 3 points (A -> B -> C) in degrees
export function getJointAngle2D(a, b, c) {
  if (!a || !b || !c) return 0;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return Math.round(angle);
}

// 1. Pelvic Tilt (Drop Phase): Angle of pelvis line relative to horizontal
export function calculatePelvicTilt(lHip, rHip) {
  if (!lHip || !rHip) return 0;
  const dy = Math.abs(rHip.y - lHip.y);
  const dx = Math.abs(rHip.x - lHip.x);
  return Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
}

// 2. Transverse Hip-Shoulder Separation (Separate Phase) using 3D pose_world_landmarks (X-Z ground plane)
export function calculateHipShoulderSeparation(worldLandmarks) {
  if (!worldLandmarks) return 0;
  const lShoulder = worldLandmarks[11];
  const rShoulder = worldLandmarks[12];
  const lHip = worldLandmarks[23];
  const rHip = worldLandmarks[24];

  if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

  // Horizontal X-Z plane vectors
  const sVec = { x: rShoulder.x - lShoulder.x, z: rShoulder.z - lShoulder.z };
  const hVec = { x: rHip.x - lHip.x, z: rHip.z - lHip.z };

  const magS = Math.hypot(sVec.x, sVec.z);
  const magH = Math.hypot(hVec.x, hVec.z);
  if (magS === 0 || magH === 0) return 0;

  const dot = (sVec.x * hVec.x) + (sVec.z * hVec.z);
  const cosTheta = Math.max(-1, Math.min(1, dot / (magS * magH)));
  return Math.round((Math.acos(cosTheta) * 180) / Math.PI);
}

// 3. Planar Rotation Collinearity (Spiral Phase): Upper arm alignment to shoulder tilt plane
export function calculatePlanarOffset(landmarks, armSide = 'RHP') {
  const sThrow = armSide === 'RHP' ? landmarks[12] : landmarks[11];
  const sGlove = armSide === 'RHP' ? landmarks[11] : landmarks[12];
  const elbow = armSide === 'RHP' ? landmarks[14] : landmarks[13];

  if (!sThrow || !sGlove || !elbow) return 0;

  // Angle of bi-acromial line
  const shoulderAngle = Math.atan2(sThrow.y - sGlove.y, sThrow.x - sGlove.x);
  // Angle of upper arm line
  const armAngle = Math.atan2(elbow.y - sThrow.y, elbow.x - sThrow.x);

  let diff = Math.abs(((armAngle - shoulderAngle) * 180) / Math.PI);
  if (diff > 180) diff = 360 - diff;
  return Math.round(diff);
}

// 4. Bauer 8-Phase "First Fault" Evaluator
export function evaluateBauerPhases(metrics) {
  const sequence = [
    {
      name: 'Drift',
      pass: metrics.driftCoMDelta >= 0.05,
      actual: `${(metrics.driftCoMDelta * 100).toFixed(1)}% CoM shift`,
      benchmark: 'Forward momentum initiated before knee drops',
      cue: 'Drive hips toward target at peak lift'
    },
    {
      name: 'Drop',
      pass: metrics.pelvicTilt <= 14,
      actual: `${metrics.pelvicTilt}° tilt`,
      benchmark: 'Pelvic line level (≤ 14°)',
      cue: 'Sit into your rear glute pocket, don’t dump hips'
    },
    {
      name: 'Rotate',
      pass: metrics.pelvicRotationFC >= 38,
      actual: `${metrics.pelvicRotationFC}° open`,
      benchmark: 'Pelvis uncoiled ≥ 38° into plant',
      cue: 'Open front hip before chest starts turning'
    },
    {
      name: 'Block',
      pass: metrics.leadKneeAngleBR >= 135 && metrics.kneeExtensionRate >= 0,
      actual: `${metrics.leadKneeAngleBR}° (rate: ${metrics.kneeExtensionRate >= 0 ? '+' : '-'}${Math.abs(metrics.kneeExtensionRate)}°/f)`,
      benchmark: 'Lead knee braced ≥ 135° and posting up',
      cue: 'Slam the front brake and firm up the front leg'
    },
    {
      name: 'Separate',
      pass: metrics.hipShoulderSeparation >= 22,
      actual: `${metrics.hipShoulderSeparation}° separation`,
      benchmark: 'X-Factor separation ≥ 22° at Foot Contact',
      cue: 'Keep chest to the dugout until foot strikes the dirt'
    },
    {
      name: 'Load',
      pass: metrics.elbowFlexionMER >= 78 && metrics.elbowFlexionMER <= 105,
      actual: `${metrics.elbowFlexionMER}° elbow flexion`,
      benchmark: 'Elbow flexion 80°–100° at layback',
      cue: 'Avoid pulling the ball down; keep 90° box in the elbow'
    },
    {
      name: 'Spiral',
      pass: metrics.planarOffset <= 15,
      actual: `${metrics.planarOffset}° slot offset`,
      benchmark: 'Arm on shoulder rotation plane (offset ≤ 15°)',
      cue: 'Match arm slot to torso tilt, don’t force over the top'
    },
    {
      name: 'Throw',
      pass: metrics.headDisplacementRatio <= 0.14,
      actual: `${(metrics.headDisplacementRatio * 100).toFixed(1)}% torso length`,
      benchmark: 'Stable head path through release (≤ 14%)',
      cue: 'Keep eyes level on target, don’t fling head offline'
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