/**
 * pitchOverlayRenderer.js
 * Canvas rendering routines for pitching & batting AR overlays,
 * True Interior Protractor Arcs, Auto-Anchored Reference Guides, and Rear-View Girdle Vectors.
 */

// 1. Draw the continuous Hip Drop Trajectory from Leg Lift to Front Foot Land
export function drawHipDropTrail(ctx, framesData, startFrame, endFrame, currentFrame) {
  if (currentFrame < startFrame || !framesData || framesData.length === 0) return;

  const stopFrame = Math.min(currentFrame, endFrame, framesData.length - 1);
  const points = [];

  for (let f = Math.max(0, startFrame); f <= stopFrame; f++) {
    const lm = framesData[f]?.landmarks;
    if (!lm || !lm[23] || !lm[24]) continue;

    const px = ((lm[23].x + lm[24].x) / 2) * ctx.canvas.width;
    const py = ((lm[23].y + lm[24].y) / 2) * ctx.canvas.height;
    points.push({ x: px, y: py, frame: f });
  }

  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = '#06b6d4'; // Cyan
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 4]);
  ctx.stroke();

  ctx.setLineDash([]);
  points.forEach((pt, idx) => {
    if (idx % 2 === 0 || idx === points.length - 1) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, idx === points.length - 1 ? 4 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = idx === points.length - 1 ? '#22c55e' : '#38bdf8';
      ctx.fill();
    }
  });

  ctx.beginPath();
  ctx.arc(points[0].x, points[0].y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();

  ctx.restore();
}

// 2. Top-Down Transverse Hip-Shoulder Separation Inset Radar
export function drawSeparationRadar(ctx, worldLandmarks, separationAngle, x = 16, y = 16, size = 68) {
  if (!worldLandmarks) return;

  const lS = worldLandmarks[11], rS = worldLandmarks[12];
  const lH = worldLandmarks[23], rH = worldLandmarks[24];
  if (!lS || !rS || !lH || !rH) return;

  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 4;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 4);
  ctx.lineTo(cx, cy + r - 4);
  ctx.moveTo(cx - r + 4, cy);
  ctx.lineTo(cx + r - 4, cy);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.stroke();

  const sAngle = Math.atan2(rS.z - lS.z, rS.x - lS.x);
  const hAngle = Math.atan2(rH.z - lH.z, rH.x - lH.x);

  // Hip Vector (Cyan)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hAngle) * (r - 6), cy + Math.sin(hAngle) * (r - 6));
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Shoulder Vector (Yellow)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sAngle) * (r - 6), cy + Math.sin(sAngle) * (r - 6));
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`SEP ${separationAngle}°`, cx, cy + size / 2 + 12);

  ctx.restore();
}

