// SDL-003: player management state and commands. Database calls remain in service layer.
import { uploadAvatarToSupabase } from '../js/mediaStorage.js';
import { insertPlayerRecord, updatePlayerRecord, deletePlayerRecord } from '../js/supabaseService.js';
import { isValidJersey as validJersey, isJerseyTaken, compareJerseys } from '../utils/jerseyUtils.js';
import { getPlayerDisplayName, formatLegalName, splitPositions, togglePositionSelection } from '../utils/playerUtils.js';
const { ref, reactive, nextTick } = Vue;

export function usePlayers({ players, sessions, drillVideos, selectedPlayer, currentView,
  expandedSessionIds, isCoach, isSaving, t, renderPlayerChart }) {
  const isUploadingPhoto = ref(false);

  const isPreferredCustomized = ref(false);

  const failedImgs = reactive({});

  const markImgFailed = (playerId) => {
    failedImgs[playerId] = true;
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !editingPlayer.value) return;

    isUploadingPhoto.value = true;
    try {
      const playerId = editingPlayer.value.id;
      editingPlayer.value.photo_url = await uploadAvatarToSupabase(playerId, file);
      failedImgs[playerId] = false;
    } catch (err) {
      alert('Upload error: ' + (err.message || 'Ensure the "avatars" bucket is set to Public.'));
      console.error('Upload failed:', err);
    } finally {
      isUploadingPhoto.value = false;
    }
  };

  const showAddPlayerModal = ref(false);

  const showEditPlayerModal = ref(false);

  const editingPlayer = ref(null);

  const selectedAddPositions = ref(['IF']);

  const selectedEditPositions = ref([]);

  const newPlayer = ref({
    last_name: '',
    given_names: '',
    preferred_name: '',
    jersey: '',
    hkll_reg_no: '',
    parent_phone: '',
    position: 'IF',
    throws: 'R',
    bats: 'R',
    bat_spec: '',
    dob: null,
    photo_url: ''
  });

  const onNamePartInput = () => {
    if (isPreferredCustomized.value) return;
    const given = (newPlayer.value.given_names || '').trim();
    const last = (newPlayer.value.last_name || '').trim();
    if (!given && !last) {
      newPlayer.value.preferred_name = '';
      return;
    }
    const firstGivenWord = given.split(' ')[0] || '';
    newPlayer.value.preferred_name = `${firstGivenWord} ${last}`.trim();
  };

  const toggleAddPosition = (pos) => {
    selectedAddPositions.value = togglePositionSelection(selectedAddPositions.value, pos);
  };

  const toggleEditPosition = (pos) => {
    selectedEditPositions.value = togglePositionSelection(selectedEditPositions.value, pos);
  };

  const openAddPlayerModal = () => {
    isPreferredCustomized.value = false;
    selectedAddPositions.value = ['IF'];
    newPlayer.value = {
      last_name: '',
      given_names: '',
      preferred_name: '',
      jersey: '',
      hkll_reg_no: '',
      parent_phone: '',
      position: 'IF',
      throws: 'R',
      bats: 'R',
      bat_spec: '',
      dob: null,
      photo_url: ''
    };
    showAddPlayerModal.value = true;
  };

  const jerseyTaken = (value, excludePlayerId = null) => isJerseyTaken(players.value, value, excludePlayerId);

  const addPlayer = async () => {
    if (isSaving.value || !isCoach.value) return;
    if (!String(newPlayer.value.preferred_name ?? '').trim() || !validJersey(newPlayer.value.jersey)) {
      alert('Enter a preferred name and a jersey number of 1–2 digits (0–99).');
      return;
    }
    newPlayer.value.jersey = String(newPlayer.value.jersey).trim();
    if (jerseyTaken(newPlayer.value.jersey)) {
      alert('This jersey number is already assigned (leading zeros do not make it a different number).');
      return;
    }
    isSaving.value = true;
    newPlayer.value.position = selectedAddPositions.value.join(', ');
    newPlayer.value.photo_url = newPlayer.value.photo_url ? newPlayer.value.photo_url.trim() : null;
    try {
      const created = await insertPlayerRecord({
        ...newPlayer.value,
        name: newPlayer.value.preferred_name
      });
      players.value.push(created);
      players.value.sort(compareJerseys);
      showAddPlayerModal.value = false;
    } catch (error) {
      alert('Failed to save player: ' + error.message);
    } finally {
      isSaving.value = false;
    }
  };

  const openEditPlayerModal = (player) => {
    if (!isCoach.value) return;
    editingPlayer.value = {
      ...player,
      preferred_name: getPlayerDisplayName(player),
      last_name: player.last_name || '',
      given_names: player.given_names || '',
      hkll_reg_no: player.hkll_reg_no || '',
      parent_phone: player.parent_phone || '',
      photo_url: player.photo_url ? String(player.photo_url) : ''
    };
    selectedEditPositions.value = splitPositions(player.position);
    showEditPlayerModal.value = true;
  };

  const updatePlayer = async () => {
    if (isSaving.value || !isCoach.value || !editingPlayer.value) return;
    if (!String(editingPlayer.value.preferred_name ?? '').trim() || !validJersey(editingPlayer.value.jersey)) {
      alert('Enter a preferred name and a jersey number of 1–2 digits (0–99).');
      return;
    }
    const proposedJersey = String(editingPlayer.value.jersey).trim();
    if (jerseyTaken(proposedJersey, editingPlayer.value.id)) {
      alert('This jersey number is already assigned (leading zeros do not make it a different number).');
      return;
    }
    isSaving.value = true;
    const { id, last_name, given_names, preferred_name, jersey, hkll_reg_no, parent_phone, throws, bats, bat_spec, dob, photo_url } = editingPlayer.value;
    const payload = {
      last_name: last_name ? last_name.trim() : null,
      given_names: given_names ? given_names.trim() : null,
      preferred_name: preferred_name ? preferred_name.trim() : '',
      name: preferred_name ? preferred_name.trim() : '',
      jersey: String(jersey).trim(),
      hkll_reg_no: hkll_reg_no ? hkll_reg_no.trim() : null,
      parent_phone: parent_phone ? parent_phone.trim() : null,
      position: selectedEditPositions.value.join(', '),
      throws,
      bats,
      bat_spec,
      dob: dob || null,
      photo_url: photo_url && photo_url.trim() !== '' ? photo_url.trim() : null
    };
    try {
      await updatePlayerRecord(id, payload);
      const index = players.value.findIndex((p) => p.id === id);
      if (index !== -1) {
        players.value[index] = { ...players.value[index], ...payload };
        players.value.sort(compareJerseys);
      }
      if (selectedPlayer.value?.id === id) {
        selectedPlayer.value = { ...selectedPlayer.value, ...payload };
      }
      failedImgs[id] = false;
      showEditPlayerModal.value = false;
    } catch (error) {
      alert('Failed to update player: ' + error.message);
    } finally {
      isSaving.value = false;
    }
  };

  const removePlayer = async (id) => {
    if (!isCoach.value || !confirm(t('deleteConfirm'))) return;
    try {
      await deletePlayerRecord(id);
      players.value = players.value.filter((p) => p.id !== id);
      sessions.value = sessions.value.filter((s) => s.player_id !== id);
      drillVideos.value = drillVideos.value.filter((v) => v.player_id !== id);
      if (selectedPlayer.value?.id === id) {
        currentView.value = 'overview';
        selectedPlayer.value = null;
      }
    } catch (error) {
      alert('Failed to delete player: ' + error.message);
    }
  };

  const selectPlayer = (player) => {
    selectedPlayer.value = player;
    currentView.value = 'player';
    expandedSessionIds.clear();
    nextTick(() => {
      renderPlayerChart();
    });
  };

  return { isUploadingPhoto, isPreferredCustomized, failedImgs, markImgFailed, handleFileUpload, showAddPlayerModal, showEditPlayerModal, editingPlayer, selectedAddPositions, selectedEditPositions, newPlayer, onNamePartInput, toggleAddPosition, toggleEditPosition, openAddPlayerModal, addPlayer, openEditPlayerModal, updatePlayer, removePlayer, selectPlayer, getPlayerDisplayName, formatLegalName, splitPositions };
}
