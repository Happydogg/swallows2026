// SDL-004-006: safe coach roster, deliberately separate from raw players SELECT *.
// The database RPC enforces identity, team and organization membership.
import { supabaseClient } from './config.js';

export async function fetchCoachRoster({signal} = {}) {
  let request = supabaseClient.rpc('sdl_004_coach_roster');
  if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal);
  const {data,error} = await request;
  if (error) throw error;
  // Only the explicitly allowlisted fields are returned by the server.
  return data || [];
}
