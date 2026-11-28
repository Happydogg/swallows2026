// SDL-UX-003: Preview-only Vue entry. No Supabase, Worker, R2 or authentication.
import { AppShell } from './components/AppShell.js';
import { ParentHome } from './components/ParentHome.js';
import { CoachHome } from './components/CoachHome.js';
import { LoginLanding } from './components/LoginLanding.js';
import { InviteOnboarding } from './components/InviteOnboarding.js';
import { PlayerHeroCard } from './components/PlayerHeroCard.js';
import { PrivateMediaPanel } from './components/PrivateMediaPanel.js';
import { StatsHub } from './components/StatsHub.js';
import { CoachTeamRoster } from './components/CoachTeamRoster.js';
import { DemoGrowthLab } from './components/DemoGrowthLab.js';
import { DEMO_GROWTH_SNAPSHOT } from './js/demoGrowthFixture.js';

const { createApp, ref, computed } = Vue;
// The same fifteen fictional names and jerseys used by the staging fixture.
const demoRoster = Object.freeze(DEMO_GROWTH_SNAPSHOT.players.map((player, i) => ({
  id: 'demo-player-'+player.jersey,
  team_id: 'demo-team',
  team_name: 'Swallows Demo Team',
  preferred_name: player.name,
  jersey: player.jersey,
  position: ['SS','2B','P','C','CF','3B','LF','P','1B','RF','SS','C','2B','P','CF'][i],
  throws: i % 4 === 0 ? 'L' : 'R',
  bats: i % 3 === 0 ? 'L' : 'R',
  photo_url: '/assets/demo-players/'+player.jersey+'.svg'
})));
const demoPlayers = Object.freeze(demoRoster.slice(0,2).map((player,i) => ({ ...player, athlete_id:'demo-athlete-'+(i+1) })));


function previewAuthController() {
  const c = {
    authMethod: ref('email'), loginEmail: ref(''), loginPassword: ref(''),
    loginPhone: ref(''), loginOtpCode: ref(''), inviteCode: ref(''), inviteEmail: ref(''),
    authBusy: ref(false), authError: ref(''), authNotice: ref('')
  };
  c.setAuthMethod = method => {
    if (!['email', 'invite', 'phone', 'otp'].includes(method)) return;
    c.authMethod.value = method;
    c.authError.value = '';
    c.authNotice.value = '';
  };
  const unavailable = () => { c.authNotice.value = 'Design preview only. Real authentication and invitation services are not connected.'; };
  c.signIn = unavailable;
  c.registerEmail = unavailable;
  c.redeemInvitation = unavailable;
  c.requestPhoneOtp = unavailable;
  c.verifyOtpCode = unavailable;
  return c;
}

function previewInviteController() {
  return {
    enabled: false, busy: ref(false), error: ref(''), notice: ref(''),
    redemptionToken: ref(''), redeem() {}
  };
}

function previewMediaController() {
  const mediaPlayers = ref(demoRoster.map(p=>({id:p.id,label:p.preferred_name+' · Swallows Demo Team'})));
  const mediaPlayerId = ref(demoRoster[0].id);
  const mediaItems = ref([
    {id:'demo-clip-1',created_at:'2026-11-13T10:00:00Z',byte_size:8388608},
    {id:'demo-clip-2',created_at:'2026-11-11T10:00:00Z',byte_size:5242880}
  ]);
  const mediaReadAllowed = ref(true), mediaUploadAllowed = ref(false), mediaLoading = ref(false);
  const mediaUploading = ref(false), mediaPlaybackLoading = ref(false), mediaProgress = ref(0);
  const mediaError = ref(''), mediaNotice = ref('Design-only clip cards. Real playback requires signing in on SDL UX Live.');
  const mediaFile = ref(null), mediaPlaybackUrl = ref(''), mediaPlaybackId = ref('');
  const unavailable = () => { mediaNotice.value = 'Demo only. Use the authenticated SDL UX Live website for permitted videos.'; };
  return {
    mediaPlayers, mediaPlayerId, mediaItems, mediaReadAllowed, mediaUploadAllowed, mediaLoading,
    mediaUploading, mediaPlaybackLoading, mediaProgress, mediaError, mediaNotice,
    mediaFile, mediaPlaybackUrl, mediaPlaybackId,
    mediaThumbnails: ref({}), mediaThumbnailBusy: ref({}),
    mediaThumbnailFailed: ref(Object.fromEntries(mediaItems.value.map(item => [item.id, true]))),
    retryMediaThumbnail: unavailable,
    selectMediaPlayer(id) { if (mediaPlayers.value.some(p=>p.id===id)) {mediaPlayerId.value=id;unavailable();} },
    refreshMedia:unavailable, selectMediaFile:unavailable, uploadPrivateMedia:unavailable,
    playPrivateMedia:unavailable, analyzePrivateMedia:unavailable, reportPlaybackError:unavailable
  };
}


 // UX-V02: synthetic-only visual fidelity candidate. No provider or media calls.
