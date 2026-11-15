/**
 * config.js
 * Centralized Supabase and Cloudflare R2 configuration for Swallows DataLab.
 */

export const SUPABASE_URL = 'https://yznulwgrhvjyuwclmioo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6bnVsd2dyaHZqeXV3Y2xtaW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTY1MDcsImV4cCI6MjEwNDE3MjUwN30.NGk74QmSL1Q5fG8JYFM_6TaB0Uo25jve76H0X_VC5co';

export const R2_WORKER_SIGNER_URL = 'https://swallows-r2-signer.sampson-ho.workers.dev';
export const R2_PUBLIC_BASE_URL   = 'https://pub-dd29961d92a5488bb37e9576e00956fc.r2.dev';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);