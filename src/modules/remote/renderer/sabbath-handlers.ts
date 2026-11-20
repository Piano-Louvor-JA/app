import type { useSabbathSchoolStore } from '../../sabbath-school/stores/useSabbathSchoolStore'
import { computeCountdownRemainingMs } from '../../countdown/services/countdown-format'
import { ALERT_PRESETS, type SabbathAudioLangSetting } from '../../sabbath-school/services/alert-tone'
import { listLibraryTones } from '../../sabbath-school/services/alert-tone-library'
import type { AlertMarkerPreset } from '../../sabbath-school/types/sabbath-school'

const DAY_MS = 24 * 60 * 60_000
export function createSabbathHandlers(store: ReturnType<typeof useSabbathSchoolStore>) {
  function snapshot() {
    return {
      status: store.runtime.status,
      remainingMs: Math.max(0, Math.round(computeCountdownRemainingMs(store.runtime, Date.now()))),
      durationMs: store.runtime.durationMs,
      finished: store.runtime.finished === true,
      isProjecting: store.isProjecting,
      rehearsing: store.rehearsing,
      canStart: store.canStart(),
      schedule: { ...store.config.schedule },
      minDurationMs: store.minDurationMs,
      videoName: store.config.customVideo?.name ?? null,
      videoDurationMs: store.config.customVideo?.durationMs ?? 0,
      videoActive: Boolean(store.runtime.videoPath),
      videoVolume: Math.round(store.videoVolume * 100),
      videoMuted: store.videoMuted,
      audioLang: store.config.audioLang,
      audioVolume: Math.round(store.audioVolume * 100),
      audioMuted: store.audioMuted,
      openingPlayback: store.openingPlayback,
      hasOpening: store.hasOpening,
      markers: store.config.alertMarkers.map(marker => ({ ...marker })),
      presets: [...['none', ...Object.keys(ALERT_PRESETS)].map(id => ({ id, name: '' })),
        ...listLibraryTones().map(tone => ({ id: `custom:${tone.id}`, name: tone.name }))],
    }
  }
  function preset(value: unknown): value is AlertMarkerPreset {
    return typeof value === 'string' && (value === 'none' || Object.hasOwn(ALERT_PRESETS, value) || listLibraryTones().some(tone => `custom:${tone.id}` === value))
  }
  function offset(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= DAY_MS
  }
  async function execute(action: string, msg: Record<string, unknown>): Promise<boolean> {
    switch (action) {
      case 'sabbath.start': store.start(); return store.isRunning
      case 'sabbath.pause':
        if (!store.isRunning) return false
        store.pause(); return true
      case 'sabbath.stop': store.stop(); return true
      case 'sabbath.toggleProjection': await store.toggleProjection(); return true
      case 'sabbath.toggleOpening':
        if (!store.hasOpening) return false
        store.toggleOpening(); return true
      case 'sabbath.toggleFinalMinutes': store.toggleFinalMinutes(); return true
      case 'sabbath.stopAudio': store.stopAudio(); return true
      case 'sabbath.adjustTime':
        if (typeof msg.value !== 'number' || !Number.isInteger(msg.value) || Math.abs(msg.value) > 3600000 || store.isIdle || store.runtime.videoPath) return false
        store.adjustTime(msg.value); return true
      case 'sabbath.seekVideo':
        if (!offset(msg.value) || !store.runtime.videoPath || store.isIdle) return false
        store.seekVideo(msg.value); return true
      case 'sabbath.setVolume':
      case 'sabbath.setVideoVolume':
        if (typeof msg.value !== 'number' || !Number.isFinite(msg.value) || msg.value < 0 || msg.value > 100) return false
        if (action === 'sabbath.setVolume') store.setAudioVolume(msg.value / 100)
        else store.setVideoVolume(msg.value / 100)
        return true
      case 'sabbath.setMuted':
      case 'sabbath.setVideoMuted':
        if (typeof msg.enabled !== 'boolean') return false
        if (action === 'sabbath.setMuted') store.setAudioMuted(msg.enabled)
        else store.setVideoMuted(msg.enabled)
        return true
      case 'sabbath.setAudioLang':
        if (typeof msg.name !== 'string' || !['auto', 'pt-BR', 'es', 'en', 'fr'].includes(msg.name)) return false
        store.setAudioLang(msg.name as SabbathAudioLangSetting); return true
      case 'sabbath.setSchedule': {
        const schedule = { ...store.config.schedule }
        if (msg.mode === 'duration') {
          if (!offset(msg.durationMs) || msg.durationMs < Math.max(1000, store.minDurationMs)) return false
          schedule.scheduleMode = 'duration'; schedule.durationMs = msg.durationMs
        } else if (msg.mode === 'endOnly') {
          if (typeof msg.name !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(msg.name)) return false
          schedule.scheduleMode = 'endOnly'; schedule.endTime = msg.name
        } else if (msg.mode === 'video') {
          if (!store.config.customVideo?.durationMs) return false
          schedule.scheduleMode = 'video'
        } else return false
        store.setSchedule(schedule); return true
      }
      case 'sabbath.addMarker':
        if (!offset(msg.value) || !preset(msg.name)) return false
        return store.addAlertMarker(msg.value, msg.name) != null
      case 'sabbath.setMarker': {
        if (typeof msg.targetId !== 'string' || (msg.name == null && msg.value == null)) return false
        if (msg.name != null && !preset(msg.name)) return false
        if (msg.value != null && !offset(msg.value)) return false
        return store.updateAlertMarker(msg.targetId, { ...(typeof msg.name === 'string' ? { preset: msg.name as AlertMarkerPreset } : {}), ...(typeof msg.value === 'number' ? { offsetMs: msg.value } : {}) })
      }
      case 'sabbath.removeMarker':
        return typeof msg.targetId === 'string' && store.removeAlertMarker(msg.targetId)
      default: return false
    }
  }
  return { snapshot, execute }
}
