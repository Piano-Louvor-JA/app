<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { GlassCard } from '@design-system/index'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage, type StageSettings } from '../../settings/types/stage-settings'


import StageCustomizationDialog from '../../settings/components/StageCustomizationDialog.vue'
import CountdownDurationInput from '../components/CountdownDurationInput.vue'
import CountdownPreview from '../components/CountdownPreview.vue'
import CountdownConfigDialog from '../components/CountdownConfigDialog.vue'
import CountdownProjectFab from '../components/CountdownProjectFab.vue'
import CountdownSavedList from '../components/CountdownSavedList.vue'
import { useCountdownFeature } from '../composables/useCountdown'
import { useCountdownStore } from '../stores/useCountdownStore'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG, type CountdownDisplayConfig, type CountdownTimeFormat, type SabbathModeConfig } from '../types/countdown'

const { t } = useI18n()
const router = useRouter()

const {
  config,
  runtime,
  isProjecting,
  configOpen,
  displayConfigOpen,
  isRunning,
  canStart,
  setTimeFormat,
  setBgColor,
  setTextColor,
  resetDisplayToDefault,
  openConfig,
  closeConfig,
  openDisplayConfig,
  closeDisplayConfig,
  setDurationMs,
  setAllowNegative,
  setAlertTonePreset: _setAlertTonePreset,
  audioMuted,
  audioVolume,
  setAudioMuted,
  setAudioVolume,
  audioPaused,
  setAudioPaused,
  stopAudio,
  setMode,
  setSabbathConfig,
  adjustTime,
  start,
  pause,
  reset,
  saveMark,
  removeSavedMark,
  clearSavedMarks,
  toggleProjection,
  clearProjection,
  refreshProjectionState,
} = useCountdownFeature()

function goBack() {
  router.push({ name: 'utilities-temporizador' })
}


function patchMode(mode: 'standard' | 'sabbath') {
  setMode(mode)
}

function patchSabbathConfig(sabbathConfig: SabbathModeConfig) {
  setSabbathConfig(sabbathConfig)
}

const sabbathEndTime = computed({
  get: () => effectiveConfig.value.sabbathConfig?.endTime ?? '',
  set: (v: string) => {
    if (effectiveConfig.value.sabbathConfig) {
      patchSabbathConfig({ ...effectiveConfig.value.sabbathConfig, endTime: v })
    }
  },
})

const sabbathStartTime = computed({
  get: () => effectiveConfig.value.sabbathConfig?.startTime ?? '',
  set: (v: string) => {
    if (effectiveConfig.value.sabbathConfig) {
      patchSabbathConfig({ ...effectiveConfig.value.sabbathConfig, startTime: v || undefined })
    }
  },
})

const canStartSabbath = computed(() => {
  const sc = effectiveConfig.value.sabbathConfig
  if (!sc) return false
  if (!/^\d{2}:\d{2}$/.test(sc.endTime)) return false
  if (sc.scheduleMode === 'start' && !/^\d{2}:\d{2}$/.test(sc.startTime ?? '')) return false
  return true
})

const sabbathPanelOpen = ref(false)

// web#175: popover de agendamento fecha ao clicar fora (document-level,
// captura qualquer clique fora do popover — o popover faz @click.stop)
function onDocumentClick() {
  sabbathPanelOpen.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') sabbathPanelOpen.value = false
}
// Feedback Ezequias (02/10): "stopar ao sair da projeção" — popup fechado
// pelo X da janela: o main avisa 'projection:popups-closed', o estado
// dessincroniza e o áudio seguiria tocando. Corta o áudio na hora.
let unsubPopupsClosed: (() => void) | null = null
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  const bridge = (window as unknown as {
    louvorja?: { projection?: { onPopupsClosed?: (cb: () => void) => () => void } }
  }).louvorja
  unsubPopupsClosed =
    bridge?.projection?.onPopupsClosed?.(() => {
      refreshProjectionState()
      stopAudio()
    }) ?? null
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
  unsubPopupsClosed?.()
  unsubPopupsClosed = null
})

