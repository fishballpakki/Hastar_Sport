const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('id');

const titleEl = document.getElementById('tournament-analysis-title');
const metaEl = document.getElementById('tournament-analysis-meta');
const chartGrid = document.getElementById('chart-grid');
const analysisEmpty = document.getElementById('analysis-empty');
const backLink = document.getElementById('back-link');
const backToTournament = document.getElementById('back-to-tournament');

const charts = [];
let tournament = null;
let tournamentMatches = [];

function showEmptyState() {
  titleEl.textContent = '尚無數據';
  metaEl.textContent = '此賽事尚未建立任何比賽。';
  chartGrid.hidden = true;
  analysisEmpty.hidden = false;
}

function destroyCharts() {
  while (charts.length > 0) {
    charts.pop().destroy();
  }
}

function buildRadarRows(metrics) {
  const rows = RADAR_METRICS.map(({ key, label }) => `
    <div class="metric-list__row">
      <dt>${escapeHtml(label)}</dt>
      <dd>
        ${formatMetricValue(key, metrics)}
        <span class="metric-list__detail">原始 ${escapeHtml(formatRawMetricValue(key, metrics))}</span>
      </dd>
    </div>
  `).join('');
  return `<h4 class="metric-section-title">雷達圖</h4><dl class="metric-list">${rows}</dl>`;
}

function buildAdvancedRows(metrics) {
  return `
    <h4 class="metric-section-title">進階數據</h4>
    <dl class="metric-list">
      <div class="metric-list__row">
        <dt>K/D/A</dt>
        <dd>${escapeHtml(metrics.kda)} <span class="metric-list__detail">(${escapeHtml(metrics.details.kda)})</span></dd>
      </div>
      <div class="metric-list__row">
        <dt>AO</dt>
        <dd>${formatNumber(metrics.ao)} <span class="metric-list__detail">${escapeHtml(metrics.details.ao)}</span></dd>
      </div>
      <div class="metric-list__row">
        <dt>AP</dt>
        <dd>${formatNumber(metrics.ap)} <span class="metric-list__detail">${escapeHtml(metrics.details.ap)}</span></dd>
      </div>
      <div class="metric-list__row">
        <dt>AQ</dt>
        <dd>${formatNumber(metrics.aq)} <span class="metric-list__detail">${escapeHtml(metrics.details.aq)}</span></dd>
      </div>
      <div class="metric-list__row">
        <dt>評級</dt>
        <dd><span class="rank-badge rank-badge--${metrics.rank.toLowerCase()}">${metrics.rank}</span></dd>
      </div>
    </dl>
  `;
}

function createRadarChart(canvas, metrics) {
  const labels = RADAR_METRICS.map(({ label }) => label);
  const values = metrics.radarValues.map((value) => Math.round(value));

  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: 'rgba(91, 156, 255, 0.22)',
        borderColor: 'rgba(91, 156, 255, 0.95)',
        borderWidth: 2,
        pointBackgroundColor: '#5b9cff',
        pointBorderColor: '#e8edf4',
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 25, color: '#9aa7b8', backdropColor: 'transparent', font: { size: 10 } },
          grid: { color: 'rgba(43, 54, 68, 0.9)' },
          angleLines: { color: 'rgba(43, 54, 68, 0.9)' },
          pointLabels: { color: '#e8edf4', font: { size: 11, weight: '600' } },
        },
      },
    },
  });
}

function aggregateRosterMetrics() {
  const rosterMap = new Map();

  tournamentMatches.forEach((match) => {
    const players = match.friendlyPlayers || [];
    players.forEach((player) => {
      if (!player || !player.id) return;
      const rosterPlayer = tournament.roster.find((item) => item.id === player.rosterId);
      const key = player.rosterId || player.id;
      const entry = rosterMap.get(key) || {
        id: key,
        rosterId: player.rosterId || null,
        number: rosterPlayer?.number || player.number || '',
        name: rosterPlayer?.name || player.name || '未知球員',
        stats: createEmptyStats(),
        appearances: 0,
      };

      entry.appearances += 1;
      Object.keys(entry.stats).forEach((statKey) => {
        entry.stats[statKey] += Number(player.stats?.[statKey] ?? 0);
      });
      rosterMap.set(key, entry);
    });
  });

  return Array.from(rosterMap.values());
}

function renderCharts() {
  destroyCharts();
  chartGrid.innerHTML = '';

  if (typeof Chart === 'undefined') {
    chartGrid.hidden = true;
    analysisEmpty.hidden = false;
    analysisEmpty.querySelector('p').textContent = '無法載入圖表元件。';
    return;
  }

  const players = aggregateRosterMetrics().sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  if (players.length === 0) {
    chartGrid.hidden = true;
    analysisEmpty.hidden = false;
    return;
  }

  chartGrid.hidden = false;
  analysisEmpty.hidden = true;

  const metricsList = computeAllPlayerMetrics(players.map((player) => ({ ...player, stats: player.stats })));
  metricsList.forEach(({ player, metrics }) => {
    const card = document.createElement('article');
    card.className = 'chart-card';
    card.innerHTML = `
      <div class="chart-card__header">
        <span class="chart-card__number">#${escapeHtml(player.number)}</span>
        <h3 class="chart-card__name">${escapeHtml(player.name)}</h3>
        <span class="rank-badge rank-badge--${metrics.rank.toLowerCase()}">${metrics.rank}</span>
      </div>
      <div class="chart-card__canvas-wrap">
        <canvas aria-label="${escapeHtml(player.name)} 雷達圖"></canvas>
      </div>
      ${buildRadarRows(metrics)}
      ${buildAdvancedRows(metrics)}
    `;
    chartGrid.appendChild(card);
    const canvas = card.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      charts.push(createRadarChart(canvas, metrics));
    }
  });
}

function loadTournamentAnalysis() {
  if (!tournamentId) {
    window.location.replace('index.html');
    return;
  }

  tournament = getTournamentById(tournamentId);
  tournamentMatches = getTournamentMatches(tournamentId);
  if (!tournament) {
    window.location.replace('index.html');
    return;
  }

  const href = `tournament.html?id=${encodeURIComponent(tournament.id)}`;
  backLink.href = href;
  backLink.textContent = '← 返回賽事';
  backToTournament.href = href;

  setPageTitle('整體分析', tournament.name);
  titleEl.textContent = tournament.name;
  metaEl.textContent = `統整 ${tournamentMatches.length} 場比賽的球員表現`;

  if (tournamentMatches.length === 0) {
    showEmptyState();
    return;
  }

  renderCharts();
}

loadTournamentAnalysis();
