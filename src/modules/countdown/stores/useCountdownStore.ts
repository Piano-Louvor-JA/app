import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  closeProjectionModule,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'

import {
  computeElapsedMs,
  computeRemainingMs,
  formatElapsedMs,
} from '../services/countdown-format'
import {
  getPresetDurationMs,
  loadCustomTones,
  pauseAllAlerts,
  resumeAllAlerts,
  stopAllAlerts,
  LEGACY_CUSTOM_TONES_KEY,
  type AlertPresetKey,
} from '../services/alert-tone'
import { migrateLegacyCustomTones } from '../services/alert-tone-library'
import {
  publishAudioControl,
  readAudioControl,
  subscribeAudioControl,
} from '../services/audio-control'
import {
  loadCountdownDisplayConfig,
  saveCountdownDisplayConfig,
} from '../services/countdown-preferences'
import {
  publishCountdownRuntime,
  readCountdownRuntimeFromStorage,
} from '../services/countdown-runtime'
import {
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
  DEFAULT_ALERT_MARKERS,
  type AlertMarker,
  type AlertMarkerPreset,
  type CountdownDisplayConfig,
  type CountdownMode,
  type CountdownRuntimeState,
  type CountdownTimeFormat,
  type SabbathModeConfig,
} from '../types/countdown'

