/**
 * chartManager.js
 * Renders velocity progression and physical growth curves via Chart.js.
 */

let chartInstance = null;

export function clearPlayerChart() {
  chartInstance?.destroy();
  chartInstance = null;
}

export function renderPlayerChartCanvas({ canvasId = 'playerVelocityChart', playerSessions, chartMode, t }) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return false;

  const sortedSessions = (playerSessions || [])
    .slice()
    .sort((a, b) => new Date(a.session_date) - new Date(b.session_date));

  let validPoints = [];
  let datasets = [];
  let scalesConfig = {};

  if (chartMode === 'velocity') {
    validPoints = sortedSessions.filter(
      (s) => (s.exit_velo !== null && s.exit_velo !== '') || (s.throwing_velo !== null && s.throwing_velo !== '')
    );

    if (validPoints.length > 0) {
      datasets = [
        {
          label: `${t('exitVelo')} (km/h)`,
          data: validPoints.map((s) => (s.exit_velo ? Number(s.exit_velo) : null)),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#60a5fa',
          pointBorderColor: '#1e3a8a',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.35,
          spanGaps: true
        },
        {
          label: `${t('throwingVelo')} (km/h)`,
          data: validPoints.map((s) => (s.throwing_velo ? Number(s.throwing_velo) : null)),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#34d399',
          pointBorderColor: '#064e3b',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.35,
          spanGaps: true
        }
      ];

      scalesConfig = {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.4)', drawBorder: false },
          ticks: { color: '#94a3b8', font: { size: 11, family: 'monospace' } }
        },
        y: {
          grid: { color: 'rgba(51, 65, 85, 0.4)', drawBorder: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11, family: 'monospace' },
            callback: (val) => val + ' km/h'
          },
          suggestedMin: 40,
          suggestedMax: 80
        }
      };
    }
  } else {
    validPoints = sortedSessions.filter(
      (s) => (s.height_cm !== null && s.height_cm !== '') || (s.weight_kg !== null && s.weight_kg !== '')
    );

    if (validPoints.length > 0) {
      datasets = [
        {
          label: `${t('heightCm')}`,
          data: validPoints.map((s) => (s.height_cm ? Number(s.height_cm) : null)),
          borderColor: '#c084fc',
          backgroundColor: 'rgba(192, 132, 252, 0.1)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#d8b4fe',
          pointBorderColor: '#581c87',
          pointBorderWidth: 2,
          yAxisID: 'yHeight',
          fill: true,
          tension: 0.35,
          spanGaps: true
        },
        {
          label: `${t('weightKg')}`,
          data: validPoints.map((s) => (s.weight_kg ? Number(s.weight_kg) : null)),
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.08)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#fde68a',
          pointBorderColor: '#78350f',
          pointBorderWidth: 2,
          yAxisID: 'yWeight',
          fill: true,
          tension: 0.35,
          spanGaps: true
        }
      ];

      scalesConfig = {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.4)', drawBorder: false },
          ticks: { color: '#94a3b8', font: { size: 11, family: 'monospace' } }
        },
        yHeight: {
          type: 'linear',
          position: 'left',
          grid: { color: 'rgba(51, 65, 85, 0.4)', drawBorder: false },
          ticks: {
            color: '#c084fc',
            font: { size: 11, family: 'monospace' },
            callback: (val) => val + ' cm'
          },
          suggestedMin: 110,
          suggestedMax: 160
        },
        yWeight: {
          type: 'linear',
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#fbbf24',
            font: { size: 11, family: 'monospace' },
            callback: (val) => val + ' kg'
          },
          suggestedMin: 20,
          suggestedMax: 60
        }
      };
    }
  }

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (validPoints.length === 0) return false;

  const ctx = canvas.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: validPoints.map((s) => s.session_date),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#94a3b8',
          bodyColor: '#ffffff',
          borderColor: '#475569',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          callbacks: {
            label: (context) => {
              const val = context.parsed.y;
              if (val === null || val === undefined) return ` ${context.dataset.label}: --`;
              const unit = chartMode === 'velocity' ? ' km/h' : context.dataset.yAxisID === 'yHeight' ? ' cm' : ' kg';
              return ` ${context.dataset.label}: ${val}${unit}`;
            }
          }
        }
      },
      scales: scalesConfig
    }
  });

  return true;
}