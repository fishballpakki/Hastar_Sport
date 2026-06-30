const params = new URLSearchParams(window.location.search);
const matchId = params.get('id');

const backLink = document.getElementById('back-link');
const titleEl = document.getElementById('match-title');
const metaEl = document.getElementById('match-meta');
const friendlyPicker = document.getElementById('friendly-picker');
const enemyList = document.getElementById('enemy-list');
const enemyTeamNameInput = document.getElementById('enemy-team-name');
const enemyNameInput = document.getElementById('enemy-name');
const enemyNumberInput = document.getElementById('enemy-number');
const addEnemyBtn = document.getElementById('add-enemy-btn');
const setupForm = document.getElementById('match-setup-form');

let match = null;
let tournament = null;
let enemyDraft = [];

function loadContext() {
  if (!matchId) {
    window.location.replace('index.html');
    return;
  }
  match = getMatchById(matchId);
  if (!match) {
    window.location.replace('index.html');
    return;
  }
  tournament = getTournamentById(match.tournamentId);
  if (!tournament) {
    window.location.replace('index.html');
    return;
  }

  setPageTitle('比賽設定', match.name);
  titleEl.textContent = match.name;
  metaEl.textContent = [formatMatchDate(match.date), tournament.name].join(' · ');
  backLink.href = getTournamentPageUrl(tournament.id);
  enemyTeamNameInput.value = match.enemyTeamName || '';

  enemyDraft = match.enemyPlayers.map((player) => ({
    id: player.id,
    name: player.name,
    number: player.number,
  }));

  renderFriendlyPicker();
  renderEnemyList();
}

function renderFriendlyPicker() {
  const selectedIds = new Set(
    match.friendlyPlayers.map((player) => player.rosterId).filter(Boolean),
  );

  friendlyPicker.innerHTML = tournament.roster
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map(
      (player) => `
        <li class="picker-item">
          <label class="picker-label">
            <input type="checkbox" name="friendly" value="${player.id}" ${selectedIds.has(player.id) ? 'checked' : ''}>
            <span class="picker-label__number">#${escapeHtml(player.number)}</span>
            <span class="picker-label__name">${escapeHtml(player.name)}</span>
          </label>
        </li>
      `,
    )
    .join('');
}

function renderEnemyList() {
  enemyList.innerHTML = enemyDraft
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map(
      (player, index) => `
        <li class="player-row">
          <div class="player-row__info">
            <span class="player-row__number">#${escapeHtml(player.number)}</span>
            <span class="player-row__name">${escapeHtml(player.name)}</span>
          </div>
          <button type="button" class="btn btn--ghost btn--danger" data-id="${player.id}">移除</button>
        </li>
      `,
    )
    .join('');
}

addEnemyBtn.addEventListener('click', () => {
  const name = enemyNameInput.value.trim();
  const number = enemyNumberInput.value.trim();
  if (!name || !number) return;
  if (enemyDraft.some((player) => player.number === number)) {
    window.alert(`背號 ${number} 已存在。`);
    return;
  }
  enemyDraft.push({ id: createId(), name, number });
  enemyNameInput.value = '';
  enemyNumberInput.value = '';
  renderEnemyList();
  enemyNameInput.focus();
});

enemyList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const btn = target.closest('button[data-id]');
  if (!(btn instanceof HTMLElement)) return;
  enemyDraft = enemyDraft.filter((player) => player.id !== btn.dataset.id);
  renderEnemyList();
});

setupForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const friendlyRosterIds = [...setupForm.querySelectorAll('input[name="friendly"]:checked')].map(
    (input) => input.value,
  );

  if (friendlyRosterIds.length === 0) {
    window.alert('請至少選擇一位友隊球員。');
    return;
  }

  const enemyTeamName = enemyTeamNameInput.value.trim();
  if (!enemyTeamName) {
    window.alert('請輸入敵隊名稱。');
    return;
  }

  if (enemyDraft.length === 0) {
    window.alert('請至少加入一位敵隊球員。');
    return;
  }

  match = updateMatchDetails(match.id, {
    name: match.name,
    date: match.date,
    enemyTeamName,
    notes: match.notes,
  });

  match = setMatchLineup(match.id, {
    friendlyRosterIds,
    enemyPlayers: enemyDraft,
  });

  window.location.href = `stats.html?id=${encodeURIComponent(match.id)}&team=${TEAM_FRIENDLY}`;
});

subscribeToSync(loadContext);
loadContext();