export const useCountdownStore = defineStore('countdown', () => {
  const config = ref<CountdownDisplayConfig>({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
  // F3 (web#175): disparos da execução ATUAL vivem no store — a janela de
  // projeção remonta o composable a cada open e NÃO pode repetir alerta.
  const firedMarkers = new Set<string>()
  // F2 (web#175): controles de áudio do OPERADOR sincronizados com a janela
  // de projeção via BroadcastChannel (janelas têm Pinias separadas).
  const audioMuted = ref(false)
  const audioVolume = ref(1)
  const audioStopTick = ref(0)
  const audioPaused = ref(false)
  let audioUnsubscribe: (() => void) | null = null

  function applyAudioControl(control: {
    muted: boolean
    volume: number
    stopTick: number
    paused: boolean
  }) {
    const stopChanged = control.stopTick !== audioStopTick.value
    const pauseChanged = control.paused !== audioPaused.value
    audioMuted.value = control.muted
    audioVolume.value = control.volume
    audioStopTick.value = control.stopTick
    audioPaused.value = control.paused
    if (stopChanged) stopAllAlerts()
    if (pauseChanged) {
      if (control.paused) pauseAllAlerts()
      else resumeAllAlerts()
    }
  }

  function startAudioControlSync() {
    if (audioUnsubscribe) return
    const current = readAudioControl()
    audioMuted.value = current.muted
    audioVolume.value = current.volume
    audioStopTick.value = current.stopTick
    audioPaused.value = current.paused
    audioUnsubscribe = subscribeAudioControl(applyAudioControl)
  }

  function publishAudio() {
    publishAudioControl({
      muted: audioMuted.value,
      volume: audioVolume.value,
      stopTick: audioStopTick.value,
      paused: audioPaused.value,
    })
  }

  function setAudioPaused(paused: boolean) {
    audioPaused.value = paused
    // Operador pausou/retomou na tela principal: aplica localmente e
    // sincroniza com a janela de projeção via canal.
    if (paused) pauseAllAlerts()
    else resumeAllAlerts()
    publishAudio()
  }

  const runtime = ref<CountdownRuntimeState>({
    ...DEFAULT_COUNTDOWN_RUNTIME,
    savedTimesMs: [],
    durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
  })
  const isProjecting = ref(false)
  // app desktop: preview da projeção dentro da janela (InAppProjectionOverlay
  // no AppShell) — alternativa a abrir a popup, mantida do store anterior.
  const inAppPreview = ref(false)
  const configOpen = ref(false)
  const displayConfigOpen = ref(false)
  const hydrated = ref(false)

  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null
  let finishWatchTimer: ReturnType<typeof setInterval> | null = null

  const isRunning = computed(() => runtime.value.status === 'running')
  const isPaused = computed(() => runtime.value.status === 'paused')
  const canStart = computed(
    () =>
      runtime.value.durationMs > 0 &&
      !runtime.value.finished &&
      // não deixa iniciar com menos tempo que a soma dos áudios habilitados (modo ES)
      (config.value.mode !== 'sabbath' || runtime.value.durationMs >= minDurationMs()),
  )

  function stopProjectionWatch() {
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    projectionWatchTimer = setInterval(() => {
      if (!isProjectionModuleOpen('countdown')) {
        // WT-5/WT-6A: 'Só TV' (receiver) não tem janela local — não é 'parado'
        if (isPalcoTvOnlyRoute('countdown')) return
        isProjecting.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function stopFinishWatch() {
    if (!finishWatchTimer) return
    clearInterval(finishWatchTimer)
    finishWatchTimer = null
  }

  function checkFinished() {
      if (runtime.value.status !== 'running' || runtime.value.finished) return

      const remaining = computeRemainingMs(
        runtime.value.durationMs,
        runtime.value.accumulatedMs,
        runtime.value.segmentStartedAt,
        'running',
        Date.now(),
      )

      // Se allowNegative=true, não pausa no zero — continua rodando (tempo negativo)
      if (config.value.allowNegative) return

      if (remaining > 0) return

      const elapsed = computeElapsedMs(
        runtime.value.accumulatedMs,
        runtime.value.segmentStartedAt,
        'running',
        Date.now(),
      )

      runtime.value = {
        ...runtime.value,
        status: 'paused',
        segmentStartedAt: null,
        accumulatedMs: Math.min(elapsed, runtime.value.durationMs),
        finished: true,
      }
      syncRuntime()
      stopFinishWatch()
    }

  function startFinishWatch() {
    stopFinishWatch()
    finishWatchTimer = setInterval(checkFinished, 50)
  }

  function syncRuntime() {
    publishCountdownRuntime(runtime.value)
  }

  function hydrate() {
    if (hydrated.value) return
    config.value = loadCountdownDisplayConfig()
    migrateLegacyOnHydrate()
    startAudioControlSync()
    runtime.value = readCountdownRuntimeFromStorage()
    isProjecting.value = isProjectionModuleOpen('countdown')
    if (isProjecting.value) startProjectionWatch()
    if (runtime.value.status === 'running') startFinishWatch()
    hydrated.value = true
  }

  /**
   * Migração 1x de dados legados (roda no hydrate, depois de load):
   * - 'legacy-custom' nos markers → importa customTones v1 pra library e
   *   aponta o marker pro 'custom:{id}' real.
   * Idempotente: sem 'legacy-custom' e sem customTones, não faz nada.
   */
  function migrateLegacyOnHydrate() {
    let changed = false
    const markers = config.value.alertMarkers
    const hasLegacyPreset = markers?.some((m) => m.preset === 'legacy-custom') ?? false
    const legacyTones = loadCustomTones()
    const hasLegacyTones = Object.keys(legacyTones).length > 0

    if (hasLegacyPreset && hasLegacyTones) {
      const ids = migrateLegacyCustomTones(legacyTones)
      config.value = {
        ...config.value,
        alertMarkers: (markers ?? []).map((m) => {
          if (m.preset !== 'legacy-custom') return m
          const markerKey = m.id as 'start' | '5min' | '1min'
          const toneId = ids[markerKey]
          return toneId ? { ...m, preset: `custom:${toneId}` } : { ...m, preset: 'beep' }
        }),
      }
      changed = true
    } else if (hasLegacyPreset) {
      // sem áudio legado no device: volta pro default
      config.value = {
        ...config.value,
        alertMarkers: (markers ?? []).map((m) =>
          m.preset === 'legacy-custom' ? { ...m, preset: 'beep' } : m,
        ),
      }
      changed = true
    }

    if (hasLegacyTones) {
      // limpa a chave legada (conteúdo já vive na library)
      try {
        localStorage.removeItem(LEGACY_CUSTOM_TONES_KEY)
      } catch {
        // storage indisponível — segue com a chave legada (re-migra inócuo)
      }
      changed = true
    }

    if (changed) persistConfig()
  }

  function persistConfig() {
    saveCountdownDisplayConfig(config.value)
  }

  function setTimeFormat(timeFormat: CountdownTimeFormat) {
    config.value = { ...config.value, timeFormat }
    persistConfig()
  }

  function setBgColor(bgColor: string) {
    config.value = { ...config.value, bgColor }
    persistConfig()
  }

  function setTextColor(textColor: string) {
      config.value = { ...config.value, textColor }
      persistConfig()
    }

    function setAllowNegative(allowNegative: boolean) {
      config.value = { ...config.value, allowNegative }
      persistConfig()
    }

    function setAlertTonePreset(
      marker: keyof NonNullable<CountdownDisplayConfig['alertTonePresets']>,
      preset: AlertPresetKey | 'none',
    ) {
      config.value = {
        ...config.value,
        alertTonePresets: { ...config.value.alertTonePresets, [marker]: preset },
      }
      persistConfig()
    }

    // ── v2: marcos dinâmicos ──────────────────────────────────────────────
    function setAlertMarkers(markers: AlertMarker[]) {
      config.value = { ...config.value, configVersion: 2, alertMarkers: markers }
      persistConfig()
    }

    /** Offset já usado por outro marco? (UI bloqueia colisão de disparo duplo) */
    function isOffsetTaken(offsetMs: number, exceptId?: string): boolean {
      return (config.value.alertMarkers ?? DEFAULT_ALERT_MARKERS).some(
        (m) => m.offsetMs === offsetMs && m.id !== exceptId,
      )
    }

    function addAlertMarker(offsetMs: number, preset: AlertMarkerPreset = 'beep'): AlertMarker | null {
      const current = config.value.alertMarkers ?? DEFAULT_ALERT_MARKERS.map((m) => ({ ...m }))
      if (offsetMs < 0 || isOffsetTaken(offsetMs)) return null
      const marker: AlertMarker = {
        id: `marker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        offsetMs,
        preset,
      }
      setAlertMarkers([...current, marker])
      return marker
    }

    function updateAlertMarker(id: string, patch: Partial<Omit<AlertMarker, 'id'>>): boolean {
      const current = config.value.alertMarkers ?? []
      if (!current.some((m) => m.id === id)) return false
      if (patch.offsetMs != null && (patch.offsetMs < 0 || isOffsetTaken(patch.offsetMs, id))) {
        return false
      }
      setAlertMarkers(current.map((m) => (m.id === id ? { ...m, ...patch } : m)))
      return true
    }

    function removeAlertMarker(id: string): boolean {
      const current = config.value.alertMarkers ?? []
      if (!current.some((m) => m.id === id)) return false
      setAlertMarkers(current.filter((m) => m.id !== id))
      return true
    }

    // ── F2 (web#175): controles de áudio do operador ─────────────────────
    function setAudioMuted(muted: boolean) {
      audioMuted.value = muted
      publishAudio()
    }

    function setAudioVolume(volume: number) {
      audioVolume.value = Math.min(1, Math.max(0, volume))
      publishAudio()
    }

    /** Stop: corta o áudio em execução E arma os marcadores de novo
     *  (o operador decide re-disparar iniciando de novo). */
    function stopAudio() {
      audioStopTick.value += 1
      firedMarkers.clear()
      stopAllAlerts()
      publishAudio()
    }

    function setMode(mode: CountdownMode) {
      if (mode === config.value.mode) return
      if (mode === 'sabbath') {
        config.value = {
          ...config.value,
          mode,
          sabbathConfig: config.value.sabbathConfig ?? { scheduleMode: 'endOnly', endTime: '10:15' },
        }
      } else {
        // volta ao padrão: comportamento como era antes do modo ES
        config.value = { ...config.value, mode, sabbathConfig: undefined }
      }
      persistConfig()
    }

    function setSabbathConfig(sabbathConfig: SabbathModeConfig) {
      config.value = { ...config.value, mode: 'sabbath', sabbathConfig }
      persistConfig()
    }

    /** Adiciona (delta > 0) ou remove (delta < 0) tempo da contagem, em qualquer status.
     *  Remove nunca deixa abaixo de zero. Não reseta a contagem em curso. */
    function adjustTime(deltaMs: number) {
      const next = Math.max(0, runtime.value.durationMs + Math.floor(deltaMs))
      runtime.value = { ...runtime.value, durationMs: next, finished: false }
      syncRuntime()
    }

    function resetDisplayToDefault() {
    config.value = { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG }
    persistConfig()
  }

  function openConfig() {
    configOpen.value = true
  }

  function closeConfig() {
    configOpen.value = false
  }

  function openDisplayConfig() {
    displayConfigOpen.value = true
  }

  function closeDisplayConfig() {
    displayConfigOpen.value = false
  }

  /** Duração mínima permitida: soma dos áudios habilitados, para que todos toquem na íntegra.
   *  Só se aplica em modo Escola Sabatina. */
  function minDurationMs(): number {
    if (config.value.mode !== 'sabbath') return 0
    const markers = config.value.alertMarkers ?? DEFAULT_ALERT_MARKERS
    return markers.reduce((total, marker) => {
      if (marker.preset === 'none') return total
      if (marker.preset.startsWith('custom:')) {
        // data-URL custom: duração desconhecida sem carregar — estimativa conservadora
        return total + 60_000
      }
      return total + getPresetDurationMs(marker.preset as AlertPresetKey)
    }, 0)
  }

  function setDurationMs(durationMs: number) {
    if (runtime.value.status === 'running') return

    const next = Math.max(minDurationMs(), Math.floor(durationMs))
    runtime.value = {
      ...runtime.value,
      durationMs: next,
      accumulatedMs: 0,
      segmentStartedAt: null,
      status: 'idle',
      finished: false,
    }
    syncRuntime()
  }

  function start() {
    if (runtime.value.status === 'running') return

    // Modo Escola Sabatina: runtime é derivado dos horários início/término —
    // NUNCA herda durationMs/acumulado do cronômetro normal.
    if (config.value.mode === 'sabbath' && config.value.sabbathConfig) {
      const sc = config.value.sabbathConfig
      if (!/^\d{2}:\d{2}$/.test(sc.endTime)) return
      const now = new Date()
      const nowCheckMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
      const nowMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000
      const [eh, em] = sc.endTime.split(':').map(Number)
      const endMs = (eh * 3600 + em * 60) * 1000
      // término em outro dia (já passou da meia-noite)? trata como amanhã
      const durationMs = endMs > nowMs ? endMs - nowMs : endMs - nowMs + 24 * 3600 * 1000
      let startAtMs = nowMs
      if (sc.scheduleMode === 'start' && /^\d{2}:\d{2}$/.test(sc.startTime ?? '')) {
        const [sh, sm] = (sc.startTime ?? '').split(':').map(Number)
        startAtMs = (sh * 3600 + sm * 60) * 1000
      }
      const accum = Math.max(0, nowMs - startAtMs)
      runtime.value = {
        ...runtime.value,
        durationMs,
        accumulatedMs: Math.min(accum, durationMs),
        segmentStartedAt: Date.now(),
        status: 'running',
        finished: false,
      }
      syncRuntime()
      startFinishWatch()
      return
    }

    if (runtime.value.durationMs <= 0 || runtime.value.finished) return

    const remaining = computeRemainingMs(
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      null,
      'paused',
      Date.now(),
    )
    if (remaining <= 0) {
      runtime.value = { ...runtime.value, finished: true, status: 'idle' }
      syncRuntime()
      return
    }

    runtime.value = {
      ...runtime.value,
      status: 'running',
      segmentStartedAt: Date.now(),
      finished: false,
    }
    syncRuntime()
    startFinishWatch()
    // F2 (web#175): retomar de pausa RESUME o alerta de onde parou
    // (em start do zero, nada há pra retomar — resume é no-op)
    setAudioPaused(false)
    resumeAllAlerts()
  }

  function pause() {
    if (runtime.value.status !== 'running' || runtime.value.segmentStartedAt == null) {
      return
    }

    const elapsed = computeElapsedMs(
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      'running',
      Date.now(),
    )

    runtime.value = {
      ...runtime.value,
      status: 'paused',
      segmentStartedAt: null,
      accumulatedMs: Math.min(elapsed, runtime.value.durationMs),
    }
    syncRuntime()
    stopFinishWatch()
    // F2 (web#175): pausar o cronômetro PAUSA o alerta em execução
    // (retomável — o start resume de onde parou, sem reiniciar do zero)
    setAudioPaused(true)
    pauseAllAlerts()
  }

  function reset() {
    const keepRunning = runtime.value.status === 'running'

    runtime.value = {
      ...runtime.value,
      status: keepRunning ? 'running' : 'idle',
      segmentStartedAt: keepRunning ? Date.now() : null,
      accumulatedMs: 0,
      finished: false,
    }
    syncRuntime()
    if (keepRunning) startFinishWatch()
    else stopFinishWatch()
  }

  function saveMark() {
    const remaining = computeRemainingMs(
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.status,
      Date.now(),
    )

    runtime.value = {
      ...runtime.value,
      savedTimesMs: [...runtime.value.savedTimesMs, remaining],
    }
    syncRuntime()
  }

  function removeSavedMark(index: number) {
    runtime.value = {
      ...runtime.value,
      savedTimesMs: runtime.value.savedTimesMs.filter((_, i) => i !== index),
    }
    syncRuntime()
  }

  function clearSavedMarks() {
    runtime.value = {
      ...runtime.value,
      savedTimesMs: [],
    }
    syncRuntime()
  }

  async function syncProjection() {
    syncRuntime()
    const opened = await openProjectionModule('countdown')
    isProjecting.value = opened
    if (opened) startProjectionWatch()
    else stopProjectionWatch()
  }

  async function clearProjection() {
    closeProjectionModule()
    isProjecting.value = false
    stopFinishWatch()
    // Feedback Ezequias (02/10): parar a projeção corta o áudio NA HORA —
    // não deixar alerta (abertura/marcos) tocando depois de sair da projeção.
    stopAudio()
    // WT-5: TV é destino independente — parar manda idle pro relay
    runtime.value = { ...DEFAULT_COUNTDOWN_RUNTIME, savedTimesMs: runtime.value.savedTimesMs }
    syncRuntime()
  }

  function refreshProjectionState() {
    const open = isProjectionModuleOpen('countdown')
    isProjecting.value = open
    if (open) startProjectionWatch()
    else stopProjectionWatch()
  }

  async function toggleProjection() {
    // WT-5: rota 'Só TV' não tem popup — desligar pelo estado, não pelo popup
    if (isProjecting.value) {
      await clearProjection()
      return
    }
    await syncProjection()
  }

  return {
    config,
    runtime,
    isProjecting,
    inAppPreview,
    configOpen,
    hydrated,
    isRunning,
    isPaused,
    canStart,
    hydrate,
    setTimeFormat,
    setBgColor,
    setTextColor,
    setAllowNegative,
    setAlertTonePreset,
            setAlertMarkers,
            addAlertMarker,
            updateAlertMarker,
            removeAlertMarker,
            isOffsetTaken,
            firedMarkers,
            startAudioControlSync,
            audioMuted,
            audioVolume,
            audioStopTick,
            setAudioMuted,
            setAudioVolume,
            audioPaused,
            setAudioPaused,
            stopAudio,
            setMode,
        setSabbathConfig,
        resetDisplayToDefault,
    openConfig,
    closeConfig,
    displayConfigOpen,
    openDisplayConfig,
    closeDisplayConfig,
    setDurationMs,
        minDurationMs,
    adjustTime,
    start,
    pause,
    reset,
    saveMark,
    removeSavedMark,
    clearSavedMarks,
    toggleProjection,
    syncProjection,
    clearProjection,
    refreshProjectionState,
  }
})
