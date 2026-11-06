// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ stop: vi.fn(), clearQueue: vi.fn(), publish: vi.fn() }))
vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: () => false,
  isProjectionModuleOpen: () => false,
  openProjectionModule: vi.fn(),
}))
vi.mock('@modules/settings/services/palco-routing', () => ({ isPalcoTvOnlyRoute: () => false }))
vi.mock('@modules/countdown/services/countdown-runtime', async (original) => ({
  ...await original<typeof import('@modules/countdown/services/countdown-runtime')>(),
  publishCountdownRuntime: mocks.publish,
}))
vi.mock('../../services/alert-tone', async (original) => ({
  ...await original<typeof import('../../services/alert-tone')>(),
  stopAllAlerts: mocks.stop,
  clearAlertQueue: mocks.clearQueue,
}))

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { useCountdownOutputStore } from '@modules/countdown/stores/useCountdownOutputStore'
import { useCountdownStore } from '@modules/countdown/stores/useCountdownStore'
import { TONE_LIBRARY_KEY } from '../../services/alert-tone-library'
import { DEFAULT_ALERT_MARKERS } from '../../types/sabbath-school'
import { useSabbathSchoolStore } from '../useSabbathSchoolStore'

const MIN = 60_000
const endAt = (endTime: string) => ({ scheduleMode: 'endOnly' as const, durationMs: 45 * MIN, endTime })

function seedPreference(key: string, value: unknown) {
  const prefs = JSON.parse(localStorage.getItem('user_data') ?? '{}')
  prefs[key] = value
  localStorage.setItem('user_data', JSON.stringify(prefs))
}