/** Converte HH:MM → ms desde meia-noite */
function timeToMs(val: string): number {
  if (!/^\d{2}:\d{2}$/.test(val)) return 0
  const [h, m] = val.split(':').map(Number)
  return (h * 3600 + m * 60) * 1000
}

// web#175: no modo ES com cronômetro idle, o preview tem que mostrar a
// duração DERIVADA do agendamento — não o 00:05:00 do cronômetro normal
// ("fica fixo, não atualiza"). Regra: scheduleMode 'start' → duração =
// Término − Início (a aula inteira, acumulado 0 — o relógio do preview
// mostra o total configurado); 'endOnly' → Término − agora.
const sabbathIdlePreviewRuntime = computed(() => {
  if (effectiveConfig.value.mode !== 'sabbath') return null
  if (runtime.value.status !== 'idle') return null
  const sc = effectiveConfig.value.sabbathConfig
  if (!sc || !/^\d{2}:\d{2}$/.test(sc.endTime)) return null
  const now = new Date()
  const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
  const endMs = timeToMs(sc.endTime)
  const endVsNow = endMs > nowMs ? endMs - nowMs : endMs - nowMs + 24 * 3600 * 1000
  const usesStart =
    sc.scheduleMode === 'start' && /^\d{2}:\d{2}$/.test(sc.startTime ?? '')
  const startMs = usesStart ? timeToMs(sc.startTime ?? '') : 0
  const durationMs = usesStart
    ? Math.max(0, endMs - startMs)
    : endVsNow
  return {
    ...runtime.value,
    durationMs,
    accumulatedMs: 0,
    segmentStartedAt: null,
    status: 'idle' as const,
    finished: false,
  }
})

/** Converte ms → HH:MM */
function msToTime(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600) % 24
  const m = Math.floor((totalSec % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Ms do horário de término (para CountdownDurationInput) */
const endTimeMs = computed({
  get: () => effectiveConfig.value.sabbathConfig ? timeToMs(effectiveConfig.value.sabbathConfig.endTime) : 0,
  set: (ms: number) => {
    if (effectiveConfig.value.sabbathConfig) {
      patchSabbathConfig({ ...effectiveConfig.value.sabbathConfig, endTime: msToTime(ms) })
    }
  },
})

/** Ms do horário de início (para CountdownDurationInput) */
const startTimeMs = computed({
  get: () => effectiveConfig.value.sabbathConfig?.startTime ? timeToMs(effectiveConfig.value.sabbathConfig.startTime) : 0,
  set: (ms: number) => {
    if (effectiveConfig.value.sabbathConfig) {
      patchSabbathConfig({ ...effectiveConfig.value.sabbathConfig, startTime: msToTime(ms) })
    }
  },
})

/** Schedule mode reativo */
const scheduleMode = computed({
  get: () => effectiveConfig.value.sabbathConfig?.scheduleMode ?? 'endOnly',
  set: (v: 'endOnly' | 'start') => {
    if (effectiveConfig.value.sabbathConfig) {
      patchSabbathConfig({ ...effectiveConfig.value.sabbathConfig, scheduleMode: v })
    }
  },
})

/** Aliases para o template (o @update:duration-ms espera função) */
function updateEndTimeMs(ms: number) { endTimeMs.value = ms }
function updateStartTimeMs(ms: number) { startTimeMs.value = ms }

function onToggleProjection() {
  toggleProjection()
}

const stage = ref<StageSettings>(readEffectiveStageSettings('countdown'))
let unsubStage: (() => void) | null = null
onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('countdown')
  })
})
onUnmounted(() => unsubStage?.())

const stageBg = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))

