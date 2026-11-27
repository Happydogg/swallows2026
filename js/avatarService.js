// SDL-004-AVATAR-001. Supabase staging private photo service.
// Every read/write is authorized by RLS or a tightly scoped RPC on the server.
import { supabaseClient } from './config.js';
import { compressImage } from './mediaStorage.js';

export const AVATAR_BUCKET = 'sdl-avatars-staging';
export const PRIVATE_AVATAR_PREFIX = 'sdl-private-avatar:';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1048576;

export function fallbackDemoAvatar(player) {
  const jersey = String(player?.jersey || '');
  return /^DEMO\s/.test(String(player?.preferred_name || '')) && /^(2[1-9]|3[0-5])$/.test(jersey)
    ? '/assets/demo-players/' + jersey + '.svg' : '';
}

export function isPrivateAvatarRef(value) {
  if (typeof value !== 'string' || !value.startsWith(PRIVATE_AVATAR_PREFIX)) return false;
  const path = value.slice(PRIVATE_AVATAR_PREFIX.length);
  const [playerId,file] = path.split('/');
  return ID_PATTERN.test(playerId || '') && /^[0-9a-f-]{36}\.jpg$/i.test(file || '')
    && ID_PATTERN.test(String(file || '').slice(0,-4)) && path.split('/').length === 2;
}

export function publicAvatarOrFallback(value, player) {
  if (typeof value === 'string' && /^https:\/\/[A-Za-z0-9]/.test(value)) return value;
  if (typeof value === 'string' && /^\/assets\/demo-players\/(2[1-9]|3[0-5])\.svg$/.test(value)) return value;
  return fallbackDemoAvatar(player);
}

export function createAvatarService({
  client = supabaseClient, compress = compressImage, makeId = () => crypto.randomUUID()
} = {}) {
  const storage = () => client.storage.from(AVATAR_BUCKET);

  async function resolvePhoto(row) {
    const ref = row?.photo_url || '';
    if (!isPrivateAvatarRef(ref)) return publicAvatarOrFallback(ref, row);
    const path = ref.slice(PRIVATE_AVATAR_PREFIX.length);
    if (!path.startsWith(row.id + '/')) return fallbackDemoAvatar(row);
    const { data, error } = await storage().createSignedUrl(path, 600);
    if (error) throw error;
    return /^https:\/\//.test(data?.signedUrl || '') ? data.signedUrl : '';
  }

  async function listManagedPlayers({filterRows=rows=>rows}={}) {
    const { data, error } = await client.rpc('sdl_ux_avatar_managed_players');
    if (error) throw error;
    const rows = filterRows(Array.isArray(data) ? data : []);
    const signed = await Promise.all(rows.map(async row => ({
      ...row,
      display_photo_url: await resolvePhoto(row).catch(() => fallbackDemoAvatar(row))
    })));
    return signed;
  }

  async function uploadPlayerPhoto(playerId, file) {
    if (!ID_PATTERN.test(String(playerId || ''))) throw new Error('Invalid player identifier');
    if (!file || typeof file.size !== 'number' || file.size <= 0 || file.size > MAX_INPUT_BYTES) {
      throw new Error('Select an image smaller than 8 MB');
    }
    if (!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)) {
      throw new Error('Choose a JPEG, PNG, WebP, or supported iPhone photo');
    }
    const compressed = await compress(file, 500, 0.8);
    if (!compressed || compressed.size > MAX_UPLOAD_BYTES || compressed.size <= 0) {
      throw new Error('Photo compression failed or the JPEG is larger than 1 MB');
    }
    const random = String(makeId() || '').toLowerCase();
    if (!ID_PATTERN.test(random)) throw new Error('Could not create a secure photo identifier');
    const objectPath = String(playerId).toLowerCase() + '/' + random + '.jpg';
    const { error: uploadError } = await storage().upload(objectPath, compressed, {
      contentType: 'image/jpeg', upsert: false, cacheControl: '60'
    });
    if (uploadError) throw uploadError;

    // Storage objects are not public. This RPC checks active role, player,
    // uploader ownership and actual object existence before writing photo_url.
    const { data: savedRef, error: saveError } = await client.rpc('sdl_ux_avatar_save', {
      p_player: playerId,
      p_object_path: objectPath
    });
    if (saveError) throw saveError;
    if (savedRef !== PRIVATE_AVATAR_PREFIX + objectPath) {
      throw new Error('The photo pointer was not confirmed by the server');
    }
    const { data: signed, error: signedError } = await storage().createSignedUrl(objectPath, 600);
    if (signedError) throw signedError;
    return {
      photo_url: savedRef,
      display_photo_url: signed?.signedUrl || ''
    };
  }
  return { listManagedPlayers, uploadPlayerPhoto, resolvePhoto };
}

export const avatarService = createAvatarService();
