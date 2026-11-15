// SDL-003: video list and upload/delete workflow; R2 behavior unchanged.
import { uploadDrillVideoWithQuota, deleteDrillVideoRecord } from '../js/supabaseService.js';
const { ref, computed } = Vue;

export function useVideos({ drillVideos, selectedPlayer, isCoach }) {
  const isUploadingVideo = ref(false);

  const showUploadVideoModal = ref(false);

  const activePlayerForVideo = ref(null);

  const selectedVideoFile = ref(null);

  const newDrillVideo = ref({
    session_date: new Date().toISOString().slice(0, 10),
    category: 'batting',
    camera_angle: 'side_open',
    fps_mode: 60,
    coach_feedback: ''
  });

  const playerDrillVideos = computed(() => {
    if (!selectedPlayer.value) return [];
    return drillVideos.value.filter((v) => v.player_id === selectedPlayer.value.id);
  });

  const openUploadVideoModal = (player) => {
    if (!isCoach.value) return;
    activePlayerForVideo.value = player;
    selectedVideoFile.value = null;
    newDrillVideo.value = {
      session_date: new Date().toISOString().slice(0, 10),
      category: 'batting',
      camera_angle: 'side_open',
      fps_mode: 60,
      coach_feedback: ''
    };
    showUploadVideoModal.value = true;
  };

  const handleVideoFilePick = (event) => {
    const file = event.target.files[0] || null;
    if (!file) return;

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = URL.createObjectURL(file);

    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(tempVideo.src);
      if (tempVideo.duration > 5.0) {
        alert(`⚠️ Video duration is ${tempVideo.duration.toFixed(1)}s. To ensure fast analysis, please trim clip under 5s.`);
        event.target.value = '';
        selectedVideoFile.value = null;
        return;
      }
      selectedVideoFile.value = file;
    };
  };

  const uploadDrillVideo = async () => {
    if (!isCoach.value || !activePlayerForVideo.value || !selectedVideoFile.value) return;
    isUploadingVideo.value = true;
    try {
      const savedClip = await uploadDrillVideoWithQuota({
        player: activePlayerForVideo.value,
        videoFile: selectedVideoFile.value,
        metadata: newDrillVideo.value
      });
      drillVideos.value.unshift(savedClip);
      showUploadVideoModal.value = false;
      alert('Video clip and snapshot saved to Cloudflare R2!');
    } catch (err) {
      console.error('Upload Error:', err);
      alert('Upload error: ' + (err.message || 'Check Worker and CORS settings.'));
    } finally {
      isUploadingVideo.value = false;
    }
  };

  const deleteDrillVideo = async (video) => {
    if (!isCoach.value || !confirm('Are you sure you want to permanently delete this drill video and snapshot?')) return;
    try {
      await deleteDrillVideoRecord(video);
      drillVideos.value = drillVideos.value.filter((v) => v.id !== video.id);
    } catch (err) {
      alert('Failed to delete video: ' + err.message);
    }
  };

  return { isUploadingVideo, showUploadVideoModal, activePlayerForVideo, selectedVideoFile, newDrillVideo, playerDrillVideos, openUploadVideoModal, handleVideoFilePick, uploadDrillVideo, deleteDrillVideo };
}
