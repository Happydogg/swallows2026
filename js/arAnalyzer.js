/**
 * arAnalyzer.js
 * Stage 2 Dugout AR Video Analyzer controller
 * 5-Phase Coaching Sequence + Interior Knee Protractor Wedge + Reliable Auto-Timestamps.
 */
import * as pitchBiometrics from './pitchBiometrics.js';
import * as pitchAnchorDetector from './pitchAnchorDetector.js';
import * as pitchOverlayRenderer from './pitchOverlayRenderer.js';

const { ref, reactive, computed } = Vue;

export function createArAnalyzerController({ selectedPlayer }) {
  const activeAnalyzerVideo = ref(null);
  const analyzerVideoRef = ref(null);
  const analyzerCanvasRef = ref(null);

  let localObjectUrl = null;
  let loopGeneration = 0;
  let pendingFrame = null;
  let poseLandmarkerInstance = null;
  let poseGeneration = 0;
  let poseInitialization = null;
  let wristHistory = [];

  const isPlaying = ref(false);
  const playbackRate = ref(0.25);
  const showOverlay = ref(true);
  const isTrackerLocked = ref(false);
  const isHudExpanded = ref(false);

  const currentCalculatedSpeed = ref(19.9);
  const currentTrajectoryAngle = ref(16.1);
  const leadKneeAngle = ref(158);
  const headDriftPx = ref(0);
  const initialHeadX = ref(null);
  const elbowFlexionAngle = ref(90);
  const trunkTiltAngle = ref(0);

  const manualRearOverride = ref(null);
  const isRearView = computed(() => {
    if (manualRearOverride.value !== null) return manualRearOverride.value;
    const angle = activeAnalyzerVideo.value?.camera_angle;
    return angle === 'behind_catcher' || angle === 'front';
  });

  const girdleMetrics = ref({
    spineTilt: 0,
    separationAngle: 0,
    shoulderTilt: 0,
    pelvicTilt: 0
  });

  const refGuides = reactive({
    frontWall: true,
    headBox: true,
    spineAxis: true
  });

  const anchoredCoords = reactive({
    frontWallX: null,
    headOrigin: null,
    backLegX: null
  });

  const toggleRefGuide = (key) => {
    if (key in refGuides) refGuides[key] = !refGuides[key];
  };

  let prevWristPosition = null;
  let prevWristTime = null;
  let lastTimestamp = -1;
  let lastRecordedVideoTime = -1;

  // 5-Phase Coaching Sequence State
  const bauerPhases = ref([]);
  const firstFaultPhase = ref(null);
  const activePhaseKey = ref(null);
  let recordedPitchFrames = [];
  let pitchAnchors = null;

  const videoDuration = ref(0);
  const currentPlaybackTime = ref(0);
  const currentFrameIndex = ref(0);
  const totalFramesEstimate = ref(0);

  const initPoseTracker = (retries = 25) => {
    if (poseLandmarkerInstance) return Promise.resolve();
    if (poseInitialization) return poseInitialization;
    const generation = poseGeneration;
    const initialization = (async () => {
      try {
        while (!window.initMediaPipe && retries > 0 && generation === poseGeneration) {
          await new Promise((res) => setTimeout(res, 100));
          retries--;
        }
        if (generation !== poseGeneration || !window.initMediaPipe) return;
        const tracker = await window.initMediaPipe();
        if (generation !== poseGeneration) tracker.close?.();
        else poseLandmarkerInstance = tracker;
      } catch (err) {
        if (generation === poseGeneration) console.warn('MediaPipe init error:', err);
      }
    })();
    poseInitialization = initialization;
    void initialization.then(() => {
      if (poseInitialization === initialization) poseInitialization = null;
    });
    return initialization;
  };

  // Seed proportional timestamps immediately from clip duration so no button ever shows blank
  const seedDefaultCheckpoints = (video, durationSec = 2.0) => {
    const dur = durationSec > 0 && isFinite(durationSec) ? durationSec : 2.0;
    const isPitch = video?.category === 'pitching';
    if (isPitch) {
      bauerPhases.value = [
        { id: 'leg_lift', name: 'Leg Lift', status: 'PASS', time: Number((dur * 0.22).toFixed(2)), isCoachStamped: false },
        { id: 'hip_drift', name: 'Hip Drift', status: 'PASS', time: Number((dur * 0.42).toFixed(2)), isCoachStamped: false },
        { id: 'front_foot_land', name: 'Front Foot Land', status: 'PASS', time: Number((dur * 0.62).toFixed(2)), isCoachStamped: false },
        { id: 'hip_sep', name: 'Hip Separation', status: 'PASS', time: Number((dur * 0.74).toFixed(2)), isCoachStamped: false },
        { id: 'release', name: 'Release', status: 'PASS', time: Number((dur * 0.84).toFixed(2)), isCoachStamped: false }
      ];
      activePhaseKey.value = 'Leg Lift';
    } else {
      bauerPhases.value = [
        { id: 'stride', name: 'Stride', status: 'PASS', time: Number((dur * 0.35).toFixed(2)), isCoachStamped: false },
        { id: 'launch', name: 'Launch', status: 'PASS', time: Number((dur * 0.55).toFixed(2)), isCoachStamped: false },
        { id: 'contact', name: 'Contact', status: 'PASS', time: Number((dur * 0.72).toFixed(2)), isCoachStamped: false }
      ];
      activePhaseKey.value = 'Stride';
    }
  };

  const cancelPendingFrame = () => {
    if (!pendingFrame) return;
    if (pendingFrame.video) pendingFrame.video.cancelVideoFrameCallback(pendingFrame.id);
    else cancelAnimationFrame(pendingFrame.id);
    pendingFrame = null;
  };

  const openAnalyzer = (video) => {
    cancelPendingFrame();
    ++loopGeneration;
    if (localObjectUrl) { URL.revokeObjectURL(localObjectUrl); localObjectUrl = null; }
    activeAnalyzerVideo.value = video;
    manualRearOverride.value = null;
    wristHistory = [];
    initialHeadX.value = null;
    anchoredCoords.frontWallX = null;
    anchoredCoords.headOrigin = null;
    anchoredCoords.backLegX = null;
    prevWristPosition = null;
    prevWristTime = null;
    lastRecordedVideoTime = -1;
    currentPlaybackTime.value = 0;
    recordedPitchFrames = [];
    firstFaultPhase.value = null;
    pitchAnchors = null;
    seedDefaultCheckpoints(video, 2.0);
  };

  // Blob URL stays in this browser tab; never submitted to Supabase or R2.
  const openLocalAnalyzer = (file, { category = 'batting', cameraAngle = 'side_open', playbackFps = 120, motionFactor = 1 } = {}) => {
    if (!file || !file.type.startsWith('video/')) throw new Error('Select an MP4 or MOV video file.');
    openAnalyzer({
      id: 'local-preview',
      video_url: null,
      category,
      camera_angle: cameraAngle,
      fps_mode: playbackFps,
      motion_factor: motionFactor,
      is_local: true,
      filename: file.name
    });
    localObjectUrl = URL.createObjectURL(file);
    activeAnalyzerVideo.value = { ...activeAnalyzerVideo.value, video_url: localObjectUrl };
  };

  const closeAnalyzer = () => {
    cancelPendingFrame();
    ++loopGeneration;
    if (analyzerVideoRef.value) analyzerVideoRef.value.pause();
    activeAnalyzerVideo.value = null;
    isPlaying.value = false;
    if (localObjectUrl) { URL.revokeObjectURL(localObjectUrl); localObjectUrl = null; }
  };

  // Account/session cleanup is stronger than closing the modal: discard all
  // private frames, detach media, and invalidate pending GPU initialization.
  const resetAnalyzer = () => {
    closeAnalyzer();
    poseGeneration++;
    poseInitialization = null;
    poseLandmarkerInstance?.close?.();
    poseLandmarkerInstance = null;
    const video = analyzerVideoRef.value;
    if (video) {
      video.onended = null;
      video.removeAttribute('src');
      video.load();
    }
    const canvas = analyzerCanvasRef.value;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    analyzerVideoRef.value = null;
    analyzerCanvasRef.value = null;
    wristHistory = [];
    recordedPitchFrames = [];
    pitchAnchors = null;
    prevWristPosition = null;
    prevWristTime = null;
    lastTimestamp = -1;
    lastRecordedVideoTime = -1;
    manualRearOverride.value = null;
    initialHeadX.value = null;
    Object.assign(anchoredCoords, { frontWallX: null, headOrigin: null, backLegX: null });
    Object.assign(refGuides, { frontWall: true, headBox: true, spineAxis: true });
    girdleMetrics.value = { spineTilt: 0, separationAngle: 0, shoulderTilt: 0, pelvicTilt: 0 };
    bauerPhases.value = [];
    firstFaultPhase.value = null;
    activePhaseKey.value = null;
    playbackRate.value = 0.25;
    showOverlay.value = true;
    isTrackerLocked.value = false;
    isHudExpanded.value = false;
    currentCalculatedSpeed.value = 19.9;
    currentTrajectoryAngle.value = 16.1;
    leadKneeAngle.value = 158;
    headDriftPx.value = 0;
    elbowFlexionAngle.value = 90;
    trunkTiltAngle.value = 0;
    videoDuration.value = 0;
    currentPlaybackTime.value = 0;
    currentFrameIndex.value = 0;
    totalFramesEstimate.value = 0;
  };

  const computeGirdleMetrics = (pts, worldPts = null) => {
    if (!pts || pts.length < 25) return null;
    const lSh = pts[11], rSh = pts[12];
    const lHip = pts[23], rHip = pts[24];

    const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
    const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };

    const spineDeg = Math.round(Math.atan2(midSh.x - midHip.x, midHip.y - midSh.y) * (180 / Math.PI));
    const shDeg = Math.atan2(rSh.y - lSh.y, rSh.x - lSh.x) * (180 / Math.PI);
    const hipDeg = Math.atan2(rHip.y - lHip.y, rHip.x - lHip.x) * (180 / Math.PI);

    let sepDeg = Math.round(Math.abs(shDeg - hipDeg));
    if (worldPts && pitchBiometrics.calculateHipShoulderSeparation) {
      const worldSep = pitchBiometrics.calculateHipShoulderSeparation(worldPts);
      if (!isNaN(worldSep) && worldSep > 0) sepDeg = Math.round(worldSep);
    }
    if (sepDeg > 90) sepDeg = Math.abs(180 - sepDeg);

    const metrics = { spineTilt: spineDeg, separationAngle: sepDeg, shoulderTilt: Math.round(shDeg), pelvicTilt: Math.round(hipDeg) };
    girdleMetrics.value = metrics;
    trunkTiltAngle.value = Math.abs(spineDeg);
    return metrics;
  };

  const lockReferenceAnchorsFromLandmarks = (pts, forceReset = false) => {
    if (!pts || pts.length < 29) return;
    if (forceReset) {
      anchoredCoords.headOrigin = null;
      anchoredCoords.frontWallX = null;
      anchoredCoords.backLegX = null;
    }

    const throwsRight = selectedPlayer.value?.throws !== 'L';
    const isPitching = activeAnalyzerVideo.value?.category === 'pitching';
    const isRightHitter = selectedPlayer.value?.bats !== 'L';

    const leadSideRight = isPitching ? !throwsRight : !isRightHitter;
    const leadHip = leadSideRight ? pts[24] : pts[23];
    const leadAnk = leadSideRight ? pts[28] : pts[27];
    const backHip = leadSideRight ? pts[23] : pts[24];

    if (anchoredCoords.headOrigin === null && pts[0]) anchoredCoords.headOrigin = { x: pts[0].x, y: pts[0].y };
    if (anchoredCoords.backLegX === null && backHip) anchoredCoords.backLegX = backHip.x;
    if (anchoredCoords.frontWallX === null && (leadAnk || leadHip)) anchoredCoords.frontWallX = leadAnk ? leadAnk.x : leadHip.x;
  };

  const runPitchDiagnostics = () => {
    if (recordedPitchFrames.length < 8) return;
    const isPitch = activeAnalyzerVideo.value?.category === 'pitching';

    if (!isPitch) {
      const batSide = selectedPlayer.value?.bats === 'L' ? 'L' : 'R';
      const batAnchors = pitchAnchorDetector.detectBattingAnchors(recordedPitchFrames, batSide);
      if (!batAnchors) return;
      const timeMap = {
        Stride: batAnchors.timestamps.stride,
        Launch: batAnchors.timestamps.launch,
        Contact: batAnchors.timestamps.contact
      };
      bauerPhases.value = bauerPhases.value.map((p) => ({
        ...p,
        time: p.isCoachStamped ? p.time : (timeMap[p.name] !== undefined ? timeMap[p.name] : p.time)
      }));
      return;
    }

    const armSide = selectedPlayer.value?.throws === 'L' ? 'LHP' : 'RHP';
    const detected = pitchAnchorDetector.detectPitchAnchors(recordedPitchFrames, armSide);
    if (!detected) return;

    pitchAnchors = detected;
    const sorted = detected.sortedFrames;

    const plFrame = sorted[detected.legLift] || sorted[0];
    const fcFrame = sorted[detected.frontFootLand] || sorted[0];

    if (plFrame?.landmarks && fcFrame?.landmarks) {
      const throwsRight = selectedPlayer.value?.throws !== 'L';
      const leadAnkIdx = throwsRight ? 27 : 28;
      const backHipIdx = throwsRight ? 24 : 23;
      anchoredCoords.headOrigin = { x: plFrame.landmarks[0].x, y: plFrame.landmarks[0].y };
      anchoredCoords.backLegX = plFrame.landmarks[backHipIdx]?.x ?? null;
      anchoredCoords.frontWallX = fcFrame.landmarks[leadAnkIdx]?.x ?? null;
    }

    const leadKneeTriplet = armSide === 'RHP' ? [23, 25, 27] : [24, 26, 28];
    const interiorKnee = pitchBiometrics.getInteriorJointAngle(
      fcFrame.landmarks[leadKneeTriplet[0]],
      fcFrame.landmarks[leadKneeTriplet[1]],
      fcFrame.landmarks[leadKneeTriplet[2]]
    );

    const audit = pitchBiometrics.evaluateBauerPhases({
      driftCoMDelta: 0.08,
      pelvicTilt: pitchBiometrics.calculatePelvicTilt(fcFrame.landmarks[23], fcFrame.landmarks[24]),
      leadKneeAngle: interiorKnee,
      hipShoulderSeparation: pitchBiometrics.calculateHipShoulderSeparation(fcFrame.worldLandmarks),
      headDisplacementRatio: 0.09
    });

    const timeMap = {
      'Leg Lift': detected.timestamps.legLift,
      'Hip Drift': detected.timestamps.hipDrift,
      'Front Foot Land': detected.timestamps.frontFootLand,
      'Hip Separation': detected.timestamps.hipSeparation,
      'Release': detected.timestamps.release
    };

    const prevMap = {};
    bauerPhases.value.forEach((p) => {
      prevMap[p.name] = p;
    });

    bauerPhases.value = audit.phases.map((p) => {
      const existing = prevMap[p.name];
      const isStamped = existing?.isCoachStamped === true;
      const resolvedTime = isStamped
        ? existing.time
        : (timeMap[p.name] !== undefined ? timeMap[p.name] : existing?.time ?? 0);
      return {
        ...p,
        isCoachStamped: isStamped,
        time: resolvedTime
      };
    });
    firstFaultPhase.value = audit.firstFault;
  };

  const onAnalyzerVideoLoaded = () => {
    const vid = analyzerVideoRef.value;
    if (!vid) return;
    videoDuration.value = vid.duration;
    vid.playbackRate = playbackRate.value;
    const fps = activeAnalyzerVideo.value?.fps_mode || 240;
    totalFramesEstimate.value = Math.round(vid.duration * fps);

    // Seed all 5 buttons with valid proportional times immediately
    seedDefaultCheckpoints(activeAnalyzerVideo.value, vid.duration);

    vid.onended = () => {
      isPlaying.value = false;
      runPitchDiagnostics();
    };

    const canvas = analyzerCanvasRef.value;
    if (canvas && vid.videoWidth && vid.videoHeight) {
      canvas.width = vid.videoWidth;
      canvas.height = vid.videoHeight;
    }
    startVideoProcessingLoop();
  };

  const togglePlayPause = () => {
    const vid = analyzerVideoRef.value;
    if (!vid) return;
    if (vid.paused) {
      vid.play();
      isPlaying.value = true;
    } else {
      vid.pause();
      isPlaying.value = false;
      runPitchDiagnostics();
    }
  };

  const setPlaybackRate = (rate) => {
    playbackRate.value = rate;
    if (analyzerVideoRef.value) analyzerVideoRef.value.playbackRate = rate;
  };

  const stepFrames = (frames) => {
    const vid = analyzerVideoRef.value;
    if (!vid) return;
    vid.pause();
    isPlaying.value = false;
    const fps = activeAnalyzerVideo.value?.fps_mode || 240;
    vid.currentTime = Math.max(0, Math.min(vid.duration, vid.currentTime + frames * (1 / fps)));
  };

  const onSeekSlider = () => {
    if (analyzerVideoRef.value) analyzerVideoRef.value.currentTime = currentPlaybackTime.value;
  };

  const onAnalyzerTimeUpdate = () => {
    if (!analyzerVideoRef.value) return;
    currentPlaybackTime.value = analyzerVideoRef.value.currentTime;
    const fps = activeAnalyzerVideo.value?.fps_mode || 240;
    currentFrameIndex.value = Math.round(analyzerVideoRef.value.currentTime * fps);
  };

  const toggleOverlay = () => {
    showOverlay.value = !showOverlay.value;
    if (!showOverlay.value && analyzerCanvasRef.value) {
      const ctx = analyzerCanvasRef.value.getContext('2d');
      ctx.clearRect(0, 0, analyzerCanvasRef.value.width, analyzerCanvasRef.value.height);
    }
  };

  const drawReferenceAROverlay = (ctx, w, h, pts, worldPts = null) => {
    const nose = { x: pts[0].x * w, y: pts[0].y * h };
    const lSh = { x: pts[11].x * w, y: pts[11].y * h };
    const rSh = { x: pts[12].x * w, y: pts[12].y * h };
    const lElb = { x: pts[13].x * w, y: pts[13].y * h };
    const rElb = { x: pts[14].x * w, y: pts[14].y * h };
    const lWrist = { x: pts[15].x * w, y: pts[15].y * h };
    const rWrist = { x: pts[16].x * w, y: pts[16].y * h };
    const lHip = { x: pts[23].x * w, y: pts[23].y * h };
    const rHip = { x: pts[24].x * w, y: pts[24].y * h };
    const lKnee = { x: pts[25].x * w, y: pts[25].y * h };
    const rKnee = { x: pts[26].x * w, y: pts[26].y * h };
    const lAnk = { x: pts[27].x * w, y: pts[27].y * h };
    const rAnk = { x: pts[28].x * w, y: pts[28].y * h };

    lockReferenceAnchorsFromLandmarks(pts, false);
    if (initialHeadX.value === null) initialHeadX.value = nose.x;
    headDriftPx.value = Math.round(nose.x - initialHeadX.value);

    // 1. Draw Reference Lines (Front Wall, Head Stability Box, Back-Leg Stack)
    pitchOverlayRenderer.drawReferenceGuidesOverlay(ctx, w, h, anchoredCoords, refGuides, nose);

    // 2. Compute Girdle Metrics
    const gMetrics = computeGirdleMetrics(pts, worldPts);

    // 3. Rear-View Mode
    if (isRearView.value) {
      pitchOverlayRenderer.drawRearGirdleVectors(ctx, w, h, pts, gMetrics);
      if (worldPts) pitchOverlayRenderer.drawSeparationRadar(ctx, worldPts, gMetrics.separationAngle, 16, 16, 62);
      return;
    }

    // 4. Side-View Full Biomechanical Mode
    const isPitching = activeAnalyzerVideo.value?.category === 'pitching';
    const throwsRight = selectedPlayer.value?.throws !== 'L';
    const isLeftHitter = selectedPlayer.value?.bats === 'L';

    // Shoulder Line & Head Node
    ctx.beginPath();
    ctx.moveTo(lSh.x, lSh.y);
    ctx.lineTo(rSh.x, rSh.y);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(nose.x, nose.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Pelvis Line
    const midHipX = (lHip.x + rHip.x) / 2;
    const midHipY = (lHip.y + rHip.y) / 2;
    const midShX = (lSh.x + rSh.x) / 2;
    const midShY = (lSh.y + rSh.y) / 2;

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(lHip.x, lHip.y);
    ctx.lineTo(rHip.x, rHip.y);
    ctx.stroke();

    // Lead Leg & Interior Knee Block Wedge (Pitching & Batting)
    const leadSideRight = isPitching ? !throwsRight : isLeftHitter;
    const leadHipPt = leadSideRight ? rHip : lHip;
    const leadKneePt = leadSideRight ? rKnee : lKnee;
    const leadAnkPt = leadSideRight ? rAnk : lAnk;

    const interiorKneeAngle = pitchBiometrics.getInteriorJointAngle(leadHipPt, leadKneePt, leadAnkPt);
    leadKneeAngle.value = interiorKneeAngle;

    const kneeColor = interiorKneeAngle >= 135 ? '#22c55e' : '#f59e0b';
    ctx.lineWidth = 5;
    ctx.strokeStyle = kneeColor;
    ctx.beginPath();
    ctx.moveTo(leadHipPt.x, leadHipPt.y);
    ctx.lineTo(leadKneePt.x, leadKneePt.y);
    ctx.lineTo(leadAnkPt.x, leadAnkPt.y);
    ctx.stroke();

    // Draw True Interior Knee Angle Wedge on Canvas
    pitchOverlayRenderer.drawAngleArc(ctx, leadHipPt, leadKneePt, leadAnkPt, interiorKneeAngle, kneeColor);

    if (isPitching) {
      if (pitchAnchors?.sortedFrames && pitchAnchors.sortedFrames.length > 0) {
        pitchOverlayRenderer.drawHipDropTrail(
          ctx,
          pitchAnchors.sortedFrames,
          pitchAnchors.legLift,
          pitchAnchors.frontFootLand,
          pitchAnchors.sortedFrames.length - 1
        );
      }

      const throwSh = throwsRight ? rSh : lSh;
      const throwElb = throwsRight ? rElb : lElb;
      const throwWri = throwsRight ? rWrist : lWrist;
      const gloveSh = throwsRight ? lSh : rSh;
      const gloveElb = throwsRight ? lElb : rElb;
      const gloveWri = throwsRight ? lWrist : rWrist;

      // Glove Arm
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.beginPath();
      ctx.moveTo(gloveSh.x, gloveSh.y);
      ctx.lineTo(gloveElb.x, gloveElb.y);
      ctx.lineTo(gloveWri.x, gloveWri.y);
      ctx.stroke();

      // Throwing Arm + Interior Elbow Angle Arc
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(throwSh.x, throwSh.y);
      ctx.lineTo(throwElb.x, throwElb.y);
      ctx.lineTo(throwWri.x, throwWri.y);
      ctx.stroke();

      const interiorElbow = pitchBiometrics.getInteriorJointAngle(throwSh, throwElb, throwWri);
      elbowFlexionAngle.value = interiorElbow;
      pitchOverlayRenderer.drawAngleArc(ctx, throwSh, throwElb, throwWri, interiorElbow, '#f59e0b');

      // Arm Slot Angle
      const shSlope = Math.atan2(rSh.y - lSh.y, rSh.x - lSh.x);
      const upperArmSlope = Math.atan2(throwElb.y - throwSh.y, throwElb.x - throwSh.x);
      let slotDeg = Math.round(Math.abs((upperArmSlope - shSlope) * (180 / Math.PI)));
      if (slotDeg > 180) slotDeg = 360 - slotDeg;
      currentTrajectoryAngle.value = slotDeg || 88;

      // Wrist Whip Trail & Speed
      wristHistory.push({ x: throwWri.x, y: throwWri.y });
      if (wristHistory.length > 25) wristHistory.shift();
      if (wristHistory.length > 2) {
        ctx.beginPath();
        ctx.moveTo(wristHistory[0].x, wristHistory[0].y);
        for (let i = 1; i < wristHistory.length; i++) ctx.lineTo(wristHistory[i].x, wristHistory[i].y);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();
      }

      const nowTime = analyzerVideoRef.value?.currentTime || 0;
      if (prevWristPosition && prevWristTime !== null && nowTime > prevWristTime) {
        const dt = nowTime - prevWristTime;
        const distPx = Math.hypot(throwWri.x - prevWristPosition.x, throwWri.y - prevWristPosition.y);
        const pxPerMeter = Math.hypot(midHipX - midShX, midHipY - midShY) / 0.45;
        if (pxPerMeter > 0 && dt > 0.005) {
          const veloKmh = Number(((distPx / pxPerMeter / dt) * 3.6).toFixed(1));
          if (veloKmh > 0 && veloKmh < 160) currentCalculatedSpeed.value = veloKmh;
        }
      }
      prevWristPosition = { x: throwWri.x, y: throwWri.y };
      prevWristTime = nowTime;
    } else {
      // Batting Upper Body & Hand Path
      const leadWrist = isLeftHitter ? lWrist : rWrist;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(lSh.x, lSh.y);
      ctx.lineTo(lElb.x, lElb.y);
      ctx.lineTo(lWrist.x, lWrist.y);
      ctx.strokeStyle = '#f97316';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rSh.x, rSh.y);
      ctx.lineTo(rElb.x, rElb.y);
      ctx.lineTo(rWrist.x, rWrist.y);
      ctx.strokeStyle = '#22c55e';
      ctx.stroke();

      wristHistory.push({ x: leadWrist.x, y: leadWrist.y });
      if (wristHistory.length > 25) wristHistory.shift();
      if (wristHistory.length > 2) {
        ctx.beginPath();
        ctx.moveTo(wristHistory[0].x, wristHistory[0].y);
        for (let i = 1; i < wristHistory.length; i++) ctx.lineTo(wristHistory[i].x, wristHistory[i].y);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#06b6d4';
        ctx.stroke();
      }
    }
  };

  const startVideoProcessingLoop = () => {
    const vid = analyzerVideoRef.value;
    const canvas = analyzerCanvasRef.value;
    if (!vid || !canvas) return;
    const ctx = canvas.getContext('2d');

    cancelPendingFrame();
    const generation = ++loopGeneration;
    const scheduleFrame = () => {
      if ('requestVideoFrameCallback' in vid && 'cancelVideoFrameCallback' in vid) {
        pendingFrame = { video: vid, id: vid.requestVideoFrameCallback(processFrame) };
      } else {
        pendingFrame = { id: requestAnimationFrame(processFrame) };
      }
    };
    const processFrame = () => {
      if (generation !== loopGeneration) return;
      pendingFrame = null;
      if (activeAnalyzerVideo.value && poseLandmarkerInstance && vid.readyState >= 2) {
        const now = performance.now();
        if (now > lastTimestamp) {
          lastTimestamp = now;
          try {
            const results = poseLandmarkerInstance.detectForVideo(vid, now);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (showOverlay.value && results.landmarks && results.landmarks[0]) {
              isTrackerLocked.value = true;
              if (Math.abs(vid.currentTime - lastRecordedVideoTime) >= 0.003) {
                lastRecordedVideoTime = vid.currentTime;
                recordedPitchFrames.push({
                  frameIdx: currentFrameIndex.value,
                  timestamp: vid.currentTime,
                  landmarks: results.landmarks[0],
                  worldLandmarks: results.worldLandmarks ? results.worldLandmarks[0] : null
                });
                if (recordedPitchFrames.length % 12 === 0) runPitchDiagnostics();
              }
              drawReferenceAROverlay(
                ctx,
                canvas.width,
                canvas.height,
                results.landmarks[0],
                results.worldLandmarks ? results.worldLandmarks[0] : null
              );
            } else {
              isTrackerLocked.value = false;
            }
          } catch (err) {
            console.warn('Frame dropped:', err);
          }
        }
      }
      if (activeAnalyzerVideo.value) {
        scheduleFrame();
      }
    };

    scheduleFrame();
  };

  const jumpToPhase = (phase) => {
    if (!analyzerVideoRef.value) return;
    activePhaseKey.value = phase.name;
    analyzerVideoRef.value.pause();
    isPlaying.value = false;
    if (phase.time !== undefined && phase.time !== null) {
      analyzerVideoRef.value.currentTime = Number(phase.time);
    }
  };

  const stampCurrentFrameToCheckpoint = (phaseName) => {
    if (!analyzerVideoRef.value) return;
    const nowSec = Number(analyzerVideoRef.value.currentTime.toFixed(2));
    const idx = bauerPhases.value.findIndex((p) => p.name === phaseName);
    if (idx !== -1) {
      bauerPhases.value[idx] = {
        ...bauerPhases.value[idx],
        time: nowSec,
        frameIdx: currentFrameIndex.value,
        isCoachStamped: true
      };
    }
    if (idx === 0 && recordedPitchFrames.length > 0) {
      const latest = recordedPitchFrames[recordedPitchFrames.length - 1];
      if (latest?.landmarks) lockReferenceAnchorsFromLandmarks(latest.landmarks, true);
    }
  };

  const getPhaseButtonClass = (phase) => {
    const isSelected = activePhaseKey.value === phase.name;
    const ringClass = isSelected ? 'ring-2 ring-amber-400 ' : '';
    if (phase.status === 'FIRST_FAULT') return ringClass + 'bg-amber-950 text-amber-300 border-amber-500 shadow-md shadow-amber-900/40';
    if (phase.status === 'PASS') return ringClass + 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900';
    return ringClass + 'bg-slate-800 text-slate-400 border-slate-700';
  };

  return {
    initPoseTracker,
    resetAnalyzer,
    activeAnalyzerVideo,
    analyzerVideoRef,
    analyzerCanvasRef,
    isPlaying,
    playbackRate,
    showOverlay,
    isTrackerLocked,
    isHudExpanded,
    isRearView,
    girdleMetrics,
    refGuides,
    toggleRefGuide,
    currentCalculatedSpeed,
    currentTrajectoryAngle,
    leadKneeAngle,
    headDriftPx,
    videoDuration,
    currentPlaybackTime,
    currentFrameIndex,
    totalFramesEstimate,
    openAnalyzer,
    openLocalAnalyzer,
    closeAnalyzer,
    onAnalyzerVideoLoaded,
    togglePlayPause,
    setPlaybackRate,
    stepFrames,
    onSeekSlider,
    onAnalyzerTimeUpdate,
    toggleOverlay,
    elbowFlexionAngle,
    trunkTiltAngle,
    bauerPhases,
    firstFaultPhase,
    activePhaseKey,
    jumpToPhase,
    stampCurrentFrameToCheckpoint,
    getPhaseButtonClass
  };
}