const VideosFidelityPreview = {
  props: { role:String, roster:Array, children:Array, requestedPlayer:String },
  setup(props) {
    const {ref,computed,watch}=Vue;
    const roleOptions=[['guardian','Guardian'],['coach','Coach'],['dual','Coach + Guardian'],['manager','Team Manager'],['admin','Club Admin'],['platform','Platform Admin']];
    const demoRole=ref(props.role==='coach'?'coach':'guardian');
    const destination=ref(props.role==='coach'?'staff':'mine');
    const selectedId=ref(''),team=ref('A'),search=ref(''),category=ref('All'),clip=ref(null),mode=ref('Watch');
    const note=ref(''),reviewIndex=ref(0),reviewFilter=ref(''),notice=ref('');
    const isFamily=computed(()=>['guardian','dual'].includes(demoRole.value));
    const isStaff=computed(()=>['coach','dual','manager','admin'].includes(demoRole.value));
    const canReview=computed(()=>['coach','dual','admin'].includes(demoRole.value));
    const destinations=computed(()=>[
      ...(isFamily.value?[{id:'mine',label:'My Videos'}]:[]),
      ...(demoRole.value==='guardian'?[{id:'shared',label:'Team Videos'}]:[]),
      ...(isStaff.value?[{id:'staff',label:'My Team Videos'}]:[]),
      ...(canReview.value?[{id:'review',label:'Review Videos'}]:[])
    ]);
    const teamOf=p=>Number(p.jersey)<=27?'A':'B';
    const teamLabel=p=>'Swallows Demo '+teamOf(p);
    const players=computed(()=>destination.value==='mine'?props.children:props.roster.filter(p=>teamOf(p)===team.value));
    const visiblePlayers=computed(()=>players.value.filter(p=>(p.preferred_name+' '+p.jersey).toLowerCase().includes(search.value.trim().toLowerCase())).slice().sort((a,b)=>Number(a.jersey)-Number(b.jersey)));
    const player=computed(()=>players.value.find(p=>p.id===selectedId.value)||null);
    const activity=['All','Batting','Pitching','Throwing'];
    const gallery=computed(()=>['Batting','Pitching','Throwing','Batting','Pitching'].map((kind,i)=>({id:'demo-'+i,kind,date:['Nov 27','Nov 24','Nov 21','Nov 18','Nov 15'][i],duration:['0:12','0:08','0:16','0:10','0:09'][i]})).filter(v=>category.value==='All'||v.kind===category.value));
    const queue=ref(props.roster.filter((_,i)=>[0,2,7,9].includes(i)).map((p,i)=>({id:'review-'+i,player:p,kind:['Batting','Pitching','Throwing','Batting'][i],date:'Nov 27',duration:'0:18'})));
    const filteredQueue=computed(()=>queue.value.filter(x=>!reviewFilter.value||teamOf(x.player)===reviewFilter.value));
    const pending=computed(()=>filteredQueue.value[reviewIndex.value]||null);
    function clearSelection(){selectedId.value='';search.value='';category.value='All';clip.value=null;mode.value='Watch';notice.value='';}
    function openDestination(id){destination.value=id;clearSelection();reviewIndex.value=0;note.value='';reviewFilter.value='';}
    function setRole(id){demoRole.value=id;team.value='A';openDestination(destinations.value[0]?.id||'');}
    function pickPlayer(p){selectedId.value=p.id;clip.value=null;mode.value='Watch';category.value='All';}
    function changeTeam(){clearSelection();}
    function openClip(v){clip.value=v;mode.value='Watch';}
    function nextReview(){if(filteredQueue.value.length)reviewIndex.value=(reviewIndex.value+1)%filteredQueue.value.length;note.value='';notice.value='';}
    function decide(action){if(!canReview.value||!pending.value||(action==='Rejected'&&!note.value.trim()))return;const id=pending.value.id;queue.value=queue.value.filter(v=>v.id!==id);if(reviewIndex.value>=filteredQueue.value.length)reviewIndex.value=0;note.value='';notice.value=action+' in this fictional preview only.';}
    watch(()=>props.role,r=>setRole(r==='coach'?'coach':'guardian'));
    watch(()=>props.requestedPlayer,id=>{const p=props.roster.find(x=>x.id===id);if(!p)return;team.value=teamOf(p);openDestination(isStaff.value?'staff':props.children.some(c=>c.id===id)?'mine':'shared');if(players.value.some(c=>c.id===id))pickPlayer(p);},{immediate:true});
    watch(reviewFilter,()=>{reviewIndex.value=0;note.value='';});
    return {roleOptions,demoRole,destinations,destination,selectedId,team,search,category,clip,mode,note,reviewFilter,notice,isFamily,isStaff,canReview,visiblePlayers,player,activity,gallery,filteredQueue,pending,queue,teamLabel,openDestination,setRole,pickPlayer,changeTeam,openClip,nextReview,decide};
  },
  template: `
  <section class="space-y-4" aria-label="Videos design preview">
    <div class="flex items-center justify-between"><h1 class="text-2xl font-black text-white">Videos</h1><span class="text-xs text-amber-300">Fictional preview</span></div>
    <details class="rounded-xl border border-slate-700 p-2"><summary class="cursor-pointer text-xs text-slate-300">Preview roles (test only)</summary><div class="mt-2 flex flex-wrap gap-2"><button v-for="r in roleOptions" :key="r[0]" @click="setRole(r[0])" :aria-pressed="demoRole===r[0]" :class="demoRole===r[0]?'bg-cyan-700':'bg-slate-800'" class="rounded-lg px-3 py-2 text-xs font-bold">{{r[1]}}</button></div></details>
    <nav v-if="destinations.length" class="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-900 p-1" aria-label="Video destinations"><button v-for="d in destinations" :key="d.id" @click="openDestination(d.id)" :aria-pressed="destination===d.id" :class="destination===d.id?'bg-blue-600 text-white':'text-slate-300'" class="min-h-12 rounded-lg px-2 py-2 text-xs font-bold sm:text-sm">{{d.label}}<span v-if="d.id==='review'" class="ml-1 text-cyan-200">({{queue.length}})</span></button></nav>
    <p v-else class="rounded-xl border border-slate-700 p-4 text-sm">No operational video destination for this example role.</p>
    <template v-if="destination==='review' && canReview">
      <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-xl font-bold">Review Videos</h2><label class="text-xs text-slate-300">Team <select v-model="reviewFilter" class="rounded-lg bg-slate-900 p-2"><option value="">All teams</option><option value="A">Demo A</option><option value="B">Demo B</option></select></label></div>
      <p class="text-sm text-slate-400">{{filteredQueue.length}} pending · Content suitability only</p>
      <template v-if="pending">
        <div class="rounded-2xl bg-slate-900 p-3"><div class="flex items-center gap-3"><img :src="pending.player.photo_url" alt="" class="h-12 w-12 rounded-full"><div><p class="font-bold">{{pending.player.preferred_name}} · #{{pending.player.jersey}}</p><p class="text-xs text-slate-400">{{teamLabel(pending.player)}} · {{pending.kind}} · {{pending.date}}</p></div></div>
        <div class="mt-3 grid aspect-video place-content-center rounded-xl bg-slate-950 text-center"><span class="text-4xl text-slate-500" aria-hidden="true">▶</span><span class="mt-2 text-xs text-slate-400">Illustrative clip · playback not connected</span></div>
        <div class="mt-2 flex items-center gap-3 text-xs text-slate-400"><button disabled class="p-2" aria-label="Play demo">▶</button><span>0:00</span><input type="range" disabled value="0" aria-label="Playback position" class="min-w-0 flex-1"><span>{{pending.duration}}</span><button disabled class="p-2" aria-label="Fullscreen">⛶</button></div>
        </div>
        <label class="block text-sm text-slate-300">Rejection reason (required to reject)<textarea v-model="note" rows="2" class="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3" placeholder="Fictional review note"></textarea></label>
        <div class="grid grid-cols-2 gap-2"><button @click="decide('Approved')" class="min-h-12 rounded-xl bg-emerald-700 font-bold">Approve</button><button @click="decide('Rejected')" :disabled="!note.trim()" class="min-h-12 rounded-xl border border-rose-700 text-rose-200 font-bold disabled:opacity-40">Reject</button><button @click="nextReview" class="col-span-2 min-h-12 rounded-xl bg-slate-800 font-bold">Next Video →</button></div>
        <p class="text-xs text-slate-400">Approval does not publish a clip. Demo decisions affect only this preview.</p>
      </template><p v-else class="rounded-xl bg-slate-900 p-4">No pending demo videos.</p>
      <p v-if="notice" role="status" class="text-sm text-emerald-300">{{notice}}</p>
    </template>
    <template v-else-if="['mine','staff','shared'].includes(destination)">
      <button v-if="destination==='mine'&&demoRole==='dual'" @click="openDestination('shared')" class="text-sm font-bold text-cyan-300">Team Videos →</button>
      <template v-if="!player">
        <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-xl font-bold">{{destination==='mine'?'My children':'Select player'}}</h2><label v-if="destination!=='mine'" class="text-sm">Team <select v-model="team" @change="changeTeam" class="rounded-lg border border-slate-700 bg-slate-900 p-2"><option value="A">Swallows Demo A</option><option value="B">Swallows Demo B</option></select></label></div>
        <input v-model="search" placeholder="Search name or jersey number" aria-label="Search name or jersey number" class="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-base">
        <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"><button v-for="p in visiblePlayers" :key="p.id" @click="pickPlayer(p)" class="min-w-0 rounded-2xl border border-slate-700 bg-slate-900 px-2 py-3 text-center hover:border-cyan-400"><img :src="p.photo_url" alt="" class="mx-auto h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20"><p class="mt-2 text-lg font-black text-cyan-300">#{{p.jersey}}</p><p class="break-words text-xs font-semibold text-white">{{p.preferred_name}}</p></button></div>
        <p v-if="!visiblePlayers.length" class="text-sm text-slate-400">No matching demo players.</p>
      </template>
      <template v-else-if="!clip">
        <button @click="selectedId=''" class="text-sm font-bold text-cyan-300">‹ Switch player</button>
        <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3"><img :src="player.photo_url" alt="" class="h-16 w-16 rounded-xl"><div class="min-w-0 flex-1"><h2 class="font-black">{{player.preferred_name}}</h2><p class="text-xs text-slate-400">#{{player.jersey}} · {{teamLabel(player)}}</p></div><button v-if="destination!=='shared'" disabled class="rounded-xl bg-blue-700 px-3 py-3 text-xs font-bold opacity-70" title="Visual only">+ Upload Video</button></div>
        <div class="flex flex-wrap gap-2" aria-label="Activity filters"><button v-for="kind in activity" :key="kind" @click="category=kind" :aria-pressed="category===kind" :class="category===kind?'bg-blue-600':'bg-slate-800'" class="rounded-xl px-3 py-2 text-sm font-bold">{{kind}}</button></div>
        <div v-if="gallery.length" class="grid gap-3 lg:grid-cols-2">
          <button @click="openClip(gallery[0])" class="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-left"><div class="grid aspect-video place-content-center bg-slate-800 text-center"><span class="text-4xl">▶</span><span class="text-xs text-slate-400">Fictional thumbnail</span></div><div class="p-3"><p class="text-xs font-bold text-cyan-300">Latest video</p><p class="font-bold">{{gallery[0].kind}} · {{gallery[0].date}}</p><p class="text-xs text-slate-400">{{gallery[0].duration}}</p></div></button>
          <div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-2"><button v-for="v in gallery.slice(1)" :key="v.id" @click="openClip(v)" class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-left"><div class="grid aspect-video place-content-center bg-slate-800 text-2xl">▶</div><div class="p-2"><p class="text-sm font-bold">{{v.kind}}</p><p class="text-xs text-slate-400">{{v.date}} · {{v.duration}}</p></div></button></div>
        </div>
      </template>
      <template v-else>
        <button @click="clip=null" class="text-sm font-bold text-cyan-300">‹ Back to gallery</button>
        <div class="grid aspect-video place-content-center rounded-xl bg-slate-900 text-center"><span class="text-4xl text-slate-500">▶</span><span class="mt-2 text-xs text-slate-400">Illustrative video · no real playback</span></div>
        <div class="flex items-center gap-3 text-xs text-slate-400"><button disabled class="p-2" aria-label="Play video">▶</button><span>0:00</span><input type="range" disabled value="0" class="min-w-0 flex-1" aria-label="Video timeline"><span>{{clip.duration}}</span><button disabled class="p-2" aria-label="Fullscreen">⛶</button></div>
        <div><h2 class="text-lg font-bold">{{clip.kind}} · {{player.preferred_name}}</h2><p class="text-xs text-slate-400">{{clip.date}}</p></div>
        <div class="grid grid-cols-2 gap-2"><button v-for="m in ['Watch','Analyze']" :key="m" @click="mode=m" :aria-pressed="mode===m" :class="mode===m?'bg-blue-600':'bg-slate-800'" class="min-h-11 rounded-xl font-bold">{{m}}</button></div>
        <div v-if="mode==='Analyze'" class="rounded-xl border border-slate-700 bg-slate-900 p-3"><p class="text-sm font-bold">Analysis controls · layout only</p><div class="mt-2 grid grid-cols-4 gap-2"><button v-for="c in ['−5','−1','+1','+5']" :key="c" disabled class="rounded bg-slate-800 p-2 text-sm">{{c}} frame</button></div><p class="mt-3 text-xs text-slate-400">0.1× · 0.25× · 0.5× · 1× · Timestamp · Checkpoints · Overlays</p></div>
      </template>
    </template>
  </section>`
};

