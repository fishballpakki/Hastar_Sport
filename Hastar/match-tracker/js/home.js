const form = document.getElementById('new-tournament-form');
const tournamentList = document.getElementById('tournament-list');
const emptyState = document.getElementById('empty-state');
const tournamentCount = document.getElementById('tournament-count');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
const syncStatusEl = document.getElementById('sync-status');
const syncNowBtn = document.getElementById('sync-now-btn');

function updateSyncStatusUI() {
  if (!syncStatusEl) return;
  const status = getSyncStatus();
  syncStatusEl.textContent = status.message || '尚未開始同步';
  syncStatusEl.dataset.status = status.status;
}

function renderTournaments() {
  const tournaments = readTournaments();
  tournamentList.innerHTML = '';

  if (tournaments.length === 0) {
    emptyState.hidden = false;
    tournamentCount.textContent = '尚未建立賽事。';
    return;
  }

  emptyState.hidden = true;
  tournamentCount.textContent =
    tournaments.length === 1 ? '共 1 個賽事' : `共 ${tournaments.length} 個賽事`;

  tournaments.forEach((tournament) => {
    const matchCount = getTournamentMatches(tournament.id).length;
    const item = document.createElement('li');
    item.className = 'match-card';
    item.innerHTML = `
      <button type="button" class="match-card__open" data-id="${tournament.id}">
        <span class="match-card__name">${escapeHtml(tournament.name)}</span>
        <span class="match-card__meta">${tournament.roster.length} 位球員 · ${matchCount} 場比賽</span>
      </button>
      <button type="button" class="match-card__delete" data-id="${tournament.id}" aria-label="刪除賽事">刪除</button>
    `;
    tournamentList.appendChild(item);
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const name = String(formData.get('tournamentName') ?? '').trim();
  if (!name) return;
  const tournament = createTournament(name);
  window.location.href = getTournamentPageUrl(tournament.id);
});

tournamentList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const openButton = target.closest('.match-card__open');
  if (openButton instanceof HTMLElement) {
    window.location.href = getTournamentPageUrl(openButton.dataset.id);
    return;
  }

  const deleteButton = target.closest('.match-card__delete');
  if (deleteButton instanceof HTMLElement) {
    const id = deleteButton.dataset.id;
    const tournament = getTournamentById(id);
    const label = tournament ? `「${tournament.name}」` : '此賽事';
    const confirmed = window.confirm(`確定要刪除 ${label} 及其中所有比賽？此操作無法復原。`);
    if (!confirmed) return;
    deleteTournament(id);
    renderTournaments();
  }
});

exportBtn.addEventListener('click', () => exportAllData());
importBtn.addEventListener('click', () => importFile.click());
syncNowBtn?.addEventListener('click', () => {
  void forceSyncNow().finally(updateSyncStatusUI);
});
importFile.addEventListener('change', async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const result = await importDataFromFile(file);
    window.alert(
      `匯入完成：賽事 +${result.addedTournaments}/~${result.updatedTournaments}，比賽 +${result.addedMatches}/~${result.updatedMatches}`,
    );
    renderTournaments();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '匯入失敗。');
  }
});

subscribeToSync(renderTournaments);
window.addEventListener('match-tracker-sync-status', updateSyncStatusUI);
updateSyncStatusUI();
renderTournaments();
