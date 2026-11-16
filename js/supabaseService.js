/**
 * supabaseService.js
 * Cloud database CRUD operations for players, sessions, and drill videos.
 */

import { supabaseClient } from './config.js';
import {
  uploadFileToR2,
  deleteFileFromR2,
  generateAnnotatedSnapshot
} from './mediaStorage.js';

export async function fetchAllCloudData() {
  const [pRes, sRes] = await Promise.all([
    supabaseClient.from('players').select('*').order('jersey', { ascending: true }),
    supabaseClient.from('sessions').select('*').order('session_date', { ascending: false })
  ]);

  if (pRes.error) console.error('Players Error:', pRes.error);
  if (sRes.error) console.error('Sessions Error:', sRes.error);

  return {
    players: pRes.data || [],
    sessions: sRes.data || [],
    // Private videos come only from the authenticated Worker, never stored public URLs.
    drillVideos: []
  };
}

export async function insertPlayerRecord(payload) {
  const { data, error } = await supabaseClient
    .from('players')
    .insert([payload])
    .select();
  if (error) throw error;
  return data[0];
}

export async function updatePlayerRecord(id, payload) {
  const { error } = await supabaseClient
    .from('players')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

export async function deletePlayerRecord(id) {
  const { error } = await supabaseClient
    .from('players')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function insertSessionRecord(payload) {
  const { data, error } = await supabaseClient
    .from('sessions')
    .insert([payload])
    .select();
  if (error) throw error;
  return data[0];
}

export async function updateSessionRecord(id, payload) {
  const { error } = await supabaseClient
    .from('sessions')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSessionRecord(sessionId) {
  const { error } = await supabaseClient
    .from('sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}

export async function uploadDrillVideoWithQuota({ player, videoFile, metadata, maxQuota = 10 }) {
  // 1. Query active unarchived clips
  const { data: existingClips } = await supabaseClient
    .from('drill_videos')
    .select('id, r2_video_key')
    .eq('player_id', player.id)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  // 2. Archive oldest clip and purge MP4 from R2 if quota reached
  if (existingClips && existingClips.length >= maxQuota) {
    const oldest = existingClips[0];
    if (oldest.r2_video_key) {
      await deleteFileFromR2(oldest.r2_video_key);
    }
    await supabaseClient
      .from('drill_videos')
      .update({ is_archived: true, video_url: null, r2_video_key: null })
      .eq('id', oldest.id);
  }

  // 3. Generate mid-clip diagnostic snapshot
  const snapshotBlob = await generateAnnotatedSnapshot(videoFile);

  // 4. Stream video and snapshot to Cloudflare R2
  const timestamp = Date.now();
  const fileExt = videoFile.name.split('.').pop() || 'mp4';
  const videoKey = `videos/${player.id}/${timestamp}.${fileExt}`;
  const snapshotKey = `snapshots/${player.id}/${timestamp}.jpg`;

  const videoUrl = await uploadFileToR2(videoKey, videoFile, videoFile.type || 'video/mp4');
  const snapshotUrl = await uploadFileToR2(snapshotKey, snapshotBlob, 'image/jpeg');

  // 5. Save database metadata row
  const videoPayload = {
    player_id: player.id,
    session_date: metadata.session_date,
    category: metadata.category,
    camera_angle: metadata.camera_angle,
    video_url: videoUrl,
    snapshot_url: snapshotUrl,
    r2_video_key: videoKey,
    r2_snapshot_key: snapshotKey,
    fps_mode: metadata.fps_mode || 60,
    coach_feedback: metadata.coach_feedback || null,
    is_archived: false
  };

  const { data: insertData, error: insertError } = await supabaseClient
    .from('drill_videos')
    .insert([videoPayload])
    .select();

  if (insertError) throw insertError;
  return insertData[0];
}

export async function deleteDrillVideoRecord(video) {
  if (video.r2_video_key) await deleteFileFromR2(video.r2_video_key);
  if (video.r2_snapshot_key) await deleteFileFromR2(video.r2_snapshot_key);

  const { error } = await supabaseClient
    .from('drill_videos')
    .delete()
    .eq('id', video.id);

  if (error) throw error;
}