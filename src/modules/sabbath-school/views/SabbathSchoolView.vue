<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { GlassCard } from '@design-system/index'
import CountdownDurationInput from '@modules/countdown/components/CountdownDurationInput.vue'
import { useCountdownStage } from '@modules/countdown/composables/useCountdownStage'
import { computeElapsedMs } from '@modules/countdown/services/countdown-format'
import { useCountdownStore } from '@modules/countdown/stores/useCountdownStore'
import StageCustomizationDialog from '@modules/settings/components/StageCustomizationDialog.vue'
import { resolveBackgroundImage, stageBgCss } from '@modules/settings/types/stage-settings'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { appConfirm } from '@shared/composables/useAppConfirm'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'

import SabbathSchoolConfigDialog from '../components/SabbathSchoolConfigDialog.vue'
import type { SabbathAudioLangSetting } from '../services/alert-tone'
import { msToTime, timeToMs } from '../services/sabbath-schedule'
import { pickAndImportSabbathVideo } from '../services/sabbath-video'
import { useSabbathSchoolStore } from '../stores/useSabbathSchoolStore'
import type { SabbathScheduleConfig } from '../types/sabbath-school'

const { t } = useI18n()

const { minimize, prepare } = useMinimizablePage({
  describe: () => ({ title: t('sabbathSchool.title'), icon: 'ti-book-2', summary: '' }),
  capture: () => null,
  fallbackRoute: { name: 'utilities' },
})
const router = useRouter()
const store = useSabbathSchoolStore()
// só a aparência da tela de contagem (cores e formato) vem do Timer
const appearance = useCountdownStore()

const settingsOpen = ref(false)
const personalizeOpen = ref(false)
const schedulePanelOpen = ref(false)

const schedule = computed(() => store.config.schedule)

/** Vídeo personalizado: o vídeo traz duração e som próprios. */
const isVideoMode = computed(() => schedule.value.scheduleMode === 'video')

// relógio da barra de andamento: só anda com o vídeo tocando
const nowMs = ref(Date.now())
let progressTimer: ReturnType<typeof setInterval> | null = null

function stopProgressTimer() {
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = null
}

watch(
  () => [isVideoMode.value && store.isRunning, store.runtime] as const,
  ([ticking]) => {
    nowMs.value = Date.now()
    stopProgressTimer()
    if (ticking) progressTimer = setInterval(() => { nowMs.value = Date.now() }, 250)
  },
  { immediate: true },
)

const videoElapsedMs = computed(() => {
  const rt = store.runtime
  const elapsed = computeElapsedMs(rt.accumulatedMs ?? 0, rt.segmentStartedAt ?? null, rt.status, nowMs.value)
  return Math.min(rt.durationMs ?? 0, Math.max(0, elapsed))
})

function toggleVideoPlayback() {
  if (store.isRunning) store.pause()
  else store.start()
}

/** O vídeo tem duração própria: sem ajuste fino. */
const adjustLocked = computed(() => store.isIdle || Boolean(store.runtime.videoPath))

const openingPlaying = computed(() => store.openingPlayback === 'playing')
const finalMinutesPlaying = computed(() => store.rehearsing && store.isRunning)

async function onFinalMinutes() {
  // contagem real em curso (rodando ou pausada) se perde ao começar os últimos 5 min
  if (!store.isIdle && !store.rehearsing) {
    const confirmed = await appConfirm({
      title: t('sabbathSchool.finalMinutesConfirmTitle'),
      message: t('sabbathSchool.finalMinutesConfirmMessage'),
      confirmLabel: t('sabbathSchool.finalMinutesConfirm'),
      cancelLabel: t('sabbathSchool.cancel'),
      danger: true,
    })
    if (!confirmed) return
  }
  store.toggleFinalMinutes()
}

