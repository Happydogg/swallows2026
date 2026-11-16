/**
 * config.js
 * Centralized Supabase and Cloudflare R2 configuration for Swallows DataLab.
 */

export const SUPABASE_URL = 'https://wvurolqbjhuckkkjiiiv.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_R1r3lQZp11V3oA-pbRDiKg_GohLWsen';

export const R2_WORKER_SIGNER_URL = 'https://swallows-r2-signer.sampson-ho.workers.dev';
export const R2_PUBLIC_BASE_URL   = 'https://pub-dd29961d92a5488bb37e9576e00956fc.r2.dev';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);