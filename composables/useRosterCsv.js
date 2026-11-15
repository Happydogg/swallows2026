// SDL-003: roster CSV entry points. CSV parser/storage remains in csvManager.
import { exportTeamRosterCSV, importTeamRosterCSV } from '../js/csvManager.js';

export function useRosterCsv({ players, sessions, isCoach, getLatestMetric, getPlayerDisplayName }) {
  const exportTeamCSV = () => {
    if (!isCoach.value) return;
    try {
      exportTeamRosterCSV(players.value, getLatestMetric, getPlayerDisplayName);
    } catch (err) {
      console.error('CSV Export Error:', err);
      alert('Failed to export CSV: ' + (err.message || 'Unknown error'));
    }
  };

  const importTeamCSV = async (event) => {
    if (!isCoach.value) return;
    const file = event.target.files[0];
    if (!file) return;
    try {
      const { updatedPlayers, growthLogged } = await importTeamRosterCSV(file, {
        players: players.value,
        sessions: sessions.value,
        getLatestMetric
      });
      alert(`Import Complete!\n• Roster Profiles Updated: ${updatedPlayers}\n• Growth Baselines Logged: ${growthLogged}`);
    } catch (err) {
      console.error('CSV Import Error:', err);
      alert('CSV Import Failed: ' + (err.message || 'Please check CSV column formatting.'));
    } finally {
      event.target.value = '';
    }
  };

  return { exportTeamCSV, importTeamCSV };
}
