import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useCountdownProjectionControl } from '@modules/countdown/composables/useCountdownProjectionControl'
import { computeCountdownRemainingMs, computeElapsedMs } from '@modules/countdown/services/countdown-format'
import { loadCountdownDisplayConfig } from '@modules/countdown/services/countdown-preferences'
import { DEFAULT_COUNTDOWN_RUNTIME, type CountdownRuntimeState } from '@modules/countdown/types/countdown'

import { clearAlertQueue, getPresetDurationMs, stopAllAlerts, type AlertPresetKey, type SabbathAudioLangSetting } from '../services/alert-tone'
import {
  readAudioPreferences,
  readVideoAudioPreferences,
  saveAudioPreferences,
  saveVideoAudioPreferences,
} from '../services/audio-preferences'
import { sabbathDurationMs } from '../services/sabbath-schedule'
import { loadSabbathSchoolConfig, saveSabbathSchoolConfig } from '../services/sabbath-school-preferences'
import type {
  AlertMarker,
  AlertMarkerPreset,
  SabbathCustomVideo,
  SabbathSchoolConfig,
  SabbathScheduleConfig,
} from '../types/sabbath-school'

export const SABBATH_SCHOOL_ROUTE = 'utilities-sabbath-school'

/** Últimos 5 min: começa no aviso de 5 minutos, que toca na hora. */
const REHEARSAL_DURATION_MS = 300_000
/** Som próprio: duração desconhecida sem carregar, estimativa conservadora. */
const CUSTOM_TONE_ESTIMATE_MS = 60_000

type RuntimeVideo = Pick<CountdownRuntimeState, 'videoPath' | 'videoVolume'>

function idleRuntime(durationMs: number, video?: RuntimeVideo): CountdownRuntimeState {
  return {
    ...DEFAULT_COUNTDOWN_RUNTIME,
    savedTimesMs: [],
    durationMs: Math.max(0, Math.floor(durationMs)),
    ...video,
  }
}

