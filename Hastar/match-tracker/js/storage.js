const STORAGE_KEY = 'match-tracker:data';
const LEGACY_KEY = 'match-tracker:matches';
const DATA_FORMAT = 'match-tracker';
const DATA_VERSION = 2;
const APP_TITLE = '比賽數據記錄';
const SYNC_STORAGE_KEY = 'match-tracker:sync';

let remoteStoreCache = null;
let remoteStoreLoaded = false;
let remoteStoreVersion = 0;
let syncSubscribers = [];
let syncTimer = null;
let syncInFlight = false;
let lastSyncedPayload = '';
let localUpdatePending = false;
let syncStatus = 'idle';
let syncStatusMessage = '';

function setSyncStatus(status, message = '') {
  syncStatus = status;
  syncStatusMessage = message;
  window.dispatchEvent(new CustomEvent('match-tracker-sync-status', {
    detail: { status, message },
  }));
}

function getSyncStatus() {
  return { status: syncStatus, message: syncStatusMessage };
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStore() {
  return { version: DATA_VERSION, tournaments: [], matches: [] };
}

function normalizeRosterPlayer(player) {
  return {
    id: player.id || createId(),
    name: String(player.name ?? '').trim(),
    number: String(player.number ?? '').trim(),
  };
}

function normalizeMatchPlayer(player) {
  return {
    id: player.id || createId(),
    rosterId: player.rosterId || null,
    name: String(player.name ?? '').trim(),
    number: String(player.number ?? '').trim(),
    stats: migrateStatKeys(player.stats),
  };
}

function normalizeTournament(tournament) {
  return {
    id: tournament.id || createId(),
    name: String(tournament.name ?? '').trim(),
    createdAt: tournament.createdAt ?? new Date().toISOString(),
    updatedAt: tournament.updatedAt ?? new Date().toISOString(),
    roster: Array.isArray(tournament.roster)
      ? tournament.roster.map(normalizeRosterPlayer)
      : [],
  };
}

function normalizeRoundState(roundState) {
  const state = roundState && typeof roundState === 'object' ? roundState : {};

  const normalizeTeamState = (teamState) => {
    const safe = teamState && typeof teamState === 'object' ? teamState : {};
    return {
      roundNumber: Number.isFinite(Number(safe.roundNumber))
        ? Math.max(0, Math.floor(Number(safe.roundNumber)))
        : 0,
      activeRound: Boolean(safe.activeRound),
      activePlayerIds: Array.isArray(safe.activePlayerIds)
        ? safe.activePlayerIds.filter(Boolean)
        : [],
      selectedPlayerIds: Array.isArray(safe.selectedPlayerIds)
        ? safe.selectedPlayerIds.filter(Boolean)
        : [],
    };
  };

  return {
    friendly: normalizeTeamState(state.friendly),
    enemy: normalizeTeamState(state.enemy),
  };
}

function normalizeMatch(match) {
  return {
    id: match.id || createId(),
    tournamentId: match.tournamentId || '',
    name: String(match.name ?? '').trim(),
    date: match.date ?? '',
    enemyTeamName: String(match.enemyTeamName ?? match.opponent ?? '').trim(),
    notes: String(match.notes ?? '').trim(),
    createdAt: match.createdAt ?? new Date().toISOString(),
    updatedAt: match.updatedAt ?? new Date().toISOString(),
    friendlyPlayers: Array.isArray(match.friendlyPlayers)
      ? match.friendlyPlayers.map(normalizeMatchPlayer)
      : Array.isArray(match.players)
        ? match.players.map(normalizeMatchPlayer)
        : [],
    enemyPlayers: Array.isArray(match.enemyPlayers)
      ? match.enemyPlayers.map(normalizeMatchPlayer)
      : [],
    roundState: normalizeRoundState(match.roundState),
  };
}

function migrateLegacyMatches() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const tournamentId = createId();
    const now = new Date().toISOString();
    const tournament = normalizeTournament({
      id: tournamentId,
      name: '未分類賽事',
      createdAt: now,
      updatedAt: now,
      roster: [],
    });

    const rosterMap = new Map();
    parsed.forEach((legacyMatch) => {
      (legacyMatch.players || []).forEach((player) => {
        const key = `${player.number}::${player.name}`;
        if (!rosterMap.has(key)) {
          rosterMap.set(key, normalizeRosterPlayer(player));
        }
      });
    });
    tournament.roster = [...rosterMap.values()];

    const matches = parsed.map((legacyMatch) =>
      normalizeMatch({
        ...legacyMatch,
        tournamentId,
        enemyTeamName: legacyMatch.opponent ?? '',
        friendlyPlayers: (legacyMatch.players || []).map((player) => ({
          ...player,
          rosterId: rosterMap.get(`${player.number}::${player.name}`)?.id ?? null,
        })),
        enemyPlayers: [],
      }),
    );

    localStorage.removeItem(LEGACY_KEY);
    return { version: DATA_VERSION, tournaments: [tournament], matches };
  } catch {
    return null;
  }
}

