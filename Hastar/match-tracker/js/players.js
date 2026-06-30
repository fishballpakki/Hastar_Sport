const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('id');

const titleEl = document.getElementById('player-page-title');
const metaEl = document.getElementById('player-page-meta');
const backLink = document.getElementById('back-link');
const backToTournament = document.getElementById('back-to-tournament');
const rosterForm = document.getElementById('add-roster-form');
const rosterList = document.getElementById('roster-list');
const nameInput = document.getElementById('player-name');
const numberInput = document.getElementById('player-number');
const newMatchBtn = document.getElementById('new-match-btn');
const newMatchDialog = document.getElementById('new-match-dialog');
const newMatchForm = document.getElementById('new-match-form');
const newMatchCancel = document.getElementById('new-match-cancel');
const matchDateInput = document.getElementById('match-date');

let tournament = null;

function renderHeader() {
  if (!tournament) return;
  setPageTitle('球員管理', tournament.name);
  titleEl.textContent = tournament.name;
  metaEl.textContent = `共 ${tournament.roster.length} 位球員`;
  const href = `tournament.html?id=${encodeURIComponent(tournament.id)}`;
  backLink.href = href;
  backLink.textContent = '← 返回賽事';
  backToTournament.href = href;
}

function renderRoster() {
  if (!tournament) return;
  rosterList.innerHTML = tournament.roster
    .slice()
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    .map((player) => `
      <li class="player-row">
        <div class="player-row__info">
          <span class="player-row__number">#${escapeHtml(player.number)}</span>
          <span class="player-row__name">${escapeHtml(player.name)}</span>
        </div>
        <button type="button" class="btn btn--ghost btn--danger player-row__delete" data-id="${player.id}">移除</button>
      </li>
    `)
    .join('');
}

function loadTournament() {
  if (!tournamentId) {
    window.location.replace('index.html');
    return;
  }

  tournament = getTournamentById(tournamentId);
  if (!tournament) {
    window.location.replace('index.html');
    return;
  }

  renderHeader();
  renderRoster();
  nameInput.focus();

  const today = new Date();
  matchDateInput.value = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

rosterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!tournament) return;

  const formData = new FormData(rosterForm);
  const name = String(formData.get('playerName') ?? '').trim();
  const number = String(formData.get('playerNumber') ?? '').trim();
  if (!name || !number) return;

  if (tournament.roster.some((player) => player.number === number)) {
    window.alert(`背號 ${number} 已存在。`);
    numberInput.focus();
    return;
  }

  tournament = addRosterPlayer(tournament.id, { name, number });
  rosterForm.reset();
  renderHeader();
  renderRoster();
  nameInput.focus();
});

rosterList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const deleteButton = target.closest('.player-row__delete');
  if (!(deleteButton instanceof HTMLElement) || !tournament) return;

  const playerId = deleteButton.dataset.id;
  const player = tournament.roster.find((item) => item.id === playerId);
  const label = player ? `#${player.number} ${player.name}` : '此球員';
  const confirmed = window.confirm(`確定要移除 ${label}？`);
  if (!confirmed) return;

  tournament = removeRosterPlayer(tournament.id, playerId);
  renderHeader();
  renderRoster();
});

newMatchBtn.addEventListener('click', () => {
  if (tournament.roster.length === 0) {
    window.alert('請先加入至少一位球員。');
    return;
  }
  newMatchDialog.showModal();
});

backToTournament.addEventListener('click', () => {
  window.location.href = `tournament.html?id=${encodeURIComponent(tournamentId || '')}`;
});

newMatchCancel.addEventListener('click', () => newMatchDialog.close());

newMatchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(newMatchForm);
  const name = String(formData.get('matchName') ?? '').trim();
  const date = String(formData.get('matchDate') ?? '');
  const notes = String(formData.get('matchNotes') ?? '').trim();
  if (!name || !date) return;
  const match = createMatch({ tournamentId: tournament.id, name, date, notes });
  window.location.href = `match-setup.html?id=${encodeURIComponent(match.id)}`;
});

subscribeToSync(() => {
  tournament = getTournamentById(tournamentId);
  if (!tournament) {
    window.location.replace('index.html');
    return;
  }
  renderHeader();
  renderRoster();
});

loadTournament();