// Características do módulo vindas do StageSettings (fonte única).
const effectiveConfig = computed(() => {
  const mod = stage.value.countdown
  const merged = mod ? { ...config.value, ...mod } : { ...config.value }
  // Garante defaults pra evitar undefined no template
  return {
    ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
    ...merged,
    allowNegative: merged.allowNegative ?? false,
  }
})
</script>

<template>
  <section class="countdown-view">
    <header class="countdown-view__header">
      <button
        type="button"
        class="countdown-view__back"
        :aria-label="t('countdown.backToUtilities')"
        @click="goBack"
      >
        <i
          class="ti ti-arrow-left"
          aria-hidden="true"
        />
      </button>

      <div class="countdown-view__brand">
        <div class="countdown-view__brand-icon">
          <i
            class="ti ti-hourglass"
            aria-hidden="true"
          />
        </div>
        <h1 class="countdown-view__title">
          {{ t('countdown.title') }}
        </h1>
      </div>
      <label
        class="countdown-view__mode-switch"
        :title="t('countdown.modeHint')"
      >
        <input
          type="checkbox"
          role="switch"
          class="countdown-view__mode-switch-input"
          :checked="effectiveConfig.mode === 'sabbath'"
          :aria-label="t('countdown.mode')"
          @change="patchMode(($event.target as HTMLInputElement).checked ? 'sabbath' : 'standard')"
        >
        <span
          class="countdown-view__mode-switch-track"
          :class="{ 'countdown-view__mode-switch-track--on': effectiveConfig.mode === 'sabbath' }"
          aria-hidden="true"
        >
          <span class="countdown-view__mode-switch-thumb" />
        </span>
        <span class="countdown-view__mode-switch-label">{{ t('countdown.modeSabbath') }}</span>
      </label>
    </header>

    <div class="countdown-view__content">
      <div class="countdown-view__stage">
        <GlassCard
          class="countdown-view__widget"
          :class="{ 'countdown-view__widget--sabbath': effectiveConfig.mode === 'sabbath' }"
          :padding="false"
        >
          <div class="countdown-view__toolbar">
            <div class="countdown-view__tool-group countdown-view__tool-group--left">
                          <button
                                          v-if="effectiveConfig.mode === 'sabbath'"
                                          type="button"
                                          class="countdown-view__tool-btn"
                                          :aria-label="t('countdown.config')"
                                          :title="t('countdown.config')"
                                          @click="openDisplayConfig"
                                        >
                                          <i
                                            class="ti ti-settings"
                                            aria-hidden="true"
                                          />
                                        </button>
                          <button
                            type="button"
                            class="countdown-view__tool-btn"
                            :aria-label="t('countdown.personalize')"
                            :title="t('countdown.personalize')"
                            @click="openConfig"
                          >
                            <i
                              class="ti ti-palette"
                              aria-hidden="true"
                            />
                          </button>
                          <button
                              v-if="effectiveConfig.mode === 'sabbath'"
                              type="button"
                              class="countdown-view__tool-btn"
                              :class="{ 'countdown-view__tool-btn--active': sabbathPanelOpen }"
                              :aria-label="t('countdown.sabbathSchedule')"
                              :title="t('countdown.sabbathScheduleHint')"
                              data-testid="sabbath-schedule-toggle"
                              @click.stop="sabbathPanelOpen = !sabbathPanelOpen"
                            >
                              <i
                                class="ti ti-calendar-clock"
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </div>

                        <!-- Popover de agendamento Escola Sabatina (fecha ao clicar fora) -->
                        <Transition name="countdown-popover">
                          <div
                            v-if="effectiveConfig.mode === 'sabbath' && sabbathPanelOpen"
                            class="countdown-view__sabbath-popover"
                            @click.stop
                          >
                            <div class="countdown-view__sabbath-head">
                              <i
                                class="ti ti-calendar-clock"
                                aria-hidden="true"
                              />
                              <div>
                                <h3>{{ t('countdown.sabbathSchedule') }}</h3>
                                <p>{{ t('countdown.sabbathScheduleHint') }}</p>
                              </div>
                            </div>
                            <div class="countdown-view__sabbath-schedule">
                              <label class="countdown-view__sabbath-radio">
                                <input
                                  type="radio"
                                  name="sabbath-schedule-mode"
                                  value="endOnly"
                                  :checked="effectiveConfig.sabbathConfig?.scheduleMode === 'endOnly'"
                                  @change="patchSabbathConfig({ ...effectiveConfig.sabbathConfig, scheduleMode: 'endOnly', endTime: effectiveConfig.sabbathConfig?.endTime ?? '10:15' })"
                                >
                                <span>{{ t('countdown.scheduleEndOnly') }}</span>
                              </label>
                              <label class="countdown-view__sabbath-radio">
                                <input
                                  type="radio"
                                  name="sabbath-schedule-mode"
                                  value="start"
                                  :checked="effectiveConfig.sabbathConfig?.scheduleMode === 'start'"
                                  @change="patchSabbathConfig({ ...effectiveConfig.sabbathConfig, scheduleMode: 'start', endTime: effectiveConfig.sabbathConfig?.endTime ?? '10:15' })"
                                >
                                <span>{{ t('countdown.scheduleStartEnd') }}</span>
                              </label>
                            </div>
                            