function buildStorePayload(store) {
  return JSON.stringify({
    version: DATA_VERSION,
    tournaments: store.tournaments.map(normalizeTournament),
    matches: store.matches.map(normalizeMatch),
  });
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const migrated = migrateLegacyMatches();
      if (migrated) {
        writeStore(migrated);
        return migrated;
      }
      return emptyStore();
    }

    const parsed = JSON.parse(raw);

    if (parsed && parsed.version === DATA_VERSION) {
      return {
        version: DATA_VERSION,
        tournaments: (parsed.tournaments || []).map(normalizeTournament),
        matches: (parsed.matches || []).map(normalizeMatch),
      };
    }

    if (Array.isArray(parsed)) {
      const migrated = migrateLegacyMatches() || emptyStore();
      writeStore(migrated);
      return migrated;
    }

    return emptyStore();
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  const payload = buildStorePayload(store);
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(SYNC_STORAGE_KEY, payload);
  lastSyncedPayload = payload;
  localUpdatePending = true;
  setSyncStatus('local-updated', '已在本機保存，正在整理資料。');
  scheduleSync();
}

function compareStorePayload(left, right) {
  return left === right;
}

function pickNewestRecord(left, right) {
  const leftTime = left?.updatedAt || left?.createdAt || '';
  const rightTime = right?.updatedAt || right?.createdAt || '';
  if (!leftTime && !rightTime) return left || right;
  if (!rightTime) return left;
  if (!leftTime) return right;
  return leftTime >= rightTime ? left : right;
}

function mergeRosterPlayers(leftRoster = [], rightRoster = []) {
  const merged = new Map();
  [...leftRoster, ...rightRoster].forEach((player) => {
    const normalized = normalizeRosterPlayer(player);
    const key = normalized.id || `${normalized.name}:${normalized.number}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      return;
    }
    merged.set(key, existing.name && existing.number ? existing : normalized);
  });
  return Array.from(merged.values());
}

function mergeMatchPlayers(leftPlayers = [], rightPlayers = []) {
  const merged = new Map();
  [...leftPlayers, ...rightPlayers].forEach((player) => {
    const normalized = normalizeMatchPlayer(player);
    const key = normalized.id || `${normalized.rosterId || ''}:${normalized.name}:${normalized.number}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      return;
    }
    merged.set(key, {
      ...existing,
      ...normalized,
      stats: { ...(existing.stats || {}), ...(normalized.stats || {}) },
    });
  });
  return Array.from(merged.values());
}