const SCHEDULE_MODES: { value: SabbathScheduleConfig['scheduleMode']; label: string; icon: string; hint?: string }[] = [
  { value: 'duration', label: 'sabbathSchool.scheduleModeDuration', icon: 'ti-hourglass' },
  { value: 'endOnly', label: 'sabbathSchool.scheduleModeEndTime', icon: 'ti-clock' },
  { value: 'video', label: 'sabbathSchool.scheduleModeVideo', icon: 'ti-movie', hint: 'sabbathSchool.scheduleModeVideoHint' },
]

const customVideo = computed(() => store.config.customVideo)
const videoBusy = ref(false)
const videoError = ref<string | null>(null)

const VIDEO_ERRORS: Record<string, string> = {
  invalid_video: 'sabbathSchool.videoInvalid',
  unsupported_format: 'sabbathSchool.videoUnsupported',
  unavailable: 'sabbathSchool.videoDesktopOnly',
}

function formatVideoDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Um vídeo só: trocar apaga o anterior da pasta, por isso confirma. */
async function onPickVideo() {
  if (customVideo.value) {
    const confirmed = await appConfirm({
      title: t('sabbathSchool.videoReplaceConfirmTitle'),
      message: t('sabbathSchool.videoReplaceConfirmMessage'),
      confirmLabel: t('sabbathSchool.videoReplace'),
      cancelLabel: t('sabbathSchool.cancel'),
      danger: true,
    })
    if (!confirmed) return
  }
  videoBusy.value = true
  try {
    const result = await pickAndImportSabbathVideo()
    if (result.ok) {
      videoError.value = null
      store.setCustomVideo(result.video)
      return
    }
    if (result.reason === 'cancelled') return
    // o vídeo que não abre já saiu da pasta junto com o anterior
    if (result.reason === 'invalid_video') store.setCustomVideo(null)
    videoError.value = VIDEO_ERRORS[result.reason] ?? 'sabbathSchool.videoError'
  } finally {
    videoBusy.value = false
  }
}

function goBack() {
  router.push({ name: 'utilities' })
}

function patchSchedule(patch: Partial<SabbathScheduleConfig>) {
  store.setSchedule({ ...schedule.value, ...patch })
}

function updateDurationMs(ms: number) { patchSchedule({ durationMs: ms }) }
function updateEndTimeMs(ms: number) { patchSchedule({ endTime: msToTime(ms) }) }

function onDocumentClick() {
  schedulePanelOpen.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') schedulePanelOpen.value = false
}

// Popup fechado pelo X da janela: o main avisa e o estado de projeção é ressincronizado.
let unsubPopupsClosed: (() => void) | null = null
onMounted(() => {
  store.refreshIdle()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  const bridge = (window as unknown as {
    louvorja?: { projection?: { onPopupsClosed?: (cb: () => void) => () => void } }
  }).louvorja
  unsubPopupsClosed = bridge?.projection?.onPopupsClosed?.(() => store.refreshProjectionState()) ?? null
})
onUnmounted(() => {
  stopProgressTimer()
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
  unsubPopupsClosed?.()
  unsubPopupsClosed = null
})

const { stage, effectiveConfig } = useCountdownStage(() => appearance.config)