/** Contagem própria da Escola Sabatina; não depende do estado do Timer. */
export const useSabbathSchoolStore = defineStore('sabbathSchool', () => {
  const config = ref<SabbathSchoolConfig>(loadSabbathSchoolConfig())
  // disparos da execução atual: pausar/retomar não repete alerta já tocado
  const firedMarkers = new Set<string>()
  const savedAudio = readAudioPreferences()
  const audioMuted = ref(savedAudio.muted)
  const audioVolume = ref(savedAudio.volume)
  const savedVideoAudio = readVideoAudioPreferences()
  const videoMuted = ref(savedVideoAudio.muted)
  const videoVolume = ref(savedVideoAudio.volume)
  const rehearsing = ref(false)
  // play/pausa da abertura: o motor (janela principal) atende e informa o estado
  const openingToggles = ref(0)
  const openingPlayback = ref<'stopped' | 'playing' | 'paused'>('stopped')
  const runtime = ref<CountdownRuntimeState>(idleRuntime(idleDurationMs(), activeVideo()))
  const projection = useCountdownProjectionControl('sabbath-school', () => runtime.value)
  const { isProjecting, inAppPreview } = projection
  let finishWatchTimer: ReturnType<typeof setInterval> | null = null

  const isRunning = computed(() => runtime.value.status === 'running')
  const isIdle = computed(() => runtime.value.status === 'idle')

  /** Soma dos áudios habilitados, para que todos toquem na íntegra. */
  const minDurationMs = computed(() =>
    config.value.alertMarkers.reduce((total, marker) => {
      if (marker.preset === 'none') return total
      if (marker.preset.startsWith('custom:') || marker.preset === 'legacy-custom') return total + CUSTOM_TONE_ESTIMATE_MS
      return total + getPresetDurationMs(marker.preset as AlertPresetKey)
    }, 0),
  )

  const hasOpening = computed(() =>
    config.value.alertMarkers.some((m) => m.offsetMs === 0 && m.preset !== 'none'),
  )

  function toggleOpening() {
    if (hasOpening.value) openingToggles.value += 1
  }

  function isVideoMode(): boolean {
    return config.value.schedule.scheduleMode === 'video'
  }

  function effectiveVideoVolume(): number {
    return videoMuted.value ? 0 : videoVolume.value
  }

  /** Vídeo personalizado em uso: só no modo vídeo e com um vídeo escolhido. */
  function activeVideo(): RuntimeVideo | undefined {
    const videoPath = isVideoMode() ? config.value.customVideo?.relativePath : undefined
    return videoPath ? { videoPath, videoVolume: effectiveVideoVolume() } : undefined
  }

  /** Modo vídeo: a duração do vídeo; senão, a que a agenda dá agora. */
  function plannedDurationMs(): number | null {
    if (isVideoMode()) return config.value.customVideo?.durationMs ?? null
    return sabbathDurationMs(config.value.schedule)
  }

  function idleDurationMs(): number {
    return plannedDurationMs() ?? 0
  }

  /** O vídeo traz o próprio áudio: os avisos não tocam, então não há mínimo. */
  function canStart(): boolean {
    if (isRunning.value) return false
    const durationMs = plannedDurationMs()
    if (durationMs == null || durationMs <= 0) return false
    return isVideoMode() || durationMs >= minDurationMs.value
  }

  function persistConfig() {
    saveSabbathSchoolConfig(config.value)
  }

  function syncRuntime() {
    projection.publish()
  }

  function stopFinishWatch() {
    if (!finishWatchTimer) return
    clearInterval(finishWatchTimer)
    finishWatchTimer = null
  }

  function checkFinished() {
    if (runtime.value.status !== 'running' || runtime.value.finished) return
    if (computeCountdownRemainingMs(runtime.value, Date.now()) > 0) return
    // o vídeo acabou: não há o que continuar mostrando além do zero
    const allowNegative = !runtime.value.videoPath && loadCountdownDisplayConfig().allowNegative !== false
    runtime.value = {
      ...runtime.value,
      finished: true,
      ...(allowNegative ? {} : {
        status: 'paused' as const,
        accumulatedMs: runtime.value.durationMs,
        segmentStartedAt: null,
        pausedRemainingMs: 0,
      }),
    }
    if (!allowNegative) stopFinishWatch()
    syncRuntime()
  }

  function startFinishWatch() {
    stopFinishWatch()
    finishWatchTimer = setInterval(checkFinished, 50)
  }

  /** Com a contagem parada, mostra a duração que a agenda dá agora. */
  function refreshIdle() {
    if (!isIdle.value) return
    runtime.value = idleRuntime(idleDurationMs(), activeVideo())
    syncRuntime()
  }

  function stopAudio() {
    firedMarkers.clear()
    clearAlertQueue()
    stopAllAlerts()
  }

  function startFixed(durationMs: number, video?: RuntimeVideo) {
    runtime.value = {
      ...idleRuntime(durationMs, video),
      segmentStartedAt: Date.now(),
      status: 'running',
    }
    syncRuntime()
    startFinishWatch()
  }

  /** Continua de onde pausou. */
  function resume() {
    runtime.value = { ...runtime.value, status: 'running', segmentStartedAt: Date.now() }
    syncRuntime()
    startFinishWatch()
  }

  /**
   * Pausada, ensaio, "Duração" e vídeo retomam de onde pararam; "Hora do
   * término" recalcula pelo horário, que não muda com a pausa.
   */
  function start() {
    if (isRunning.value) return
    const resumable = rehearsing.value || config.value.schedule.scheduleMode !== 'endOnly'
    if (resumable && runtime.value.status === 'paused' && !runtime.value.finished) {
      resume()
      return
    }
    const durationMs = plannedDurationMs()
    if (durationMs == null || !canStart()) return
    // depois de um ensaio, a contagem real toca todos os avisos de novo
    if (rehearsing.value) {
      rehearsing.value = false
      firedMarkers.clear()
    }
    startFixed(durationMs, activeVideo())
  }

  function pause() {
    if (!isRunning.value || runtime.value.segmentStartedAt == null) return
    runtime.value = {
      ...runtime.value,
      status: 'paused',
      segmentStartedAt: null,
      accumulatedMs: computeElapsedMs(runtime.value.accumulatedMs, runtime.value.segmentStartedAt, 'running', Date.now()),
    }
    stopFinishWatch()
    syncRuntime()
  }

  /** Para a contagem e os áudios; volta a mostrar a duração da agenda. */
  function stop() {
    stopFinishWatch()
    rehearsing.value = false
    stopAudio()
    runtime.value = idleRuntime(idleDurationMs(), activeVideo())
    syncRuntime()
  }

  /** Ajuste fino com a contagem em andamento; nunca abaixo de zero. O vídeo tem duração própria. */
  function adjustTime(deltaMs: number) {
    if (isIdle.value || runtime.value.videoPath) return
    const durationMs = Math.max(0, runtime.value.durationMs + Math.floor(deltaMs))
    runtime.value = { ...runtime.value, durationMs, finished: false }
    syncRuntime()
    if (isRunning.value) startFinishWatch()
  }

  /** Barra de andamento do vídeo: pula para o ponto escolhido sem mudar o play/pausa. */
  function seekVideo(elapsedMs: number) {
    if (isIdle.value || !runtime.value.videoPath) return
    const accumulatedMs = Math.min(runtime.value.durationMs, Math.max(0, Math.floor(elapsedMs)))
    runtime.value = {
      ...runtime.value,
      accumulatedMs,
      segmentStartedAt: isRunning.value ? Date.now() : null,
      finished: false,
    }
    syncRuntime()
    if (isRunning.value) startFinishWatch()
  }

  /** Últimos 5 min: 5:00 sem abertura, substituindo qualquer contagem em curso. */
  function rehearse() {
    if (isIdle.value) stopAudio()
    else stop()
    const startMarker = config.value.alertMarkers.find((m) => m.offsetMs === 0)
    if (startMarker) firedMarkers.add(startMarker.id)
    rehearsing.value = true
    startFixed(REHEARSAL_DURATION_MS)
  }

  /** Botão dos últimos 5 min: pausa e retoma o próprio ensaio; senão começa um. */
  function toggleFinalMinutes() {
    if (rehearsing.value && isRunning.value) {
      pause()
      return
    }
    if (rehearsing.value && runtime.value.status === 'paused' && !runtime.value.finished) {
      resume()
      return
    }
    rehearse()
  }

  function setSchedule(schedule: SabbathScheduleConfig) {
    config.value = { ...config.value, schedule }
    persistConfig()
    refreshIdle()
  }

  function setCustomVideo(customVideo: SabbathCustomVideo | null) {
    config.value = { ...config.value, customVideo }
    persistConfig()
    refreshIdle()
  }

  function setAudioLang(audioLang: SabbathAudioLangSetting) {
    config.value = { ...config.value, audioLang }
    persistConfig()
  }

  function setAlertMarkers(alertMarkers: AlertMarker[]) {
    config.value = { ...config.value, alertMarkers }
    persistConfig()
  }

  /** Offset já usado por outro marco? (a tela bloqueia colisão de disparo duplo) */
  function isOffsetTaken(offsetMs: number, exceptId?: string): boolean {
    return config.value.alertMarkers.some((m) => m.offsetMs === offsetMs && m.id !== exceptId)
  }

  function addAlertMarker(offsetMs: number, preset: AlertMarkerPreset = 'beep'): AlertMarker | null {
    if (offsetMs < 0 || isOffsetTaken(offsetMs)) return null
    const marker: AlertMarker = {
      id: `marker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      offsetMs,
      preset,
    }
    setAlertMarkers([...config.value.alertMarkers, marker])
    return marker
  }

  function updateAlertMarker(id: string, patch: Partial<Omit<AlertMarker, 'id'>>): boolean {
    const current = config.value.alertMarkers
    if (!current.some((m) => m.id === id)) return false
    if (patch.offsetMs != null && (patch.offsetMs < 0 || isOffsetTaken(patch.offsetMs, id))) return false
    setAlertMarkers(current.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    return true
  }

  function removeAlertMarker(id: string): boolean {
    const current = config.value.alertMarkers
    if (!current.some((m) => m.id === id)) return false
    setAlertMarkers(current.filter((m) => m.id !== id))
    return true
  }

  function setAudioMuted(muted: boolean) {
    audioMuted.value = muted
    saveAudioPreferences({ muted: audioMuted.value, volume: audioVolume.value })
  }

  function applyVideoAudio() {
    saveVideoAudioPreferences({ muted: videoMuted.value, volume: videoVolume.value })
    if (!runtime.value.videoPath) return
    runtime.value = { ...runtime.value, videoVolume: effectiveVideoVolume() }
    syncRuntime()
  }

  function setVideoMuted(muted: boolean) {
    videoMuted.value = muted
    applyVideoAudio()
  }

  function setVideoVolume(volume: number) {
    videoVolume.value = Math.min(1, Math.max(0, volume))
    applyVideoAudio()
  }

  function setAudioVolume(volume: number) {
    audioVolume.value = Math.min(1, Math.max(0, volume))
    saveAudioPreferences({ muted: audioMuted.value, volume: audioVolume.value })
  }

  return {
    config,
    runtime,
    firedMarkers,
    audioMuted,
    audioVolume,
    videoMuted,
    videoVolume,
    rehearsing,
    openingToggles,
    openingPlayback,
    hasOpening,
    toggleOpening,
    isRunning,
    isIdle,
    isProjecting,
    inAppPreview,
    minDurationMs,
    canStart,
    refreshIdle,
    start,
    pause,
    stop,
    adjustTime,
    seekVideo,
    rehearse,
    toggleFinalMinutes,
    stopAudio,
    setSchedule,
    setCustomVideo,
    setAudioLang,
    setAlertMarkers,
    isOffsetTaken,
    addAlertMarker,
    updateAlertMarker,
    removeAlertMarker,
    setAudioMuted,
    setAudioVolume,
    setVideoMuted,
    setVideoVolume,
    toggleProjection: projection.toggleProjection,
    syncProjection: projection.syncProjection,
    clearProjection: projection.clearProjection,
    refreshProjectionState: projection.refreshProjectionState,
  }
})
