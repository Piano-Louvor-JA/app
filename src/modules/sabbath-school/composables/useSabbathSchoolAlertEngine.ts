import { computed, onScopeDispose, watch } from 'vue'

import i18n from '@/plugins/i18n'
import { computeCountdownRemainingMs } from '@modules/countdown/services/countdown-format'

import {
  clearAlertQueue,
  enqueueAlert,
  pauseAllAlerts,
  playAlertTone,
  resolveSabbathSchoolAudioLang,
  resumeAllAlerts,
  setLiveVolume,
  stopAllAlerts,
  type AlertPresetKey,
} from '../services/alert-tone'
import { getLibraryTone } from '../services/alert-tone-library'
import { useSabbathSchoolStore } from '../stores/useSabbathSchoolStore'

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

/**
 * Motor dos alertas da Escola Sabatina. Montar UMA vez, na janela principal
 * (AppShell): o áudio independe de projeção, prévia ou tela aberta, e as
 * janelas de projeção nunca tocam.
 *
 * Marcos por deadline absoluto checado por setInterval: timers de janela em
 * segundo plano são limitados, mas não congelam como o rAF.
 */
export function useSabbathSchoolAlertEngine(): void {
  const store = useSabbathSchoolStore()
  const runtime = computed(() => store.runtime)
  const firedMarkers = store.firedMarkers
  const activeMarkers = computed(() => store.config.alertMarkers)

  function playMarkerPreset(preset: string, onAudio?: (audio: HTMLAudioElement) => void): void {
    if (store.audioMuted) return
    // marcos que vencem juntos tocam em sequência, nunca simultâneos
    enqueueAlert(() => {
      if (preset.startsWith('custom:')) {
        const audio = getCustomAudioById(preset.slice('custom:'.length))
        if (!audio) return Promise.resolve()
        audio.volume = store.audioVolume
        return audio.play().then(
          () => onAudio?.(audio),
          () => undefined,
        )
      }
      return playAlertTone(preset as AlertPresetKey, undefined, undefined, {
        volume: store.audioVolume,
        sabbathAudioLang: resolveSabbathSchoolAudioLang(
          store.config.audioLang,
          i18n.global.locale.value,
        ),
      }).then((audio) => {
        if (audio) onAudio?.(audio)
      })
    })
  }

  watch(() => store.audioVolume, (volume) => setLiveVolume(volume))

  // abertura em curso (manual ou do início da contagem): o botão mostra play/pausa
  let openingAudio: HTMLAudioElement | null = null
  const trackedOpeningAudios = new WeakSet<HTMLAudioElement>()

  function trackOpening(audio: HTMLAudioElement): void {
    openingAudio = audio
    store.openingPlayback = 'playing'
    if (trackedOpeningAudios.has(audio)) return
    trackedOpeningAudios.add(audio)
    const isCurrent = () => openingAudio === audio
    audio.addEventListener('playing', () => {
      if (isCurrent()) store.openingPlayback = 'playing'
    })
    // o stop geral rebobina para o início: aí a abertura acabou, não pausou
    audio.addEventListener('pause', () => {
      if (isCurrent()) store.openingPlayback = audio.ended || audio.currentTime === 0 ? 'stopped' : 'paused'
    })
    audio.addEventListener('ended', () => {
      if (isCurrent()) store.openingPlayback = 'stopped'
    })
  }

  // play/pausa do operador: só a abertura, sem mexer na contagem nem nos marcos
  watch(() => store.openingToggles, () => {
    const audio = openingAudio
    if (audio && store.openingPlayback === 'playing') {
      audio.pause()
      store.openingPlayback = 'paused'
      return
    }
    if (store.audioMuted) return
    if (audio && store.openingPlayback === 'paused') {
      audio.volume = store.audioVolume
      store.openingPlayback = 'playing'
      void audio.play().catch(() => {
        store.openingPlayback = 'paused'
      })
      return
    }
    const startMarker = activeMarkers.value.find((m) => m.offsetMs === 0)
    if (!startMarker || startMarker.preset === 'none') return
    clearAlertQueue()
    stopAllAlerts()
    playMarkerPreset(startMarker.preset, trackOpening)
  })

  let markerTimer: ReturnType<typeof setInterval> | null = null
  let deadlines = new Map<string, number>()

  function stopMarkerTimer(): void {
    if (markerTimer) clearInterval(markerTimer)
    markerTimer = null
  }

  function armMarkers(): void {
    // vídeo personalizado: o vídeo traz o próprio áudio, os avisos não tocam
    if (runtime.value.status !== 'running' || runtime.value.videoPath) {
      deadlines = new Map()
      stopMarkerTimer()
      return
    }
    const base = Date.now()
    const remaining = computeCountdownRemainingMs(runtime.value, base)
    deadlines = new Map(
      activeMarkers.value
        .filter((m) => m.offsetMs > 0 && m.preset !== 'none' && m.offsetMs < remaining)
        .map((m) => [m.id, base + (remaining - m.offsetMs)]),
    )
    // marco que já perdeu a hora no início da contagem não toca atrasado
    for (const m of activeMarkers.value) {
      if (m.offsetMs > 0 && m.offsetMs >= remaining) firedMarkers.add(m.id)
    }
    if (!markerTimer) markerTimer = setInterval(fireDueMarkers, 1_000)
  }

  function fireDueMarkers(): void {
    const now = Date.now()
    for (const marker of activeMarkers.value) {
      if (marker.offsetMs === 0) continue
      if (firedMarkers.has(marker.id) || marker.preset === 'none') continue
      const deadline = deadlines.get(marker.id)
      if (deadline !== undefined && now >= deadline) {
        firedMarkers.add(marker.id)
        playMarkerPreset(marker.preset)
      }
    }
  }

  // pausar a contagem pausa o áudio; retomar continua de onde parou.
  // Abertura: dispara na transição para running.
  watch(
    () => runtime.value.status,
    (status, prevStatus) => {
      if (status === 'idle') firedMarkers.clear()
      // ao zerar sem tempo negativo a contagem para, mas o último aviso termina
      if (status === 'paused' && !runtime.value.finished) pauseAllAlerts()
      if (status === 'running' && prevStatus === 'paused') resumeAllAlerts()
      if (status !== 'running' || prevStatus === 'running' || runtime.value.videoPath) return
      // últimos 5 min: o aviso que coincide com o início toca na hora
      if (store.rehearsing && prevStatus !== 'paused') {
        const dueNow = activeMarkers.value.find((m) => m.offsetMs > 0 && m.offsetMs === runtime.value.durationMs)
        if (dueNow && dueNow.preset !== 'none' && !firedMarkers.has(dueNow.id)) {
          firedMarkers.add(dueNow.id)
          playMarkerPreset(dueNow.preset)
        }
      }
      const startMarker = activeMarkers.value.find((m) => m.offsetMs === 0)
      if (!startMarker || startMarker.preset === 'none' || firedMarkers.has(startMarker.id)) return
      firedMarkers.add(startMarker.id)
      playMarkerPreset(startMarker.preset, trackOpening)
    },
    { flush: 'sync' },
  )

  // (re)arma deadlines quando o runtime muda (início, pausa, retomada, ajuste)
  watch(
    () => [
      runtime.value.status,
      runtime.value.durationMs,
      runtime.value.accumulatedMs,
      runtime.value.segmentStartedAt,
      runtime.value.videoPath,
    ],
    () => armMarkers(),
    { immediate: true },
  )

  onScopeDispose(stopMarkerTimer)
}