function mergeStoreData(localStore, remoteStore) {
  const tournamentsById = new Map();
  [...(localStore.tournaments || []), ...(remoteStore.tournaments || [])].forEach((tournament) => {
    const normalized = normalizeTournament(tournament);
    const existing = tournamentsById.get(normalized.id);
    if (!existing) {
      tournamentsById.set(normalized.id, normalized);
      return;
    }
    const winner = pickNewestRecord(existing, normalized);
    tournamentsById.set(normalized.id, {
      ...winner,
      ...normalized,
      roster: mergeRosterPlayers(existing.roster || [], normalized.roster || []),
      updatedAt: winner.updatedAt || normalized.updatedAt,
    });
  });

  const matchesById = new Map();
  [...(localStore.matches || []), ...(remoteStore.matches || [])].forEach((match) => {
    const normalized = normalizeMatch(match);
    const existing = matchesById.get(normalized.id);
    if (!existing) {
      matchesById.set(normalized.id, normalized);
      return;
    }
    const winner = pickNewestRecord(existing, normalized);
    matchesById.set(normalized.id, {
      ...winner,
      ...normalized,
      friendlyPlayers: mergeMatchPlayers(existing.friendlyPlayers || [], normalized.friendlyPlayers || []),
      enemyPlayers: mergeMatchPlayers(existing.enemyPlayers || [], normalized.enemyPlayers || []),
      updatedAt: winner.updatedAt || normalized.updatedAt,
    });
  });

  return {
    version: DATA_VERSION,
    tournaments: Array.from(tournamentsById.values()),
    matches: Array.from(matchesById.values()),
  };
}

function notifySyncSubscribers() {
  syncSubscribers.forEach((subscriber) => subscriber());
}

function normalizeRemoteStore(payload) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || parsed.version !== DATA_VERSION) return null;
    return {
      version: DATA_VERSION,
      tournaments: (parsed.tournaments || []).map(normalizeTournament),
      matches: (parsed.matches || []).map(normalizeMatch),
    };
  } catch {
    return null;
  }
}

function persistRemoteStore(store) {
  remoteStoreCache = store;
  remoteStoreVersion += 1;
  const payload = buildStorePayload(store);
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(SYNC_STORAGE_KEY, payload);
  lastSyncedPayload = payload;
  notifySyncSubscribers();
}

function setupRemoteListener() {
  // Local-only deployment: keep the hook for compatibility without using any remote service.
}

function scheduleSync() {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    void syncStore();
  }, 250);
}

async function syncStore() {
  if (syncInFlight) return;
  syncInFlight = true;
  setSyncStatus('syncing', '正在整理本機資料...');

  try {
    const localStore = readStore();
    const payload = buildStorePayload(localStore);
    localStorage.setItem(SYNC_STORAGE_KEY, payload);
    lastSyncedPayload = payload;
    remoteStoreCache = localStore;
    remoteStoreLoaded = true;
    localUpdatePending = false;
    setSyncStatus('ready', '資料已儲存在本機。可使用匯出／匯入 JSON 分享。');
    notifySyncSubscribers();
  } finally {
    syncInFlight = false;
    syncTimer = null;
  }
}

function subscribeToSync(callback) {
  syncSubscribers.push(callback);
  return () => {
    syncSubscribers = syncSubscribers.filter((subscriber) => subscriber !== callback);
  };
}

function forceSyncNow() {
  localUpdatePending = true;
  return syncStore();
}

function getLiveStore() {
  if (remoteStoreCache) return remoteStoreCache;
  return readStore();
}

function getLiveTournaments() {
  return getLiveStore().tournaments;
}

function getLiveMatches() {
  return getLiveStore().matches;
}

function getLiveTournamentById(id) {
  return getLiveTournaments().find((item) => item.id === id) ?? null;
}

function getLiveMatchById(id) {
  return getLiveMatches().find((item) => item.id === id) ?? null;
}

window.addEventListener('storage', (event) => {
  if (event.key === SYNC_STORAGE_KEY && event.newValue) {
    const parsed = normalizeRemoteStore(event.newValue);
    if (parsed) {
      remoteStoreCache = parsed;
      remoteStoreLoaded = true;
      notifySyncSubscribers();
    }
  }
});

setupRemoteListener();
void syncStore();

function readTournaments() {
  return readStore().tournaments;
}

function readMatches() {
  return readStore().matches;
}

function getTournamentById(id) {
  return readTournaments().find((item) => item.id === id) ?? null;
}

