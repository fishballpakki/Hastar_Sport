const STAT_COLUMNS = [
  { key: 'setsPlayed', label: '上場局數' },
  { key: 'attempts', label: '出手次數' },
  { key: 'hits', label: '擊中數' },
  { key: 'receptions', label: '接球數' },
  { key: 'assists', label: '助攻數' },
  { key: 'receivedAgainst', label: '被接球' },
  { key: 'gotHit', label: '被打中' },
  { key: 'missedReception', label: '漏接' },
  { key: 'holdDeath', label: '持球死亡' },
  { key: 'junkBall', label: '垃圾波' },
  { key: 'blocks', label: '擋波數' },
  { key: 'fouls', label: '犯規' },
  { key: 'yellowCards', label: '黃牌' },
  { key: 'redCards', label: '紅牌' },
];

const STAT_GROUPS = [
  { id: 'general', label: '上場', keys: ['setsPlayed'] },
  { id: 'attack', label: '進攻', keys: ['attempts', 'hits', 'assists'] },
  {
    id: 'defense',
    label: '防守',
    keys: [
      'receptions',
      'receivedAgainst',
      'gotHit',
      'missedReception',
      'holdDeath',
      'junkBall',
      'blocks',
    ],
  },
  { id: 'discipline', label: '紀律', keys: ['fouls', 'yellowCards', 'redCards'] },
];

const STAT_LABELS = Object.fromEntries(STAT_COLUMNS.map(({ key, label }) => [key, label]));

const TEAM_FRIENDLY = 'friendly';
const TEAM_ENEMY = 'enemy';

function createEmptyStats() {
  return Object.fromEntries(STAT_COLUMNS.map(({ key }) => [key, 0]));
}

function migrateStatKeys(stats) {
  const next = createEmptyStats();
  if (!stats || typeof stats !== 'object') return next;

  STAT_COLUMNS.forEach(({ key }) => {
    if (key in stats) {
      const value = Number(stats[key]);
      next[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    }
  });

  if (stats.blockDrops != null && !stats.holdDeath && !stats.junkBall) {
    next.holdDeath = Math.floor(Number(stats.blockDrops) || 0);
  }

  return next;
}

function getEffectiveGames(stats) {
  return Math.max(stats.setsPlayed ?? 0, 1);
}
