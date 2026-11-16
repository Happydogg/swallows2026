// SDL-004-006: safe coach roster, deliberately separate from raw players SELECT *.
// The database RPC enforces identity, team and organization membership.
import { supabaseClient } from './config.js';

export async function fetchCoachRoster() {
  const { data, error } = await supabaseClient.rpc('sdl_004_coach_roster');
  if (error) throw error;
  // Only the explicitly allowlisted fields are returned by the server.
  return data || [];
}