/** Nova instância lendo o storage (simula reabrir o app). */
function reload() {
  setActivePinia(createPinia())
  return useSabbathSchoolStore()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T09:00:00'))
  localStorage.clear()
  mocks.stop.mockClear()
  mocks.clearQueue.mockClear()
  mocks.publish.mockClear()
  setActivePinia(createPinia())
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('marcos de alerta', () => {
  it('config nova nasce com os 3 marcos padrão', () => {
    expect(useSabbathSchoolStore().config.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })

  it('adicionar cria marco persistido que sobrevive ao recarregar', () => {
    const marker = useSabbathSchoolStore().addAlertMarker(420_000, 'chime')
    expect(marker).not.toBeNull()
    const reloaded = reload().config.alertMarkers.find((m) => m.id === marker?.id)
    expect(reloaded).toEqual({ id: marker?.id, offsetMs: 420_000, preset: 'chime' })
  })

  it('offset negativo ou já usado é bloqueado', () => {
    const store = useSabbathSchoolStore()
    expect(store.addAlertMarker(60_000)).toBeNull()
    expect(store.addAlertMarker(-1)).toBeNull()
  })

  it('atualiza offset e som; remove; bloqueia colisão e id inexistente', () => {
    const store = useSabbathSchoolStore()
    const marker = store.addAlertMarker(180_000, 'beep')!
    expect(store.updateAlertMarker(marker.id, { offsetMs: 120_000, preset: 'gong' })).toBe(true)
    expect(store.config.alertMarkers.find((m) => m.id === marker.id)).toEqual({ id: marker.id, offsetMs: 120_000, preset: 'gong' })
    expect(store.updateAlertMarker('start', { offsetMs: 300_000 })).toBe(false)
    expect(store.updateAlertMarker('start', { offsetMs: -1 })).toBe(false)
    expect(store.updateAlertMarker('nao-existe', { offsetMs: 5 })).toBe(false)
    expect(store.removeAlertMarker(marker.id)).toBe(true)
    expect(store.removeAlertMarker('nao-existe')).toBe(false)
  })

  it('remover todos os marcos continua sem alertas ao recarregar', () => {
    const store = useSabbathSchoolStore()
    for (const { id } of [...store.config.alertMarkers]) store.removeAlertMarker(id)
    expect(reload().config.alertMarkers).toEqual([])
  })

  it('tons da biblioteca migrados do legado não duplicam', async () => {
    localStorage.setItem(TONE_LIBRARY_KEY, JSON.stringify([{ id: 'tone-x', name: 'Sino', dataUrl: 'data:audio/mpeg;base64,AAA', createdAt: 1 }]))
    const { migrateLegacyCustomTones } = await import('../../services/alert-tone-library')
    expect(migrateLegacyCustomTones({ start: 'data:audio/mpeg;base64,AAA' }).start).toBe('tone-x')
    expect(JSON.parse(localStorage.getItem(TONE_LIBRARY_KEY) ?? '[]')).toHaveLength(1)
  })
})

describe('migração da config que vivia no Timer', () => {
  it('agenda, idioma e marcos do modo Escola Sabatina do Timer vêm para o módulo', () => {
    seedPreference(USER_PREFERENCE_KEYS.countdownConfig, {
      timeFormat: 'mm:ss',
      mode: 'sabbath',
      alertTonePresets: { start: 'gong', '5min': 'chime' },
      sabbathConfig: { scheduleMode: 'start', startTime: '08:45', endTime: '10:00' },
      sabbathSchoolAudioLang: 'es',
    })
    const store = useSabbathSchoolStore()
    expect(store.config.schedule).toEqual({ scheduleMode: 'duration', durationMs: 75 * MIN, endTime: '10:00' })
    expect(store.config.audioLang).toBe('es')
    expect(store.config.alertMarkers.map((m) => m.preset)).toEqual(['gong', 'chime', '1min_es'])
    expect(useCountdownStore().config).not.toHaveProperty('mode')
  })
})

describe('contagem', () => {
  it('parada, mostra a duração que a agenda dá agora', () => {
    const store = useSabbathSchoolStore()
    expect(store.runtime).toMatchObject({ status: 'idle', mode: 'duration', durationMs: 45 * MIN })
    store.setSchedule({ scheduleMode: 'duration', durationMs: 30 * MIN, endTime: '10:15' })
    expect(store.runtime.durationMs).toBe(30 * MIN)
    vi.setSystemTime(new Date('2026-10-22T09:10:00'))
    store.setSchedule(endAt('10:15'))
    expect(store.runtime.durationMs).toBe(65 * MIN)
  })

  it('Timer e Escola Sabatina contam ao mesmo tempo sem um mexer no outro', () => {
    const countdown = useCountdownStore()
    const store = useSabbathSchoolStore()
    countdown.setDurationMs(5 * MIN)
    countdown.start()
    store.start()
    expect(countdown.runtime).toMatchObject({ status: 'running', durationMs: 5 * MIN })
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 45 * MIN })
    countdown.reset()
    expect(store.runtime.status).toBe('running')
    countdown.setDurationMs(MIN)
    countdown.start()
    store.stop()
    expect(countdown.runtime).toMatchObject({ status: 'running', durationMs: MIN })
  })

  it('duração: conta o tempo escolhido e, pausada, retoma de onde parou', () => {
    const store = useSabbathSchoolStore()
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 45 * MIN, accumulatedMs: 0 })
    vi.advanceTimersByTime(10 * MIN)
    store.start()
    store.pause()
    store.pause()
    expect(store.runtime).toMatchObject({ status: 'paused', accumulatedMs: 10 * MIN })
    vi.advanceTimersByTime(5 * MIN)
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 45 * MIN, accumulatedMs: 10 * MIN })
  })

  it('duração encerrada no zero (sem tempo negativo): iniciar recomeça a contagem cheia', () => {
    const appearance = useCountdownStore()
    appearance.hydrate()
    appearance.setAllowNegative(false)
    const store = useSabbathSchoolStore()
    store.setAlertMarkers([])
    store.setSchedule({ scheduleMode: 'duration', durationMs: 2 * MIN, endTime: '10:15' })
    store.start()
    vi.advanceTimersByTime(2 * MIN + 100)
    expect(store.runtime).toMatchObject({ status: 'paused', finished: true })
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 2 * MIN, accumulatedMs: 0, finished: false })
  })

  it('hora do término: conta até o horário; término inválido não inicia; retomar recalcula pelo término', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(endAt('xx:yy'))
    store.start()
    expect(store.runtime.status).toBe('idle')
    vi.setSystemTime(new Date('2026-10-22T09:20:00'))
    store.setSchedule(endAt('10:15'))
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 55 * MIN, accumulatedMs: 0 })
    store.pause()
    vi.setSystemTime(new Date('2026-10-22T09:25:00'))
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 50 * MIN, accumulatedMs: 0 })
  })

  it('poder iniciar exige agenda maior que a soma dos áudios habilitados', () => {
    const store = useSabbathSchoolStore()
    // padrões: abertura_es 30,4 s + 5min_es 18 s + 1min_es 65,5 s
    expect(store.minDurationMs).toBe(30_400 + 18_000 + 65_500)
    store.setSchedule(endAt('09:01'))
    expect(store.canStart()).toBe(false)
    store.setAlertMarkers([
      { id: 'start', offsetMs: 0, preset: 'none' },
      { id: 'custom', offsetMs: 30_000, preset: 'custom:sound' },
    ])
    expect(store.minDurationMs).toBe(60_000)
    expect(store.canStart()).toBe(true)
    store.start()
    expect(store.canStart()).toBe(false)
    store.stop()
    store.setSchedule({ scheduleMode: 'duration', durationMs: 0, endTime: '10:15' })
    expect(store.canStart()).toBe(false)
  })

  it('últimos 5 min: 5:00 sem abertura; o mesmo botão pausa e retoma; parar e iniciar volta a tocar tudo', () => {
    const store = useSabbathSchoolStore()
    store.setAlertMarkers([{ id: 'start', offsetMs: 0, preset: 'abertura_es' }, { id: '5min', offsetMs: 300_000, preset: '5min_es' }])
    store.toggleFinalMinutes()
    expect(store.runtime).toMatchObject({ mode: 'duration', durationMs: 300_000, accumulatedMs: 0, status: 'running' })
    expect(store.firedMarkers.has('start')).toBe(true)
    expect(store.rehearsing).toBe(true)
    expect(mocks.stop).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(10_000)
    store.toggleFinalMinutes()
    expect(store.runtime).toMatchObject({ status: 'paused', accumulatedMs: 10_000 })
    vi.advanceTimersByTime(5_000)
    store.toggleFinalMinutes()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 300_000, accumulatedMs: 10_000 })
    expect(store.rehearsing).toBe(true)
    expect(mocks.stop).toHaveBeenCalledOnce()
    store.pause()
    store.start()
    expect(store.rehearsing).toBe(true)
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 300_000, accumulatedMs: 10_000 })
    store.stop()
    expect(store.rehearsing).toBe(false)
    expect(store.firedMarkers.size).toBe(0)
    store.start()
    expect(store.runtime).toMatchObject({ durationMs: 45 * MIN, accumulatedMs: 0 })
  })

  it('sem tempo negativo, o ensaio para no zero e não é retomado: iniciar começa a contagem real', () => {
    const appearance = useCountdownStore()
    appearance.hydrate()
    appearance.setAllowNegative(false)
    const store = useSabbathSchoolStore()
    store.rehearse()
    vi.advanceTimersByTime(300_100)
    expect(store.runtime).toMatchObject({ status: 'paused', finished: true })
    store.toggleFinalMinutes()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 300_000, accumulatedMs: 0, finished: false })
    vi.advanceTimersByTime(300_100)
    store.start()
    expect(store.rehearsing).toBe(false)
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 45 * MIN, finished: false })
  })

  it.each([['rodando', false], ['pausada', true]])('últimos 5 min substitui a contagem real %s', (_label, paused) => {
    const store = useSabbathSchoolStore()
    store.start()
    vi.advanceTimersByTime(MIN)
    if (paused) store.pause()
    mocks.stop.mockClear()
    store.toggleFinalMinutes()
    expect(store.rehearsing).toBe(true)
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 300_000, accumulatedMs: 0 })
    expect(store.firedMarkers.has('start')).toBe(true)
    expect(mocks.stop).toHaveBeenCalled()
  })

  it('play/pausa da abertura pede ao motor só quando há som de abertura, sem mexer na contagem', () => {
    const store = useSabbathSchoolStore()
    expect(store.hasOpening).toBe(true)
    expect(store.openingPlayback).toBe('stopped')
    store.toggleOpening()
    store.toggleOpening()
    expect(store.openingToggles).toBe(2)
    expect(store.runtime.status).toBe('idle')
    store.setAlertMarkers([{ id: 'start', offsetMs: 0, preset: 'none' }])
    expect(store.hasOpening).toBe(false)
    store.toggleOpening()
    store.setAlertMarkers([{ id: '5min', offsetMs: 300_000, preset: '5min_es' }])
    expect(store.hasOpening).toBe(false)
    store.toggleOpening()
    expect(store.openingToggles).toBe(2)
  })

  it('ensaio sem marco de abertura apenas inicia a contagem', () => {
    const store = useSabbathSchoolStore()
    store.setAlertMarkers([])
    store.rehearse()
    expect(store.firedMarkers.size).toBe(0)
    expect(store.runtime.status).toBe('running')
  })

  it('parar corta o som, encerra o ensaio e volta à duração da agenda', () => {
    const store = useSabbathSchoolStore()
    store.rehearse()
    store.firedMarkers.add('5min')
    store.stop()
    expect(store.rehearsing).toBe(false)
    expect(store.firedMarkers.size).toBe(0)
    expect(mocks.clearQueue).toHaveBeenCalled()
    expect(store.runtime).toMatchObject({ status: 'idle', durationMs: 45 * MIN })
  })

  it('ajuste fino só com a contagem em andamento e nunca abaixo de zero', () => {
    const store = useSabbathSchoolStore()
    store.adjustTime(MIN)
    expect(store.runtime.durationMs).toBe(45 * MIN)
    store.start()
    store.adjustTime(5 * MIN)
    expect(store.runtime.durationMs).toBe(50 * MIN)
    store.pause()
    store.adjustTime(-1000 * MIN)
    expect(store.runtime.durationMs).toBe(0)
  })

  it('ao zerar com tempo negativo, segue contando marcada como encerrada', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(endAt('09:02'))
    store.setAlertMarkers([])
    store.start()
    vi.advanceTimersByTime(2 * MIN + 100)
    expect(store.runtime).toMatchObject({ status: 'running', finished: true })
  })
})

