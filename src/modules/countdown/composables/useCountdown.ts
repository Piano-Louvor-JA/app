import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'

import {
  computeRemainingMs,
  computeRemainingRawMs,
  durationPartsFromMs,
  formatCountdownWithSign,
  formatElapsedMs,
} from '../services/countdown-format'
import type {
  CountdownDisplayConfig,
  CountdownRuntimeState,
} from '../types/countdown'
import { useCountdownStore } from '../stores/useCountdownStore'
import { clearAlertQueue, enqueueAlert, playAlertTone, setLiveVolume, stopAllAlerts } from '../services/alert-tone'
import { getLibraryTone } from '../services/alert-tone-library'
import {
  DEFAULT_ALERT_MARKERS,
  type AlertMarkerPreset,
} from '../types/countdown'
import type { AlertPresetKey } from '../services/alert-tone'
import {
  claimAudioHost,
  isOperatorWindow,
  releaseAudioHost,
  renewAudioHost,
} from '../services/audio-control'

/** AudioElement de um tom da biblioteca (cacheado pelo data-URL). */
const libraryAudioCache = new Map<string, HTMLAudioElement>()

function getCustomAudioById(toneId: string): HTMLAudioElement | undefined {
  const tone = getLibraryTone(toneId)
  if (!tone) return undefined
  let audio = libraryAudioCache.get(tone.dataUrl)
  if (!audio) {
    audio = new Audio(tone.dataUrl)
    audio.preload = 'auto'
    libraryAudioCache.set(tone.dataUrl, audio)
  }
  return audio
}

export function useCountdownTick(active: MaybeRefOrGetter<boolean> = true) {
  const now = ref(Date.now())
  let frameId = 0

  function tick() {
    if (toValue(active)) {
      now.value = Date.now()
    }
    frameId = requestAnimationFrame(tick)
  }

  onMounted(() => {
    frameId = requestAnimationFrame(tick)
  })

  onUnmounted(() => {
    cancelAnimationFrame(frameId)
  })

  return { now }
}

export const DEFAULT_ALERT_TONE_PRESETS: NonNullable<
  CountdownDisplayConfig['alertTonePresets']
> = {
  start: 'abertura_es',
  '5min': '5min_es',
  '1min': '1min_es',
}

/** Marcos em ms restantes que disparam alerta. */
const ALERT_MARKERS_MS = { start: 0, '5min': 300_000, '1min': 60_000 } as const

