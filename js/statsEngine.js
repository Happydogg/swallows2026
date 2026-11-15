/**
 * statsEngine.js
 * Pure statistical calculations, leaderboard sorting, and formatting helpers.
 */

export function getPlayerSessionsList(sessions, playerId) {
  return sessions.filter((s) => s.player_id === playerId);
}

export function getLatestPlayerMetric(sessions, playerId, key) {
  const list = getPlayerSessionsList(sessions, playerId);
  const found = list.find((s) => s[key] !== null && s[key] !== undefined && s[key] !== '');
  return found ? found[key] : null;
}

export function calculatePlayerJumpRatio(sessions, playerId) {
  const jump = getLatestPlayerMetric(sessions, playerId, 'broad_jump');
  const height = getLatestPlayerMetric(sessions, playerId, 'height_cm');
  if (!jump || !height || Number(height) <= 0) return null;
  return (Number(jump) / Number(height)).toFixed(2);
}

export function getRowJumpRatio(sessions, session) {
  if (!session.broad_jump) return null;
  let h = session.height_cm;
  if (!h && session.player_id) {
    h = getLatestPlayerMetric(sessions, session.player_id, 'height_cm');
  }
  if (!h || Number(h) <= 0) return null;
  return (Number(session.broad_jump) / Number(h)).toFixed(2);
}

export function getJumpRatioColorClass(ratioStr) {
  if (!ratioStr) return 'text-slate-400';
  const r = Number(ratioStr);
  if (r >= 1.15) return 'text-emerald-400 font-bold';
  if (r >= 1.05) return 'text-cyan-400 font-semibold';
  if (r >= 0.90) return 'text-slate-300';
  return 'text-amber-400 font-medium';
}

export function computeTopMetrics(players, sessions, key, count = 3, ascending = false) {
  const results = [];

  players.forEach((p) => {
    const pSessions = getPlayerSessionsList(sessions, p.id);
    const vals = pSessions
      .map((s) => Number(s[key]))
      .filter((v) => !isNaN(v) && v > 0);

    if (vals.length > 0) {
      const best = ascending ? Math.min(...vals) : Math.max(...vals);
      results.push({ player: p, value: best });
    }
  });

  results.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value));
  return results.slice(0, count);
}

export function computeTopJumpRatios(players, sessions, count = 3) {
  const results = [];

  players.forEach((p) => {
    const pSessions = getPlayerSessionsList(sessions, p.id);
    const valid = [];

    pSessions.forEach((s) => {
      if (s.broad_jump) {
        const h = s.height_cm || getLatestPlayerMetric(sessions, p.id, 'height_cm');
        if (h && Number(h) > 0) {
          const r = Number(s.broad_jump) / Number(h);
          valid.push({
            ratio: Number(r.toFixed(2)),
            jump: s.broad_jump,
            height: h
          });
        }
      }
    });

    if (valid.length > 0) {
      valid.sort((a, b) => b.ratio - a.ratio);
      results.push({
        player: p,
        ratio: valid[0].ratio.toFixed(2),
        jump: valid[0].jump,
        height: valid[0].height
      });
    }
  });

  results.sort((a, b) => Number(b.ratio) - Number(a.ratio));
  return results.slice(0, count);
}

export function formatPlayerHeightWeight(sessions, playerId) {
  const h = getLatestPlayerMetric(sessions, playerId, 'height_cm');
  const w = getLatestPlayerMetric(sessions, playerId, 'weight_kg');
  if (!h && !w) return '--';
  return `${h ? h + 'cm' : '--'} / ${w ? w + 'kg' : '--'}`;
}

export function calculatePlayerAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();

  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (now.getDate() < birth.getDate()) {
    months = Math.max(0, months - 1);
  }

  return `${years}y ${months}m`;
}

export function getClubThresholdCount(players, sessions, threshold) {
  return players.filter((p) => {
    const velo = getLatestPlayerMetric(sessions, p.id, 'exit_velo');
    return velo && Number(velo) >= threshold;
  }).length;
}

export function computeAvgBatSpeed(players, sessions) {
  const velos = players
    .map((p) => getLatestPlayerMetric(sessions, p.id, 'exit_velo'))
    .filter((v) => v !== null && v !== '' && !isNaN(v));

  if (velos.length > 0) {
    const total = velos.reduce((sum, v) => sum + Number(v), 0);
    return (total / velos.length).toFixed(1);
  }
  return '--';
}

export function countSafetyAlerts(sessions) {
  return sessions.filter((s) => s.shoulder_check === 'Adjust').length;
}

export function getAttackAngleColorClass(angle) {
  if (angle === null || angle === undefined || angle === '') return 'text-slate-400';
  const num = Number(angle);
  if (num >= 5 && num <= 15) return 'text-emerald-400 font-bold';
  if (num < 0 || num > 20) return 'text-rose-400 font-bold';
  return 'text-amber-400';
}