</div>
                        </Transition>

          <div
            class="countdown-view__preview"
            :style="stageBg"
          >
            <div class="countdown-view__duration">
                          <template v-if="effectiveConfig.mode === 'sabbath' && effectiveConfig.sabbathConfig">
                            <div
                              v-if="effectiveConfig.sabbathConfig.scheduleMode === 'start'"
                              class="countdown-view__sabbath-time-field"
                            >
                              <span class="countdown-view__sabbath-time-label">Início</span>
                              <CountdownDurationInput
                                :duration-ms="startTimeMs"
                                :disabled="isRunning"
                                compact
                                no-seconds
                                @update:duration-ms="updateStartTimeMs"
                              />
                            </div><div class="countdown-view__sabbath-time-field">
                              <span class="countdown-view__sabbath-time-label">Término</span>
                              <CountdownDurationInput
                                :duration-ms="endTimeMs"
                                :disabled="isRunning"
                                compact
                                no-seconds
                                @update:duration-ms="updateEndTimeMs"
                              />
                            </div>
                          </template>
                          <CountdownDurationInput
                            v-else
                            :duration-ms="runtime.durationMs"
                            :disabled="isRunning"
                            compact
                            @update:duration-ms="setDurationMs"
                          />
                        </div>
            <CountdownPreview
              :config="effectiveConfig"
              :runtime="sabbathIdlePreviewRuntime ?? runtime"
              preview
            />
          </div>

          <div class="countdown-view__controls">
                      <button
                        v-if="!isRunning && effectiveConfig.mode !== 'sabbath'"
                        type="button"
                        class="countdown-view__ctrl countdown-view__ctrl--start"
                        :disabled="!canStart"
                        @click="start"
                      >
                        <i
                          class="ti ti-player-play"
                          aria-hidden="true"
                        />
                        {{ t('countdown.start') }}
                      </button>
                      <button
                        v-if="!isRunning && effectiveConfig.mode === 'sabbath'"
                        type="button"
                        class="countdown-view__ctrl countdown-view__ctrl--start"
                        :disabled="!canStart"
                        @click="start"
                      >
                        <i
                          class="ti ti-player-play"
                          aria-hidden="true"
                        />
                        {{ t('countdown.start') }}
                      </button>
                      <button
                        v-else
                        type="button"
                        class="countdown-view__ctrl countdown-view__ctrl--pause"
                        @click="pause"
                      >
                        <i
                          class="ti ti-player-pause"
                          aria-hidden="true"
                        />
                        {{ t('countdown.pause') }}
                      </button>

                      <button
                        type="button"
                        v-if="effectiveConfig.mode !== 'sabbath'"
                        class="countdown-view__ctrl countdown-view__ctrl--reset"
                        @click="reset"
                      >
                        <i
                          class="ti ti-refresh"
                          aria-hidden="true"
                        />
                        {{ t('countdown.reset') }}
                      </button>

                      <button
                        type="button"
                        v-if="effectiveConfig.mode !== 'sabbath'"
                        class="countdown-view__ctrl countdown-view__ctrl--save"
                        @click="saveMark"
                      >
                        <i
                          class="ti ti-device-floppy"
                          aria-hidden="true"
                        />
                        {{ t('countdown.save') }}
                      </button>
                    </div>

                    <div
                      v-if="effectiveConfig.mode === 'sabbath'"
                      class="countdown-view__adjust"
                    >
            <button
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--adjust"
              :aria-label="t('countdown.addMinute')"
              @click="adjustTime(60_000)"
            >
              <i
                class="ti ti-plus"
                aria-hidden="true"
              /> 1 min
            </button>
            <button
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--adjust"
              :aria-label="t('countdown.addFiveMinutes')"
              @click="adjustTime(300_000)"
            >
              <i
                class="ti ti-plus"
                aria-hidden="true"
              /> 5 min
            </button>
            <button
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--adjust"
              :aria-label="t('countdown.subMinute')"
              @click="adjustTime(-60_000)"
            >
              <i
                class="ti ti-minus"
                aria-hidden="true"
              /> 1 min
            </button>
            <button
              type="button"
              class="countdown-view__ctrl countdown-view__ctrl--adjust"
              :aria-label="t('countdown.subFiveMinutes')"
              @click="adjustTime(-300_000)"
            >
              <i
                class="ti ti-minus"
                aria-hidden="true"
              /> 5 min
            </button>
          </div>

          <div
            v-if="isProjecting"
            class="countdown-view__projecting"
          >
            <i
              class="ti ti-device-desktop"
              aria-hidden="true"
            />
            {{ t('countdown.projecting') }}
          </div>

          <!-- F2 (web#175): controles de áudio do operador (o áudio toca na
               janela de projeção; estes controles sincronizam via canal) -->
          <div
            v-if="effectiveConfig.mode === 'sabbath'"
            class="countdown-view__audio-controls"
            data-testid="operator-audio-controls"
          >
            <button
              type="button"
              class="countdown-view__audio-btn"
              :class="{ 'countdown-view__audio-btn--muted': audioMuted }"
              :aria-label="audioMuted ? t('countdown.unmuteAudio') : t('countdown.muteAudio')"
              :title="audioMuted ? t('countdown.unmuteAudio') : t('countdown.muteAudio')"
              @click="setAudioMuted(!audioMuted)"
            >
              <i
                :class="audioMuted ? 'ti ti-volume-off' : 'ti ti-volume'"
                aria-hidden="true"
              />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="countdown-view__audio-volume"
              :value="audioVolume"
              :aria-label="t('countdown.audioVolume')"
              @input="setAudioVolume(Number(($event.target as HTMLInputElement).value))"
            >
            <!-- Feedback Ezequias: botão único funciona como TOGGLE —
                 tocando = pausa (retoma de onde parou); pausado = retoma -->
            <button
              type="button"
              class="countdown-view__audio-btn countdown-view__audio-btn--toggle"
              :class="{ 'countdown-view__audio-btn--toggle-playing': !audioPaused }"
              :aria-label="audioPaused ? t('countdown.playAudio') : t('countdown.pauseAudio')"
              :title="audioPaused ? t('countdown.playAudio') : t('countdown.pauseAudio')"
              @click="setAudioPaused(!audioPaused)"
            >
              <i
                :class="audioPaused ? 'ti ti-player-play' : 'ti ti-player-pause'"
                aria-hidden="true"
              />
            </button>
            <label
              class="countdown-view__audio-toggle"
              :title="t('countdown.audioAppliesToProjection')"
            >
              <input
                type="checkbox"
                role="switch"
                class="countdown-view__audio-toggle-input"
                :checked="!audioMuted"
                :aria-label="t('countdown.audioAppliesToProjection')"
                @change="setAudioMuted(!($event.target as HTMLInputElement).checked)"
              >
              <span
                class="countdown-view__audio-toggle-track"
                :class="{ 'countdown-view__audio-toggle-track--on': !audioMuted }"
                aria-hidden="true"
              >
                <span class="countdown-view__audio-toggle-thumb" />
              </span>
              <span class="countdown-view__audio-hint">{{ t('countdown.audioAppliesToProjection') }}</span>
            </label>
          </div>
        </GlassCard>
      </div>

      <CountdownSavedList
        :items="runtime.savedTimesMs"
        :time-format="config.timeFormat"
        @remove="removeSavedMark"
        @clear="clearSavedMarks"
      />
    </div>

        <CountdownConfigDialog
          :open="displayConfigOpen"
          :config="effectiveConfig"
          @close="closeDisplayConfig"
          @update:time-format="setTimeFormat"
          @update:allow-negative="setAllowNegative"
          @update:mode="patchMode"
          @update:sabbath-config="patchSabbathConfig"
          @reset="resetDisplayToDefault"
        />

        <StageCustomizationDialog
      :open="configOpen"
      scope="countdown"
      @close="closeConfig"
    />


    <CountdownProjectFab
      :projecting="isProjecting"
      @project="onToggleProjection"
      @clear="() => void clearProjection()"
    />
  </section>
