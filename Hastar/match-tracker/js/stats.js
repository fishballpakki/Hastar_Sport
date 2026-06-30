const params = new URLSearchParams(window.location.search);
const matchId = params.get('id');
let team = params.get('team') || TEAM_FRIENDLY;
if (team !== TEAM_FRIENDLY && team !== TEAM_ENEMY) team = TEAM_FRIENDLY;

const titleEl = document.getElementById('match-title');
const metaEl = document.getElementById('match-meta');
const playerCountEl = document.getElementById('player-count');
const sheetHeaderRow = document.getElementById('sheet-header-row');
const sheetBody = document.getElementById('sheet-body');
const sheetScroll = document.querySelector('.sheet-scroll');
const editPlayersLink = document.getElementById('edit-players-link');
const analysisLink = document.getElementById('analysis-link');
const editMatchBtn = document.getElementById('edit-match-btn');
const teamFriendlyTab = document.getElementById('team-friendly-tab');
const teamEnemyTab = document.getElementById('team-enemy-tab');
const matchEditDialog = document.getElementById('match-edit-dialog');
const matchEditForm = document.getElementById('match-edit-form');
const matchEditCancel = document.getElementById('match-edit-cancel');
const editMatchName = document.getElementById('edit-match-name');
const editMatchDate = document.getElementById('edit-match-date');
const editMatchOpponent = document.getElementById('edit-match-opponent');
const roundStatusEl = document.getElementById('round-status');
const roundMetaEl = document.getElementById('round-meta');
const startRoundBtn = document.getElementById('start-round-btn');
const finishRoundBtn = document.getElementById('finish-round-btn');
const resetRoundBtn = document.getElementById('reset-round-btn');
const matchOverBtn = document.getElementById('match-over-btn');
const roundSelectDialog = document.getElementById('round-select-dialog');
const roundSelectForm = document.getElementById('round-select-form');
const roundSelectCancel = document.getElementById('round-select-cancel');
const roundPlayerList = document.getElementById('round-player-list');

let match = null;

