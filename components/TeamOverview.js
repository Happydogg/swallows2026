/**
 * SDL-001: Team Overview extraction.
 * Rendering-only component. Player/session data and actions remain in app.js.
 * Do not change behaviors or database permissions in this refactor.
 */
export const TeamOverview = {
  name: 'TeamOverview',
  props: {
    t: { type: Function, required: true },
    players: { type: Array, required: true },
    getClubCount: { type: Function, required: true },
    avgBatSpeed: { type: String, required: true },
    safetyAlertCount: { type: Number, required: true },
    overviewTab: { type: String, required: true },
    searchQuery: { type: String, required: true },
    filteredPlayers: { type: Array, required: true },
    failedImgs: { type: Object, required: true },
    formatImgUrl: { type: Function, required: true },
    getPlayerDisplayName: { type: Function, required: true },
    markImgFailed: { type: Function, required: true },
    selectPlayer: { type: Function, required: true },
    calculateAge: { type: Function, required: true },
    splitPositions: { type: Function, required: true },
    getLatestMetric: { type: Function, required: true },
    getAttackAngleColor: { type: Function, required: true },
    calculateJumpRatio: { type: Function, required: true },
    getJumpRatioColor: { type: Function, required: true },
    isCoach: { type: Boolean, required: true },
    openLogModal: { type: Function, required: true },
    openEditPlayerModal: { type: Function, required: true },
    removePlayer: { type: Function, required: true },
    getTopMetrics: { type: Function, required: true },
    getTopJumpRatios: { type: Function, required: true }
  },
  emits: ['update:overviewTab', 'update:searchQuery'],
  setup(props, { emit }) {
    const setOverviewTab = (tab) => emit('update:overviewTab', tab);
    const setSearchQuery = (query) => emit('update:searchQuery', query);
    return { setOverviewTab, setSearchQuery };
  },
  template: `
    <div class="space-y-6">

      
      <!-- Top Overview Stat Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
          <p class="text-xs text-slate-400">{{ t('activeRoster') }}</p>
          <p class="text-2xl font-bold">{{ players.length }} {{ t('playersUnit') }}</p>
        </div>
        <div class="bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
          <p class="text-xs text-slate-400">{{ t('club60') }}</p>
          <p class="text-2xl font-bold text-amber-400">{{ getClubCount(60) }}</p>
        </div>
        <div class="bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
          <p class="text-xs text-slate-400">{{ t('avgExitVelo') }}</p>
          <p class="text-2xl font-bold text-blue-400">{{ avgBatSpeed }} km/h</p>
        </div>
        <div class="bg-slate-800/60 border border-slate-700 p-4 rounded-xl">
          <p class="text-xs text-slate-400">{{ t('armSafetyFlags') }}</p>
          <p class="text-2xl font-bold" :class="safetyAlertCount > 0 ? 'text-rose-400' : 'text-emerald-400'">{{ safetyAlertCount }}</p>
        </div>
      </div>

      <!-- Tab Switcher & Quick Roster Search -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
        <div class="flex gap-2">
          <button 
            @click="setOverviewTab('roster')" 
            :class="overviewTab === 'roster' ? 'border-b-2 border-blue-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
            class="pb-2 px-3 text-sm transition">
            📋 {{ t('rosterList') }}
          </button>
          <button 
            @click="setOverviewTab('leaderboard')" 
            :class="overviewTab === 'leaderboard' ? 'border-b-2 border-amber-500 text-white font-bold' : 'text-slate-400 hover:text-slate-200'"
            class="pb-2 px-3 text-sm transition flex items-center gap-1.5">
            🏆 {{ t('leaderboardTab') }}
            <span class="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-bold">Top 3</span>
          </button>
        </div>

        <div v-if="overviewTab === 'roster'" class="w-full sm:w-64">
          <input 
            :value="searchQuery" @input="setSearchQuery($event.target.value)" 
            type="text" 
            :placeholder="t('searchPlaceholder')" 
            class="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500">
        </div>
      </div>

      <!-- TAB A: Roster (Responsive Layout) -->
      <div v-if="overviewTab === 'roster'">
        
        <!-- Mobile Player Cards (< 768px): Prioritizes Throws/Bats and Sprint -->
        <div class="block md:hidden space-y-3">
          <div v-for="player in filteredPlayers" :key="'m-rost-' + player.id" class="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 space-y-3 shadow-sm">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div @click="selectPlayer(player)" class="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-sm text-blue-300 cursor-pointer hover:opacity-80 transition" title="View Profile">
                  <img v-if="player.photo_url && !failedImgs[player.id]" 
                       :src="formatImgUrl(player.photo_url)" 
                       :alt="getPlayerDisplayName(player)" 
                       class="w-full h-full object-cover" 
                       referrerpolicy="no-referrer"
                       @error="markImgFailed(player.id)">
                  <span v-else>#{{ player.jersey }}</span>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono text-slate-400">#{{ player.jersey }}</span>
                    <span v-if="player.dob" class="text-xs text-blue-400 font-medium">{{ calculateAge(player.dob) }}</span>
                  </div>
                  <button @click="selectPlayer(player)" class="font-bold text-white hover:underline text-base block text-left">
                    {{ getPlayerDisplayName(player) }}
                  </button>
                  <span v-if="player.hkll_reg_no" class="text-[10px] text-slate-400 font-mono">HKLL: {{ player.hkll_reg_no }}</span>
                </div>
              </div>

              <div class="flex flex-col items-end gap-1">
                <div class="flex gap-1">
                  <span v-for="pos in splitPositions(player.position)" :key="pos" class="px-2 py-0.5 rounded bg-slate-700 text-[10px] font-semibold text-slate-200">
                    {{ pos }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Core High-Signal Stats Grid -->
            <div class="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs font-mono">
              <div>
                <span class="text-slate-400 text-[10px] block">{{ t('throwsBats') }}:</span>
                <span class="text-slate-200 font-bold">{{ player.throws }} / {{ player.bats }}</span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] block">{{ t('sprint18m') }}:</span>
                <span class="text-amber-300 font-bold">{{ getLatestMetric(player.id, 'sprint_time') ? getLatestMetric(player.id, 'sprint_time') + 's' : '--' }}</span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] block">{{ t('topExitVelo') }}:</span>
                <span :class="Number(getLatestMetric(player.id, 'exit_velo')) >= 60 ? 'text-amber-400 font-bold' : 'text-blue-400 font-semibold'">
                  {{ getLatestMetric(player.id, 'exit_velo') || '--' }} km/h
                </span>
              </div>
              <div>
                <span class="text-slate-400 text-[10px] block">{{ t('throwingVelo') }}:</span>
                <span class="text-emerald-400 font-semibold">{{ getLatestMetric(player.id, 'throwing_velo') ? getLatestMetric(player.id, 'throwing_velo') + ' km/h' : '--' }}</span>
              </div>
            </div>

            <!-- Mobile Card Actions Footer -->
            <div class="flex items-center justify-between pt-1 border-t border-slate-700/60">
              <button @click="selectPlayer(player)" class="text-xs text-blue-400 font-semibold hover:underline">
                View Profile &amp; History →
              </button>
              <div class="space-x-2" v-if="isCoach">
                <button @click="openLogModal(player)" class="bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-2.5 py-1 rounded text-xs">+ {{ t('log') }}</button>
                <button @click="openEditPlayerModal(player)" class="bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 px-2.5 py-1 rounded text-xs">{{ t('edit') }}</button>
              </div>
            </div>
          </div>

          <div v-if="filteredPlayers.length === 0" class="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-750 text-slate-500 text-sm">
            {{ t('noPlayersMatch') }}
          </div>
        </div>

        <!-- Desktop Multi-Column Roster Table (≥ 768px) -->
        <div class="hidden md:block bg-slate-800/40 border border-slate-700/80 rounded-xl overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-800/80 text-slate-300 text-xs uppercase tracking-wider">
              <tr>
                <th class="p-3">#</th>
                <th class="p-3">{{ t('player') }}</th>
                <th class="p-3">{{ t('pos') }}</th>
                <th class="p-3">{{ t('throwsBats') }}</th>
                <th class="p-3">{{ t('sprint18m') }}</th>
                <th class="p-3">{{ t('topExitVelo') }}</th>
                <th class="p-3">{{ t('throwingVelo') }}</th>
                <th class="p-3">{{ t('attackAngle') }}</th>
                <th class="p-3">{{ t('broadJumpRatioHeader') }}</th>
                <th class="p-3 text-right">{{ t('actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800">
              <tr v-for="player in filteredPlayers" :key="player.id" class="hover:bg-slate-800/40 transition">
                <td class="p-3 font-mono text-slate-400">{{ player.jersey }}</td>
                <td class="p-3">
                  <div class="flex items-center gap-3">
                    <div @click="selectPlayer(player)" class="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-xs text-blue-300 cursor-pointer hover:opacity-80 transition" title="View Profile">
                      <img v-if="player.photo_url && !failedImgs[player.id]" 
                           :src="formatImgUrl(player.photo_url)" 
                           :alt="getPlayerDisplayName(player)" 
                           class="w-full h-full object-cover" 
                           referrerpolicy="no-referrer"
                           @error="markImgFailed(player.id)">
                      <span v-else>#{{ player.jersey }}</span>
                    </div>
                    <div>
                      <button @click="selectPlayer(player)" class="font-semibold text-white hover:underline text-blue-400 block text-left">
                        {{ getPlayerDisplayName(player) }}
                      </button>
                      <div class="text-xs text-slate-400 flex items-center gap-1.5">
                        <span v-if="player.dob">{{ calculateAge(player.dob) }}</span>
                        <span v-if="player.hkll_reg_no" class="font-mono text-[10px] text-slate-500">• #{{ player.hkll_reg_no }}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="p-3">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="pos in splitPositions(player.position)" :key="pos" class="px-2 py-0.5 rounded bg-slate-700 text-xs font-medium">
                      {{ pos }}
                    </span>
                  </div>
                </td>
                <td class="p-3 font-mono text-slate-300">{{ player.throws }} / {{ player.bats }}</td>
                <td class="p-3 font-mono text-amber-300 font-semibold">
                  {{ getLatestMetric(player.id, 'sprint_time') ? getLatestMetric(player.id, 'sprint_time') + 's' : '--' }}
                </td>
                <td class="p-3 font-mono">
                  <span :class="Number(getLatestMetric(player.id, 'exit_velo')) >= 60 ? 'text-amber-400 font-bold' : ''">
                    {{ getLatestMetric(player.id, 'exit_velo') || '--' }} km/h
                  </span>
                </td>
                <td class="p-3 font-mono text-emerald-400 font-semibold">{{ getLatestMetric(player.id, 'throwing_velo') ? getLatestMetric(player.id, 'throwing_velo') + ' km/h' : '--' }}</td>
                <td class="p-3 font-mono">
                  <span :class="getAttackAngleColor(getLatestMetric(player.id, 'attack_angle'))">
                    {{ getLatestMetric(player.id, 'attack_angle') ? getLatestMetric(player.id, 'attack_angle') + '°' : '--' }}
                  </span>
                </td>
                <td class="p-3 font-mono">
                  <div v-if="getLatestMetric(player.id, 'broad_jump')">
                    <span>{{ getLatestMetric(player.id, 'broad_jump') }} cm</span>
                    <span v-if="calculateJumpRatio(player.id)" class="text-xs ml-1 font-bold" :class="getJumpRatioColor(calculateJumpRatio(player.id))">
                      ({{ calculateJumpRatio(player.id) }}x)
                    </span>
                  </div>
                  <span v-else class="text-slate-600">--</span>
                </td>
                <td class="p-3 text-right space-x-2 whitespace-nowrap">
                  <template v-if="isCoach">
                    <button @click="openLogModal(player)" class="bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-2.5 py-1 rounded text-xs">+ {{ t('log') }}</button>
                    <button @click="openEditPlayerModal(player)" class="bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 px-2.5 py-1 rounded text-xs">{{ t('edit') }}</button>
                    <button @click="removePlayer(player.id)" class="text-rose-400 hover:text-rose-300 text-xs">{{ t('remove') }}</button>
                  </template>
                  <span v-else class="text-xs text-slate-500 italic">{{ t('viewOnly') }}</span>
                </td>
              </tr>
              <tr v-if="filteredPlayers.length === 0">
                <td colspan="10" class="p-6 text-center text-slate-500">{{ t('noPlayersMatch') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <!-- TAB B: Team Leaderboards & PR Badges -->
      <div v-else-if="overviewTab === 'leaderboard'" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <!-- Exit Velocity Leaderboard -->
          <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h4 class="text-sm font-bold text-blue-400 flex items-center justify-between mb-3">
              <span>⚡ {{ t('topExitVelo') }}</span>
              <span class="text-xs text-slate-500">km/h</span>
            </h4>
            <div class="space-y-2">
              <div v-for="(item, idx) in getTopMetrics('exit_velo', 3)" :key="item.player.id" class="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold" :class="idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-amber-600'">
                    {{ idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉' }}
                  </span>
                  <div>
                    <p class="text-xs font-semibold text-white">{{ getPlayerDisplayName(item.player) }}</p>
                    <p class="text-[10px] text-slate-500 font-mono">#{{ item.player.jersey }}</p>
                  </div>
                </div>
                <span class="text-sm font-mono font-bold text-blue-400">{{ item.value }} km/h</span>
              </div>
              <p v-if="getTopMetrics('exit_velo', 3).length === 0" class="text-xs text-slate-500 text-center py-2">--</p>
            </div>
          </div>

          <!-- Throwing Velocity Leaderboard -->
          <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h4 class="text-sm font-bold text-emerald-400 flex items-center justify-between mb-3">
              <span>🎯 {{ t('throwingVelo') }}</span>
              <span class="text-xs text-slate-500">km/h</span>
            </h4>
            <div class="space-y-2">
              <div v-for="(item, idx) in getTopMetrics('throwing_velo', 3)" :key="item.player.id" class="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold" :class="idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-amber-600'">
                    {{ idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉' }}
                  </span>
                  <div>
                    <p class="text-xs font-semibold text-white">{{ getPlayerDisplayName(item.player) }}</p>
                    <p class="text-[10px] text-slate-500 font-mono">#{{ item.player.jersey }}</p>
                  </div>
                </div>
                <span class="text-sm font-mono font-bold text-emerald-400">{{ item.value }} km/h</span>
              </div>
              <p v-if="getTopMetrics('throwing_velo', 3).length === 0" class="text-xs text-slate-500 text-center py-2">--</p>
            </div>
          </div>

          <!-- Broad Jump Height Ratio Leaderboard -->
          <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h4 class="text-sm font-bold text-purple-400 flex items-center justify-between mb-3">
              <span>🚀 {{ t('broadJumpRatioTitle') }}</span>
              <span class="text-xs text-slate-500">{{ t('ratioLabel') }}</span>
            </h4>
            <div class="space-y-2">
              <div v-for="(item, idx) in getTopJumpRatios(3)" :key="item.player.id" class="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold" :class="idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-amber-600'">
                    {{ idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉' }}
                  </span>
                  <div>
                    <p class="text-xs font-semibold text-white">{{ getPlayerDisplayName(item.player) }}</p>
                    <p class="text-[10px] text-slate-500 font-mono">#{{ item.player.jersey }} • {{ item.jump }}cm @ {{ item.height }}cm</p>
                  </div>
                </div>
                <span class="text-sm font-mono font-bold text-purple-400">{{ item.ratio }}x</span>
              </div>
              <p v-if="getTopJumpRatios(3).length === 0" class="text-xs text-slate-500 text-center py-2">--</p>
            </div>
          </div>

          <!-- Home-to-1st Sprint Leaderboard -->
          <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h4 class="text-sm font-bold text-amber-400 flex items-center justify-between mb-3">
              <span>⏱️ {{ t('sprint18m') }}</span>
              <span class="text-xs text-slate-500">sec (Lowest)</span>
            </h4>
            <div class="space-y-2">
              <div v-for="(item, idx) in getTopMetrics('sprint_time', 3, true)" :key="item.player.id" class="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold" :class="idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : 'text-amber-600'">
                    {{ idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉' }}
                  </span>
                  <div>
                    <p class="text-xs font-semibold text-white">{{ getPlayerDisplayName(item.player) }}</p>
                    <p class="text-[10px] text-slate-500 font-mono">#{{ item.player.jersey }}</p>
                  </div>
                </div>
                <span class="text-sm font-mono font-bold text-amber-300">{{ item.value }}s</span>
              </div>
              <p v-if="getTopMetrics('sprint_time', 3, true).length === 0" class="text-xs text-slate-500 text-center py-2">--</p>
            </div>
          </div>

        </div>
      </div>

    </div>
  `
};