function getMatchById(id) {
  return readMatches().find((item) => item.id === id) ?? null;
}

function saveTournament(tournament) {
  const store = readStore();
  const normalized = normalizeTournament(tournament);
  normalized.updatedAt = new Date().toISOString();
  const index = store.tournaments.findIndex((item) => item.id === normalized.id);
  if (index === -1) store.tournaments.unshift(normalized);
  else store.tournaments[index] = normalized;
  writeStore(store);
  return normalized;
}

function saveMatch(match) {
  const store = readStore();
  const normalized = normalizeMatch(match);
  normalized.updatedAt = new Date().toISOString();
  const index = store.matches.findIndex((item) => item.id === normalized.id);
  if (index === -1) store.matches.unshift(normalized);
  else store.matches[index] = normalized;
  writeStore(store);
  return normalized;
}

function createTournament(name) {
  const now = new Date().toISOString();
  return saveTournament({
    id: createId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    roster: [],
  });
}

function updateTournament(id, updater) {
  const tournament = getTournamentById(id);
  if (!tournament) return null;
  const updated = typeof updater === 'function' ? updater(tournament) : { ...tournament, ...updater };
  return saveTournament({ ...updated, id });
}

function addRosterPlayer(tournamentId, { name, number }) {
  return updateTournament(tournamentId, (tournament) => ({
    ...tournament,
    roster: [
      ...tournament.roster,
      normalizeRosterPlayer({ id: createId(), name, number }),
    ],
  }));
}

function removeRosterPlayer(tournamentId, playerId) {
  return updateTournament(tournamentId, (tournament) => ({
    ...tournament,
    roster: tournament.roster.filter((player) => player.id !== playerId),
  }));
}

function getTournamentMatches(tournamentId) {
  return readMatches().filter((match) => match.tournamentId === tournamentId);
}

function createMatch({ tournamentId, name, date, enemyTeamName = '', notes = '' }) {
  const now = new Date().toISOString();
  return saveMatch({
    id: createId(),
    tournamentId,
    name: name.trim(),
    date,
    enemyTeamName: enemyTeamName.trim(),
    notes: notes.trim(),
    createdAt: now,
    updatedAt: now,
    friendlyPlayers: [],
    enemyPlayers: [],
  });
}

function updateMatch(id, updater) {
  const match = getMatchById(id);
  if (!match) return null;
  const updated = typeof updater === 'function' ? updater(match) : { ...match, ...updater };
  return saveMatch({ ...updated, id });
}

function updateMatchDetails(matchId, { name, date, enemyTeamName, notes }) {
  return updateMatch(matchId, (match) => ({
    ...match,
    name: String(name).trim(),
    date,
    enemyTeamName: String(enemyTeamName ?? match.enemyTeamName).trim(),
    notes: String(notes ?? match.notes).trim(),
  }));
}

function setMatchLineup(matchId, { friendlyRosterIds, enemyPlayers }) {
  const tournament = getTournamentById(getMatchById(matchId)?.tournamentId);
  if (!tournament) return null;

  return updateMatch(matchId, (match) => {
    const friendlyPlayers = friendlyRosterIds
      .map((rosterId) => tournament.roster.find((player) => player.id === rosterId))
      .filter(Boolean)
      .map((player) => {
        const existing = match.friendlyPlayers.find((item) => item.rosterId === player.id);
        return existing
          ? { ...existing, name: player.name, number: player.number }
          : normalizeMatchPlayer({
              id: createId(),
              rosterId: player.id,
              name: player.name,
              number: player.number,
              stats: createEmptyStats(),
            });
      });

    const normalizedEnemy = enemyPlayers.map((player) => {
      const existing = match.enemyPlayers.find((item) => item.id === player.id);
      return existing
        ? { ...existing, name: player.name, number: player.number }
        : normalizeMatchPlayer({
            id: player.id || createId(),
            name: player.name,
            number: player.number,
            stats: createEmptyStats(),
          });
    });

    return { ...match, friendlyPlayers, enemyPlayers: normalizedEnemy };
  });
}

