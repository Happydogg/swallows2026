/**
 * pitchOverlayRenderer.js
 * Canvas rendering routines for pitching AR overlays.
 */

// 1. Draw the continuous Hip Drop Trajectory from Peak Lift to Foot Plant
export function drawHipDropTrail(ctx, framesData, startFrame, endFrame, currentFrame) {
  if (currentFrame < startFrame) return;

  const stopFrame = Math.min(currentFrame, endFrame);
  const points = [];

  for (let f = startFrame; f <= stopFrame; f++) {
    const lm = framesData[f]?.landmarks;
    if (!lm || !lm[23] || !lm[24]) continue;

    const px = ((lm[23].x + lm[24].x) / 2) * ctx.canvas.width;
    const py = ((lm[23].y + lm[24].y) / 2) * ctx.canvas.height;
    points.push({ x: px, y: py, frame: f });
  }

  if (points.length < 2) return;

  ctx.save();
  // Trace line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = '#06b6d4'; // Cyan
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 4]);
  ctx.stroke();

  // Draw acceleration cadence dots
  ctx.setLineDash([]);
  points.forEach((pt, idx) => {
    if (idx % 2 === 0 || idx === points.length - 1) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, idx === points.length - 1 ? 4 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = idx === points.length - 1 ? '#22c55e' : '#38bdf8';
      ctx.fill();
    }
  });

  // Start apex pin
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
  // Radar disc
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Target orientation crosshair (Top = Plate)
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 4);
  ctx.lineTo(cx, cy + r - 4);
  ctx.moveTo(cx - r + 4, cy);
  ctx.lineTo(cx + r - 4, cy);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.stroke();

  // Vectors
  const sAngle = Math.atan2(rS.z - lS.z, rS.x - lS.x);
  const hAngle = Math.atan2(rH.z - lH.z, rH.x - lH.x);

  // Draw Hip Vector (Cyan)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hAngle) * (r - 6), cy + Math.sin(hAngle) * (r - 6));
  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw Shoulder Vector (Yellow)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sAngle) * (r - 6), cy + Math.sin(sAngle) * (r - 6));
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Badge Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${separationAngle}°`, cx, cy + size / 2 + 12);

  ctx.restore();
}

// 3. Draw Frozen Kinematic Angle Arc
export function drawAngleArc(ctx, a, b, c, angle, color = '#22c55e') {
  if (!a || !b || !c) return;
  const bx = b.x * ctx.canvas.width;
  const by = b.y * ctx.canvas.height;
  const radius = 22;

  const startAngle = Math.atan2((a.y * ctx.canvas.height) - by, (a.x * ctx.canvas.width) - bx);
  const endAngle = Math.atan2((c.y * ctx.canvas.height) - by, (c.x * ctx.canvas.width) - bx);

  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by, radius, startAngle, endAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Text label pill
  ctx.fillStyle = color;
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`${angle}°`, bx + 12, by - 8);
  ctx.restore();
}