describe('vídeo personalizado', () => {
  const VIDEO = { relativePath: 'modulos/escola-sabatina/video/video-1.mp4', name: 'Tema.mp4', durationMs: 3 * MIN }
  const videoMode = { scheduleMode: 'video' as const, durationMs: 45 * MIN, endTime: '10:15' }

  it('sem vídeo escolhido não inicia e mostra zero', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    expect(store.runtime).toMatchObject({ status: 'idle', durationMs: 0 })
    expect(store.runtime).not.toHaveProperty('videoPath')
    expect(store.canStart()).toBe(false)
    store.start()
    expect(store.runtime.status).toBe('idle')
  })

  it('o vídeo escolhido persiste e, parado, a tela já mostra o vídeo com a duração dele', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    expect(store.runtime).toMatchObject({ status: 'idle', durationMs: 3 * MIN, videoPath: VIDEO.relativePath })
    expect(reload().config.customVideo).toEqual(VIDEO)
  })

  it('fora do modo vídeo a tela volta aos números', () => {
    const store = useSabbathSchoolStore()
    store.setCustomVideo(VIDEO)
    expect(store.runtime).not.toHaveProperty('videoPath')
    store.setSchedule(videoMode)
    store.setSchedule({ ...videoMode, scheduleMode: 'duration' })
    expect(store.runtime).toMatchObject({ durationMs: 45 * MIN })
    expect(store.runtime).not.toHaveProperty('videoPath')
  })

  it('a contagem dura o vídeo, ignora o mínimo dos áudios, que não tocam, e leva o vídeo à projeção', async () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo({ ...VIDEO, durationMs: 10_000 })
    await store.toggleProjection()
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'idle', videoPath: VIDEO.relativePath }))
    expect(store.canStart()).toBe(true)
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 10_000, videoPath: VIDEO.relativePath })
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ videoPath: VIDEO.relativePath }))
  })

  it('pausar e retomar continuam o vídeo de onde parou; o ajuste fino não muda a duração', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    store.start()
    vi.advanceTimersByTime(MIN)
    store.adjustTime(5 * MIN)
    store.pause()
    expect(store.runtime).toMatchObject({ status: 'paused', durationMs: 3 * MIN, accumulatedMs: MIN, videoPath: VIDEO.relativePath })
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', accumulatedMs: MIN, videoPath: VIDEO.relativePath })
  })

  it('o fim do vídeo encerra a contagem, mesmo com tempo negativo ligado', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    store.start()
    vi.advanceTimersByTime(3 * MIN + 100)
    expect(store.runtime).toMatchObject({ status: 'paused', finished: true, accumulatedMs: 3 * MIN, videoPath: VIDEO.relativePath })
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', accumulatedMs: 0, finished: false })
  })

  it('últimos 5 min no modo vídeo conta com números; parar volta ao vídeo', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    store.rehearse()
    expect(store.runtime).toMatchObject({ status: 'running', durationMs: 300_000 })
    expect(store.runtime).not.toHaveProperty('videoPath')
    store.stop()
    expect(store.runtime).toMatchObject({ status: 'idle', videoPath: VIDEO.relativePath })
  })

  it('a barra de andamento pula para o ponto escolhido, rodando ou pausada', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    store.seekVideo(MIN)
    expect(store.runtime).toMatchObject({ status: 'idle', accumulatedMs: 0 })
    store.start()
    vi.advanceTimersByTime(10_000)
    store.seekVideo(2 * MIN)
    expect(store.runtime).toMatchObject({ status: 'running', accumulatedMs: 2 * MIN, segmentStartedAt: Date.now() })
    vi.advanceTimersByTime(30_000)
    store.pause()
    expect(store.runtime.accumulatedMs).toBe(2.5 * MIN)
    store.seekVideo(-5)
    expect(store.runtime).toMatchObject({ status: 'paused', accumulatedMs: 0, segmentStartedAt: null })
    store.seekVideo(99 * MIN)
    expect(store.runtime.accumulatedMs).toBe(3 * MIN)
  })

  it('depois do fim, voltar na barra deixa retomar dali', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    store.start()
    vi.advanceTimersByTime(3 * MIN + 100)
    store.seekVideo(MIN)
    expect(store.runtime).toMatchObject({ status: 'paused', finished: false, accumulatedMs: MIN })
    store.start()
    expect(store.runtime).toMatchObject({ status: 'running', accumulatedMs: MIN })
  })

  it('sem vídeo na contagem a barra não age', () => {
    const store = useSabbathSchoolStore()
    store.start()
    store.seekVideo(MIN)
    expect(store.runtime.accumulatedMs).toBe(0)
  })

  it('volume do vídeo vai junto para a projeção; mudo manda zero; persiste', async () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    expect(store.runtime.videoVolume).toBe(1)
    store.start()
    store.setVideoVolume(0.4)
    expect(store.runtime).toMatchObject({ status: 'running', videoVolume: 0.4 })
    store.setVideoMuted(true)
    expect(store.runtime.videoVolume).toBe(0)
    store.setVideoVolume(2)
    expect(store.videoVolume).toBe(1)
    expect(store.runtime.videoVolume).toBe(0)
    store.setVideoMuted(false)
    expect(store.runtime.videoVolume).toBe(1)
    store.setVideoVolume(-1)
    store.setVideoMuted(true)
    const reloaded = reload()
    expect(reloaded.videoMuted).toBe(true)
    expect(reloaded.videoVolume).toBe(0)
    expect(reloaded.audioMuted).toBe(false)
  })

  it('fora do vídeo o volume do vídeo não entra na contagem', () => {
    const store = useSabbathSchoolStore()
    store.setVideoVolume(0.5)
    expect(store.runtime).not.toHaveProperty('videoVolume')
  })

  it('remover o vídeo volta a zero', () => {
    const store = useSabbathSchoolStore()
    store.setSchedule(videoMode)
    store.setCustomVideo(VIDEO)
    store.setCustomVideo(null)
    expect(store.config.customVideo).toBeNull()
    expect(store.runtime).toMatchObject({ status: 'idle', durationMs: 0 })
    expect(store.runtime).not.toHaveProperty('videoPath')
  })
})

