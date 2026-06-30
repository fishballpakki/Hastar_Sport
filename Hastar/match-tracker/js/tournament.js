const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('id');

const titleEl = document.getElementById('tournament-title');
const metaEl = document.getElementById('tournament-meta');
const matchList = document.getElementById('match-list');
const matchCount = document.getElementById('match-count');
const matchesEmpty = document.getElementById('matches-empty');
const managePlayersLink = document.getElementById('manage-players-link');
const tournamentAnalysisLink = document.getElementById('tournament-analysis-link');
const newMatchBtn = document.getElementById('new-match-btn');
const newMatchDialog = document.getElementById('new-match-dialog');
const newMatchForm = document.getElementById('new-match-form');
const newMatchCancel = document.getElementById('new-match-cancel');
const matchDateInput = document.getElementById('match-date');

let tournament = null;

function renderHeader() {
  setPageTitle('賽事', tournament.name);
  titleEl.textContent = tournament.name;
  metaEl.textContent = `共 ${tournament.roster.length} 位球員`;
  managePlayersLink.href = `players.html?id=${encodeURIComponent(tournament.id)}`;
  tournamentAnalysisLink.href = `tournament-analysis.html?id=${encodeURIComponent(tournament.id)}`;
}

function renderMatches() {
  const matches = getTournamentMatches(tournament.id);
  matchList.innerHTML = '';
  matchesEmpty.hidden = matches.length > 0;
  matchCount.textContent = matches.length === 0 ? '尚無比賽' : `共 ${matches.length} 場比賽`;

  matches.forEach((match) => {
    const item = document.createElement('li');
    item.className = 'match-card';
    const meta = [formatMatchDate(match.date), match.enemyTeamName || '敵隊未設定'].filter(Boolean);
    item.innerHTML = `
      <button type="button" class="match-card__open" data-id="${match.id}">
        <span class="match-card__name">${escapeHtml(match.name)}</span>
        <span class="match-card__meta">${escapeHtml(meta.join(' · '))}</span>
      </button>
      <button type="button" class="match-card__delete" data-id="${match.id}">刪除</button>
    `;
    matchList.appendChild(item);
  });
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
  renderMatches();

  const today = new Date();
  matchDateInput.value = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

newMatchBtn.addEventListener('click', () => {
  if (tournament.roster.length === 0) {
    window.alert('請先加入至少一位球員。');
    return;
  }
  newMatchDialog.showModal();
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

matchList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const openBtn = target.closest('.match-card__open');
  if (openBtn instanceof HTMLElement) {
    window.location.href = getMatchPageUrl(openBtn.dataset.id);
    return;
  }
  const delBtn = target.closest('.match-card__delete');
  if (delBtn instanceof HTMLElement) {
    if (!window.confirm('確定刪除此比賽？')) return;
    deleteMatch(delBtn.dataset.id);
    renderMatches();
  }
});

subscribeToSync(() => {
  tournament = getTournamentById(tournamentId);
  if (!tournament) {
    window.location.replace('index.html');
    return;
  }
  renderHeader();
  renderMatches();
});

loadTournament();
