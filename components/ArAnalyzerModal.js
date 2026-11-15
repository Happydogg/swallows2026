// SDL-003: AR analyzer UI; reuses unchanged MediaPipe controller.
export const ArAnalyzerModal = {
  name: "ArAnalyzerModal",
  props: {
    controller: { type: Object, required: true },
    t: { type: Function, required: true }
  },
  setup(props, { emit }) { 
    // The controller is deliberately markRaw at the root; its Vue refs remain writable here.
    const c = props.controller;
    const setVideoElement = node => { c.analyzerVideoRef.value = node; };
    const setCanvasElement = node => { c.analyzerCanvasRef.value = node; };
    return { ...c, setVideoElement, setCanvasElement };
   },
  template: `
  <div class="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-2 sm:p-4 select-none overflow-hidden">
    <!-- Top Bar -->
    <div class="w-full max-w-6xl flex items-center justify-between px-3 py-2 text-white z-10">
      <button @click="closeAnalyzer" class="flex items-center gap-1.5 text-sm font-semibold hover:text-amber-400 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
        Back to Profile
      </button>
      <div class="flex items-center gap-3">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider"
              :class="isTrackerLocked ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'">
          {{ isTrackerLocked ? '● POSE LOCKED' : '○ TRACKING...' }}
        </span>
        <span class="text-xs text-slate-400 font-mono">{{ activeAnalyzerVideo.fps_mode || 240 }} FPS</span>
      </div>
    </div>

    <!-- Stage & HUD (Adaptive for 9:16 Vertical and 16:9 Landscape) -->
    <div class="relative w-full max-w-5xl h-[65vh] sm:h-[72vh] bg-neutral-950 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-white/10">
      <div class="relative max-w-full max-h-full flex items-center justify-center">
        <video 
          :ref="setVideoElement" 
          :src="activeAnalyzerVideo.video_url" 
          class="max-w-full max-h-[65vh] sm:max-h-[72vh] object-contain pointer-events-none rounded-lg block"
          crossorigin="anonymous"
          playsinline 
          webkit-playsinline
          muted
          @loadedmetadata="onAnalyzerVideoLoaded"
          @timeupdate="onAnalyzerTimeUpdate">
        </video>
        <canvas :ref="setCanvasElement" class="absolute inset-0 w-full h-full pointer-events-none z-10"></canvas>
      </div>

      <!-- MINIMALIST FLOATING HUD (UNBLOCKS MOBILE CANVAS) -->
      <div class="absolute left-2 sm:left-4 top-2 sm:top-4 z-30 flex flex-col items-start gap-2 select-none pointer-events-auto">
        <!-- Main Floating Pill -->
        <div @click="isHudExpanded = !isHudExpanded"
             class="bg-slate-950/85 hover:bg-slate-900/90 active:scale-95 backdrop-blur-md border border-white/20 hover:border-amber-400/60 shadow-xl rounded-full px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-all touch-manipulation">
          <!-- Velocity -->
          <div class="flex items-center gap-1 font-mono">
            <span class="text-xs text-amber-400">⚡</span>
            <span class="text-xs sm:text-sm font-black text-white">{{ currentCalculatedSpeed }}</span>
            <span class="text-[9px] sm:text-[10px] text-slate-400">km/h</span>
          </div>
          <span class="text-slate-600 text-xs">|</span>
          <!-- Arm Slot / Attack Angle -->
          <div class="flex items-center gap-1 font-mono">
            <span class="text-xs text-cyan-400">🎯</span>
            <span class="text-xs sm:text-sm font-bold text-cyan-300">{{ currentTrajectoryAngle }}°</span>
          </div>
          <span class="text-slate-600 text-xs">|</span>
          <!-- Knee Block -->
          <div class="flex items-center gap-1 font-mono">
            <span class="text-xs">🦵</span>
            <span class="text-xs sm:text-sm font-bold" :class="leadKneeAngle >= 140 ? 'text-emerald-400' : 'text-amber-400'">
              {{ leadKneeAngle }}°
            </span>
          </div>
          <span class="text-[10px] text-slate-400 pl-0.5">
            {{ isHudExpanded ? '▲' : '▼' }}
          </span>
        </div>

        <!-- Expandable Secondary Card (Only opens on tap) -->
        <div v-if="isHudExpanded" 
             class="bg-slate-950/95 backdrop-blur-xl border border-white/20 rounded-2xl p-3 shadow-2xl w-60 sm:w-64 text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-150">
          <div class="flex items-center justify-between pb-1.5 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>Diagnostics</span>
            <span class="text-amber-400">Frame {{ currentFrameIndex }}</span>
          </div>

          <div class="grid grid-cols-2 gap-1.5 text-[11px]">
            <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span class="text-[10px] text-slate-400 block">{{ t('hudHeadDrift') }}</span>
              <span class="font-bold text-sm" :class="Math.abs(headDriftPx) > 35 ? 'text-rose-400' : 'text-emerald-400'">
                {{ headDriftPx > 0 ? '+' : '' }}{{ headDriftPx }}px
              </span>
            </div>
            <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span class="text-[10px] text-slate-400 block">{{ t('hudTiltPitching') }}</span>
              <span class="font-bold text-sm text-cyan-300">{{ trunkTiltAngle }}°</span>
            </div>
            <div v-if="activeAnalyzerVideo.category === 'pitching'" class="col-span-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
              <span class="text-[10px] text-slate-400">{{ t('hudElbowFlexion') }}:</span>
              <span class="font-bold text-sm text-cyan-400">{{ elbowFlexionAngle }}°</span>
            </div>
            <div class="col-span-2 flex items-center justify-between px-1 text-[10px] text-slate-400">
              <span>Time:</span>
              <span class="text-slate-200 font-semibold">{{ currentPlaybackTime.toFixed(2) }}s / {{ videoDuration.toFixed(2) }}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>

 <!-- STAGE 2.1: Auto-Seed + Coach Nudge Checkpoints & Reference Guides Bar -->
    <div class="w-full max-w-5xl mx-auto px-1 mb-1 z-20 space-y-1.5">
      <!-- Row 1: View Mode Indicator + Reference Line Toggles -->
      <div class="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-mono px-1">
        <div class="flex items-center gap-1.5">
          <span class="px-2 py-0.5 rounded font-bold uppercase"
                :class="isRearView ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'">
            {{ isRearView ? '📐 REAR GIRDLE VECTOR MODE' : '📏 SIDE JOINT ANGLE MODE' }}
          </span>
          <span v-if="isRearView && girdleMetrics" class="text-slate-300 hidden sm:inline">
            H-S Sep: <strong class="text-amber-400">{{ girdleMetrics.separationAngle }}°</strong> | Spine Tilt: <strong class="text-cyan-300">{{ girdleMetrics.spineTilt }}°</strong>
          </span>
        </div>

        <!-- Reference Guide Toggles -->
        <div class="flex items-center gap-1">
          <button @click="toggleRefGuide('frontWall')"
                  :class="refGuides?.frontWall ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'"
                  class="px-2 py-0.5 rounded border text-[10px] font-mono transition">
            🧱 Front Wall
          </button>
          <button @click="toggleRefGuide('headBox')"
                  :class="refGuides?.headBox ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'"
                  class="px-2 py-0.5 rounded border text-[10px] font-mono transition">
            ⭕ Head Box
          </button>
          <button @click="toggleRefGuide('spineAxis')"
                  :class="refGuides?.spineAxis ? 'bg-purple-600/30 text-purple-300 border-purple-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'"
                  class="px-2 py-0.5 rounded border text-[10px] font-mono transition">
            脊椎 Spine/Girdle
          </button>
        </div>
      </div>

      <!-- Row 2: Checkpoint Ribbon + Coach Stamp Nudge -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button 
          v-for="phase in bauerPhases" 
          :key="phase.id || phase.name"
          @click="jumpToPhase(phase)"
          class="px-2.5 py-1 rounded text-xs font-mono font-semibold transition active:scale-95 border whitespace-nowrap flex items-center gap-1"
          :class="getPhaseButtonClass(phase)">
          <span>{{ phase.name }}</span>
          <span v-if="phase.time !== null && phase.time !== undefined" class="text-[10px] opacity-75">({{ Number(phase.time).toFixed(2) }}s)</span>
        </button>

        <!-- Coach Nudge: Stamp Current Frame to Active Checkpoint -->
        <button 
          v-if="activePhaseKey"
          @click="stampCurrentFrameToCheckpoint(activePhaseKey)"
          class="ml-auto px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold whitespace-nowrap transition active:scale-95">
          📌 Stamp Frame (f{{ currentFrameIndex }})
        </button>
      </div>
    </div>

    <!-- Scrubber & Controls (44px Mobile Touch Targets) -->
    <div class="w-full max-w-5xl bg-slate-900/95 border border-slate-800 rounded-2xl p-2.5 sm:p-3 mt-1.5 flex flex-col gap-2 z-20 shadow-2xl">
      <div class="flex items-center gap-2 sm:gap-3 px-1">
        <input type="range" min="0" :max="videoDuration" step="0.00416"
               v-model.number="currentPlaybackTime" @input="onSeekSlider"
               class="flex-1 accent-amber-500 h-2.5 sm:h-2 bg-slate-700 rounded-lg cursor-pointer touch-manipulation">
        <span class="text-[11px] sm:text-xs font-mono text-slate-400 whitespace-nowrap min-w-[70px] text-right">
          {{ currentPlaybackTime.toFixed(2) }}s <span class="text-slate-500">|</span> f{{ currentFrameIndex }}
        </span>
      </div>

      <div class="flex items-center justify-between gap-1 sm:gap-2">
        <button @click="stepFrames(-5)" 
                class="h-11 sm:h-9 px-2.5 sm:px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 active:scale-95 text-slate-300 rounded-xl text-xs font-mono font-semibold transition touch-manipulation flex items-center justify-center border border-slate-700/60">
          -5f
        </button>
        <button @click="stepFrames(-1)" 
                class="h-11 sm:h-9 flex-1 max-w-[120px] px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 active:scale-95 text-white rounded-xl text-xs font-mono font-bold transition touch-manipulation flex items-center justify-center gap-1 border border-slate-700/80 shadow">
          <span class="text-sm">❮</span> <span>Frame</span>
        </button>
        <button @click="togglePlayPause" 
                class="h-11 sm:h-9 flex-1 max-w-[140px] px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 active:scale-95 text-black font-black rounded-xl text-xs sm:text-sm tracking-wide transition touch-manipulation flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20">
          <span>{{ isPlaying ? '❚❚' : '▶' }}</span>
          <span>{{ isPlaying ? 'PAUSE' : 'PLAY' }}</span>
        </button>
        <button @click="stepFrames(1)" 
                class="h-11 sm:h-9 flex-1 max-w-[120px] px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 active:scale-95 text-white rounded-xl text-xs font-mono font-bold transition touch-manipulation flex items-center justify-center gap-1 border border-slate-700/80 shadow">
          <span>Frame</span> <span class="text-sm">❯</span>
        </button>
        <button @click="stepFrames(5)" 
                class="h-11 sm:h-9 px-2.5 sm:px-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 active:scale-95 text-slate-300 rounded-xl text-xs font-mono font-semibold transition touch-manipulation flex items-center justify-center border border-slate-700/60">
          +5f
        </button>
      </div>

      <div class="flex items-center justify-between gap-1 pt-1 border-t border-slate-800/80 text-white">
        <div class="flex items-center gap-1">
          <button v-for="rate in [0.1, 0.25, 0.5, 1.0]" :key="rate" @click="setPlaybackRate(rate)"
                  :class="playbackRate === rate ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'"
                  class="h-8 px-2 sm:px-2.5 rounded-lg text-xs font-mono transition touch-manipulation active:scale-95">
            {{ rate }}x
          </button>
        </div>
        <button @click="toggleOverlay" 
                :class="showOverlay ? 'bg-cyan-600 hover:bg-cyan-500 text-white font-semibold' : 'bg-slate-800 text-slate-400'"
                class="h-8 px-3 rounded-lg text-xs transition touch-manipulation active:scale-95 flex items-center gap-1">
          <span>{{ showOverlay ? '✓ AR HUD' : '○ AR HUD' }}</span>
        </button>
      </div>
    </div>
  </div>
  `
};