createApp({
  components: { AppShell, ParentHome, CoachHome, LoginLanding, InviteOnboarding, PlayerHeroCard, PrivateMediaPanel, StatsHub, CoachTeamRoster, DemoGrowthLab, VideosFidelityPreview },
  setup() {
    // Safe, whitelisted review deep links. Query values cannot grant roles or
    // access any real data because this build has no backend connection.
    const reviewQuery = new URLSearchParams(window.location.search);
    const requestedScreen = reviewQuery.get('screen');
    const requestedTab = reviewQuery.get('tab');
    const screen = ref(['app','profile','login','invite'].includes(requestedScreen) ? requestedScreen : 'app');
    const role = ref(reviewQuery.get('role') === 'coach' ? 'coach' : 'family');
    const activeTab = ref(['home','team','stats','videos','me'].includes(requestedTab) ? requestedTab : 'home');
    const previewViews = Object.freeze([
      { id:'app', title:'Inside app' }, { id:'profile', title:'Player profile' }, { id:'login', title:'Login' }, { id:'invite', title:'Invitation' }
    ]);
    const version = window.SDL_UX_META?.commit?.slice(0, 8) || 'local';
    const branch = window.SDL_UX_META?.branch || 'local-preview';
    const loginController = previewAuthController();
    const invitationController = previewInviteController();
    const previewMediaControllerState = previewMediaController();
    const previewSelectedPlayer = ref(demoRoster[0]);
    const previewEditOpen = ref(false);
    const requestedVideoPlayer = ref('');
    const openPreviewProfile = player => {
      const allowed=demoRoster.find(p=>p.id===player?.id && p.team_id===player?.team_id);
      if (!allowed) return;
      previewSelectedPlayer.value=allowed;
      previewMediaControllerState.selectMediaPlayer(allowed.id);
      screen.value='profile';
    };
    const openPreviewVideos = player => {
      requestedVideoPlayer.value=player.id;
      previewMediaControllerState.selectMediaPlayer(player.id);
      activeTab.value = 'videos';
    };
    // Fictional numbers on the explicitly labeled synthetic site.
    const previewFamilyStats = Object.freeze([
      { athlete_id: 'demo-athlete-1', name: 'Sample Player A', profiles: [
        { id: 'demo-player-1', clubLabel: 'Swallows Demo Team', jersey: '12',
          position: 'SS / P', statsAvailable: true, latestExitVelo: 74,
          latestThrowingVelo: 67, latestSprintTime: 4.2, sessionCount: 6 }
      ] },
      { athlete_id: 'demo-athlete-2', name: 'Sample Player B', profiles: [
        { id: 'demo-player-2', clubLabel: 'Swallows Demo Team', jersey: '08',
          position: 'OF', statsAvailable: false }
      ] }
    ]);
    const previewTranslate = key => ({
      throws:'Throws',bats:'Bats',officialName:'Official name',
      dob:'DOB',jumpRatioLabel:'Jump ratio',batSpec:'Bat specification',
      notSpecified:'Not specified'
    })[key] || key;
    const demoMeasurements = () => 'Synthetic example · 140 cm · 32 kg';
    const tabTitle = computed(() => ({
      home:'Home', team:'Team and Clubhouse', stats:'Stats and Progress',
      videos:'Videos', me:'My Account'
    })[activeTab.value] || 'Review');
    const reportOpen = ref(false);
    const issue = ref('');
    const copyNotice = ref('');
    const manualReport = ref(false);
    const reportText = computed(() => [
      'SDL-UX-003 | Mobile preview feedback',
      'Version: '+version,
      'Branch: '+branch,
      'Screen: '+screen.value,
      'Role: '+role.value,
      'Tab: '+activeTab.value,
      'Viewport: '+window.innerWidth+'x'+window.innerHeight,
      'Issue: '+(issue.value.trim() || '(describe the problem)'),
      'Expected:',
      'Actual:',
      'Screenshot: attach in ChatGPT separately',
      'Note: Synthetic-data design preview only'
    ].join('\n'));
    async function copyReport() {
      copyNotice.value = '';
      manualReport.value = false;
      try {
        if (!navigator.clipboard?.writeText) throw Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(reportText.value);
        copyNotice.value = 'Copied! Paste into the SDL chat and add your screenshot.';
      } catch {
        manualReport.value = true;
        copyNotice.value = 'Copy the report from the text field below and paste into the SDL chat.';
      }
    }
    return {
      previewViews, screen, role, activeTab, tabTitle, version, branch,
      demoPlayers, demoRoster, previewSelectedPlayer, previewEditOpen, openPreviewProfile, openPreviewVideos, loginController, invitationController,
      previewMediaControllerState, requestedVideoPlayer, previewFamilyStats, previewTranslate, demoMeasurements,
      reportOpen, issue, reportText, copyReport, copyNotice, manualReport
    };
  }
}).mount('#preview-app');
