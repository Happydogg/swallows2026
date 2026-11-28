import { createPrivateMediaService, validateMediaFile } from '../js/privateMediaService.js';
import { extractVideoThumbnail } from '../js/videoThumbnail.js';
const { ref, computed } = Vue;

// Separate media permissions from isCoach: media access never unlocks official stats.
export function usePrivateMedia({ auth, players, coachRoster, managedPlayers = {value:[]}, analyzer, service = createPrivateMediaService({ auth }),
  urls = URL, timeoutMs = 125000, thumbnailExtractor = extractVideoThumbnail }) {
  const mediaPlayerId = ref('');
  const mediaItems = ref([]);
  const mediaReadAllowed = ref(false);
  const mediaUploadAllowed = ref(false);
  const mediaLoading = ref(false);
  const mediaUploading = ref(false);
  const mediaArchiving = ref(false);
  const mediaProgress = ref(0);
  const mediaError = ref('');
  const mediaUploadError = ref('');
  const mediaNotice = ref('');
  const mediaFile = ref(null);
  const uploadCategory = ref('');
  let uploadRequest, inboxReviewContext=false;
  const mediaPlaybackUrl = ref('');
  const mediaPlaybackId = ref('');
  const mediaReviewing=ref(false),reviewSingleSubject=ref(false),reviewVideoNote=ref('');
  const reviewItem=computed(()=>mediaItems.value.find(row=>row.id===mediaPlaybackId.value&&row.can_review===true));
  const mediaPlaybackLoading = ref(false);
  const analysisCategory = ref('');
  const analysisFps = ref('');
  // Real, authorization-checked thumbnails stay in memory only.
  const mediaThumbnails = ref({});
  const mediaThumbnailBusy = ref({});
  const mediaThumbnailFailed = ref({});
  const thumbnailQueue=[];
  const thumbnailQueued=new Set();
  let thumbnailEpoch=0, thumbnailWorkerRunning=false;
  function discardThumbnails(){
    thumbnailEpoch++;
    thumbnailQueue.length=0;thumbnailQueued.clear();
    mediaThumbnails.value={};mediaThumbnailBusy.value={};mediaThumbnailFailed.value={};
  }
  function ensureMediaThumbnail(item){
    if(!mediaReadAllowed.value || !mediaPlayerId.value || !item
      || !mediaItems.value.some(x=>x.id===item.id&&x.status!=='rejected')
      || mediaThumbnails.value[item.id] || mediaThumbnailFailed.value[item.id]
      || thumbnailQueued.has(item.id))return;
    thumbnailQueued.add(item.id);
    thumbnailQueue.push({id:item.id,epoch:thumbnailEpoch});
    void runThumbnailQueue();
  }
  function retryMediaThumbnail(item) {
    if (!mediaThumbnailFailed.value[item.id]) return;
    const remaining = {...mediaThumbnailFailed.value};
    delete remaining[item.id];
    mediaThumbnailFailed.value = remaining;
    ensureMediaThumbnail(item);
  }
  async function runThumbnailQueue(){
    if(thumbnailWorkerRunning)return;
    thumbnailWorkerRunning=true;
    try{
      while(thumbnailQueue.length){
        const {id,epoch}=thumbnailQueue.shift();
        if(epoch!==thumbnailEpoch || !mediaReadAllowed.value || !mediaItems.value.some(x=>x.id===id)){
          thumbnailQueued.delete(id);continue;
        }
        const op=operation();
        mediaThumbnailBusy.value={...mediaThumbnailBusy.value,[id]:true};
        try{
          const blob=await service.playback(id,{signal:op.signal});
          if(!op.current()||epoch!==thumbnailEpoch)continue;
          const preview=await thumbnailExtractor(blob,{onSignal:op.signal});
          if(op.current() && epoch===thumbnailEpoch)mediaThumbnails.value={...mediaThumbnails.value,[id]:preview};
        }catch(error){
          if(op.ownsState() && epoch===thumbnailEpoch){
            if(error.status===401||error.status===403)op.failed(error);
            else mediaThumbnailFailed.value={...mediaThumbnailFailed.value,[id]:true};
          }
        }finally{
          if (epoch === thumbnailEpoch) thumbnailQueued.delete(id);
          if(op.ownsState()&&epoch===thumbnailEpoch){
            const pending={...mediaThumbnailBusy.value};delete pending[id];mediaThumbnailBusy.value=pending;
          }
          op.finish();
        }
      }
    }finally{thumbnailWorkerRunning=false;}
  }
  // No parent-upload/review/Clubhouse API is deployed. Never infer approval from a private clip.
  const submissionsEnabled = false;
  let generation = 0;
  let playbackGeneration = 0;
  const pending = new Set();
  const mediaPlayers = computed(() => {
    const result = new Map();
    for (const player of players.value) {
      if (auth.guardianLinks.value.some(link => link.athlete_id === player.athlete_id && link.status === 'verified')) {
        result.set(player.id, { id: player.id, label: player.preferred_name || 'My player' });
      }
    }
    if (auth.isTeamCoach.value) for (const player of coachRoster.value) {
      result.set(player.id, { id: player.id, label: `${player.preferred_name || 'Player'} · ${player.team_name || 'Team'}` });
    }
    for (const player of managedPlayers.value) {
      result.set(player.id, {id:player.id,label:player.preferred_name || 'Player'});
    }
    return [...result.values()];
  });
  function releasePlayback() {
    playbackGeneration++;
    if (mediaPlaybackUrl.value) urls.revokeObjectURL(mediaPlaybackUrl.value);
    mediaPlaybackUrl.value = '';
    mediaPlaybackId.value = '';
    reviewSingleSubject.value=false;reviewVideoNote.value='';
    analysisCategory.value='';analysisFps.value='';
    analyzer.resetAnalyzer();
  }
  function resetMedia() {
    generation++;
    for (const controller of pending) controller.abort();
    pending.clear();
    discardThumbnails();
    releasePlayback();
    mediaPlayerId.value = '';
    mediaItems.value = [];
    mediaReadAllowed.value = false;
    mediaUploadAllowed.value = false;
    mediaLoading.value = false;
    mediaUploading.value = false;
    mediaArchiving.value = false;
    mediaReviewing.value = false;
    mediaPlaybackLoading.value = false;
    mediaProgress.value = 0;
    mediaFile.value = null;
    uploadCategory.value = '';
    uploadRequest = undefined;inboxReviewContext=false;
    mediaError.value = '';
    mediaUploadError.value = '';
    mediaNotice.value = '';
  }
  function operation() {
    const epoch = generation, identity = auth.captureIdentity();
    const controller = new AbortController();
    pending.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    return {
      signal: controller.signal,
      current: () => epoch === generation && auth.isCurrentIdentity(identity) && !controller.signal.aborted,
      ownsState: () => epoch === generation && auth.isCurrentIdentity(identity),
      failed(error) {
        if (epoch !== generation || !auth.isCurrentIdentity(identity)) return;
        if (error.status === 401 || error.status === 403) {
          resetMedia();
        }
        if (timedOut) mediaError.value = 'Media request timed out. Refresh before retrying.';
        else if (error.name !== 'AbortError') mediaError.value = error.message || 'Media request failed.';
      },
      finish() { clearTimeout(timer); pending.delete(controller); }
    };
  }
  async function refreshMedia() {
    if (!mediaPlayerId.value || !mediaReadAllowed.value) return;
    const op = operation();
    mediaLoading.value = true; mediaError.value = '';
    // Do not retain a previously playable URL while rechecking permissions.
    releasePlayback(); discardThumbnails(); mediaItems.value = [];
    try {
      const rows = await service.list(mediaPlayerId.value, { signal: op.signal });
      if (op.current()) mediaItems.value = rows;
    } catch (error) { op.failed(error); }
    finally { if (op.ownsState()) mediaLoading.value = false; op.finish(); }
  }
  async function selectMediaPlayer(playerId) {
    resetMedia();
    if (!mediaPlayers.value.some(p => p.id === playerId)) return;
    mediaPlayerId.value = playerId;
    const op = operation(); mediaLoading.value = true;
    try {
      const [list, upload] = await Promise.allSettled([
        service.list(playerId, { signal: op.signal }),
        service.authorize(playerId, 'upload', { signal: op.signal })
      ]);
      if (!op.current()) return;
      for (const result of [list, upload]) {
        if (result.status === 'rejected' && result.reason.status === 401) throw result.reason;
      }
      if (upload.status === 'fulfilled') mediaUploadAllowed.value = upload.value;
      if (list.status === 'fulfilled') {
        mediaReadAllowed.value = true;
        mediaItems.value = list.value;
      } else {
        // A disabled or denied list does not invalidate a separately allowed upload.
        mediaError.value = list.reason.message || 'Media listing unavailable.';
      }
      if (upload.status === 'rejected') mediaUploadError.value = upload.reason.message || 'Media upload unavailable.';
    } catch (error) { op.failed(error); }
    finally { if (op.ownsState()) mediaLoading.value = false; op.finish(); }
  }
  function selectMediaFile(event) {
    uploadRequest = undefined;
    mediaFile.value = null; mediaError.value = ''; mediaProgress.value = 0;
    const file = event.target.files?.[0];
    if (!file) return;
    try { validateMediaFile(file); mediaFile.value = file; }
    catch (error) { mediaError.value = error.message; }
    // File lives only in this identity's ref; clearing input also allows picking it again.
    event.target.value = '';
  }
  async function uploadPrivateMedia() {
    if (!mediaUploadAllowed.value || !mediaFile.value || !uploadCategory.value || mediaUploading.value) return;
    const op = operation(); mediaUploading.value = true; mediaError.value = ''; mediaNotice.value = '';
    const playerId = mediaPlayerId.value, file = mediaFile.value;
    try {
      const category = uploadCategory.value;
      if (uploadRequest?.category !== category) uploadRequest = {category,key:crypto.randomUUID()};
      await service.upload(playerId, file, { signal: op.signal, submission: uploadRequest,
        onProgress: value => { if (op.current()) mediaProgress.value = value; } });
      if (!op.current()) return;
      mediaFile.value = null;
      uploadRequest = undefined;
      mediaNotice.value = 'Private clip saved.';
      await refreshMedia();
    } catch (error) { op.failed(error); }
    finally { if (op.ownsState()) mediaUploading.value = false; op.finish(); }
  }
  // Open only a freshly re-authorized, exact pending inbox item. The Worker
  // still authorizes playback and every review mutation independently.
  async function openInboxReview(scope,item,teamId=''){
    resetMedia();
    if(!['coach','club_admin'].includes(scope?.role)||!item?.id||!item?.playerId||(scope.role==='coach'?!auth.isTeamCoach.value:!auth.isOrgAdmin.value))return false;
    const op=operation();mediaLoading.value=true;
    try{
      const result=await service.reviewInbox(scope,{mediaId:item.id,playerId:item.playerId,...(teamId?{teamId}:{})},{signal:op.signal});
      if(!op.current())return false;
      const exact=result.items.find(r=>r.id===item.id&&r.playerId===item.playerId&&r.status==='pending'&&r.can_review===true&&['batting','pitching','throwing'].includes(r.category));
      if(!exact){mediaError.value='This submission is no longer available for review. Refresh the inbox.';return false;}
      inboxReviewContext=true;mediaPlayerId.value=exact.playerId;mediaItems.value=[{id:exact.id,player_id:exact.playerId,category:exact.category,status:'pending',created_at:exact.createdAt,can_review:true}];
      mediaReadAllowed.value=true;
      await playPrivateMedia(mediaItems.value[0]);
      return op.current()&&mediaPlaybackId.value===exact.id&&!!mediaPlaybackUrl.value;
    }catch(error){op.failed(error);return false;}
    finally{if(op.ownsState())mediaLoading.value=false;op.finish();}
  }
  async function reviewPrivateMedia(decision) {
    const item=reviewItem.value;
    if(!item||!mediaPlaybackUrl.value||mediaReviewing.value||mediaArchiving.value||mediaUploading.value||mediaPlaybackLoading.value)return;
    if(!['approved','rejected'].includes(decision))return;
    const note=reviewVideoNote.value.trim(), single=decision==='approved'&&reviewSingleSubject.value===true;
    if(decision==='rejected'&&!note){mediaError.value='Enter a brief reason for rejection.';return;}
    if(!globalThis.confirm(decision==='approved'?(single?'Confirm you reviewed the entire clip and only the selected athlete is identifiable. Approve privately?':'Approve this clip privately without confirming its subject?'): 'Reject this video? Playback will be blocked; authorized staff can still permanently delete it.'))return;
    const op=operation();mediaReviewing.value=true;mediaError.value='';mediaNotice.value='';
    try {
      await service.review(item.id,decision,note,single,{signal:op.signal});
      if(!op.current())return;
      mediaNotice.value=decision==='approved'?'Video approved privately. Not published.':'Video rejected. Playback blocked.';
      if(inboxReviewContext){releasePlayback();mediaItems.value=[];mediaPlayerId.value='';mediaReadAllowed.value=false;inboxReviewContext=false;}else await refreshMedia();
      return true;
    }catch(error){op.failed(error);return false;}
    finally{if(op.ownsState())mediaReviewing.value=false;op.finish();}
  }
  async function archivePrivateMedia(item) {
    if(mediaArchiving.value||mediaReviewing.value||mediaUploading.value||!mediaReadAllowed.value||!mediaItems.value.some(row=>row.id===item.id&&row.can_archive===true))return;
    if(!globalThis.confirm('Permanently delete this video? This action cannot be undone.'))return;
    const op=operation();mediaArchiving.value=true;mediaError.value='';mediaNotice.value='';
    try {
      const receipt=await service.archive(item.id,{signal:op.signal});
      if(!op.current())return;
      releasePlayback();discardThumbnails();
      mediaItems.value=mediaItems.value.filter(row=>row.id!==item.id);
      mediaNotice.value=receipt.deleted?'Video permanently deleted.':'Video removed from the library. Storage deletion is pending automatic retry.';
      await refreshMedia();
    }catch(error){op.failed(error);}
    finally{if(op.ownsState())mediaArchiving.value=false;op.finish();}
  }
  async function playPrivateMedia(item) {
    if (mediaReviewing.value||!mediaReadAllowed.value || !mediaItems.value.some(row => row.id === item.id&&row.status!=='rejected')) return;
    releasePlayback();
    const playback = playbackGeneration;
    const op = operation(); mediaPlaybackLoading.value = true; mediaError.value = '';
    try {
      const blob = await service.playback(item.id, { signal: op.signal });
      if (!op.current() || playback !== playbackGeneration) return;
      mediaPlaybackUrl.value = urls.createObjectURL(blob);
      mediaPlaybackId.value = item.id;
    } catch (error) {
      // A permission failure invalidates this session's media even if a refresh
      // or newer playback replaced the original card while the request ran.
      if (playback === playbackGeneration || error.status === 401 || error.status === 403) op.failed(error);
    }
    finally {
      if (op.ownsState() && playback === playbackGeneration) mediaPlaybackLoading.value = false;
      op.finish();
    }
  }
  function analyzePrivateMedia() {
    if (!mediaPlaybackUrl.value || !mediaReadAllowed.value) return;
    if (!['pitching','batting'].includes(analysisCategory.value)
      || !['30','60','120','240'].includes(String(analysisFps.value))) {
      mediaError.value='Choose the motion type and original recording FPS before analyzing.';
      return;
    }
    mediaError.value='';
    void analyzer.initPoseTracker();
    analyzer.openAnalyzer({
      id: mediaPlaybackId.value,
      video_url: mediaPlaybackUrl.value,
      category: analysisCategory.value,
      fps_mode: Number(analysisFps.value),
      is_private: true
    });
  }
  function reportPlaybackError() {
    releasePlayback();
    mediaError.value = 'This browser could not decode the video. For wider compatibility, use H.264 (iPhone Camera > Formats > Most Compatible).';
  }
  return { mediaPlayers, mediaPlayerId, mediaItems, mediaReadAllowed, mediaUploadAllowed, mediaLoading,
    mediaUploading, mediaArchiving, mediaReviewing, reviewSingleSubject, reviewVideoNote, reviewItem, reviewPrivateMedia, mediaProgress, mediaError, mediaUploadError, mediaNotice, mediaFile, uploadCategory, mediaPlaybackUrl, mediaPlaybackId,
    mediaPlaybackLoading, analysisCategory, analysisFps, mediaThumbnails, mediaThumbnailBusy, mediaThumbnailFailed,
    submissionsEnabled, ensureMediaThumbnail, retryMediaThumbnail, openInboxReview,
    selectMediaPlayer, refreshMedia, selectMediaFile, uploadPrivateMedia, archivePrivateMedia, playPrivateMedia,
    analyzePrivateMedia, reportPlaybackError, resetMedia, closePrivatePlayback:()=>{releasePlayback();mediaPlaybackLoading.value=false;} };
}