function sortedPlayers(players) {
  return players
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

function currentPlayers() {
  if (!match) return [];
  return getMatchTeamPlayers(match, team);
}

function getCurrentRoundState() {
  if (!match) {
    return { roundNumber: 0, activeRound: false, activePlayerIds: [], selectedPlayerIds: [] };
  }
  return getTeamRoundState(match, team);
}

function getVisiblePlayers() {
  const players = currentPlayers();
  const roundState = getCurrentRoundState();
  if (!roundState.activeRound || roundState.activePlayerIds.length === 0) return players;
  const visibleIds = new Set(roundState.activePlayerIds);
  return players.filter((player) => visibleIds.has(player.id));
}

function showMissingMatch() {
  titleEl.textContent = '找不到比賽';
  metaEl.textContent = '此比賽可能已被刪除。';
  if (sheetScroll) sheetScroll.hidden = true;
}

function renderMatchHeader() {
  setPageTitle('數據記錄', match.name);
  titleEl.textContent = match.name;
  const metaParts = [formatMatchDate(match.date), getTeamLabel(team)];
  if (team === TEAM_ENEMY) metaParts.push(match.enemyTeamName || '敵隊');
  else metaParts.push('友隊');
  metaEl.textContent = metaParts.join(' · ');

  const players = currentPlayers();
  const visiblePlayers = getVisiblePlayers();
  const roundState = getCurrentRoundState();
  const playerCountText = roundState.activeRound
    ? `本輪 ${visiblePlayers.length} 位球員`
    : `共 ${players.length} 位球員`;
  playerCountEl.textContent = playerCountText;

  const base = `stats.html?id=${encodeURIComponent(match.id)}`;
  teamFriendlyTab.href = `${base}&team=${TEAM_FRIENDLY}`;
  teamEnemyTab.href = `${base}&team=${TEAM_ENEMY}`;
  teamFriendlyTab.classList.toggle('team-tab--active', team === TEAM_FRIENDLY);
  teamEnemyTab.classList.toggle('team-tab--active', team === TEAM_ENEMY);

  editPlayersLink.href = `match-setup.html?id=${encodeURIComponent(match.id)}`;
  analysisLink.href = `analysis.html?id=${encodeURIComponent(match.id)}`;
}

function renderRoundControls() {
  if (!match) return;

  const roundState = getCurrentRoundState();
  roundStatusEl.textContent = `第 ${roundState.roundNumber + 1} 輪 · ${roundState.activeRound ? '本輪進行中' : '等待開始新一輪'}`;
  roundMetaEl.textContent = roundState.activeRound
    ? `本輪已選 ${roundState.activePlayerIds.length} 位球員`
    : roundState.selectedPlayerIds.length > 0
      ? `已選擇 ${roundState.selectedPlayerIds.length} 位球員，尚未開始`
      : '請選擇本輪上場球員';

  startRoundBtn.disabled = roundState.activeRound;
  startRoundBtn.textContent = roundState.activeRound ? '本輪進行中' : '開始本輪';
  finishRoundBtn.disabled = !roundState.activeRound;
  resetRoundBtn.disabled = !roundState.activeRound && roundState.selectedPlayerIds.length === 0 && roundState.activePlayerIds.length === 0;
}

function buildSheetCell(playerId, statKey, value) {
  const isReadOnly = statKey === 'setsPlayed';
  const buttons = isReadOnly
    ? ''
    : `
      <button type="button" class="sheet-cell__btn sheet-cell__btn--plus" aria-label="增加 1">+</button>
      <span class="sheet-cell__value${isReadOnly ? ' sheet-cell__value--readonly' : ''}" aria-live="polite">${value}</span>
      <button type="button" class="sheet-cell__btn sheet-cell__btn--minus" aria-label="減少 1">−</button>
    `;

  return `
    <div class="sheet-cell" data-player-id="${playerId}" data-stat="${statKey}">
      ${buttons}
    </div>
  `;
}

function buildSheetHeader() {
  sheetHeaderRow.innerHTML = `
    <th class="sheet-table__player-col sheet-freeze sheet-freeze--corner" scope="col">球員</th>
    ${STAT_COLUMNS.map(({ label }) => `
      <th class="sheet-freeze sheet-freeze--head" scope="col">${escapeHtml(label)}</th>
    `).join('')}
  `;
}

function renderSheet() {
  const players = sortedPlayers(getVisiblePlayers());
  sheetBody.innerHTML = players
    .map((player) => {
      const nameCell = `
        <th class="sheet-table__player-col sheet-freeze sheet-freeze--col" scope="row">
          <span class="sheet-table__number">#${escapeHtml(player.number)}</span>
          <span class="sheet-table__name">${escapeHtml(player.name)}</span>
        </th>
      `;
      const statCells = STAT_COLUMNS.map(
        ({ key }) => `<td>${buildSheetCell(player.id, key, player.stats[key] ?? 0)}</td>`,
      ).join('');
      return `<tr data-player-id="${player.id}">${nameCell}${statCells}</tr>`;
    })
    .join('');
}

function updateStatDisplay(playerId, statKey, value) {
  const valueEl = sheetBody.querySelector(
    `.sheet-cell[data-player-id="${playerId}"][data-stat="${statKey}"] .sheet-cell__value`,
  );
  if (valueEl) valueEl.textContent = String(value);
}

function syncRoundSelectionAvailability() {
  const checkboxes = Array.from(roundPlayerList.querySelectorAll('input[name="round-player"]'));
  const selectedCount = checkboxes.filter((input) => input.checked).length;
  checkboxes.forEach((input) => {
    input.disabled = selectedCount >= 6 && !input.checked;
  });
}

function openRoundSelectionDialog() {
  if (!match) return;

  const players = currentPlayers();
  const roundState = getCurrentRoundState();
  const selectedIds = roundState.activeRound ? roundState.activePlayerIds : roundState.selectedPlayerIds;
  roundPlayerList.innerHTML = players
    .map((player) => {
      const checked = selectedIds.includes(player.id) ? 'checked' : '';
      return `
        <label class="round-player-option">
          <input type="checkbox" name="round-player" value="${escapeHtml(player.id)}" ${checked}>
          <span>
            <strong>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</strong>
            <small>可選 1–6 位</small>
          </span>
        </label>
      `;
    })
    .join('');

  syncRoundSelectionAvailability();
  roundSelectDialog.showModal();
}

function closeRoundSelectionDialog() {
  roundSelectDialog.close();
}

function handleRoundSelectSubmit(event) {
  event.preventDefault();
  if (!match) return;

  const selectedIds = Array.from(
    roundPlayerList.querySelectorAll('input[name="round-player"]:checked'),
  ).map((input) => input.value);

  if (selectedIds.length === 0) {
    alert('請至少選 1 位球員。');
    return;
  }

  if (selectedIds.length > 6) {
    alert('每輪最多選 6 位球員。');
    return;
  }

  match = startRound(match.id, team, selectedIds);
  renderMatchHeader();
  renderRoundControls();
  renderSheet();
  closeRoundSelectionDialog();
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
  buildSheetHeader();
  renderRoundControls();
  renderSheet();
}

sheetBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !match) return;

  const button = target.closest('.sheet-cell__btn');
  if (!(button instanceof HTMLElement)) return;

  const cell = button.closest('.sheet-cell');
  if (!(cell instanceof HTMLElement)) return;

  const playerId = cell.dataset.playerId;
  const statKey = cell.dataset.stat;
  if (!playerId || !statKey || statKey === 'setsPlayed') return;

  const delta = button.classList.contains('sheet-cell__btn--plus') ? 1 : -1;
  match = updatePlayerStat(match.id, team, playerId, statKey, delta);
  const player = currentPlayers().find((item) => item.id === playerId);
  if (!player) return;
  updateStatDisplay(playerId, statKey, player.stats[statKey] ?? 0);
});