</template>

<style scoped lang="scss">
.countdown-view {
  display: flex;
  min-height: calc(
    (100 * var(--ui-vh)) - var(--ds-header-height, 5.5rem) - var(--ds-dock-height, 5.5rem)
  );
  flex-direction: column;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: calc(var(--ds-dock-height, 5.5rem) + 5rem);
}

.countdown-view__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.countdown-view__back {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition: background-color 160ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  }

  .ti {
    font-size: 1.25rem;
  }
}

.countdown-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.countdown-view__brand-icon {
  display: flex;
  width: 2.75rem;
  height: 2.75rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-md, 0.75rem);
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.35rem;
  }
}

.countdown-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}

.countdown-view__content {
  display: flex;
  flex: 1;
  align-items: stretch;
  justify-content: center;
  gap: 1.25rem;
  min-height: 0;
}

.countdown-view__stage {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}

.countdown-view__widget {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 56rem;
  aspect-ratio: 21 / 9;
  max-height: min(100%, 28rem);
  overflow: hidden;
  flex-direction: column;
}

/* web#175: modo ES — TODOS os elementos visíveis em qualquer breakpoint,
   com folga vertical (o preview nunca pode colapsar). Largo (>1280):
   proporção 21/9 com teto 30rem. Estreito (≤1280): altura por conteúdo,
   sem aspect-ratio/max-height e SEM overflow:hidden (era ele que cortava
   o display e os controles nos prints do Ezequias). O display escala
   pelas container queries; a view tem scroll natural se precisar. */