const stageBg = computed(() => ({
  backgroundColor: stageBgCss(stage.value.backgroundColor),
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))
</script>

<template>
  <section class="sabbath-school-view">
    <header class="sabbath-school-view__header">
      <PageBackStack @minimize="minimize" @prepare="prepare">
        <button
          type="button"
          class="sabbath-school-view__back"
          :aria-label="t('sabbathSchool.backToUtilities')"
          @click="goBack"
        >
          <i
            class="ti ti-arrow-left"
            aria-hidden="true"
          />
        </button>
      </PageBackStack>

      <div class="sabbath-school-view__brand">
        <div class="sabbath-school-view__brand-icon">
          <i
            class="ti ti-book-2"
            aria-hidden="true"
          />
        </div>
        <h1 class="sabbath-school-view__title">
          {{ t('sabbathSchool.title') }}
        </h1>
      </div>
    </header>

    <div class="sabbath-school-view__content">
      <GlassCard
        class="sabbath-school-view__widget"
        :padding="false"
      >
        <div class="sabbath-school-view__toolbar">
          <div class="sabbath-school-view__tool-group">
            <button
              type="button"
              class="sabbath-school-view__tool-btn"
              :aria-label="t('sabbathSchool.settings')"
              :title="t('sabbathSchool.settings')"
              data-testid="sabbath-settings"
              @click="settingsOpen = true"
            >
              <i
                class="ti ti-settings"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="sabbath-school-view__tool-btn"
              :aria-label="t('sabbathSchool.personalize')"
              :title="t('sabbathSchool.personalize')"
              @click="personalizeOpen = true"
            >
              <i
                class="ti ti-palette"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="sabbath-school-view__tool-btn"
              :class="{ 'sabbath-school-view__tool-btn--active': schedulePanelOpen }"
              :aria-label="t('sabbathSchool.schedule')"
              :title="t('sabbathSchool.scheduleHint')"
              data-testid="sabbath-schedule-toggle"
              @click.stop="schedulePanelOpen = !schedulePanelOpen"
            >
              <i
                class="ti ti-calendar-clock"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <Transition name="sabbath-popover">
          <div
            v-if="schedulePanelOpen"
            class="sabbath-school-view__popover"
            @click.stop
          >
            <div class="sabbath-school-view__popover-head">
              <i
                class="ti ti-calendar-clock"
                aria-hidden="true"
              />
              <div>
                <h3>{{ t('sabbathSchool.schedule') }}</h3>
                <p>{{ t('sabbathSchool.scheduleHint') }}</p>
              </div>
            </div>
            <div class="sabbath-school-view__audio-lang">
              <label for="sabbath-audio-lang">{{ t('sabbathSchool.audioLang') }}</label>
              <select
                id="sabbath-audio-lang"
                data-testid="sabbath-audio-lang"
                :value="store.config.audioLang"
                @change="store.setAudioLang(($event.target as HTMLSelectElement).value as SabbathAudioLangSetting)"
              >
                <option value="auto">{{ t('sabbathSchool.audioLangAuto') }}</option>
                <option value="pt-BR">Português (BR)</option>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </div>
          </div>
        </Transition>


        <div
          class="sabbath-school-view__preview"
          :style="stageBg"
        >
          <div class="sabbath-school-view__times">
            <div
              class="sabbath-school-view__modes"
              role="radiogroup"
              :aria-label="t('sabbathSchool.schedule')"
            >
              <button
                v-for="mode in SCHEDULE_MODES"
                :key="mode.value"
                type="button"
                role="radio"
                class="sabbath-school-view__mode"
                :class="{ 'sabbath-school-view__mode--active': schedule.scheduleMode === mode.value }"
                :aria-checked="schedule.scheduleMode === mode.value"
                :disabled="store.isRunning"
                :data-testid="`sabbath-mode-${mode.value}`"
                :title="mode.hint ? t(mode.hint) : undefined"
                @click="patchSchedule({ scheduleMode: mode.value })"
              >
                <i
                  :class="['ti', mode.icon]"
                  aria-hidden="true"
                />
                {{ t(mode.label) }}
              </button>
            </div>
            <div
              v-if="schedule.scheduleMode === 'duration'"
              class="sabbath-school-view__time-field"
            >
              <CountdownDurationInput
                :duration-ms="schedule.durationMs"
                :disabled="store.isRunning"
                compact
                no-seconds
                @update:duration-ms="updateDurationMs"
              />
            </div>
            <div
              v-else-if="schedule.scheduleMode === 'video'"
              class="sabbath-school-view__time-field"
            >
              <div
                class="sabbath-school-view__video"
                data-testid="sabbath-video-field"
              >
                <template v-if="customVideo">
                  <i
                    class="ti ti-movie"
                    aria-hidden="true"
                  />
                  <span
                    class="sabbath-school-view__video-name"
                    :title="customVideo.name"
                  >{{ customVideo.name }}</span>
                  <span class="sabbath-school-view__video-duration">{{ formatVideoDuration(customVideo.durationMs) }}</span>
                </template>
                <span
                  v-else
                  class="sabbath-school-view__video-empty"
                >{{ t('sabbathSchool.videoEmpty') }}</span>
                <button
                  type="button"
                  class="sabbath-school-view__video-pick"
                  data-testid="sabbath-video-pick"
                  :disabled="!store.isIdle || videoBusy"
                  @click="onPickVideo"
                >
                  <i
                    :class="['ti', customVideo ? 'ti-replace' : 'ti-upload']"
                    aria-hidden="true"
                  />
                  {{ customVideo ? t('sabbathSchool.videoReplace') : t('sabbathSchool.videoChoose') }}
                </button>
              </div>
              <p
                v-if="videoError"
                class="sabbath-school-view__video-error"
                role="alert"
                data-testid="sabbath-video-error"
              >
                {{ t(videoError) }}
              </p>
            </div>
            <div
              v-else
              class="sabbath-school-view__time-field"
            >
              <CountdownDurationInput
                :duration-ms="timeToMs(schedule.endTime)"
                :disabled="store.isRunning"
                compact
                no-seconds
                @update:duration-ms="updateEndTimeMs"
              />
            </div>
          </div>
        </div>

        <div
          v-if="isVideoMode"
          class="sabbath-school-view__video-player"
          data-testid="sabbath-video-player"
        >
          <button
            type="button"
            class="sabbath-school-view__player-btn sabbath-school-view__player-btn--main"
            data-testid="sabbath-video-play"
            :aria-label="store.isRunning ? t('sabbathSchool.videoPause') : t('sabbathSchool.videoPlay')"
            :title="store.isRunning ? t('sabbathSchool.videoPause') : t('sabbathSchool.videoPlay')"
            :disabled="!store.isRunning && !store.canStart()"
            @click="toggleVideoPlayback"
          >
            <i
              :class="['ti', store.isRunning ? 'ti-player-pause' : 'ti-player-play']"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="sabbath-school-view__player-btn"
            data-testid="sabbath-stop"
            :aria-label="t('sabbathSchool.stop')"
            :title="t('sabbathSchool.stop')"
            :disabled="store.isIdle"
            @click="store.stop()"
          >
            <i
              class="ti ti-player-stop"
              aria-hidden="true"
            />
          </button>
          <span class="sabbath-school-view__player-time">{{ formatVideoDuration(videoElapsedMs) }}</span>
          <input
            type="range"
            class="sabbath-school-view__player-progress"
            data-testid="sabbath-video-progress"
            min="0"
            :max="store.runtime.durationMs"
            step="100"
            :value="videoElapsedMs"
            :disabled="store.isIdle"
            :aria-label="t('sabbathSchool.videoProgress')"
            @input="store.seekVideo(Number(($event.target as HTMLInputElement).value))"
          >
          <span class="sabbath-school-view__player-time">{{ formatVideoDuration(store.runtime.durationMs) }}</span>
          <button
            type="button"
            class="sabbath-school-view__audio-btn"
            :class="{ 'sabbath-school-view__audio-btn--muted': store.videoMuted }"
            data-testid="sabbath-video-mute"
            :aria-label="store.videoMuted ? t('sabbathSchool.unmuteAudio') : t('sabbathSchool.muteAudio')"
            :title="store.videoMuted ? t('sabbathSchool.unmuteAudio') : t('sabbathSchool.muteAudio')"
            @click="store.setVideoMuted(!store.videoMuted)"
          >
            <i
              :class="store.videoMuted ? 'ti ti-volume-off' : 'ti ti-volume'"
              aria-hidden="true"
            />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="sabbath-school-view__audio-volume"
            data-testid="sabbath-video-volume"
            :value="store.videoVolume"
            :aria-label="t('sabbathSchool.videoVolume')"
            @input="store.setVideoVolume(Number(($event.target as HTMLInputElement).value))"
          >
        </div>
        <div
          v-else
          class="sabbath-school-view__adjust"
        >
          <button
            type="button"
            class="sabbath-school-view__ctrl"
            :aria-label="t('sabbathSchool.addMinute')"
            :disabled="adjustLocked"
            @click="store.adjustTime(60_000)"
          >
            <i
              class="ti ti-plus"
              aria-hidden="true"
            /> 1 min
          </button>
          <button
            type="button"
            class="sabbath-school-view__ctrl"
            :aria-label="t('sabbathSchool.addFiveMinutes')"
            :disabled="adjustLocked"
            @click="store.adjustTime(300_000)"
          >
            <i
              class="ti ti-plus"
              aria-hidden="true"
            /> 5 min
          </button>
          <button
            type="button"
            class="sabbath-school-view__ctrl"
            :aria-label="t('sabbathSchool.subMinute')"
            :disabled="adjustLocked"
            @click="store.adjustTime(-60_000)"
          >
            <i
              class="ti ti-minus"
              aria-hidden="true"
            /> 1 min
          </button>
          <button
            type="button"
            class="sabbath-school-view__ctrl"
            :aria-label="t('sabbathSchool.subFiveMinutes')"
            :disabled="adjustLocked"
            @click="store.adjustTime(-300_000)"
          >
            <i
              class="ti ti-minus"
              aria-hidden="true"
            /> 5 min
          </button>
          <button
            type="button"
            class="sabbath-school-view__ctrl sabbath-school-view__ctrl--stop"
            data-testid="sabbath-stop"
            :disabled="store.isIdle"
            @click="store.stop()"
          >
            <i
              class="ti ti-player-stop"
              aria-hidden="true"
            /> {{ t('sabbathSchool.stop') }}
          </button>
        </div>

        <div
          v-if="store.isProjecting"
          class="sabbath-school-view__projecting"
        >
          <i
            class="ti ti-device-desktop"
            aria-hidden="true"
          />
          {{ t('sabbathSchool.projecting') }}
        </div>

        <!-- controles de áudio do operador (o motor de alertas roda na janela principal) -->
        <div
          v-if="!isVideoMode"
          class="sabbath-school-view__audio-controls"
          data-testid="operator-audio-controls"
        >
          <button
            type="button"
            class="sabbath-school-view__audio-btn"
            :class="{ 'sabbath-school-view__audio-btn--muted': store.audioMuted }"
            :aria-label="store.audioMuted ? t('sabbathSchool.unmuteAudio') : t('sabbathSchool.muteAudio')"
            :title="store.audioMuted ? t('sabbathSchool.unmuteAudio') : t('sabbathSchool.muteAudio')"
            @click="store.setAudioMuted(!store.audioMuted)"
          >
            <i
              :class="store.audioMuted ? 'ti ti-volume-off' : 'ti ti-volume'"
              aria-hidden="true"
            />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="sabbath-school-view__audio-volume"
            :value="store.audioVolume"
            :aria-label="t('sabbathSchool.audioVolume')"
            @input="store.setAudioVolume(Number(($event.target as HTMLInputElement).value))"
          >
          <div
            class="sabbath-school-view__manual-player"
            role="group"
            :aria-label="t('sabbathSchool.manualPlayer')"
            data-testid="sabbath-manual-player"
          >
            <span class="sabbath-school-view__manual-player-label">{{ t('sabbathSchool.manualPlayer') }}</span>
            <button
              type="button"
              class="sabbath-school-view__rehearse"
              :class="{ 'sabbath-school-view__rehearse--active': openingPlaying }"
              :disabled="!store.hasOpening || (store.audioMuted && !openingPlaying)"
              :title="openingPlaying ? t('sabbathSchool.pauseOpening') : t('sabbathSchool.playOpeningHint')"
              :aria-pressed="openingPlaying"
              data-testid="sabbath-play-opening"
              @click="store.toggleOpening()"
            >
              <i
                :class="['ti', openingPlaying ? 'ti-player-pause' : 'ti-player-play']"
                aria-hidden="true"
              />
              {{ t('sabbathSchool.playOpening') }}
            </button>
            <button
              type="button"
              class="sabbath-school-view__rehearse"
              :class="{ 'sabbath-school-view__rehearse--active': finalMinutesPlaying }"
              :title="finalMinutesPlaying ? t('sabbathSchool.pauseFinalMinutes') : t('sabbathSchool.rehearseFinalMinutesHint')"
              :aria-pressed="finalMinutesPlaying"
              data-testid="rehearse-final-minutes"
              @click="onFinalMinutes"
            >
              <i
                :class="['ti', finalMinutesPlaying ? 'ti-player-pause' : 'ti-hourglass-low']"
                aria-hidden="true"
              />
              {{ t('sabbathSchool.rehearseFinalMinutes') }}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>

    <SabbathSchoolConfigDialog
      :open="settingsOpen"
      :config="effectiveConfig"
      @close="settingsOpen = false"
      @update:time-format="appearance.setTimeFormat"
      @update:bg-color="appearance.setBgColor"
      @update:text-color="appearance.setTextColor"
      @update:allow-negative="appearance.setAllowNegative"
      @reset="appearance.resetDisplayToDefault"
    />

    <StageCustomizationDialog
      :open="personalizeOpen"
      scope="countdown"
      @close="personalizeOpen = false"
    />
  </section>
</template>

<style scoped lang="scss">
.sabbath-school-view {
  display: flex;
  min-height: calc(
    (100 * var(--ui-vh)) - var(--ds-header-height, 5.5rem) - var(--ds-dock-height, 5.5rem)
  );
  flex-direction: column;
  padding: var(--ds-spacing-page, 1.5rem);
  padding-bottom: calc(var(--ds-dock-height, 5.5rem) + 5rem);
}

.sabbath-school-view__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.sabbath-school-view__back {
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

.sabbath-school-view__brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.sabbath-school-view__brand-icon {
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

.sabbath-school-view__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}

.sabbath-school-view__content {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.sabbath-school-view__widget {
  position: relative;
  display: flex;
  width: 100%;
  max-width: 56rem;
  flex-direction: column;
  padding-bottom: 1rem;
}

.sabbath-school-view__toolbar {
  position: absolute;
  inset: 1rem 1rem auto;
  z-index: 2;
  display: flex;
  pointer-events: none;
}

.sabbath-school-view__tool-group {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  pointer-events: auto;
}

.sabbath-school-view__tool-btn {
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
  transition:
    transform 160ms ease,
    background-color 160ms ease;

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  &--active {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #131313);
  }

  .ti {
    font-size: 1.1rem;
  }
}

.sabbath-school-view__popover {
  position: absolute;
  top: 3.5rem;
  left: 1rem;
  z-index: 10;
  min-width: min(20rem, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: 1rem;
  background: var(--ds-color-surface-elevated, var(--ds-color-surface));
  box-shadow: 0 8px 32px rgb(0 0 0 / 25%);
  animation: sabbath-popover-in 160ms ease;
}

@keyframes sabbath-popover-in {
  from { opacity: 0; transform: translateY(-0.5rem); }
  to { opacity: 1; transform: translateY(0); }
}

.sabbath-popover-leave-active {
  animation: sabbath-popover-out 140ms ease forwards;
}

@keyframes sabbath-popover-out {
  to { opacity: 0; transform: translateY(-0.5rem); }
}

.sabbath-school-view__popover-head {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.75rem;

  i {
    margin-top: 0.15rem;
    color: var(--ds-color-primary);
    font-size: 1.25rem;
  }

  h3 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 0.9rem;
    font-weight: 600;
  }

  p {
    margin: 0.15rem 0 0;
    color: var(--ds-color-on-surface-muted, var(--ds-color-on-surface));
    font-size: 0.75rem;
  }
}

.sabbath-school-view__audio-lang {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;

  label {
    font-size: 0.75rem;
    opacity: 0.8;
  }

  select {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid rgb(var(--v-theme-border));
    border-radius: 8px;
    background: rgb(var(--v-theme-surface));
    color: inherit;
    font-size: 0.85rem;
  }
}


.sabbath-school-view__preview {
  position: relative;
  overflow: hidden;
  padding: 3.75rem 1.5rem 1rem;
  border-radius: 0.75rem;
}

.sabbath-school-view__times {
  display: flex;
  flex-direction: column;
  width: fit-content;
  align-items: center;
  gap: 0.6rem;
  margin: 0.5rem auto 0;
}

.sabbath-school-view__modes {
  display: inline-flex;
  padding: 0.2rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
}

.sabbath-school-view__mode {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.9rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ds-color-on-surface);
  font-size: 0.8rem;
  font-weight: 600;
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.85);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover:not(:disabled):not(.sabbath-school-view__mode--active) {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.sabbath-school-view__mode--active {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  text-shadow: none;
}

.sabbath-school-view__time-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.sabbath-school-view__video {
  display: inline-flex;
  max-width: min(32rem, 100%);
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.5rem 0.45rem 0.9rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: var(--ds-color-on-surface);
  font-size: 0.9rem;

  > .ti {
    color: var(--ds-color-primary);
    font-size: 1.15rem;
  }
}

.sabbath-school-view__video-name {
  overflow: hidden;
  min-width: 0;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sabbath-school-view__video-duration {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.sabbath-school-view__video-empty {
  opacity: 0.8;
}

.sabbath-school-view__video-pick {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.85rem;
  border: 0;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.sabbath-school-view__video-error {
  margin: 0;
  color: var(--ds-color-error, #ff5252);
  font-size: 0.8rem;
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.85);
}

.sabbath-school-view__video-player {
  display: flex;
  width: min(44rem, calc(100% - 2rem));
  align-items: center;
  gap: 0.6rem;
  margin: 0.75rem auto 0;
  padding: 0.4rem 0.9rem 0.4rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
}

.sabbath-school-view__player-btn {
  display: inline-flex;
  width: 2.1rem;
  height: 2.1rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 1.05rem;
  cursor: pointer;

  &--main {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.sabbath-school-view__player-time {
  flex-shrink: 0;
  min-width: 2.6rem;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
  opacity: 0.85;
}

.sabbath-school-view__player-progress {
  flex: 1;
  min-width: 0;
  accent-color: var(--ds-color-primary);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.sabbath-school-view__adjust {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.sabbath-school-view__ctrl {
  display: inline-flex;
  height: 2rem;
  min-width: 5.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0 0.95rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &--stop {
    background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
    color: var(--ds-color-on-surface);
  }
}

.sabbath-school-view__projecting {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.35rem auto 0;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;

  .ti {
    font-size: 0.95rem;
  }
}

.sabbath-school-view__audio-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.sabbath-school-view__audio-btn {
  display: inline-flex;
  flex-shrink: 0;
  width: 1.9rem;
  height: 1.9rem;
  align-items: center;
  justify-content: center;
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
}

.sabbath-school-view__audio-volume {
  width: 5.5rem;
  flex-shrink: 0;
  accent-color: var(--ds-color-primary);
}

.sabbath-school-view__rehearse {
  display: inline-flex;
  height: 1.9rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0 0.75rem;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 0.8rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.sabbath-school-view__rehearse--active {
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  color: var(--ds-color-primary);
}

.sabbath-school-view__manual-player {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.25rem 0.2rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: 999px;
}

.sabbath-school-view__manual-player-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
}

@media (max-width: 1280px) {
  .sabbath-school-view {
    padding: 1rem;
    padding-bottom: calc(var(--ds-dock-height, 5.5rem) + 3.5rem);
  }

  .sabbath-school-view__header {
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .sabbath-school-view__title {
    font-size: 1.15rem;
  }
}
</style>