export function useCountdownDisplay(
  configSource?: MaybeRefOrGetter<CountdownDisplayConfig>,
  runtimeSource?: MaybeRefOrGetter<CountdownRuntimeState>,
) {
  const store = useCountdownStore()
  const config = computed(() => toValue(configSource) ?? store.config)
  const runtime = computed(() => toValue(runtimeSource) ?? store.runtime)
  const { now } = useCountdownTick(() => runtime.value.status === 'running')

  const remainingRawMs = computed(() =>
    computeRemainingRawMs(
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.status,
      now.value,
    ),
  )

  const remainingMs = computed(() =>
    computeRemainingMs(
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.status,
      now.value,
    ),
  )

  const formattedTime = computed(() =>
    formatElapsedMs(remainingMs.value, config.value.timeFormat),
  )

  const formattedTimeWithSign = computed(() =>
    formatCountdownWithSign(remainingRawMs.value, config.value.timeFormat),
  )

  const isNegative = computed(() => remainingRawMs.value < 0)

  const isUrgent = computed(
    () =>
      remainingMs.value > 0 &&
      remainingMs.value <= 60_000 &&
      (runtime.value.status === 'running' || runtime.value.status === 'paused'),
  )

  const isFinished = computed(
      () =>
        runtime.value.finished ||
        (remainingMs.value <= 0 &&
          runtime.value.durationMs > 0 &&
          runtime.value.accumulatedMs > 0),
    )

    // ── Disparo de alertas nos marcos (v2: marcos dinâmicos) ─────────────
    // Marcos vêm da config (alertMarkers); fallback = seeds padrão.
    // offset 0 ("start") dispara na transição pra running; demais por
    // cruzamento decrescente. preset 'custom:{id}' toca da biblioteca local.
    // F3 (web#175): firedMarkers vive NO STORE — reabrir a janela de projeção
    // remonta o composable e NÃO repete alertas da mesma execução.
    // web#175 F2-v5: o disparo acontece SÓ na janela de PROJEÇÃO (popup).
    // Critério robusto (opener pode faltar com COOP/redirect): a rota do
    // popup é /popup?module=countdown (buildPopupUrl) — checar CAMINHO +
    // query, imutáveis pra cada janela.
    const isProjectionWindow =
      typeof window !== 'undefined' &&
      (window.opener != null ||
        (window.location.pathname.includes('/popup') &&
          new URLSearchParams(window.location.search).get('module') === 'countdown'))
    // O popup não roda hydrate() — inicia a escuta do canal de controle aqui
    // (idempotente no store) pra receber mute/volume/stop do operador.
    if (isProjectionWindow) store.startAudioControlSync()
    // Host de áudio (fix duplicidade 03/10 + cronômetro sem projeção):
    // exatamente UMA janela toca. Popup eleita (menor monitorId) quando há
    // projeção; OPERADOR quando não há popup viva — cronômetro roda e o
    // alerta toca no PC mesmo sem projetar (feedback do irmão).
    const isAudioHost = claimAudioHost()
    // Heartbeat: host renova o claim a cada 1s; se a popup host fechar,
    // claim expira (4s) e o OPERADOR assume (áudio sem projeção).
    const hostHeartbeat = isAudioHost
      ? window.setInterval(() => renewAudioHost(), 1_000)
      : null
    onUnmounted(() => {
      if (hostHeartbeat) clearInterval(hostHeartbeat)
      releaseAudioHost()
    })
    const firedMarkers = store.firedMarkers
    let prevStatus: CountdownRuntimeState['status'] = runtime.value.status

    const activeMarkers = computed(() => config.value.alertMarkers ?? DEFAULT_ALERT_MARKERS)

    function playMarkerPreset(preset: string, markerId: string): void {
      if (!isAudioHost) return // fix duplicidade: só a janela eleita toca
      if (store.audioMuted) return // F2: operador silenciou
      // Fila (feedback Ezequias: "adiciona queue") — marcos que cruzam juntos
      // (jump do rAF em janela em bg) tocam em sequência, nunca simultâneos.
      enqueueAlert(() => {
        if (preset.startsWith('custom:')) {
          const audio = getCustomAudioById(preset.slice('custom:'.length))
          if (!audio) return Promise.resolve()
          audio.volume = store.audioVolume
          return audio.play().then(
            () => undefined,
            () => undefined, // autoplay bloqueado — silencioso
          )
        }
        return playAlertTone(preset as AlertPresetKey, undefined, undefined, {
          volume: store.audioVolume,
        }).then(() => undefined)
      })
    }

    // F2: Stop do operador corta na hora o que estiver tocando
    watch(() => store.audioStopTick, () => {
      stopAllAlerts()
    })

    // F2: volume do operador aplica AO VIVO no que estiver tocando
    watch(() => store.audioVolume, (volume) => {
      setLiveVolume(volume)
    })

    if (isProjectionWindow) {
      // Marcos por DEADLINE ABSOLUTO (feedback Ezequias 02/10: "5min toca
      // quando falta 1min"). O antigo watch(remainingRawMs) dependia do rAF
      // — que CONGELA em janela em background (mesma raiz do app#337). Ao
      // voltar o foco, raw saltava (ex.: 10min → 1min) e o cruzamento do
      // 5min acontecia no salto, com minutos de atraso; 1min tocava junto.
      // Agora: deadline = Date.now() + remaining no start/resume, checado por
      // setInterval (timers de bg são throttled mas NUNCA congelados; e o
      // catch-up dispara qualquer marco vencido — na ordem, pela fila).
      let markerTimer: ReturnType<typeof setInterval> | null = null
      let deadlines = new Map<string, number>()

      function armMarkers(): void {
        if (runtime.value.status !== 'running') {
          deadlines = new Map()
          if (markerTimer) {
            clearInterval(markerTimer)
            markerTimer = null
          }
          return
        }
        const base = Date.now()
        // Marco cujo deadline já passou NO ARM (operador iniciou o cronômetro
        // quando já faltava menos que o offset — ex.: start faltando 4:30 e
        // marco 5min): NÃO toca atrasado. Feedback Ezequias: "5min toca
        // faltando 4" — o catch-up tocava o alerta fora de hora (no app E no
        // web, mesmo comportamento). Alerta que perdeu a hora é pulado.
        const remaining = remainingRawMs.value
        deadlines = new Map(
          activeMarkers.value
            .filter(
              (m) =>
                m.offsetMs > 0 &&
                m.preset !== 'none' &&
                m.offsetMs < remaining,
            )
            .map((m) => [m.id, base + (remaining - m.offsetMs)]),
        )
        // os que já passaram ficam marcados como fired (não tocaram de propósito)
        for (const m of activeMarkers.value) {
          if (m.offsetMs > 0 && m.offsetMs >= remaining) firedMarkers.add(m.id)
        }
        if (!markerTimer) {
          markerTimer = setInterval(fireDueMarkers, 1_000)
        }
      }

      function fireDueMarkers(): void {
        if (runtime.value.status !== 'running') return
        const now = Date.now()
        for (const marker of activeMarkers.value) {
          if (marker.offsetMs === 0) continue
          if (firedMarkers.has(marker.id) || marker.preset === 'none') continue
          const deadline = deadlines.get(marker.id)
          if (deadline !== undefined && now >= deadline) {
            firedMarkers.add(marker.id)
            playMarkerPreset(marker.preset, marker.id)
          }
        }
      }

      // start: primeira observação com status running (offset 0)
      const startMarker = activeMarkers.value.find((m) => m.offsetMs === 0)
      watch(
        [() => runtime.value.status, remainingRawMs],
        ([status]) => {
          if (
            startMarker &&
            status === 'running' &&
            prevStatus !== 'running' &&
            !firedMarkers.has(startMarker.id) &&
            startMarker.preset !== 'none'
          ) {
            firedMarkers.add(startMarker.id)
            playMarkerPreset(startMarker.preset, startMarker.id)
          }
          prevStatus = status
        },
        { flush: 'sync' },
      )

      // (re)arma deadlines quando runtime muda (start/pausa/resume/ajuste)
      watch(
        () => [
          runtime.value.status,
          runtime.value.durationMs,
          runtime.value.accumulatedMs,
          runtime.value.segmentStartedAt,
        ],
        () => armMarkers(),
        { immediate: true },
      )

      // Marcos vencidos: re-checa a cada tick do relógio (barato: Map lookup)
      watch(remainingRawMs, () => fireDueMarkers())

      // limpa o interval ao desmontar
      onUnmounted(() => {
        if (markerTimer) clearInterval(markerTimer)
        markerTimer = null
      })

      // Reset dos marcos quando o countdown volta pro idle (reset)
      watch(() => runtime.value.status, (status) => {
        if (status === 'idle') firedMarkers.clear()
      })
    }

    return {
      now,
      config,
      runtime,
      remainingMs,
      formattedTime,
      formattedTimeWithSign,
      isUrgent,
      isFinished,
      isNegative,
    }
}

