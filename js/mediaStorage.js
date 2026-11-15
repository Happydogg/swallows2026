/**
 * mediaStorage.js
 * Image compression, avatar uploads, Cloudflare R2 video streaming, and snapshot generation.
 */

import { R2_WORKER_SIGNER_URL, R2_PUBLIC_BASE_URL, supabaseClient } from './config.js';

/**
 * Formats image URLs, converting Google Drive & Dropbox links into direct thumbnails.
 */
export function formatImgUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();

  if (trimmed.includes('drive.google.com/file/d/')) {
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w500`;
    }
  }
  if (trimmed.includes('drive.google.com') && trimmed.includes('id=')) {
    const match = trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w500`;
    }
  }
  if (trimmed.includes('dropbox.com') && trimmed.endsWith('?dl=0')) {
    return trimmed.replace('?dl=0', '?raw=1');
  }

  return trimmed;
}

/**
 * Compresses image uploads client-side to maximum 500px avatars (~50KB).
 */
export function compressImage(file, maxWidth = 500, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas compression failed'));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Compresses and uploads a player avatar to the Supabase 'avatars' bucket, returning its cache-busted public URL.
 */
export async function uploadAvatarToSupabase(playerId, file) {
  const compressedBlob = await compressImage(file, 500, 0.8);
  const filePath = `${playerId}.jpg`;

  const { error: uploadError } = await supabaseClient.storage
    .from('avatars')
    .upload(filePath, compressedBlob, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabaseClient.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return `${publicUrlData.publicUrl}?t=${Date.now()}`;
}

/**
 * Uploads a video or snapshot blob directly to Cloudflare R2 via the Worker signer.
 */
export async function uploadFileToR2(key, fileOrBlob, contentType) {
  const uploadUrl = `${R2_WORKER_SIGNER_URL}?key=${encodeURIComponent(key)}`;
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileOrBlob
  });

  if (!res.ok) throw new Error(`R2 Upload failed with status ${res.status}`);
  return `${R2_PUBLIC_BASE_URL}/${key}`;
}

/**
 * Deletes an object from Cloudflare R2 by key.
 */
export async function deleteFileFromR2(key) {
  if (!key) return;
  try {
    await fetch(`${R2_WORKER_SIGNER_URL}?key=${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });
  } catch (e) {
    console.warn('R2 deletion warning:', e);
  }
}

/**
 * Captures a mid-clip JPEG diagnostic frame (~80KB) from a local video file.
 */
export function generateAnnotatedSnapshot(videoFile) {
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.src = URL.createObjectURL(videoFile);

    vid.onloadedmetadata = () => {
      vid.currentTime = vid.duration * 0.55;
    };

    vid.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth || 1280;
      canvas.height = vid.videoHeight || 720;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect(24, 24, 280, 70, 8);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText('DIAGNOSTIC SNAPSHOT', 38, 48);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('Cloudflare R2 Synced', 38, 70);

      URL.revokeObjectURL(vid.src);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    };
  });
}