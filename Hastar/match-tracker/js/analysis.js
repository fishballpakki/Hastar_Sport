const params = new URLSearchParams(window.location.search);
const matchId = params.get('id');
let team = params.get('team') || TEAM_FRIENDLY;
if (team !== TEAM_FRIENDLY && team !== TEAM_ENEMY) team = TEAM_FRIENDLY;

const titleEl = document.getElementById('match-title');
const metaEl = document.getElementById('match-meta');
const chartGrid = document.getElementById('chart-grid');
const analysisEmpty = document.getElementById('analysis-empty');
const backToStatsLink = document.getElementById('back-to-stats-link');
const teamFriendlyTab = document.getElementById('team-friendly-tab');
const teamEnemyTab = document.getElementById('team-enemy-tab');

const charts = [];
let match = null;

function currentPlayers() {
  if (!match) return [];
  return getMatchTeamPlayers(match, team);
}

function showMissingMatch() {
  titleEl.textContent = '找不到比賽';
  metaEl.textContent = '此比賽可能已被刪除。';
  chartGrid.hidden = true;
  analysisEmpty.hidden = false;
}

function renderMatchHeader() {
  setPageTitle('數據分析', match.name);
  titleEl.textContent = match.name;
  const label = team === TEAM_ENEMY ? match.enemyTeamName || '敵隊' : '友隊';
  metaEl.textContent = [formatMatchDate(match.date), label, getTeamLabel(team)].join(' · ');

  const base = `analysis.html?id=${encodeURIComponent(match.id)}`;
  teamFriendlyTab.href = `${base}&team=${TEAM_FRIENDLY}`;
  teamEnemyTab.href = `${base}&team=${TEAM_ENEMY}`;
  teamFriendlyTab.classList.toggle('team-tab--active', team === TEAM_FRIENDLY);
  teamEnemyTab.classList.toggle('team-tab--active', team === TEAM_ENEMY);
  backToStatsLink.href = `stats.html?id=${encodeURIComponent(match.id)}&team=${team}`;
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

function renderCharts() {
  destroyCharts();
  chartGrid.innerHTML = '';

  if (typeof Chart === 'undefined') {
    chartGrid.hidden = true;
    analysisEmpty.hidden = false;
    analysisEmpty.querySelector('p').textContent = '無法載入圖表元件。';
    return;
  }

  const players = currentPlayers()
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  if (players.length === 0) {
    chartGrid.hidden = true;
    analysisEmpty.hidden = false;
    return;
  }

  chartGrid.hidden = false;
  analysisEmpty.hidden = true;

  computeAllPlayerMetrics(players).forEach(({ player, metrics }) => {
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

function loadMatch() {
  if (!matchId) {
    showMissingMatch();
    return;
  }
  match = getMatchById(matchId);
  if (!match) {
    showMissingMatch();
    return;
  }
  if (match.friendlyPlayers.length === 0 && match.enemyPlayers.length === 0) {
    window.location.replace(`match-setup.html?id=${encodeURIComponent(match.id)}`);
    return;
  }
  renderMatchHeader();
  renderCharts();
}

subscribeToSync(loadMatch);
loadMatch();