function openMatchEditDialog() {
  if (!match) return;
  editMatchName.value = match.name;
  editMatchDate.value = match.date;
  editMatchOpponent.value = match.enemyTeamName;
  matchEditDialog.showModal();
  editMatchName.focus();
}

function closeMatchEditDialog() {
  matchEditDialog.close();
}

function handleMatchEditSubmit(event) {
  event.preventDefault();
  if (!match) return;

  const formData = new FormData(matchEditForm);
  const name = String(formData.get('matchName') ?? '').trim();
  const date = String(formData.get('matchDate') ?? '');
  const enemyTeamName = String(formData.get('matchOpponent') ?? '').trim();

  if (!name || !date) return;

  match = updateMatchDetails(match.id, { name, date, enemyTeamName, notes: match.notes });
  renderMatchHeader();
  closeMatchEditDialog();
}

startRoundBtn.addEventListener('click', openRoundSelectionDialog);
finishRoundBtn.addEventListener('click', () => {
  if (!match) return;
  match = finishRound(match.id, team);
  renderMatchHeader();
  renderRoundControls();
  renderSheet();
});
resetRoundBtn.addEventListener('click', () => {
  if (!match) return;
  match = resetRound(match.id, team);
  renderMatchHeader();
  renderRoundControls();
  renderSheet();
});
matchOverBtn.addEventListener('click', () => {
  if (!match) return;
  if (getTeamRoundState(match, team).activeRound) {
    match = finishRound(match.id, team);
  }
  window.location.assign(analysisLink.href);
});
editMatchBtn.addEventListener('click', openMatchEditDialog);
matchEditCancel.addEventListener('click', closeMatchEditDialog);
matchEditForm.addEventListener('submit', handleMatchEditSubmit);
matchEditDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeMatchEditDialog();
});
matchEditDialog.addEventListener('click', (event) => {
  if (event.target === matchEditDialog) closeMatchEditDialog();
});
roundSelectCancel.addEventListener('click', closeRoundSelectionDialog);
roundSelectForm.addEventListener('submit', handleRoundSelectSubmit);
roundPlayerList.addEventListener('change', syncRoundSelectionAvailability);
roundSelectDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeRoundSelectionDialog();
});
roundSelectDialog.addEventListener('click', (event) => {
  if (event.target === roundSelectDialog) closeRoundSelectionDialog();
});

subscribeToSync(loadMatch);
loadMatch();
