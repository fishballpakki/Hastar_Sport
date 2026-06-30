const RADAR_METRICS = [
  { key: 'hitRate', label: '命中' },
  { key: 'survival', label: '生存' },
  { key: 'reception', label: '接球' },
  { key: 'assist', label: '助攻' },
  { key: 'blockRate', label: '擋波' },
];

function calcHitRate(stats) {
  const attempts = stats.attempts ?? 0;
  const hits = stats.hits ?? 0;
  if (attempts === 0) return 0;
  return hits / attempts;
}

function calcDodgeRate(stats) {
  const gotHit = stats.gotHit ?? 0;
  const attacksFaced = gotHit + (stats.receptions ?? 0);
  if (attacksFaced === 0) return 1;
  return 1 - gotHit / attacksFaced;
}

function calcBlockRate(stats) {
  const blocks = stats.blocks ?? 0;
  const holdDeath = stats.holdDeath ?? 0;
  return blocks / Math.max(holdDeath, 1);
}

function calcTeamShare(personalValue, teamTotal) {
  if (teamTotal === 0) return 0;
  return personalValue / teamTotal;
}

function computeTeamStatTotal(players, statKey) {
  return players.reduce((sum, player) => sum + (player.stats[statKey] ?? 0), 0);
}

function normalizeMinMax(value, min, max) {
  if (max === min) return 100;
  return ((value - min) / (max - min)) * 100;
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function getAQRank(aq) {
  if (aq > 7.5) return 'S';
  if (aq >= 6.0) return 'A';
  if (aq >= 5.0) return 'B';
  if (aq >= 4.0) return 'C';
  return 'D';
}

function computeAdvancedStats(stats) {
  const games = getEffectiveGames(stats);
  const hits = stats.hits ?? 0;
  const assists = stats.assists ?? 0;
  const receivedAgainst = stats.receivedAgainst ?? 0;
  const receptions = stats.receptions ?? 0;
  const gotHit = stats.gotHit ?? 0;
  const missedReception = stats.missedReception ?? 0;
  const holdDeath = stats.holdDeath ?? 0;
  const junkBall = stats.junkBall ?? 0;
  const blocks = stats.blocks ?? 0;
  const fouls = stats.fouls ?? 0;
  const yellowCards = stats.yellowCards ?? 0;
  const redCards = stats.redCards ?? 0;

  const ao =
    (hits * 3.0 + assists * 1.5 - receivedAgainst * 1.0) / games;
  const ap =
    (receptions * 4.0 -
      gotHit * 1.5 -
      missedReception -
      (holdDeath + junkBall) * 0.5) /
    games;
  const aq =
    5.0 +
    ao * 0.5 +
    ap * 0.5 -
    (fouls * 0.5) / games -
    yellowCards * 3.0 -
    redCards * 6.0;

  return {
    games,
    kda: `${hits} / ${gotHit} / ${assists}`,
    ao,
    ap,
    aq,
    rank: getAQRank(aq),
    blockRate: calcBlockRate(stats),
    hitRate: calcHitRate(stats),
    survival: calcDodgeRate(stats),
    details: {
      ao: `((${hits}×3 + ${assists}×1.5 − ${receivedAgainst}) ÷ ${games} 局)`,
      ap: `((${receptions}×4 − ${gotHit}×1.5 − ${missedReception} − (${holdDeath}+${junkBall})×0.5) ÷ ${games} 局)`,
      aq: `5 + AO×0.5 + AP×0.5 − 犯規×0.5/局 − 黃牌×3 − 紅牌×6`,
      blockRate: `${blocks} / ${Math.max(holdDeath, 1)}`,
      kda: '擊中 / 被打中 / 助攻',
    },
  };
}

function computeRawMetrics(player, teamTotals) {
  const stats = player.stats;
  const advanced = computeAdvancedStats(stats);
  const reception = calcTeamShare(stats.receptions ?? 0, teamTotals.receptions);
  const assist = calcTeamShare(stats.assists ?? 0, teamTotals.assists);

  return {
    ...advanced,
    reception,
    assist,
    radarRaw: {
      hitRate: advanced.hitRate,
      survival: advanced.survival,
      reception,
      assist,
      blockRate: advanced.blockRate,
    },
  };
}

function computeNormalizedScores(rawMetricsList) {
  const normalizedByPlayer = rawMetricsList.map(() => ({}));

  RADAR_METRICS.forEach(({ key }) => {
    const values = rawMetricsList.map((raw) => raw.radarRaw[key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    values.forEach((value, index) => {
      normalizedByPlayer[index][key] = normalizeMinMax(value, min, max);
    });
  });

  return normalizedByPlayer;
}

function computeAllPlayerMetrics(players) {
  if (players.length === 0) return [];

  const teamTotals = {
    receptions: computeTeamStatTotal(players, 'receptions'),
    assists: computeTeamStatTotal(players, 'assists'),
  };

  const rawMetricsList = players.map((player) => computeRawMetrics(player, teamTotals));
  const normalizedList = computeNormalizedScores(rawMetricsList);

  return players.map((player, index) => {
    const raw = rawMetricsList[index];
    const normalized = normalizedList[index];

    return {
      player,
      metrics: {
        ...raw,
        normalized,
        radarValues: RADAR_METRICS.map(({ key }) => normalized[key]),
      },
    };
  });
}

function formatMetricValue(key, metrics) {
  const score = Math.round(metrics.normalized[key]);
  return `${score} 分`;
}

function formatRawMetricValue(key, metrics) {
  if (key === 'blockRate') return formatNumber(metrics.blockRate);
  if (key === 'survival' || key === 'hitRate') return formatPercent(metrics[key]);
  return formatPercent(metrics[key]);
}