.countdown-view__widget--sabbath {
  aspect-ratio: 21 / 9;
  max-height: min(100%, 30rem);
  min-height: 20rem;
}

/* web#175: no modo ES a área de controles tem 2 fileiras (ações + ajustes);
   compacta pra devolver altura ao preview e manter o display centrado */
.countdown-view__widget--sabbath .countdown-view__controls {
  padding: 0.4rem 1.25rem 0.6rem;
  gap: 0.4rem;
}

.countdown-view__widget--sabbath .countdown-view__adjust {
  margin-top: 0;
}

.countdown-view__widget--sabbath .countdown-view__ctrl {
  height: 2rem;
}

/* F2 (web#175): controles de áudio do operador (sincronizam com a projeção) */
.countdown-view__audio-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.countdown-view__audio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 1rem;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 15%, transparent);
  }

  &--muted {
    color: var(--ds-color-primary);
  }

  &--toggle-playing {
    background: color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
  }

  &--stop:hover {
    background: color-mix(in srgb, var(--ds-color-error, #ff5252) 25%, transparent);
    color: var(--ds-color-error, #ff5252);
  }
}

.countdown-view__audio-volume {
  width: 5.5rem;
  accent-color: var(--ds-color-primary);
}

.countdown-view__audio-hint {
  font-size: 0.68rem;
  color: var(--ds-color-on-surface-variant);
  user-select: none;
}

/* Feedback Ezequias: "fazer o toggle" — controle visual ON/OFF pro áudio da projeção */
.countdown-view__audio-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

.countdown-view__audio-toggle-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.countdown-view__audio-toggle-track {
  position: relative;
  width: 2.1rem;
  height: 1.15rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 20%, transparent);
  transition: background 0.15s ease;

  &--on {
    background: var(--ds-color-primary);
  }
}

.countdown-view__audio-toggle-thumb {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  background: #fff;
  transition: transform 0.15s ease;

  .countdown-view__audio-toggle-track--on & {
    transform: translateX(0.95rem);
  }
}

.countdown-view__toolbar {
  position: absolute;
  inset: 1rem 1rem auto;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  pointer-events: none;
}

.countdown-view__tool-group {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  pointer-events: auto;

  &--right {
    justify-content: flex-end;
  }
}

.countdown-view__tool-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;

  /* web#175: popover aberto — botão de agenda fica no estado ativo */
  &--active {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #131313);
  }
  transition:
    transform 160ms ease,
    background-color 160ms ease;

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  .ti {
      font-size: 1.1rem;
    }
  }

  .countdown-view__mode-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;

    &-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    &-track {
      display: inline-flex;
      width: 2.4rem;
      height: 1.3rem;
      align-items: center;
      padding: 0.15rem;
      border-radius: 9999px;
      background: color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
      transition: background-color 180ms ease;

      &--on {
        background: var(--ds-color-primary);
      }
    }

    &-thumb {
      width: 1rem;
      height: 1rem;
      border-radius: 9999px;
      background: var(--ds-color-surface);
      box-shadow: 0 1px 3px rgb(0 0 0 / 35%);
      transition: transform 180ms ease;
    }

    &-track--on &-thumb {
      transform: translateX(1.1rem);
    }

    &-label {
      font-size: 0.85rem;
      color: var(--ds-color-on-surface);
    }
  }

  .countdown-view__sabbath-times .countdown-view__ctrl--start {
      align-self: flex-end;
      margin-left: 0.5rem;
    }

    /* Popover de agendamento — ancorado abaixo do botão de agenda */
    .countdown-view__sabbath-popover {
              position: absolute;
              top: 3.5rem;
          right: 0;
          z-index: 10;
          min-width: min(20rem, calc(100vw - 2rem));
          max-width: calc(100vw - 2rem);
      padding: 1rem;
      border-radius: 1rem;
      background: var(--ds-color-surface-elevated, var(--ds-color-surface));
      border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
      box-shadow: 0 8px 32px rgb(0 0 0 / 25%);
      animation: countdown-popover-in 160ms ease;
    }

    @keyframes countdown-popover-in {
      from { opacity: 0; transform: translateY(-0.5rem); }
      to { opacity: 1; transform: translateY(0); }
    }

    .countdown-popover-leave-active {
      animation: countdown-popover-out 140ms ease forwards;
    }

    @keyframes countdown-popover-out {
      to { opacity: 0; transform: translateY(-0.5rem); }
    }

    .countdown-view__sabbath-head {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.75rem;

      i {
        font-size: 1.25rem;
        color: var(--ds-color-primary);
        margin-top: 0.15rem;
      }

      div h3 {
        margin: 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--ds-color-on-surface);
      }

      div p {
        margin: 0.15rem 0 0;
        font-size: 0.75rem;
        color: var(--ds-color-on-surface-muted, var(--ds-color-on-surface));
      }
    }

    .countdown-view__sabbath-schedule {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
      margin-bottom: 0.75rem;

      label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--ds-color-on-surface);
      }

      input[type="radio"] {
        accent-color: var(--ds-color-primary);
      }
    }

    .countdown-view__sabbath-times {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.5rem;
    }

    .countdown-view__sabbath-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 8rem;

      span {
        font-size: 0.75rem;
        color: var(--ds-color-on-surface-muted, var(--ds-color-on-surface));
      }

      input {
        padding: 0.45rem 0.6rem;
        border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
        border-radius: 0.5rem;
        background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
        color: var(--ds-color-on-surface);
        font-size: 1rem;
        text-align: center;

        &:focus {
          outline: 2px solid var(--ds-color-primary);
          outline-offset: 1px;
        }
      }
    }

    .countdown-view__sabbath-times .countdown-view__ctrl--start {
      align-self: flex-end;
      margin-left: 0.5rem;
    }

    .countdown-view__duration {
  /* F1 (web#175): fluxo, não overlay — inputs nunca mais cobrem os dígitos */
  position: static;
  transform: none;
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  border-radius: var(--ds-radius-md, 0.75rem 0 0.75rem 0);
  overflow: visible;
  margin: 0.5rem auto 0;
  width: fit-content;
}

