// SDL-003: player profile and historical session presentation; stats supplied as props.
export const PlayerProfile = {
  name: "PlayerProfile",
  props: {
    t: { type: Function, required: true },
    selectedPlayer: { type: Object, required: true },
    isCoach: { type: Boolean, required: true },
    failedImgs: { type: Object, required: true },
    formatImgUrl: { type: Function, required: true },
    markImgFailed: { type: Function, required: true },
    formatLegalName: { type: Function, required: true },
    getPlayerDisplayName: { type: Function, required: true },
    getLatestMetric: { type: Function, required: true },
    splitPositions: { type: Function, required: true },
    calculateAge: { type: Function, required: true },
    calculateJumpRatio: { type: Function, required: true },
    getJumpRatioColor: { type: Function, required: true },
    formatHeightWeight: { type: Function, required: true },
    getPlayerSessions: { type: Function, required: true },
    getSessionJumpRatio: { type: Function, required: true },
    chartMode: { type: String, required: true },
    hasChartData: { type: Boolean, required: true },
    setChartMode: { type: Function, required: true },
    playerDrillVideos: { type: Array, required: true },
    openAnalyzer: { type: Function, required: true },
    openUploadVideoModal: { type: Function, required: true },
    openEditPlayerModal: { type: Function, required: true },
    openLogModal: { type: Function, required: true },
    triggerPrintReport: { type: Function, required: true },
    isSessionExpanded: { type: Function, required: true },
    toggleSessionExpand: { type: Function, required: true },
    getAttackAngleColor: { type: Function, required: true },
    openEditSessionModal: { type: Function, required: true },
    removeSession: { type: Function, required: true },
    deleteDrillVideo: { type: Function, required: true }
  },
  emits: ["back", "open-submissions"],
  template: `
<div class="space-y-6">

  <!-- Top Action Navigation Bar -->
  <div class="flex items-center justify-between no-print">
    <button @click="$emit('back')" class="text-sm text-slate-400 hover:text-white">← {{ t('backToOverview') }}</button>
    <div class="flex items-center gap-2">
      <button @click="triggerPrintReport" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1.5 shadow">
        🖨️ {{ t('printReportBtn') }}
      </button>
      <template v-if="isCoach">
        <button @click="openUploadVideoModal(selectedPlayer)" class="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1">
          📹 {{ t('uploadVideo') }}
        </button>
        <button @click="openEditPlayerModal(selectedPlayer)" class="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition">
          ✏️ {{ t('editPlayer') }}
        </button>
        <button @click="openLogModal(selectedPlayer)" class="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-md text-sm font-medium text-white transition">
          + {{ t('logNewSession') }}
        </button>
      </template>
    </div>
  </div>

  <!-- Printable Player Summary Card -->
  <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 print-card">
    <div class="flex items-center gap-4">
      <div class="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-slate-700 border-2 border-slate-600 shadow-md flex items-center justify-center font-bold text-xl text-blue-300">
        <img v-if="selectedPlayer.photo_url && !failedImgs[selectedPlayer.id]" 
             :src="formatImgUrl(selectedPlayer.photo_url)" 
             :alt="getPlayerDisplayName(selectedPlayer)" 
             class="w-full h-full object-cover" 
             referrerpolicy="no-referrer"
             @error="markImgFailed(selectedPlayer.id)">
        <span v-else>#{{ selectedPlayer.jersey }}</span>
      </div>
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-700 text-white">#{{ selectedPlayer.jersey }}</span>
          <div class="flex gap-1">
            <span v-for="pos in splitPositions(selectedPlayer.position)" :key="pos" class="px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 text-xs font-medium border border-blue-700/50">
              {{ pos }}
            </span>
          </div>
          <span v-if="Number(getLatestMetric(selectedPlayer.id, 'exit_velo')) >= 60" class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
            🏅 60+ km/h Club
          </span>
        </div>
        <h2 class="text-2xl font-bold">{{ getPlayerDisplayName(selectedPlayer) }}</h2>
        <p v-if="isCoach" class="text-xs text-slate-400 font-mono mt-0.5">
          {{ t('officialName') }}: <span class="text-slate-200">{{ formatLegalName(selectedPlayer) }}</span>
          <span v-if="selectedPlayer.hkll_reg_no"> • HKLL: <span class="text-blue-300">{{ selectedPlayer.hkll_reg_no }}</span></span>
        </p>
        <p class="text-sm text-slate-400 mt-1">
          {{ t('throws') }}: {{ selectedPlayer.throws }} | {{ t('bats') }}: {{ selectedPlayer.bats }}
          <span v-if="isCoach && selectedPlayer.dob"> | {{ t('dob') }}: {{ selectedPlayer.dob }} ({{ calculateAge(selectedPlayer.dob) }})</span>
        </p>
        <p class="text-sm text-blue-400 mt-1 font-mono font-medium">
          {{ t('latestMeasurements') }}: {{ formatHeightWeight(selectedPlayer.id) }}
          <span v-if="calculateJumpRatio(selectedPlayer.id)" class="ml-2 font-bold" :class="getJumpRatioColor(calculateJumpRatio(selectedPlayer.id))">
            • {{ t('jumpRatioLabel') }}: {{ calculateJumpRatio(selectedPlayer.id) }}x
          </span>
        </p>
      </div>
    </div>

    <div class="text-sm text-slate-300 space-y-1 self-stretch md:self-auto border-t md:border-t-0 border-slate-700/60 pt-3 md:pt-0">
      <p><span class="text-slate-500">{{ t('batSpec') }}:</span> {{ selectedPlayer.bat_spec || t('notSpecified') }}</p>
    </div>
  </div>

  <!-- Family accounts: no parent-safe statistics API exists, so raw sessions are not loaded. -->
  <div v-if="!isCoach && getPlayerSessions(selectedPlayer.id).length === 0" class="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-300 no-print" role="status" data-stats-unavailable>
    Dated session metrics, velocity and growth charts await the parent-safe statistics service. Raw session records are not requested for family accounts.
  </div>

  <!-- Interactive Chart (Hidden on Print) -->
  <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 no-print">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-700/60 pb-3">
      <div>
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <span>📈</span> 
          {{ chartMode === 'velocity' ? t('chartTitle') : t('growthChartTitle') }}
        </h3>
        <p class="text-xs text-slate-400">
          {{ chartMode === 'velocity' ? t('chartSubtitle') : t('growthChartSubtitle') }}
        </p>
      </div>

      <div class="flex items-center gap-2 bg-slate-900/80 p-1 rounded-lg border border-slate-700 self-start sm:self-auto">
        <button 
          @click="setChartMode('velocity')" 
          :class="chartMode === 'velocity' ? 'bg-blue-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'"
          class="px-2.5 py-1 rounded-md text-xs transition">
          ⚡ {{ t('chartModeVelocity') }}
        </button>
        <button 
          @click="setChartMode('growth')" 
          :class="chartMode === 'growth' ? 'bg-purple-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-slate-200'"
          class="px-2.5 py-1 rounded-md text-xs transition">
          📏 {{ t('chartModeGrowth') }}
        </button>
      </div>
    </div>

    <div class="flex items-center gap-4 text-xs font-medium mb-3">
      <template v-if="chartMode === 'velocity'">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-blue-500 inline-block"></span>
          <span class="text-slate-300">{{ t('exitVelo') }} (km/h)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span>
          <span class="text-slate-300">{{ t('throwingVelo') }} (km/h)</span>
        </div>
      </template>
      <template v-else>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-purple-400 inline-block"></span>
          <span class="text-slate-300">{{ t('heightCm') }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
          <span class="text-slate-300">{{ t('weightKg') }}</span>
        </div>
      </template>
    </div>

    <div class="relative h-64 w-full">
      <canvas id="playerVelocityChart"></canvas>
      <div v-if="!hasChartData" class="absolute inset-0 flex items-center justify-center bg-slate-850/80 rounded-lg">
        <p class="text-sm text-slate-500 font-medium">
          {{ chartMode === 'velocity' ? t('needMoreDataForChart') : t('needMoreGrowthData') }}
        </p>
      </div>
    </div>
  </div>

  <!-- STAGE 1: Video Analysis & Drill Clips Gallery -->
  <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 no-print space-y-4">
    <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
      <div>
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <span>📹</span> {{ t('videoAnalysisSection') }}
          <button @click="$emit('open-submissions',selectedPlayer.id)" class="ml-2 p-3 rounded bg-slate-700 text-xs no-print">Submission history</button>
        </h3>
        <p class="text-xs text-slate-400">{{ t('videoAnalysisSubtitle') }}</p>
      </div>
      <button 
        v-if="isCoach" 
        @click="openUploadVideoModal(selectedPlayer)" 
        class="bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/50 px-3 py-1 rounded-md text-xs font-semibold transition">
        + {{ t('uploadVideo') }}
      </button>
    </div>

    <!-- Video Cards Grid -->
    <div v-if="playerDrillVideos.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div v-for="video in playerDrillVideos" :key="video.id" class="bg-slate-900/80 border border-slate-750 rounded-xl p-3 space-y-2.5">
        <div class="flex items-center justify-between text-xs">
          <span class="px-2 py-0.5 rounded font-bold uppercase tracking-wider" 
                :class="video.category === 'batting' ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'">
            {{ video.category }}
          </span>
          <span class="text-slate-400 font-mono text-[11px]">{{ video.session_date }}</span>
        </div>

        <!-- Native HTML5 Video Element or Snapshot Fallback -->
        <div class="aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 relative group">
          <template v-if="video.video_url && !video.is_archived">
            <video :src="video.video_url" crossorigin="anonymous" playsinline preload="metadata" class="w-full h-full object-contain pointer-events-none"></video>
            <div class="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all flex items-center justify-center">
              <button @click="openAnalyzer(video)" class="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xl active:scale-95 transition">
                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Analyze (AR HUD)</span>
              </button>
            </div>
          </template>
          <template v-else>
            <img :src="video.snapshot_url" class="w-full h-full object-cover">
            <span class="absolute top-2 right-2 bg-slate-900/80 border border-slate-700 text-amber-400 text-[10px] font-mono px-2 py-0.5 rounded">
              Snapshot Archive
            </span>
          </template>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Angle: {{ video.camera_angle || 'Standard' }}</span>
          <span class="text-amber-300">{{ video.fps_mode || 60 }} FPS</span>
        </div>

        <div v-if="video.coach_feedback" class="p-2 bg-slate-800/80 rounded border border-slate-700 text-xs text-slate-300">
          <p class="font-semibold text-[10px] text-purple-300 uppercase">Coach Notes:</p>
          <p class="mt-0.5">{{ video.coach_feedback }}</p>
        </div>

        <div v-if="isCoach" class="flex justify-end pt-1">
          <button @click="deleteDrillVideo(video)" class="text-rose-400 hover:text-rose-300 text-xs">
            🗑️ {{ t('remove') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="p-6 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
      {{ t('noVideosLogged') }}
    </div>
  </div>

  <!-- Dated Session History Details -->
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <span>{{ t('sessionHistory') }}</span>
        <span class="text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-mono">
          {{ getPlayerSessions(selectedPlayer.id).length }}
        </span>
      </h3>
      <span class="text-xs text-slate-500 font-normal no-print hidden sm:inline">All metrics synced to cloud</span>
    </div>

    <!-- Mobile Accordion Cards (< 768px screens) -->
    <div class="block md:hidden space-y-2.5">
      <div 
        v-for="session in getPlayerSessions(selectedPlayer.id)" 
        :key="'mob-' + session.id"
        class="bg-slate-850 border border-slate-700/80 rounded-xl overflow-hidden shadow-sm transition">

        <div 
          @click="toggleSessionExpand(session.id)" 
          class="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition active:bg-slate-800">

          <div class="flex items-center gap-3">
            <div class="bg-slate-800 border border-slate-700 px-2 py-1 rounded-md text-xs font-mono font-bold text-slate-200">
              📅 {{ session.session_date }}
            </div>
            <div class="flex items-center gap-2 text-xs font-mono">
              <span class="text-blue-400 font-bold" title="Exit Velocity">
                ⚡ {{ session.exit_velo ? session.exit_velo + 'k' : '--' }}
              </span>
              <span class="text-emerald-400 font-bold" title="Throwing Velocity">
                🎯 {{ session.throwing_velo ? session.throwing_velo + 'k' : '--' }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span 
              class="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
              :class="session.shoulder_check === 'Pass' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/50' : 'bg-rose-950/60 text-rose-400 border border-rose-700/50'">
              {{ session.shoulder_check === 'Pass' ? 'PASS' : 'WARN' }}
            </span>

            <span 
              class="text-xs text-slate-400 transition-transform duration-200 inline-block"
              :class="isSessionExpanded(session.id) ? 'rotate-180 text-blue-400' : ''">
              ▼
            </span>
          </div>
        </div>

        <div 
          v-if="isSessionExpanded(session.id)" 
          class="border-t border-slate-800 bg-slate-900/90 p-4 space-y-3.5 text-xs">

          <!-- Hitting Metrics Group -->
          <div class="space-y-1.5">
            <p class="text-[11px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <span>⚡</span> {{ t('stationMetricsHeader') }}
            </p>
            <div class="grid grid-cols-2 gap-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 font-mono">
              <div>
                <span class="text-slate-400 block text-[10px]">{{ t('personalBatExit') }}:</span>
                <span class="text-white font-bold text-sm">{{ session.exit_velo ? session.exit_velo + ' km/h' : '--' }}</span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">{{ t('controlBatExit') }}:</span>
                <span class="text-slate-300 font-bold text-sm">{{ session.control_exit_velo ? session.control_exit_velo + ' km/h' : '--' }}</span>
              </div>
              <div class="col-span-2 pt-1 border-t border-slate-700/40 flex items-center justify-between">
                <span class="text-slate-400 text-[10px]">{{ t('attackAngleDeg') }}:</span>
                <span class="font-bold" :class="getAttackAngleColor(session.attack_angle)">
                  {{ session.attack_angle ? session.attack_angle + '°' : '--' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Speed and Power Group -->
          <div class="space-y-1.5">
            <p class="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <span>🚀</span> {{ t('broadJumpRatioTitle') }} &amp; Speed
            </p>
            <div class="grid grid-cols-2 gap-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 font-mono">
              <div>
                <span class="text-slate-400 block text-[10px]">{{ t('broadJump') }}:</span>
                <span class="text-white font-semibold">
                  {{ session.broad_jump ? session.broad_jump + ' cm' : '--' }}
                  <span v-if="getSessionJumpRatio(session)" class="text-[11px] font-bold" :class="getJumpRatioColor(getSessionJumpRatio(session))">
                    ({{ getSessionJumpRatio(session) }}x)
                  </span>
                </span>
              </div>
              <div>
                <span class="text-slate-400 block text-[10px]">{{ t('homeTo1stSec') }}:</span>
                <span class="text-amber-300 font-semibold">{{ session.sprint_time ? session.sprint_time + 's' : '--' }}</span>
              </div>
              <div class="col-span-2 pt-1 border-t border-slate-700/40 grid grid-cols-2 gap-2">
                <div>
                  <span class="text-slate-400 block text-[10px]">{{ t('domGripKg') }}:</span>
                  <span class="text-slate-200">{{ session.grip_dom ? session.grip_dom + ' kg' : '--' }}</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px]">{{ t('fingerPinchKg') }}:</span>
                  <span class="text-slate-200">{{ session.pinch ? session.pinch + ' kg' : '--' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Physical Measurements Baseline -->
          <div class="space-y-1.5">
            <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span>📏</span> {{ t('growthSectionHeader') }}
            </p>
            <div class="flex items-center justify-between bg-slate-800/60 px-3 py-2 rounded-lg border border-slate-700/60 font-mono">
              <div>
                <span class="text-slate-400 text-[10px] mr-1.5">{{ t('heightCm') }}:</span>
                <span class="text-white font-bold">{{ session.height_cm ? session.height_cm + ' cm' : '--' }}</span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] mr-1.5">{{ t('weightKg') }}:</span>
                <span class="text-white font-bold">{{ session.weight_kg ? session.weight_kg + ' kg' : '--' }}</span>
              </div>
            </div>
          </div>

          <div v-if="isCoach" class="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button 
              @click="openEditSessionModal(session)" 
              class="bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-600/40 px-3 py-1.5 rounded text-xs font-medium transition">
              ✏️ {{ t('edit') }}
            </button>
            <button 
              @click="removeSession(session.id)" 
              class="bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-700/40 px-3 py-1.5 rounded text-xs font-medium transition">
              🗑️ {{ t('remove') }}
            </button>
          </div>

        </div>
      </div>

      <div v-if="getPlayerSessions(selectedPlayer.id).length === 0" class="p-8 text-center bg-slate-850 rounded-xl border border-slate-800 text-slate-500 text-sm">
        {{ t('noSessionsRecorded') }}
      </div>
    </div>

    <!-- Desktop Multi-Column Session History Table (≥ 768px screens or printing) -->
    <div class="hidden md:block bg-slate-800/40 border border-slate-700/80 rounded-xl overflow-x-auto print-card">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-800/80 text-slate-300 text-xs uppercase tracking-wider">
          <tr>
            <th class="p-3">{{ t('date') }}</th>
            <th class="p-3">{{ t('heightWeight') }}</th>
            <th class="p-3">{{ t('exitVeloPersonalControl') }}</th>
            <th class="p-3">{{ t('throwingVelo') }}</th>
            <th class="p-3">{{ t('attackAngle') }}</th>
            <th class="p-3">{{ t('broadJumpRatioHeader') }}</th>
            <th class="p-3">{{ t('sprint18m') }}</th>
            <th class="p-3">{{ t('gripPinch') }}</th>
            <th class="p-3">{{ t('shoulderCheck') }}</th>
            <th class="p-3 text-right no-print" v-if="isCoach">{{ t('actions') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr v-for="session in getPlayerSessions(selectedPlayer.id)" :key="'desk-' + session.id" class="hover:bg-slate-800/40 transition">
            <td class="p-3 font-mono text-slate-300">{{ session.session_date }}</td>
            <td class="p-3 font-mono">
              <span v-if="session.height_cm || session.weight_kg">
                {{ session.height_cm ? session.height_cm + 'cm' : '--' }} / {{ session.weight_kg ? session.weight_kg + 'kg' : '--' }}
              </span>
              <span v-else class="text-slate-600">--</span>
            </td>
            <td class="p-3 font-mono">{{ session.exit_velo || '--' }} / {{ session.control_exit_velo || '--' }} km/h</td>
            <td class="p-3 font-mono text-emerald-400 font-semibold">{{ session.throwing_velo ? session.throwing_velo + ' km/h' : '--' }}</td>
            <td class="p-3 font-mono" :class="getAttackAngleColor(session.attack_angle)">{{ session.attack_angle ? session.attack_angle + '°' : '--' }}</td>

            <td class="p-3 font-mono">
              <div v-if="session.broad_jump">
                <span>{{ session.broad_jump }} cm</span>
                <span v-if="getSessionJumpRatio(session)" class="text-xs ml-1 font-bold" :class="getJumpRatioColor(getSessionJumpRatio(session))">
                  ({{ getSessionJumpRatio(session) }}x)
                </span>
              </div>
              <span v-else class="text-slate-600">--</span>
            </td>

            <td class="p-3 font-mono">{{ session.sprint_time ? session.sprint_time + 's' : '--' }}</td>
            <td class="p-3 font-mono">{{ session.grip_dom || '--' }} / {{ session.pinch || '--' }} kg</td>
            <td class="p-3">
              <span :class="session.shoulder_check === 'Pass' ? 'text-emerald-400' : 'text-rose-400'">
                {{ session.shoulder_check === 'Pass' ? t('pass') : t('adjust') }}
              </span>
            </td>
            <td class="p-3 text-right space-x-2 whitespace-nowrap no-print" v-if="isCoach">
              <button @click="openEditSessionModal(session)" class="bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 px-2.5 py-1 rounded text-xs">
                {{ t('edit') }}
              </button>
              <button @click="removeSession(session.id)" class="text-rose-400 hover:text-rose-300 text-xs">
                {{ t('remove') }}
              </button>
            </td>
          </tr>
          <tr v-if="getPlayerSessions(selectedPlayer.id).length === 0">
            <td :colspan="isCoach ? 10 : 9" class="p-6 text-center text-slate-500">{{ t('noSessionsRecorded') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

</div>
  `
};