function getMatchTeamPlayers(match, team) {
  if (team === TEAM_ENEMY) return match.enemyPlayers;
  return match.friendlyPlayers;
}

function getTeamRoundState(match, team) {
  const teamKey = team === TEAM_ENEMY ? 'enemy' : 'friendly';
  return normalizeRoundState(match.roundState)[teamKey];
}

function startRound(matchId, team, playerIds) {
  const listKey = team === TEAM_ENEMY ? 'enemyPlayers' : 'friendlyPlayers';
  const teamKey = team === TEAM_ENEMY ? 'enemy' : 'friendly';
  const selectedIds = Array.from(new Set((playerIds || []).filter(Boolean).slice(0, 6)));

  return updateMatch(matchId, (match) => {
    const state = getTeamRoundState(match, team);
    const nextPlayers = match[listKey].map((player) => {
      if (!selectedIds.includes(player.id)) return player;
      const current = player.stats.setsPlayed ?? 0;
      return {
        ...player,
        stats: { ...player.stats, setsPlayed: current + 1 },
      };
    });

    return {
      ...match,
      [listKey]: nextPlayers,
      roundState: {
        ...match.roundState,
        [teamKey]: {
          ...state,
          activeRound: true,
          activePlayerIds: selectedIds,
          selectedPlayerIds: selectedIds,
        },
      },
    };
  });
}

function finishRound(matchId, team) {
  const teamKey = team === TEAM_ENEMY ? 'enemy' : 'friendly';
  return updateMatch(matchId, (match) => {
    const state = getTeamRoundState(match, team);
    return {
      ...match,
      roundState: {
        ...match.roundState,
        [teamKey]: {
          ...state,
          roundNumber: state.roundNumber + 1,
          activeRound: false,
          activePlayerIds: [],
          selectedPlayerIds: [],
        },
      },
    };
  });
}

function resetRound(matchId, team) {
  const listKey = team === TEAM_ENEMY ? 'enemyPlayers' : 'friendlyPlayers';
  const teamKey = team === TEAM_ENEMY ? 'enemy' : 'friendly';
  return updateMatch(matchId, (match) => {
    const state = getTeamRoundState(match, team);
    const previousActiveIds = state.activeRound ? state.activePlayerIds : [];

    return {
      ...match,
      [listKey]: match[listKey].map((player) => {
        if (!previousActiveIds.includes(player.id)) return player;
        const nextValue = Math.max(0, (player.stats.setsPlayed ?? 0) - 1);
        return {
          ...player,
          stats: { ...player.stats, setsPlayed: nextValue },
        };
      }),
      roundState: {
        ...match.roundState,
        [teamKey]: {
          ...state,
          activeRound: false,
          activePlayerIds: [],
          selectedPlayerIds: [],
        },
      },
    };
  });
}

function updatePlayerStat(matchId, team, playerId, statKey, delta) {
  const listKey = team === TEAM_ENEMY ? 'enemyPlayers' : 'friendlyPlayers';
  return updateMatch(matchId, (match) => ({
    ...match,
    [listKey]: match[listKey].map((player) => {
      if (player.id !== playerId) return player;
      const current = player.stats[statKey] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...player, stats: { ...player.stats, [statKey]: next } };
    }),
  }));
}

function deleteMatch(id) {
  const store = readStore();
  store.matches = store.matches.filter((match) => match.id !== id);
  writeStore(store);
}

function deleteTournament(id) {
  const store = readStore();
  store.tournaments = store.tournaments.filter((item) => item.id !== id);
  store.matches = store.matches.filter((match) => match.tournamentId !== id);
  writeStore(store);
}

function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