.countdown-view__duration .countdown-view__sabbath-time-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
}

.countdown-view__duration .countdown-view__sabbath-time-label {
  font-size: 0.7rem;
  font-weight: 600;
  opacity: 0.8;
}

.countdown-view__preview {
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
  flex: 1;
  min-height: 8rem;
  padding: 0.75rem 1.5rem 1rem;
}

.countdown-view__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 0.75rem 1.25rem 1.25rem;
}

.countdown-view__adjust {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.countdown-view__ctrl--adjust {
  min-width: 5.5rem;
  font-size: 0.9rem;
}

.countdown-view__ctrl {
  display: inline-flex;
  height: 2.35rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 700;

  .ti {
    font-size: 1.05rem;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--start {
    background: rgba(67, 160, 71, 0.30);
    color: #a5d6a7;
  }

  &--pause {
    background: rgba(251, 140, 0, 0.30);
    color: #ffcc80;
  }

  &--reset {
    background: rgba(229, 57, 53, 0.25);
    color: #ef9a9a;
  }

  &--save {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.countdown-view__projecting {
  /* web#175: fluxo, não overlay — absolute aqui encostava no botão Pausar
     quando a altura do card varia (janela estreita / card de inputs no fluxo) */
  position: static;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;
  margin: 0.35rem auto 0;

  .ti {
    font-size: 0.95rem;
  }
}

@media (max-width: 1280px) {
  .countdown-view {
    padding: 1rem;
    padding-bottom: calc(var(--ds-dock-height, 5.5rem) + 3.5rem);
  }

  .countdown-view__header {
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .countdown-view__brand-icon {
    width: 2.25rem;
    height: 2.25rem;

    .ti {
      font-size: 1.15rem;
    }
  }

  .countdown-view__title {
    font-size: 1.15rem;
  }

  .countdown-view__widget {
    min-height: 16rem;
    max-height: min(100%, 24rem);
  }

  /* web#175: modo ES estreito — todos os elementos visíveis com folga:
     sem aspect-ratio, sem max-height, e o preview ganha altura MÍNIMA
     real (não colapsa) com o display escalando por container query. */
  .countdown-view__widget--sabbath {
    aspect-ratio: auto;
    max-height: none;
    overflow: visible;
  }

  .countdown-view__widget--sabbath .countdown-view__preview {
    overflow: visible;
    min-height: 11rem;
    flex-shrink: 0;
  }

  .countdown-view__preview {
    padding: 0.65rem 1rem 0.5rem;
  }
}

@media (max-width: 960px) {
  .countdown-view__content {
    flex-direction: column;
    align-items: center;
  }
}
</style>