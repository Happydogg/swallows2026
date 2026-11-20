// SDL-004-AVATAR-001: authenticated, permission-scoped photo manager.
// Browser controls improve UX, but the database RPC and storage RLS enforce access.
import { avatarService } from '../js/avatarService.js';

export function useAvatarManager({ auth, service = avatarService } = {}) {
  const rows = Vue.ref([]);
  const loading = Vue.ref(false);
  const busy = Vue.ref(false);
  const open = Vue.ref(false);
  const selectedId = Vue.ref('');
  const selectedFile = Vue.ref(null);
  const error = Vue.ref('');
  const notice = Vue.ref('');
  let generation = 0;

  const photos = Vue.computed(() => Object.fromEntries(
    rows.value.filter(p => p.display_photo_url).map(p => [p.id,p.display_photo_url])
  ));
  const selectedPlayer = Vue.computed(() => rows.value.find(p => p.id === selectedId.value) || null);
  const canEdit = id => rows.value.some(row => row.id === id);

  const reset = () => {
    generation++;
    rows.value = [];
    loading.value = false;
    busy.value = false;
    open.value = false;
    selectedId.value = '';
    selectedFile.value = null;
    error.value = '';
    notice.value = '';
  };

  const load = async () => {
    const identity = auth.captureIdentity();
    if (!auth.isCurrentIdentity(identity) || auth.authError.value) return;
    const stamp = ++generation;
    loading.value = true;
    error.value = '';
    try {
      const allowed = await service.listManagedPlayers();
      if (stamp === generation && auth.isCurrentIdentity(identity)) rows.value = allowed;
    } catch (reason) {
      if (stamp === generation && auth.isCurrentIdentity(identity)) {
        rows.value = [];
        error.value = 'Could not load authorized photo permissions: ' + (reason.message || 'unknown error');
      }
    } finally {
      if (stamp === generation && auth.isCurrentIdentity(identity)) loading.value = false;
    }
  };
  const choose = id => {
    if (!canEdit(id)) return false;
    selectedId.value = id;
    selectedFile.value = null;
    error.value = '';
    notice.value = '';
    open.value = true;
    return true;
  };
  const close = () => {
    if (busy.value) return;
    open.value = false;
    selectedFile.value = null;
  };
  const selectFile = event => {
    selectedFile.value = event?.target?.files?.[0] || null;
    error.value = '';
    notice.value = '';
  };
  const save = async () => {
    const identity = auth.captureIdentity();
    const playerId = selectedId.value;
    if (busy.value || !selectedFile.value || !canEdit(playerId)
      || !auth.isCurrentIdentity(identity) || auth.authError.value) return;
    busy.value = true;
    error.value = '';
    notice.value = '';
    try {
      const result = await service.uploadPlayerPhoto(playerId,selectedFile.value);
      if (!auth.isCurrentIdentity(identity)) return;
      rows.value = rows.value.map(row => row.id === playerId ? {
        ...row,photo_url: result.photo_url, display_photo_url: result.display_photo_url
      } : row);
      selectedFile.value = null;
      notice.value = 'Private profile photo saved.';
      open.value = false;
    } catch (reason) {
      if (auth.isCurrentIdentity(identity)) error.value = reason.message || 'Photo update failed.';
    } finally {
      if (auth.isCurrentIdentity(identity)) busy.value = false;
    }
  };
  return { rows,photos,loading,busy,open,selectedId,selectedPlayer,selectedFile,error,notice,
    canEdit,load,reset,choose,close,selectFile,save };
}
