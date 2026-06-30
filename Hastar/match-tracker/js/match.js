const params = new URLSearchParams(window.location.search);
const matchId = params.get('id');

if (!matchId) {
  window.location.replace('index.html');
} else {
  const match = getMatchById(matchId);
  if (!match) {
    window.location.replace('index.html');
  } else if (match.friendlyPlayers.length === 0 && match.enemyPlayers.length === 0) {
    window.location.replace(`match-setup.html?id=${encodeURIComponent(match.id)}`);
  } else {
    window.location.replace(`stats.html?id=${encodeURIComponent(match.id)}&team=${TEAM_FRIENDLY}`);
  }
}
