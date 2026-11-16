/**
 * config.js
 * Centralized Supabase and Cloudflare R2 configuration for Swallows DataLab.
 */

export const SUPABASE_URL = 'https://wvurolqbjhuckkkjiiiv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_R1r3lQZp11V3oA-pbRDiKg_GohLWsen';

// Legacy exports are retained for compatibility, but cannot address public/production media.
export const R2_WORKER_SIGNER_URL = '';
export const R2_PUBLIC_BASE_URL = '';
export const PRIVATE_MEDIA_WORKER_URL = 'https://sdl-r2-staging-gate.sampson-ho.workers.dev';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