// 3. Draw True Interior Joint Angle Protractor Wedge & Label (auto-handles normalized or pixel coords)
export function drawAngleArc(ctx, a, b, c, angle, color = '#22c55e') {
  if (!a || !b || !c) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Support both normalized (0..1) and pixel coordinates seamlessly
  const isNorm = a.x <= 1.5 && b.x <= 1.5 && c.x <= 1.5;
  const ax = isNorm ? a.x * w : a.x;
  const ay = isNorm ? a.y * h : a.y;
  const bx = isNorm ? b.x * w : b.x;
  const by = isNorm ? b.y * h : b.y;
  const cx = isNorm ? c.x * w : c.x;
  const cy = isNorm ? c.y * h : c.y;

  const radius = Math.max(22, Math.min(w, h) * 0.045);

  const ang1 = Math.atan2(ay - by, ax - bx);
  const ang2 = Math.atan2(cy - by, cx - bx);

  // Compute clockwise angular sweep from ang1 to ang2 in [0, 2*PI)
  let cwDiff = (ang2 - ang1) % (2 * Math.PI);
  if (cwDiff < 0) cwDiff += 2 * Math.PI;

  // Always draw the shorter INTERIOR arc (< 180 deg)
  const anticlockwise = cwDiff > Math.PI;

  // Calculate interior bisector angle so the degree text sits right inside the joint bend
  const interiorSweep = anticlockwise ? (2 * Math.PI - cwDiff) : cwDiff;
  const midAngle = anticlockwise ? (ang1 - interiorSweep / 2) : (ang1 + interiorSweep / 2);

  ctx.save();

  // Draw semi-transparent interior wedge fill
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.arc(bx, by, radius, ang1, ang2, anticlockwise);
  ctx.closePath();
  ctx.fillStyle = color === '#22c55e' ? 'rgba(34, 197, 94, 0.22)' : 'rgba(245, 158, 11, 0.22)';
  ctx.fill();

  // Draw interior arc border
  ctx.beginPath();
  ctx.arc(bx, by, radius, ang1, ang2, anticlockwise);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw high-contrast degree pill along the interior bisector
  const labelDist = radius + 18;
  const lx = bx + Math.cos(midAngle) * labelDist;
  const ly = by + Math.sin(midAngle) * labelDist;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(lx - 18, ly - 9, 36, 18, 4);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${angle}°`, lx, ly);

  ctx.restore();
}

// 4. Draw Auto-Anchored Reference Guides (Front Wall, Head Box, Back-Leg Stack)
export function drawReferenceGuidesOverlay(ctx, w, h, anchors, toggles, currentNosePx) {
  if (!anchors) return;
  ctx.save();

  // A. Front Wall Line (Vertical emerald barrier at lead foot plant)
  if (toggles.frontWall && anchors.frontWallX !== null) {
    const wallX = anchors.frontWallX * w;
    ctx.beginPath();
    ctx.moveTo(wallX, h * 0.12);
    ctx.lineTo(wallX, h * 0.92);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(wallX - 44, h * 0.12 - 20, 88, 18);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FRONT WALL', wallX, h * 0.12 - 7);
  }

  // B. Head Stability Box/Circle (Anchored at Leg Lift / Stride)
  if (toggles.headBox && anchors.headOrigin) {
    const hx = anchors.headOrigin.x * w;
    const hy = anchors.headOrigin.y * h;
    const radius = Math.max(22, w * 0.038);

    const driftDist = currentNosePx ? Math.hypot(currentNosePx.x - hx, currentNosePx.y - hy) : 0;
    const isDrifting = driftDist > radius * 1.15;

    ctx.beginPath();
    ctx.arc(hx, hy, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = isDrifting ? '#f43f5e' : '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.stroke();

    if (currentNosePx && driftDist > 4) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(currentNosePx.x, currentNosePx.y);
      ctx.strokeStyle = isDrifting ? '#f43f5e' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // C. Back-Leg Stack Vertical Reference Line
  if (toggles.spineAxis && anchors.backLegX !== null) {
    const stackX = anchors.backLegX * w;
    ctx.beginPath();
    ctx.moveTo(stackX, h * 0.25);
    ctx.lineTo(stackX, h * 0.90);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.65)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
  }

  ctx.restore();
}

// 5. Draw Rear-View Girdle Vectors (Bypasses occluded arm/leg jitter)
export function drawRearGirdleVectors(ctx, w, h, pts, girdleMetrics) {
  if (!pts || !girdleMetrics) return;

  const lSh = { x: pts[11].x * w, y: pts[11].y * h };
  const rSh = { x: pts[12].x * w, y: pts[12].y * h };
  const lHip = { x: pts[23].x * w, y: pts[23].y * h };
  const rHip = { x: pts[24].x * w, y: pts[24].y * h };

  const midSh = { x: (lSh.x + rSh.x) / 2, y: (lSh.y + rSh.y) / 2 };
  const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(midHip.x, midHip.y - 160);
  ctx.lineTo(midHip.x, midHip.y + 40);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(midHip.x, midHip.y);
  ctx.lineTo(midSh.x, midSh.y);
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(lHip.x, lHip.y);
  ctx.lineTo(rHip.x, rHip.y);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(lSh.x, lSh.y);
  ctx.lineTo(rSh.x, rSh.y);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();

  [lSh, rSh, lHip, rHip].forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = idx < 2 ? '#fde047' : '#d8b4fe';
    ctx.fill();
  });

  const calloutX = Math.min(w - 135, Math.max(12, midSh.x + 28));
  const calloutY = Math.max(30, midSh.y - 10);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(calloutX, calloutY, 122, 44, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`/// SPINE: ${girdleMetrics.spineTilt}°`, calloutX + 8, calloutY + 16);

  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`/// H-S SEP: ${girdleMetrics.separationAngle}°`, calloutX + 8, calloutY + 33);

  ctx.restore();
}