describe('projeção pela tela de contagem', () => {
  it('projetar assume a tela; o Timer sai dela e segue contando sem publicar', async () => {
    const countdown = useCountdownStore()
    const store = useSabbathSchoolStore()
    await countdown.toggleProjection()
    expect(countdown.isProjecting).toBe(true)
    await store.toggleProjection()
    expect(useCountdownOutputStore().owner).toBe('sabbath-school')
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(true)
    expect(countdown.isProjecting).toBe(false)
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ durationMs: 45 * MIN, projecting: true }))
    mocks.publish.mockClear()
    countdown.setDurationMs(3 * MIN)
    expect(mocks.publish).not.toHaveBeenCalled()
    store.start()
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'running', durationMs: 45 * MIN }))
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({ projecting: false }))
  })

  it('o Timer projetar de novo tira a tela da Escola Sabatina', async () => {
    const countdown = useCountdownStore()
    const store = useSabbathSchoolStore()
    await store.syncProjection()
    await countdown.syncProjection()
    expect(store.isProjecting).toBe(false)
    expect(store.inAppPreview).toBe(false)
    store.refreshProjectionState()
    expect(store.isProjecting).toBe(false)
  })
})

describe('áudio do operador e idioma', () => {
  it('mudo e volume persistem; volume fica entre 0 e 1', () => {
    const store = useSabbathSchoolStore()
    store.setAudioMuted(true)
    store.setAudioVolume(2)
    expect(store.audioVolume).toBe(1)
    store.setAudioVolume(-1)
    const reloaded = reload()
    expect(reloaded.audioMuted).toBe(true)
    expect(reloaded.audioVolume).toBe(0)
  })

  it('idioma das narrações persiste', () => {
    useSabbathSchoolStore().setAudioLang('fr')
    expect(reload().config.audioLang).toBe('fr')
  })
})