export function useCountdownFeature() {
  const store = useCountdownStore()

  store.hydrate()

  const durationParts = computed(() => durationPartsFromMs(store.runtime.durationMs))

  return {
    config: computed(() => store.config),
    runtime: computed(() => store.runtime),
    durationParts,
    isProjecting: computed(() => store.isProjecting),
    configOpen: computed(() => store.configOpen),
    displayConfigOpen: computed(() => store.displayConfigOpen),
    isRunning: computed(() => store.isRunning),
    isPaused: computed(() => store.isPaused),
    canStart: computed(() => store.canStart),
    setTimeFormat: store.setTimeFormat,
    setBgColor: store.setBgColor,
    setTextColor: store.setTextColor,
    resetDisplayToDefault: store.resetDisplayToDefault,
    openConfig: store.openConfig,
        closeConfig: store.closeConfig,
        openDisplayConfig: store.openDisplayConfig,
        closeDisplayConfig: store.closeDisplayConfig,
        setAllowNegative: store.setAllowNegative,
        setAlertTonePreset: store.setAlertTonePreset,
        audioMuted: computed(() => store.audioMuted),
        audioVolume: computed(() => store.audioVolume),
        audioPaused: computed(() => store.audioPaused),
        setAudioMuted: store.setAudioMuted,
        setAudioVolume: store.setAudioVolume,
        setAudioPaused: store.setAudioPaused,
        stopAudio: store.stopAudio,
        setMode: store.setMode,
        setSabbathConfig: store.setSabbathConfig,
        setDurationMs: store.setDurationMs,
        adjustTime: store.adjustTime,
        start: store.start,
    pause: store.pause,
    reset: store.reset,
    saveMark: store.saveMark,
    removeSavedMark: store.removeSavedMark,
    clearSavedMarks: store.clearSavedMarks,
    toggleProjection: store.toggleProjection,
    syncProjection: store.syncProjection,
    clearProjection: store.clearProjection,
    refreshProjectionState: store.refreshProjectionState,
  }
}