function formatMatchDate(dateString) {
  if (!dateString) return '無日期';
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('zh-TW', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getMatchPageUrl(matchId) {
  const match = getMatchById(matchId);
  if (!match) return `match.html?id=${encodeURIComponent(matchId)}`;
  if (match.friendlyPlayers.length === 0 && match.enemyPlayers.length === 0) {
    return `match-setup.html?id=${encodeURIComponent(matchId)}`;
  }
  return `stats.html?id=${encodeURIComponent(matchId)}&team=${TEAM_FRIENDLY}`;
}

function getTournamentPageUrl(tournamentId) {
  return `tournament.html?id=${encodeURIComponent(tournamentId)}`;
}

function buildExportPayload() {
  const store = readStore();
  return {
    format: DATA_FORMAT,
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    tournaments: store.tournaments,
    matches: store.matches,
  };
}

function exportAllData() {
  const payload = buildExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `match-tracker-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseImportPayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('檔案不是有效的 JSON 格式。');
  }

  if (parsed && parsed.version === DATA_VERSION) {
    return {
      tournaments: (parsed.tournaments || []).map(normalizeTournament),
      matches: (parsed.matches || []).map(normalizeMatch),
    };
  }

  if (parsed && parsed.format === DATA_FORMAT && Array.isArray(parsed.matches)) {
    const tournamentId = createId();
    const now = new Date().toISOString();
    const tournament = normalizeTournament({
      id: tournamentId,
      name: '匯入賽事',
      createdAt: now,
      updatedAt: now,
      roster: [],
    });
    return {
      tournaments: [tournament],
      matches: parsed.matches.map((match) =>
        normalizeMatch({ ...match, tournamentId }),
      ),
    };
  }

  throw new Error('檔案格式不正確，請使用本系統匯出的數據檔。');
}

function importData(data, mode = 'merge') {
  if (mode === 'replace') {
    writeStore({ version: DATA_VERSION, tournaments: data.tournaments, matches: data.matches });
    return {
      addedTournaments: data.tournaments.length,
      addedMatches: data.matches.length,
      updatedTournaments: 0,
      updatedMatches: 0,
    };
  }

  const store = readStore();
  const tournamentById = new Map(store.tournaments.map((item) => [item.id, item]));
  const matchById = new Map(store.matches.map((item) => [item.id, item]));
  let addedTournaments = 0;
  let updatedTournaments = 0;
  let addedMatches = 0;
  let updatedMatches = 0;

  data.tournaments.forEach((tournament) => {
    if (tournamentById.has(tournament.id)) updatedTournaments += 1;
    else addedTournaments += 1;
    tournamentById.set(tournament.id, normalizeTournament(tournament));
  });

  data.matches.forEach((match) => {
    if (matchById.has(match.id)) updatedMatches += 1;
    else addedMatches += 1;
    matchById.set(match.id, normalizeMatch(match));
  });

  writeStore({
    version: DATA_VERSION,
    tournaments: [...tournamentById.values()],
    matches: [...matchById.values()],
  });

  return { addedTournaments, updatedTournaments, addedMatches, updatedMatches };
}

async function importDataFromFile(file) {
  const text = await file.text();
  const data = parseImportPayload(text);

  const store = readStore();
  if (store.tournaments.length === 0 && store.matches.length === 0) {
    return importData(data, 'replace');
  }

  const merge = window.confirm(
    '要合併匯入的數據嗎？\n\n按「確定」= 合併（相同 ID 會覆寫）\n按「取消」= 改為全部取代現有數據',
  );

  if (merge) return importData(data, 'merge');

  const replace = window.confirm('確定要以匯入的數據取代目前全部資料？此操作無法復原。');
  if (!replace) throw new Error('已取消匯入。');
  return importData(data, 'replace');
}

function setPageTitle(pageName, detail = '') {
  document.title = detail ? `${APP_TITLE} — ${detail}` : `${APP_TITLE} — ${pageName}`;
}

function getTeamLabel(team) {
  return team === TEAM_ENEMY ? '敵隊' : '友隊';
}

// Backward-compatible aliases
function exportAllMatches() {
  exportAllData();
}

async function importMatchesFromFile(file) {
  return importDataFromFile(file);
}

function clearAllMatches() {
  clearAllData();
}
