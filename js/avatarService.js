// SDL-004-AVATAR-001. Supabase staging private photo service.
// Every read/write is authorized by RLS or a tightly scoped RPC on the server.
import { supabaseClient } from './config.js';
import { compressImage } from './mediaStorage.js';

export const AVATAR_BUCKET = 'sdl-avatars-staging';
export const PRIVATE_AVATAR_PREFIX = 'sdl-private-avatar:';
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 1048576;

const FICTIONAL_PORTRAITS = Object.freeze({
  '8f6bfeaf-9bc9-4cd0-b8a2-5809cf2733e4': '00',
  '8760c9dd-9168-45fd-bb6d-4aae6526aa95': '07',
  '53a23db8-956a-4e21-868a-502cb278b035': '10',
  '2fc38b67-9a19-4e5f-81e2-fae4c80d7d7a': '12',
  'f275aa33-6f14-ec95-603e-302bb4cadb90': '21',
  '63022426-9184-8e23-a575-0694c8769456': '22',
  '1b69fc38-cc4a-d270-9fd1-109bce59d9cf': '23',
  '433a64cc-e42c-9473-5837-20a2b4c8f522': '24',
  'cefd5239-06a7-1fd4-0f76-448a8060351a': '25',
  '6968cda7-49ac-3484-4624-a351e494e3ef': '26',
  '2a0e66a5-da1e-a974-c85a-679efaa2427c': '27',
  'fec2fd06-43b6-a7de-224a-7b1e5993b82d': '28',
  'fc3da4ae-03f9-05fc-a4bf-a2eae0f7f2ab': '29',
  '025d4d0a-3fde-17af-ad68-1b63d0df6f1f': '30',
  '72f3285d-8897-a66f-718a-ba3da13aa906': '31',
  'c682df8f-f079-a34d-6c8c-753ab6ef8099': '32',
  'f4f6509a-b985-9485-7828-2d065f4086fd': '33',
  '0ee06598-7a2e-5561-33d3-51d2fe91c39b': '34',
  'f9e55bc2-d3c1-7d4d-d530-380117813197': '35',
  'b84c480a-1580-447a-9a4e-69605ade4ae8': '60',
  '88df0a1c-b28e-4f35-9329-06dee1eeb3c5': '61',
  'a61d0bf5-2eb1-4f67-b08d-6a93cfb8ce8b': '62',
  '429345ee-67d6-47d2-b884-fb030fb12d39': '63',
  'e8e816b6-963b-470a-827e-7188648bf2f3': '64',
  'dfca1302-cce4-48bc-b9e2-e82861fe901e': '65',
  'f32bf0a2-35fb-4e79-a632-28da1ba2faba': '99'
});

// Only the 26 owner-confirmed synthetic records are assigned new portraits.
// This lookup never fetches player records or confers access.
export function fictionalPortraitFor(player) {
  const jersey = FICTIONAL_PORTRAITS[player?.id];
  return typeof jersey === 'string' && String(player?.jersey ?? '') === jersey
    ? '/assets/demo-players/' + jersey + '.jpg' : '';
}

export function fallbackDemoAvatar(player) {
  const fictional = fictionalPortraitFor(player);
  if (fictional) return fictional;
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
  // Only replace the exact existing public DEMO illustration with its fictional portrait.
  // Private/signed/custom images and other players are never overridden.
  const jersey=String(player?.jersey||'');
  const fictional=fictionalPortraitFor(player);
  if (fictional) {
    const old='/assets/demo-players/'+jersey+'.svg';
    if (!value || value===old || value==='https://sdl-ux-live.pages.dev'+old || value===fictional || (typeof value==='string' && value.startsWith(PRIVATE_AVATAR_PREFIX))) return fictional;
  }
  if(/^DEMO\s/.test(String(player?.preferred_name||'')) && /^(2[1-9]|3[0-5])$/.test(jersey)) {
    const old='/assets/demo-players/'+jersey+'.svg';
    if(value===old||value==='https://sdl-ux-live.pages.dev'+old||value==='/assets/demo-players/'+jersey+'.jpg') return '/assets/demo-players/'+jersey+'.jpg';
  }
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
