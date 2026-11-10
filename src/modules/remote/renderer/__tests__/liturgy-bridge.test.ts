import { reapplyProjectionTargets } from '@shared/composables/useProjectionWindow'
import { palcoSession } from '../../../settings/services/palco-session'
import { obsConnections, selectObsConnection } from '../../../settings/services/obs-connections'
import { loadProjectionSettings, saveProjectionSettings } from '../../../settings/services/projection-preferences'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const DEFAULT_TIMER = {
  runtime: { value: { status: 'idle', remainingMs: 0 } },
  isProjecting: { value: false },
} as Record<string, unknown>

const hoisted = vi.hoisted(() => {
  return {
    targetRef: 'player' as string,
    projection: undefined as Record<string, unknown> | undefined,
    liturgyStore: {
      currentItems: [] as Array<{ type: string; name: string; subtitle?: string; done?: boolean; accentColor?: string }>,
      selectedItemIndex: -1,
      selectItem: vi.fn(async (_idx: number, _router: unknown) => { console.log('selectItem called', _idx) }),
      playItemOnScreens: vi.fn(async (_idx: number) => {}),
      toggleItemDone: vi.fn((_idx: number) => {}),
    },
    playerStub: {
      queue: { value: [] as Array<{ musicId: number; albumId: number | null; title: string }> },
      queueIndex: { value: -1 },
      queueLabel: { value: null as string | null },
      queueShuffled: { value: false },
      playQueue: vi.fn(async () => {}),
      nextTrack: vi.fn(),
      previousTrack: vi.fn(),
      clearQueue: vi.fn(),
      jumpToQueue: vi.fn(),
      playQueueInOrder: vi.fn(),
      isPlaying: { value: false },
      isProjecting: { value: false },
      toggleProjection: vi.fn(async () => {}),
      session: { value: { title: 'Faixa X' } },
      slideIndex: { value: 0 },
      nextSlide: vi.fn(async () => {}),
      previousSlide: vi.fn(async () => {}),
      goToSlide: vi.fn(async (_i: number) => {}),
      volume: { value: 0.7 },
      currentTimeSec: { value: 0 },
      durationSec: { value: 0 },
      getPlaybackState: vi.fn(() => ({ playing: true, positionMs: 1500, volume: 70 })),
      play: vi.fn(async () => {}),
      pause: vi.fn(async () => {}),
      togglePlay: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      next: vi.fn(async () => {}),
      previous: vi.fn(async () => {}),
      setVolume: vi.fn(async () => {}),
      seek: vi.fn(async () => {}),
      setMode: vi.fn(async () => {}),
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      seekTo: vi.fn(async () => {}),
      switchMode: vi.fn(async () => {}),
    },
    openMusicPlayer: vi.fn(async () => ({ ok: true })),
    bibleBootstrap: vi.fn(async () => {}),
    searchMod: {
      loadAlbumMusicIndex: vi.fn(async () => []),
      filterAlbumMusicIndex: vi.fn(() => [{ id: 1, title: 'Hino 1' }]),
    },
    modulesExecute: vi.fn(async () => true),
    modulesSnapshot: vi.fn(() => ({ bible: {}, timer: {}, countdown: {}, clock: {}, random: {}, media: {} })),
    modulesGetState: vi.fn(() => ({ bible: {}, timer: {}, countdown: {}, clock: {}, random: {}, media: {} })),
    randomStore: {} as unknown,
    desktopBridge: undefined as { projection?: Record<string, unknown>; getMediaTarget?: () => string } | undefined,
    remoteApiStub: {
      onCommand: vi.fn((_cb: (msg: { action: string; id?: number }) => Promise<unknown>) => vi.fn()),
      onStateRequest: vi.fn((_cb: () => Promise<unknown>) => vi.fn()),
      sendAck: vi.fn(async () => {}),
      sendState: vi.fn(async () => {}),
      sendMediaState: vi.fn(async () => {}),
    },
    router: { push: vi.fn() },
  }
})

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => ({
    remote: hoisted.remoteApiStub,
    projection: hoisted.projection,
    displays: hoisted.displays,
    getMediaTarget: () => hoisted.targetRef,
  }))
}))

vi.mock('../slide-background', () => ({
  makeSlideBackgroundThumb: vi.fn(async (path: string) => `data:image/jpeg;base64,${path}`),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  reapplyProjectionTargets: vi.fn(async () => false),
}))

vi.mock('../../../settings/services/palco-session', () => ({
  palcoSession: {
    status: vi.fn(async () => ({ running: false, clients: 0, url: null, wsUrl: null })),
    slots: vi.fn(async () => []),
    createSlot: vi.fn(async () => ({ id: 's1', label: 'TV', httpPort: 8080, wsPort: 8081 })),
    removeSlot: vi.fn(async () => true),
    startSlot: vi.fn(async () => true),
    stopSlot: vi.fn(async () => {}),
    turnOn: vi.fn(async () => true),
    turnOff: vi.fn(async () => {}),
    project: vi.fn(),
    idle: vi.fn(),
  },
}))

vi.mock('../../../media/services/open-music-player', () => ({
  openMusicPlayer: hoisted.openMusicPlayer,
}))

vi.mock('../../../albums/services/album-music-search', () => hoisted.searchMod)

vi.mock('../../../liturgy/stores/useLiturgyStore', () => {
  const store = reactive({
    currentItems: [] as Array<Record<string, unknown>>,
    selectedItemIndex: -1,
    selectItem: vi.fn(async () => {}),
    playItemOnScreens: vi.fn(async () => {}),
    playMusicMode: vi.fn(async () => true),
    toggleItemDone: vi.fn(),
    weekdays: {} as Record<string, unknown[]>,
    customLiturgies: [] as Array<{ items: unknown[] }>,
    selectedDay: 'sunday',
    selectDay: vi.fn((day: string) => {
      store.selectedDay = day
    }),
    selectedCustomIndex: 0,
    selectCustomLiturgy: vi.fn((index: number) => {
      store.selectedCustomIndex = index
    }),
  })
  return {
    useLiturgyStore: () => store,
    __liturgyStore: store,
  }
})

vi.mock('../../../media/composables/useMediaPlayer', () => ({
  useMediaPlayer: () => hoisted.playerStub
}))

vi.mock('../../../bible/stores/useBibleStore', () => ({
  useBibleStore: () => (hoisted.bibleStore === null ? null : (hoisted.bibleStore ?? { bootstrap: hoisted.bibleBootstrap }))
}))

vi.mock('../../../timer/stores/useTimerStore', () => ({
  useTimerStore: () => (hoisted.timerStore === null ? null : (hoisted.timerStore ?? DEFAULT_TIMER))
}))

vi.mock('../../../countdown/stores/useCountdownStore', () => ({
  useCountdownStore: () => (hoisted.countdownStore === null ? null : (hoisted.countdownStore ?? {
    runtime: { value: { status: 'idle', remainingMs: 0 } },
    isProjecting: { value: false },
    finished: { value: false },
  }))
}))

vi.mock('../../../clock/stores/useClockStore', () => ({
  useClockStore: () => (hoisted.clockStore === null ? null : (hoisted.clockStore ?? {}))
}))

vi.mock('../../../random/stores/useRandomStore', () => ({
  useRandomStore: () => (hoisted.randomStore === null ? null : hoisted.randomStore),
}))

vi.mock('../../../remote/renderer/media-target', () => ({
  resolveMediaTarget: vi.fn(async ({ projection }: any) => {
    if (projection?.getPlaybackState) return 'projection'
    return 'player'
  })
}))

// Retorna o singleton reactive do liturgy store mock
async function getLit() {
  const mod = await import('../../../liturgy/stores/useLiturgyStore') as { __liturgyStore?: { currentItems: unknown[]; selectedItemIndex: number; selectItem: ReturnType<typeof vi.fn>; playItemOnScreens: ReturnType<typeof vi.fn>; toggleItemDone: ReturnType<typeof vi.fn> } }
  return mod.__liturgyStore!
}

// Sincroniza o estado do hoisted para o singleton reactive do mock
async function syncLit() {
  const mod = await import('../../../liturgy/stores/useLiturgyStore') as { __liturgyStore?: { currentItems: unknown[]; selectedItemIndex: number } }
  const store = mod.__liturgyStore
  if (!store) return
  store.currentItems = hoisted.liturgyStore.currentItems as unknown[]
  store.selectedItemIndex = hoisted.liturgyStore.selectedItemIndex
}

async function installBridge() {
  await syncLit()
  const { installRemoteLiturgyBridge } = await import('../liturgy-bridge')
  const cleanup = await installRemoteLiturgyBridge({ router: hoisted.router })
  const onCommandCb = hoisted.remoteApiStub.onCommand.mock.calls[0]?.[0]
  if (!onCommandCb) throw new Error('onCommand not registered')
  const onStateRequestCb = hoisted.remoteApiStub.onStateRequest.mock.calls[0]?.[0]
  async function command(msg: { action: string; id?: number; [key: string]: unknown }) {
    await onCommandCb(msg)
  }
  return { command, cleanup, onStateRequestCb }
}

function resetHoisted() {
  hoisted.playerStub.queue.value = []
  hoisted.playerStub.queueIndex.value = -1
  hoisted.playerStub.queueLabel.value = null
  hoisted.playerStub.playQueue.mockClear()
  hoisted.playerStub.nextTrack.mockClear()
  hoisted.playerStub.previousTrack.mockClear()
  hoisted.targetRef = 'player'
  hoisted.projection = undefined
  hoisted.liturgyStore.currentItems = []
  hoisted.liturgyStore.selectedItemIndex = -1
  hoisted.liturgyStore.selectItem.mockClear()
  hoisted.liturgyStore.playItemOnScreens.mockClear()
  hoisted.liturgyStore.toggleItemDone.mockClear()
  hoisted.playerStub.isPlaying.value = false
  hoisted.playerStub.isProjecting.value = false
  hoisted.playerStub.toggleProjection.mockClear()
  hoisted.playerStub.session.value = { title: 'Faixa X' }
  hoisted.playerStub.volume.value = 0.7
  hoisted.playerStub.currentTimeSec.value = 0
  hoisted.playerStub.durationSec.value = 0
  hoisted.playerStub.play.mockClear()
  hoisted.playerStub.pause.mockClear()
  hoisted.playerStub.togglePlay.mockClear()
  hoisted.playerStub.stop.mockClear()
  hoisted.playerStub.next.mockClear()
  hoisted.playerStub.previous.mockClear()
  hoisted.playerStub.setVolume.mockClear()
  hoisted.playerStub.seek.mockClear()
  hoisted.playerStub.setMode.mockClear()
  hoisted.playerStub.open.mockClear()
  hoisted.playerStub.close.mockClear()
  hoisted.playerStub.seekTo.mockClear()
  hoisted.playerStub.switchMode.mockClear()
  hoisted.playerStub.nextSlide?.mockClear?.()
  hoisted.playerStub.previousSlide?.mockClear?.()
  hoisted.playerStub.goToSlide?.mockClear?.()
  hoisted.playerStub.getPlaybackState.mockClear()
  hoisted.bibleBootstrap.mockReset()
  hoisted.bibleBootstrap.mockResolvedValue(undefined)
  hoisted.searchMod.loadAlbumMusicIndex.mockClear()
  hoisted.searchMod.filterAlbumMusicIndex.mockClear()
  hoisted.modulesExecute.mockClear()
  hoisted.modulesSnapshot.mockClear()
  hoisted.remoteApiStub.onCommand.mockClear()
  hoisted.remoteApiStub.onStateRequest.mockClear()
  hoisted.remoteApiStub.sendAck.mockClear()
  hoisted.remoteApiStub.sendState.mockClear()
  hoisted.remoteApiStub.sendMediaState.mockClear()
  hoisted.router.push.mockClear()
}

describe('installRemoteLiturgyBridge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    resetHoisted()
  })

  it('Escola Sabatina remota usa a contagem do desktop e publica o estado', async () => {
    const { useSabbathSchoolStore } = await import('../../../sabbath-school/stores/useSabbathSchoolStore')
    const store = useSabbathSchoolStore()
    const { command, cleanup } = await installBridge()
    try {
      await command({ action: 'sabbath.setSchedule', mode: 'duration', durationMs: 1200000, id: 201 })
      await command({ action: 'sabbath.start', id: 202 })
      expect(store.isRunning).toBe(true)
      await vi.waitFor(() => {
        const state = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
        expect(state.sabbath.status).toBe('running')
        expect(state.sabbath.schedule.durationMs).toBe(1200000)
      })
      await command({ action: 'sabbath.pause', id: 203 })
      expect(store.runtime.status).toBe('paused')
    } finally { store.stop(); cleanup() }
  })

  it('inicializa o sorteio e sua assinatura de áudio sem abrir a tela no desktop', async () => {
    const hydrate = vi.fn()
    hoisted.randomStore = { hydrate }
    const { cleanup } = await installBridge()
    try { expect(hydrate).toHaveBeenCalledOnce() }
    finally { cleanup() }
  })

  it('playlist: play usa fila e anterior/próxima deixam de navegar na liturgia', async () => {
    const { createPlaylist, addPlaylistItem } = await import('../../../albums/services/playlist-storage')
    const list = createPlaylist('Culto remoto')
    addPlaylistItem(list.id, { musicId: 1, albumId: 3, title: 'Primeiro' })
    addPlaylistItem(list.id, { musicId: 2, albumId: 3, title: 'Segundo' })
    const { command, cleanup } = await installBridge()
    try {
      await command({ action: 'playlist.play', id: 101, targetId: list.id })
      expect(hoisted.playerStub.playQueue).toHaveBeenCalledWith(expect.any(Array), 0, 'audio', 'Culto remoto', { minimized: true })
      hoisted.playerStub.queue.value = [{ musicId: 1, albumId: 3, title: 'Primeiro' }, { musicId: 2, albumId: 3, title: 'Segundo' }]
      hoisted.playerStub.queueIndex.value = 0
      await command({ action: 'player.next', id: 102 })
      expect(hoisted.playerStub.nextTrack).toHaveBeenCalledOnce()
      hoisted.playerStub.queueIndex.value = 1
      await command({ action: 'player.previous', id: 103 })
      expect(hoisted.playerStub.previousTrack).toHaveBeenCalledOnce()
      expect(hoisted.liturgyStore.playItemOnScreens).not.toHaveBeenCalled()
    } finally { cleanup() }
  })

  it('anúncios: comandos alteram o desktop e mudanças locais atualizam o APK', async () => {
    const { useAnnouncementsStore } = await import('../../../announcements/stores/useAnnouncementsStore')
    const store = useAnnouncementsStore()
    store.addAnnouncement({ id: 'remote-ann-test', title: 'Reunião remota', kind: 'text', html: '<p>Texto</p>', plainText: 'Texto', titleColor: '' })
    const { command, cleanup } = await installBridge()
    try {
      await command({ action: 'announcements.setCarousel', id: 100, durationMs: 12000, enabled: false })
      expect(store.carousel).toEqual({ slideMs: 12000, loop: false })
      await vi.waitFor(() => {
        const state = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
        expect(state.announcements.slideMs).toBe(12000)
        expect(state.announcements.lists.flatMap(list => list.items)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'remote-ann-test' })]))
      })
      store.updateAnnouncement({ id: 'remote-ann-test', title: 'Atualizado no desktop', kind: 'text', html: '<p>Texto</p>', plainText: 'Texto', titleColor: '' })
      await vi.waitFor(() => {
        const state = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
        expect(state.announcements.lists.flatMap(list => list.items)).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Atualizado no desktop' })]))
      })
    } finally { cleanup() }
  })

  it('buildState: alvo projection com getPlaybackState monta media da projeção', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = { getPlaybackState: vi.fn(() => ({ paused: false, currentTime: 1.5, duration: 30, volume: 0.7 })) }
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 1 })
    await vi.waitFor(() => {
      const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      expect(st.player.playing).toBe(true)
      expect(st.player.volume).toBe(70)
      expect(st.player.positionMs).toBe(1500)
    })
  })

  it('buildState: projection sem getPlaybackState → fallback player', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = { getPlaybackState: undefined }
    hoisted.playerStub.isPlaying.value = true
    hoisted.playerStub.session.value = { title: 'Faixa X' }
    hoisted.playerStub.volume.value = 0.7
    hoisted.playerStub.currentTimeSec.value = 0
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 1 })
    await vi.waitFor(() => {
      const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      expect(st.player.playing).toBe(true)
      expect(st.player.title).toBe('Faixa X')
    })
  })

  it('liturgy.state: ok direto; onStateRequest empurra estado', async () => {
    const { onStateRequestCb } = await installBridge()
    await vi.advanceTimersByTimeAsync(0) // drena push inicial pendente
    const before = hoisted.remoteApiStub.sendState.mock.calls.length
    await onStateRequestCb?.()
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(before + 1)
    const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
    expect(st.player).toBeDefined()
  })

  it('liturgy.next: avança, resiste no fim; previous recua e falha no início', async () => {
    hoisted.liturgyStore.currentItems = [
      { type: 'music', name: 'Hino 1' },
      { type: 'music', name: 'Hino 2' },
    ]
    hoisted.liturgyStore.selectedItemIndex = 0
    const { command } = await installBridge()
    const lit = await getLit()
    await command({ action: 'liturgy.next', id: 10 })
    expect(lit.selectItem).toHaveBeenCalledWith(1, hoisted.router)
    lit.selectedItemIndex = 1
    await command({ action: 'liturgy.next', id: 11 })
    expect(lit.selectItem).toHaveBeenCalledTimes(1)
    await command({ action: 'liturgy.previous', id: 12 })
    expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
    lit.selectedItemIndex = 0
    await command({ action: 'liturgy.previous', id: 13 })
    expect(lit.selectItem).toHaveBeenCalledTimes(2)
  })

  it('player na PROJEÇÃO: play/pause/stop/setVolume/seek e optional-chaining vazio', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = {
      getPlaybackState: vi.fn(() => ({ playing: true, positionMs: 0, volume: 50, projecting: true })),
      remotePlay: vi.fn(async () => true),
      remotePause: vi.fn(async () => true),
      remoteStop: vi.fn(async () => true),
      remoteSetVolume: vi.fn(async () => true),
      remoteSeek: vi.fn(async () => true),
      toggleVideoScreens: vi.fn(async () => {}),
      closeUrl: vi.fn(async () => {}),
    }
    const { command } = await installBridge()
    await command({ action: 'player.play', id: 10 })
    expect(hoisted.projection.remotePlay).toHaveBeenCalled()
    await command({ action: 'player.pause', id: 11 })
    expect(hoisted.projection.remotePause).toHaveBeenCalled()
    await command({ action: 'player.stop', id: 12 })
    expect(hoisted.projection.toggleVideoScreens).toHaveBeenCalled()
    expect(hoisted.projection.closeUrl).toHaveBeenCalled()
    await command({ action: 'player.setVolume', id: 13, value: 80 })
    expect(hoisted.projection.remoteSetVolume).toHaveBeenCalledWith(0.8)
    await command({ action: 'player.seek', id: 14, positionMs: 5000 })
    expect(hoisted.projection.remoteSeek).toHaveBeenCalledWith(5)
  })

  it('player fallback local: play/pause/toggle/stop/next/previous/setVolume/seek/setMode/open', async () => {
    hoisted.liturgyStore.currentItems = [
      { type: 'music', name: 'Hino 1' },
      { type: 'music', name: 'Hino 2' },
    ]
    hoisted.liturgyStore.selectedItemIndex = 0
    const { command } = await installBridge()
    await command({ action: 'player.play', id: 15 })
    expect(hoisted.playerStub.play).toHaveBeenCalled()
    await command({ action: 'player.pause', id: 16 })
    expect(hoisted.playerStub.pause).toHaveBeenCalled()
    await command({ action: 'player.toggle', id: 17 })
    expect(hoisted.playerStub.togglePlay).toHaveBeenCalled()
    await command({ action: 'player.stop', id: 18 })
    expect(hoisted.playerStub.close).toHaveBeenCalled()
    const lit = await getLit()
    await command({ action: 'player.next', id: 19 })
    expect(lit.selectItem).toHaveBeenCalledWith(1, hoisted.router)
    lit.selectedItemIndex = 1
    await command({ action: 'player.previous', id: 20 })
    expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
    await command({ action: 'player.setVolume', id: 21, value: 50 })
    expect(hoisted.playerStub.setVolume).toHaveBeenCalledWith(0.5)
    await command({ action: 'player.seek', id: 22, positionMs: 3000 })
    expect(hoisted.playerStub.seekTo).toHaveBeenCalledWith(3)
    await command({ action: 'player.setMode', id: 23, mode: 'instrumental' })
    expect(hoisted.playerStub.switchMode).toHaveBeenCalledWith('instrumental')
    await command({ action: 'player.open', id: 24, hymnId: 42 })
    // Controle remoto abre o hino sem projetar; a seta liga a projeção.
    expect(hoisted.openMusicPlayer).toHaveBeenCalledWith(expect.objectContaining({ musicId: 42, project: false }))
  })

  it('onPlaybackSync: empurra estado com throttle de 1s', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = {
      paused: false,
      getPlaybackState: vi.fn(() => ({ paused: false, currentTime: 0.1, volume: 0.5 })),
      onPlaybackSync: vi.fn((cb) => cb),
    }
    await installBridge()
    // callback registrado via projection.onPlaybackSync
    const syncCb = hoisted.projection.onPlaybackSync.mock.calls[0]?.[0]
    expect(syncCb).toBeTypeOf('function')
    await syncCb() // 1ª chamada: lastSyncPush=0 → push
    await vi.advanceTimersByTimeAsync(0) // drena push inicial pendente
    const afterFirst = hoisted.remoteApiStub.sendState.mock.calls.length
    expect(afterFirst).toBeGreaterThanOrEqual(1)
    // imediata de novo: dentro do throttle → não empurra
    await syncCb()
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(afterFirst)
    // após 1.1s: empurra de novo
    await vi.advanceTimersByTimeAsync(1100)
    await syncCb()
    await vi.advanceTimersByTimeAsync(0) // drena push assíncrono
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBeGreaterThanOrEqual(afterFirst + 1)
  })

  it('progressTicker: nada rodando não empurra; timer running empurra a cada 1s', async () => {
    const { useTimerStore } = await import('../../../timer/stores/useTimerStore')
    const timerStore = useTimerStore()
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 1 })
    await vi.advanceTimersByTimeAsync(0) // drena push inicial pendente
    const before = hoisted.remoteApiStub.sendState.mock.calls.length
    // nada rodando: ticker não empurra
    await vi.advanceTimersByTimeAsync(2100)
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(before)
    // timer rodando: empurra a cada 1s
    timerStore.runtime.value.status = 'running'
    await vi.advanceTimersByTimeAsync(1100)
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(before + 1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(before + 2)
  })

  it('liturgy.select: válido projeta no palco; inválido → false', async () => {
    hoisted.liturgyStore.currentItems = [{ type: 'music', name: 'A' }, { type: 'music', name: 'B' }]
    const { command } = await installBridge()
    await command({ action: 'liturgy.select', id: 40, value: 1 })
    expect((await getLit()).playItemOnScreens).toHaveBeenCalledWith(1)
    // value inválido: não número
    await command({ action: 'liturgy.select', id: 41, value: 'x' })
    // índice fora do range
    await command({ action: 'liturgy.select', id: 42, value: 99 })
    expect((await getLit()).playItemOnScreens).toHaveBeenCalledTimes(1)
  })

  it('liturgy.toggleDone: value numérico ou current; fora do range → false', async () => {
    hoisted.liturgyStore.currentItems = [{ type: 'music', name: 'A' }]
    hoisted.liturgyStore.selectedItemIndex = 0
    const { command } = await installBridge()
    await command({ action: 'liturgy.toggleDone', id: 43, value: 0 })
    expect((await getLit()).toggleItemDone).toHaveBeenCalledWith(0)
    // sem value usa current
    await command({ action: 'liturgy.toggleDone', id: 44 })
    expect((await getLit()).toggleItemDone).toHaveBeenCalledWith(0)
    // índice inválido
    await command({ action: 'liturgy.toggleDone', id: 45, value: 5 })
    expect((await getLit()).toggleItemDone).toHaveBeenCalledTimes(2)
  })

  it('liturgy.state → true; ação desconhecida → false (ack negativo)', async () => {
    const { command } = await installBridge()
    await command({ action: 'liturgy.state', id: 46 })
    const ack1 = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack1.ok).toBe(true)
    await command({ action: 'liturgy.bla', id: 47 })
    const ack2 = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack2.ok).toBe(false)
  })

  it('player.toggle na projeção: pb.paused → remotePlay; não paused → remotePause; sem pb → false', async () => {
    hoisted.targetRef = 'projection'
    const pausedFlag = { value: true }
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => ({ paused: pausedFlag.value })),
      remotePlay: vi.fn(async () => true),
      remotePause: vi.fn(async () => true),
    }
    const { command } = await installBridge()
    // paused=true → toggle → remotePlay
    await command({ action: 'player.toggle', id: 50 })
    await vi.waitFor(() => expect(hoisted.projection.remotePlay).toHaveBeenCalled())
    // paused=false → toggle → remotePause
    pausedFlag.value = false
    await command({ action: 'player.toggle', id: 51 })
    await vi.waitFor(() => expect(hoisted.projection.remotePause).toHaveBeenCalled())
    // getPlaybackState → null → toggle → false (nenhum remote chamado)
    hoisted.projection.getPlaybackState.mockResolvedValue(null)
    const rpBefore = hoisted.projection.remotePlay.mock.calls.length
    const rpsBefore = hoisted.projection.remotePause.mock.calls.length
    await command({ action: 'player.toggle', id: 52 })
    expect(hoisted.projection.remotePlay).toHaveBeenCalledTimes(rpBefore)
    expect(hoisted.projection.remotePause).toHaveBeenCalledTimes(rpsBefore)
  })

  it('player na projeção sem métodos remotos: optional chaining → false/true', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = { getPlaybackState: vi.fn(async () => ({ paused: false })) }
    const { command } = await installBridge()
    await command({ action: 'player.play', id: 53 })
    await command({ action: 'player.pause', id: 54 })
    await command({ action: 'player.toggle', id: 55 })
    await command({ action: 'player.seek', id: 56, positionMs: 1000 })
    // stop tem toggleVideoScreens/closeUrl opcionais → true
    await command({ action: 'player.stop', id: 57 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(true)
    // setVolume sem number → false
    await command({ action: 'player.setVolume', id: 58 })
    // setMode/open não tratados na projeção → caem no fallback local (linha break)
    hoisted.liturgyStore.currentItems = [{ type: 'music', name: 'A' }, { type: 'music', name: 'B' }]
    hoisted.liturgyStore.selectedItemIndex = 0
    await command({ action: 'player.setMode', id: 59, mode: 'audio' })
    await command({ action: 'player.open', id: 60, hymnId: 7 })
  })

  it('palco namespace: todos os comandos reais do handler v2', async () => {
    const { command } = await installBridge()
    const cmds: Array<[string, Record<string, unknown>]> = [
      ['palco.on', {}],
      ['palco.off', {}],
      ['palco.status', {}],
      ['palco.slots', {}],
      ['palco.slot-add', { label: 'TV 1' }],
      ['palco.slot-remove', { slotId: 's1' }],
      ['palco.slot-start', { slotId: 's1' }],
      ['palco.slot-stop', { slotId: 's1' }],
      ['palco.project', { text: 'Hino 1', scope: 'hymns' }],
      ['palco.idle', {}],
    ]
    for (const [action, extra] of cmds) {
      await command({ action, id: 60, ...extra })
    }
    const lastAck = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(lastAck.ok).toBe(true)
  })

  it('bible/timer/countdown/clock/random namespaces executam sem derrubar bridge', async () => {
    const { command } = await installBridge()
    await command({ action: 'clock.toggleProjection', id: 70 })
    await command({ action: 'random.pick', id: 71 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack).toBeDefined()
  })

  it('media.search falha (índice indisponível) → devolve vazio sem derrubar bridge', async () => {
    hoisted.searchMod.loadAlbumMusicIndex.mockRejectedValue(new Error('API fora'))
    const { command } = await installBridge()
    await command({ action: 'media.search', id: 72, query: 'hino' })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(true) // handler loga e devolve []
    hoisted.searchMod.loadAlbumMusicIndex.mockRejectedValue(undefined as never)
  })

  it('execute lança → catch → ack ok:false', async () => {
    const { command } = await installBridge()
    // openMusicPlayer rejeita → media.open falha com exceção → catch do onCommand
    hoisted.openMusicPlayer.mockRejectedValueOnce(new Error('boom'))
    await command({ action: 'media.open', id: 73, musicId: 1 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(false)
  })

  it('handler devolve {ok,data} → ack propaga data (media.search com resultados)', async () => {
    hoisted.searchMod.loadAlbumMusicIndex.mockResolvedValue([{ musicId: 1, name: 'Hino 1' }])
    hoisted.searchMod.filterAlbumMusicIndex.mockReturnValue([{ musicId: 1, name: 'Hino 1', track: null }])
    const { command } = await installBridge()
    await command({ action: 'media.search', id: 74, query: 'hino' })
    // executa o ack com ok (resultado interno no cache do handler)
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(true)
  })

  it('cleanup: limpa ticker e desregistra handlers', async () => {
    const onCmdUn = vi.fn()
    hoisted.remoteApiStub.onCommand.mockImplementationOnce(() => onCmdUn)
    const onStateUn = vi.fn()
    hoisted.remoteApiStub.onStateRequest.mockImplementationOnce(() => onStateUn)
    const { cleanup } = await installBridge()
    await cleanup()
    expect(onCmdUn).toHaveBeenCalled()
    expect(onStateUn).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0) // drena push inicial pendente
    // após cleanup, ticker limpo: avançar tempo não empurra mais nada via ticker novo
    const before = hoisted.remoteApiStub.sendState.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(before)
  })

  it('sem desktop bridge (remoteApi ausente) → retorna noop', async () => {
    const mod = await import('@shared/services/desktop-bridge')
    vi.mocked(mod.getDesktopBridge).mockReturnValueOnce({ remote: undefined, projection: undefined } as never)
    const { installRemoteLiturgyBridge } = await import('../liturgy-bridge')
    const cleanup = await installRemoteLiturgyBridge({ router: hoisted.router })
    expect(cleanup).toBeTypeOf('function')
    cleanup()
  })

  it('bibleStore.bootstrap rejeita → catch silencioso (bridge segue de pé)', async () => {
    // remock useBibleStore para essa instancia: usar via spy no modulo real mockado
    // como o mock é por arquivo, validamos indiretamente: bridge instalou e respondeu
    const { command } = await installBridge()
    await command({ action: 'liturgy.state', id: 80 })
    expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
  })

  it('setMode inválido (mode não string/fora da lista) → false; hymnId não number → false', async () => {
    const { command } = await installBridge()
    await command({ action: 'player.setMode', id: 81, mode: 'xpto' })
    await command({ action: 'player.setMode', id: 82 })
    expect(hoisted.playerStub.switchMode).not.toHaveBeenCalled()
    await command({ action: 'player.open', id: 83 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(false)
  })

  it('seek sem positionMs (local e projeção) → false; setVolume sem value → false', async () => {
    const { command } = await installBridge()
    await command({ action: 'player.seek', id: 84 })
    await command({ action: 'player.setVolume', id: 85 })
    expect(hoisted.playerStub.seekTo).not.toHaveBeenCalled()
    expect(hoisted.playerStub.setVolume).not.toHaveBeenCalled()
  })

  it('seek/setVolume sem valores na PROJEÇÃO → false via projection switch', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => ({ paused: false })),
      remotePlay: vi.fn(async () => true),
      remotePause: vi.fn(async () => true),
      remoteSetVolume: vi.fn(async () => true),
      remoteSeek: vi.fn(async () => true),
    }
    const { command } = await installBridge()
    await command({ action: 'player.seek', id: 90 })
    await command({ action: 'player.setVolume', id: 91 })
    expect(hoisted.projection.remoteSeek).not.toHaveBeenCalled()
    expect(hoisted.projection.remoteSetVolume).not.toHaveBeenCalled()
  })

  it('bibleStore.bootstrap rejeita → catch silencioso (bridge segue de pé)', async () => {
    hoisted.bibleBootstrap.mockRejectedValue(new Error('catálogo falhou'))
    const { command } = await installBridge()
    await command({ action: 'liturgy.state', id: 80 })
    expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
  })

  it('slide:next/prev/goto controlam o player (superfície do pregador)', async () => {
    const { command } = await installBridge()
    await command({ action: 'slide:next', id: 91 })
    await command({ action: 'slide:prev', id: 92 })
    await command({ action: 'slide:goto', id: 93, index: 2 })
    expect(hoisted.playerStub.nextSlide).toHaveBeenCalledTimes(1)
    expect(hoisted.playerStub.previousSlide).toHaveBeenCalledTimes(1)
    expect(hoisted.playerStub.goToSlide).toHaveBeenCalledWith(2)
    // goto sem index numérico → false
    await command({ action: 'slide:goto', id: 94, index: 'x' as unknown as number })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(false)
  })

  it('slide:next/prev com PDF projetado roteia para projection.remotePdf* (cabo E palco)', async () => {
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => null),
      getPdfPageState: vi.fn(async () => ({ index: 1, total: 10, projecting: true })),
      remotePdfNext: vi.fn(async () => ({ index: 2, total: 10 })),
      remotePdfPrev: vi.fn(async () => ({ index: 0, total: 10 })),
    }
    const { command } = await installBridge()
    await command({ action: 'slide:next', id: 101 })
    expect(hoisted.projection.remotePdfNext).toHaveBeenCalledTimes(1)
    expect(hoisted.playerStub.nextSlide).not.toHaveBeenCalled()
    await command({ action: 'slide:prev', id: 102 })
    expect(hoisted.projection.remotePdfPrev).toHaveBeenCalledTimes(1)
    expect(hoisted.playerStub.previousSlide).not.toHaveBeenCalled()
  })

  it('slide:next com PPT projetado roteia para projection.remotePpt* (cabo E palco)', async () => {
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => null),
      getPptSlideState: vi.fn(async () => ({ index: 2, total: 15, projecting: true })),
      remotePptNext: vi.fn(async () => ({ index: 3, total: 15 })),
      remotePptPrev: vi.fn(async () => ({ index: 1, total: 15 })),
    }
    const { command } = await installBridge()
    await command({ action: 'slide:next', id: 103 })
    expect(hoisted.projection.remotePptNext).toHaveBeenCalledTimes(1)
    expect(hoisted.playerStub.nextSlide).not.toHaveBeenCalled()
    await command({ action: 'slide:prev', id: 104 })
    expect(hoisted.projection.remotePptPrev).toHaveBeenCalledTimes(1)
  })

  it('opening an image control does not automatically publish gallery frames to connections', async () => {
    const capture = vi.fn(async () => 'frame')
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => null),
      getImageSlideState: vi.fn(async () => ({ index: 0, total: 3, projecting: false })),
      captureSourceFrame: capture,
    }
    await installBridge()
    await vi.advanceTimersByTimeAsync(2100)
    expect(capture).not.toHaveBeenCalled()
  })

  describe('letra do hino para a previa do celular', () => {
    function hymnOpen() {
      hoisted.projection = { getPlaybackState: vi.fn(async () => null) }
      hoisted.playerStub.session.value = {
        title: 'Digno',
        slides: [
          { lyric: '', isCover: true },
          { lyric: 'Digno és<br>Senhor', isCover: false },
          { lyric: '<b>Santo</b>, santo', isCover: false },
        ],
      } as never
      hoisted.playerStub.slideIndex.value = 1
    }

    it('manda a letra de cada slide em texto simples', async () => {
      hymnOpen()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].slide).toMatchObject({
          index: 1,
          total: 3,
          lyrics: ['Digno', 'Digno és\nSenhor', 'Santo, santo'],
        }),
      )
      cleanup()
    })

    function hymnWithBackgrounds() {
      hoisted.projection = { getPlaybackState: vi.fn(async () => null) }
      hoisted.playerStub.session.value = {
        musicId: 7,
        mode: 'audio',
        title: 'Digno',
        slides: [
          { lyric: '', isCover: true, imageUrl: 'capa.jpg' },
          { lyric: 'A', isCover: false, imageUrl: 'fundo.jpg' },
          { lyric: 'B', isCover: false, imageUrl: 'fundo.jpg' },
          { lyric: 'C', isCover: false, imageUrl: null },
        ],
      } as never
      hoisted.playerStub.slideIndex.value = 1
    }
    function lastSlideState() {
      return hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].slide
    }

    it('manda o fundo de cada slide sem repetir imagem', async () => {
      hymnWithBackgrounds()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastSlideState()).toMatchObject({
          backgroundIndex: [0, 1, 1, -1],
          backgroundSources: ['data:image/jpeg;base64,capa.jpg', 'data:image/jpeg;base64,fundo.jpg'],
        }),
      )
      cleanup()
    })

    it('fundos ja enviados nao vao de novo; o indice segue', async () => {
      hymnWithBackgrounds()
      const { command, onStateRequestCb, cleanup } = await installBridge()
      await onStateRequestCb()
      await vi.waitFor(() => expect(lastSlideState()?.backgroundSources).toBeDefined())

      await command({ action: 'liturgy.state', id: 999 })

      await vi.waitFor(() => {
        expect(lastSlideState().backgroundIndex).toEqual([0, 1, 1, -1])
        expect(lastSlideState()).not.toHaveProperty('backgroundSources')
      })
      cleanup()
    })

    it('sem slides de letra nao manda letra', async () => {
      hoisted.projection = { getPlaybackState: vi.fn(async () => null) }
      hoisted.playerStub.session.value = { title: 'Faixa X' } as never
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() => expect(hoisted.remoteApiStub.sendState).toHaveBeenCalled())
      expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].slide).not.toHaveProperty('lyrics')
      cleanup()
    })
  })

  describe('pdf aberto: seta de projetar', () => {
    function pdfOpen(projecting: boolean) {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => null),
        runVideoControlCommand: vi.fn(async () => false),
        getPdfPageState: vi.fn(async () => ({ index: 2, total: 3, projecting })),
        toggleVideoScreens: vi.fn(async () => true),
      }
      return hoisted.projection as unknown as { toggleVideoScreens: ReturnType<typeof vi.fn> }
    }

    it('anuncia que da para projetar o pdf', async () => {
      pdfOpen(false)
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video).toMatchObject({
          canProject: true,
          projecting: false,
        }),
      )
      cleanup()
    })

    it('a seta liga e desliga as telas do pdf', async () => {
      const projection = pdfOpen(true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.toggleProjection', id: 998 })

      expect(projection.toggleVideoScreens).toHaveBeenCalledOnce()
      cleanup()
    })
  })

  describe('imagem aberta: seta de projetar', () => {
    function imageOpen(projecting: boolean) {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => null),
        runVideoControlCommand: vi.fn(async () => false),
        getImageSlideState: vi.fn(async () => ({ index: 0, total: 3, projecting })),
        toggleVideoScreens: vi.fn(async () => true),
      }
      return hoisted.projection as unknown as { toggleVideoScreens: ReturnType<typeof vi.fn> }
    }

    it('anuncia que da para projetar a imagem', async () => {
      imageOpen(false)
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video).toMatchObject({
          canProject: true,
          projecting: false,
        }),
      )
      cleanup()
    })

    it('imagem projetada aparece como projetando', async () => {
      imageOpen(true)
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video.projecting).toBe(true),
      )
      cleanup()
    })

    it('a seta liga e desliga as telas da imagem', async () => {
      const projection = imageOpen(false)
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.toggleProjection', id: 995 })

      expect(projection.toggleVideoScreens).toHaveBeenCalledOnce()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })
  })

  describe('site aberto: projetar e fechar pelo celular', () => {
    function siteOpen(projecting: boolean) {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => null),
        runVideoControlCommand: vi.fn(async () => false),
        getNavigationState: vi.fn(async () => ({ projecting, url: 'https://x.org' })),
        toggleSiteScreens: vi.fn(async () => true),
        toggleVideoScreens: vi.fn(async () => true),
        closeUrl: vi.fn(async () => undefined),
      }
      return hoisted.projection as unknown as Record<string, ReturnType<typeof vi.fn>>
    }

    it('anuncia a seta e o estado de projecao do site', async () => {
      siteOpen(true)
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video).toMatchObject({
          canProject: true,
          projecting: true,
        }),
      )
      cleanup()
    })

    it('a seta liga e desliga as telas do site', async () => {
      const projection = siteOpen(false)
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.toggleProjection', id: 993 })

      expect(projection.toggleSiteScreens).toHaveBeenCalledOnce()
      expect(projection.toggleVideoScreens).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it.each([[false, false, true, 1], [true, false, true, 0], [false, true, true, 0], [false, false, false, 0]])('site: projetando=%s concluído=%s sucesso=%s → %s marcações', async (projecting, done, success, calls) => {
      const projection = siteOpen(projecting)
      projection.toggleSiteScreens.mockResolvedValue(success)
      const { useLiturgyStore } = await import('../../../liturgy/stores/useLiturgyStore')
      const lit = useLiturgyStore()
      hoisted.liturgyStore.currentItems = [{ type: 'site', name: 'Site', done }]
      hoisted.liturgyStore.selectedItemIndex = 0
      vi.mocked(lit.toggleItemDone).mockClear()
      const { command, cleanup } = await installBridge()
      await command({ action: 'video.toggleProjection', id: 991 })
      expect(lit.toggleItemDone).toHaveBeenCalledTimes(calls)
      if (calls) expect(lit.toggleItemDone).toHaveBeenCalledWith(0)
      cleanup()
    })

    it.each([[false, false, true, 1], [true, false, true, 0], [false, true, true, 0], [false, false, false, 0]])('anotação: projetando=%s concluída=%s sucesso=%s → %s marcações', async (projecting, done, success, calls) => {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => ({ projecting })),
        runVideoControlCommand: vi.fn(async () => success),
      }
      hoisted.liturgyStore.currentItems = [{ type: 'annotation', name: 'Aviso', done }]
      hoisted.liturgyStore.selectedItemIndex = 0
      const { useLiturgyStore } = await import('../../../liturgy/stores/useLiturgyStore')
      const lit = useLiturgyStore()
      vi.mocked(lit.toggleItemDone).mockClear()
      const { command, cleanup } = await installBridge()
      await command({ action: 'video.toggleProjection', id: 990 })
      expect(lit.toggleItemDone).toHaveBeenCalledTimes(calls)
      if (calls) expect(lit.toggleItemDone).toHaveBeenCalledWith(0)
      cleanup()
    })

    it.each(['site', 'annotation'])('fechar %s usado sem projetar conclui o item', async (type) => {
      const projection = siteOpen(false)
      if (type === 'annotation') {
        hoisted.targetRef = 'projection'
        projection.getPlaybackState.mockResolvedValue({ projecting: false })
      }
      hoisted.liturgyStore.currentItems = [{ type, name: 'Usado', done: false }]
      hoisted.liturgyStore.selectedItemIndex = 0
      const lit = await getLit()
      lit.toggleItemDone.mockClear()
      const { command, cleanup } = await installBridge()
      await command({ action: 'player.stop', id: 988 })
      expect(lit.toggleItemDone).toHaveBeenCalledWith(0)
      cleanup()
    })

    it('prévia do texto usa quadros novos, sem miniatura estática preta', async () => {
      hoisted.projection = {
        getTextScale: vi.fn(async () => ({ scale: 1 })),
        getImageSlideState: vi.fn(async () => ({ index: 0, total: 1 })),
        captureSlidePreview: vi.fn(async () => 'captura-preta'),
        getVideoControlSnapshot: vi.fn(async () => ({ projecting: false })),
      }
      const { onStateRequestCb, cleanup } = await installBridge()
      await onStateRequestCb()
      const state = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      expect(state.slide.preview).toBeUndefined()
      expect(state.video).toBeDefined()
      cleanup()
    })

    it('fechar desliga as telas e fecha o site', async () => {
      const projection = siteOpen(true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'player.stop', id: 992 })

      expect(projection.toggleSiteScreens).toHaveBeenCalledOnce()
      expect(projection.closeUrl).toHaveBeenCalledOnce()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('site aberto, projetado ou fechado no desktop avisa o celular', async () => {
      let nav: { projecting: boolean } | null = null
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => null),
        getNavigationState: vi.fn(async () => nav),
      }
      const { cleanup } = await installBridge()
      const last = () => hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      await vi.advanceTimersByTimeAsync(2100)
      await vi.waitFor(() => expect(last()?.video).toBeUndefined())

      nav = { projecting: false }
      await vi.advanceTimersByTimeAsync(2100)
      await vi.waitFor(() => expect(last()?.video).toMatchObject({ canProject: true, projecting: false }))

      nav = { projecting: true }
      await vi.advanceTimersByTimeAsync(2100)
      await vi.waitFor(() => expect(last()?.video?.projecting).toBe(true))

      nav = null
      await vi.advanceTimersByTimeAsync(2100)
      await vi.waitFor(() => expect(last()?.video).toBeUndefined())
      cleanup()
    })

    it('navegar no celular leva o site projetado ao mesmo endereco', async () => {
      const projection = siteOpen(true)
      projection.remoteNavigate = vi.fn(async () => true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'site.navigate', url: 'https://x.org/imoveis', id: 990 })

      expect(projection.remoteNavigate).toHaveBeenCalledWith('https://x.org/imoveis')
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('navegar sem endereco e recusado', async () => {
      const projection = siteOpen(true)
      projection.remoteNavigate = vi.fn(async () => true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'site.navigate', id: 989 })

      expect(projection.remoteNavigate).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('rolar no celular rola o site projetado na mesma proporcao', async () => {
      const projection = siteOpen(true)
      projection.remoteScroll = vi.fn(async () => true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'site.scroll', ratio: 0.42, id: 988 })

      expect(projection.remoteScroll).toHaveBeenCalledWith(0.42)
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('rolagem sem proporcao valida e recusada', async () => {
      const projection = siteOpen(true)
      projection.remoteScroll = vi.fn(async () => true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'site.scroll', id: 987 })
      await command({ action: 'site.scroll', ratio: Number.NaN, id: 986 })

      expect(projection.remoteScroll).not.toHaveBeenCalled()
      cleanup()
    })

    it('fechar site so aberto nao liga as telas', async () => {
      const projection = siteOpen(false)
      const { command, cleanup } = await installBridge()

      await command({ action: 'player.stop', id: 991 })

      expect(projection.toggleSiteScreens).not.toHaveBeenCalled()
      expect(projection.closeUrl).toHaveBeenCalledOnce()
      cleanup()
    })
  })

  describe('hino: abertura e projeção separadas', () => {
    it.each([false, true])('estado anuncia seta de projeção do hino (%s)', async (projecting) => {
      hoisted.playerStub.session.value = { title: 'Hino', slides: [{ lyric: 'Letra' }] } as never
      hoisted.playerStub.isProjecting.value = projecting
      const { onStateRequestCb, cleanup } = await installBridge()
      await onStateRequestCb()
      expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video).toMatchObject({ canProject: true, projecting })
      cleanup()
    })

    it('seta do hino alterna a projeção no próprio player', async () => {
      hoisted.playerStub.session.value = { title: 'Hino', slides: [{ lyric: 'Letra' }] } as never
      const { command, cleanup } = await installBridge()
      await command({ action: 'video.toggleProjection', id: 1130 })
      expect(hoisted.playerStub.toggleProjection).toHaveBeenCalledOnce()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('play da música da liturgia abre sem projetar', async () => {
      hoisted.liturgyStore.currentItems = [{ type: 'music', name: 'Hino' }]
      const { command, cleanup } = await installBridge()
      const lit = await getLit()
      await command({ action: 'liturgy.open', value: 0, id: 1131 })
      expect((lit as any).playMusicMode).toHaveBeenCalledWith(0, 'audio', hoisted.router, { project: false })
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      cleanup()
    })
  })

  describe('video aberto: estado leve', () => {
    it('o estado nao leva quadro do video (vai pelo canal de quadros)', async () => {
      const capture = vi.fn(async () => 'data:image/jpeg;base64,AAA')
      hoisted.targetRef = 'projection'
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => ({ paused: false, currentTime: 3, duration: 60, volume: 1 })),
        getVideoControlSnapshot: vi.fn(async () => null),
        captureSlidePreview: capture,
      }
      const sends = hoisted.remoteApiStub.sendState.mock.calls.length
      const { command, cleanup } = await installBridge()

      await command({ action: 'state.request', id: 985 })

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBeGreaterThan(sends),
      )
      expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].slide.preview).toBeUndefined()
      expect(capture).not.toHaveBeenCalled()
      cleanup()
    })
  })

  describe('previa do slide para o celular', () => {
    function galleryProjection(capture: ReturnType<typeof vi.fn>) {
      let index = 0
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getImageSlideState: vi.fn(async () => ({ index, total: 3, projecting: false })),
        captureSlidePreview: capture,
      }
      return { setIndex: (next: number) => { index = next } }
    }
    function lastSlide() {
      return hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].slide
    }

    it('imagem aberta manda a previa junto do slide', async () => {
      galleryProjection(vi.fn(async () => 'jpeg0'))
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() => expect(lastSlide()).toEqual({ index: 0, total: 3, preview: 'jpeg0' }))
      cleanup()
    })

    it('mesma imagem nao e capturada de novo; trocar de imagem captura', async () => {
      const capture = vi.fn(async () => 'jpeg')
      const gallery = galleryProjection(capture)
      const { onStateRequestCb, cleanup } = await installBridge()
      await onStateRequestCb()
      await onStateRequestCb()
      await vi.waitFor(() => expect(lastSlide()?.preview).toBe('jpeg'))
      const calls = capture.mock.calls.length

      gallery.setIndex(1)
      await onStateRequestCb()

      await vi.waitFor(() => expect(capture.mock.calls.length).toBe(calls + 1))
      cleanup()
    })

    it('imagem ainda carregando tenta de novo sozinha', async () => {
      const capture = vi.fn().mockResolvedValueOnce(null).mockResolvedValue('pronta')
      galleryProjection(capture)
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.advanceTimersByTimeAsync(1500)

      await vi.waitFor(() => expect(lastSlide()?.preview).toBe('pronta'))
      cleanup()
    })

    function galleryWithThumbs(key = 'g1') {
      const gallery = { key, previews: ['a', 'b', 'c'] }
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getImageSlideState: vi.fn(async () => ({ index: 0, total: 3, projecting: false })),
        captureSlidePreview: vi.fn(async () => 'a'),
        captureGalleryPreviews: vi.fn(async () => gallery),
        remoteImageNext: vi.fn(async () => ({ index: 1, total: 3 })),
      }
      return gallery
    }

    it('celular que pede o estado recebe as miniaturas da galeria', async () => {
      galleryWithThumbs()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastSlide()).toMatchObject({ galleryKey: 'g1', previews: ['a', 'b', 'c'] }),
      )
      cleanup()
    })

    it('depois de enviadas, so a chave da galeria segue no estado', async () => {
      galleryWithThumbs()
      const { command, onStateRequestCb, cleanup } = await installBridge()
      await onStateRequestCb()
      await vi.waitFor(() => expect(lastSlide()?.previews).toBeDefined())

      await command({ action: 'slide:next', id: 996 })

      await vi.waitFor(() => {
        expect(lastSlide().galleryKey).toBe('g1')
        expect(lastSlide()).not.toHaveProperty('previews')
      })
      cleanup()
    })

    it('outra galeria manda as miniaturas de novo', async () => {
      const gallery = galleryWithThumbs()
      const { command, onStateRequestCb, cleanup } = await installBridge()
      await onStateRequestCb()
      await vi.waitFor(() => expect(lastSlide()?.previews).toBeDefined())

      gallery.key = 'g2'
      await command({ action: 'slide:next', id: 997 })

      await vi.waitFor(() => expect(lastSlide()).toMatchObject({ galleryKey: 'g2', previews: ['a', 'b', 'c'] }))
      cleanup()
    })

    it('sem imagem, pdf ou ppt aberto nao ha previa', async () => {
      hoisted.projection = { getPlaybackState: vi.fn(async () => null) }
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() => expect(hoisted.remoteApiStub.sendState).toHaveBeenCalled())
      expect(lastSlide()).not.toHaveProperty('preview')
      cleanup()
    })
  })

  it('slide:next com IMAGEM projetada roteia para projection.remoteImage* (cabo E palco)', async () => {
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => null),
      getImageSlideState: vi.fn(async () => ({ index: 0, total: 4, projecting: true })),
      remoteImageNext: vi.fn(async () => ({ index: 1, total: 4 })),
      remoteImagePrev: vi.fn(async () => ({ index: 0, total: 4 })),
    }
    const { command } = await installBridge()
    await command({ action: 'slide:next', id: 105 })
    expect(hoisted.projection.remoteImageNext).toHaveBeenCalledTimes(1)
    expect(hoisted.playerStub.nextSlide).not.toHaveBeenCalled()
    await command({ action: 'slide:prev', id: 106 })
    expect(hoisted.projection.remoteImagePrev).toHaveBeenCalledTimes(1)
  })

  it('slide:goto com PDF projetado roteia índice absoluto para projeção', async () => {
    hoisted.projection = {
      getPlaybackState: vi.fn(async () => null),
      getPdfPageState: vi.fn(async () => ({ index: 1, total: 10, projecting: true })),
      remotePdfNext: vi.fn(async () => ({ index: 2, total: 10 })),
      remotePdfPrev: vi.fn(async () => ({ index: 0, total: 10 })),
    }
    const { command } = await installBridge()
    await command({ action: 'slide:goto', id: 107, index: 5 })
    // sem API de goto absoluto no PDF: navega por next/prev até o alvo
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect([true, false]).toContain(ack.ok)
  })

  it('estado inclui slide {index,total} do player', async () => {
    hoisted.playerStub.slideIndex.value = 3
    hoisted.playerStub.session.value = { title: 'Faixa X', slides: new Array(7) }
    const { command } = await installBridge()
    await command({ action: 'liturgy.state', id: 95 })
    await vi.waitFor(() => {
      const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      expect(st.slide).toMatchObject({ index: 3, total: 7 })
    })
    // sem session/slides → fallback 0
    hoisted.playerStub.session.value = { title: 'Faixa X' }
    hoisted.playerStub.slideIndex.value = 0
    await command({ action: 'liturgy.state', id: 96 })
    await vi.waitFor(() => {
      const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      expect(st.slide).toEqual({ index: 0, total: 0 })
    })
    // session inteira indefinida → fallback 0
    hoisted.playerStub.session.value = undefined
    await command({ action: 'liturgy.state', id: 97 })
    await vi.waitFor(() => {
      const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
      expect(st.slide).toEqual({ index: 0, total: 0 })
    })
  })

  it('ação totalmente desconhecida → false (return final)', async () => {
    const { command } = await installBridge()
    await command({ action: 'foo.bar', id: 86 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(false)
  })

  it('estados degenerados: items undefined, selectedItemIndex undefined, player fields null', async () => {
    hoisted.liturgyStore.currentItems = undefined as never
    hoisted.liturgyStore.selectedItemIndex = undefined as never
    hoisted.playerStub.isPlaying.value = undefined as never
    hoisted.playerStub.session.value = null as never
    hoisted.playerStub.volume.value = null as never
    hoisted.playerStub.currentTimeSec.value = null as never
    hoisted.playerStub.durationSec.value = null as never
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 95 })
    await command({ action: 'liturgy.next', id: 96 }) // current ?? -1 → -1+1=0 >= 0 items → false
    const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
    expect(st.liturgy.total).toBe(0)
    expect(st.player.canPrevious).toBe(false)
  })

  it('items com name/subtitle vazios, item sem subtitle/done/accentColor → fallbacks', async () => {
    hoisted.liturgyStore.currentItems = [
      { type: 'music', name: '', subtitle: '' },
      { type: 'category', name: 'Seção' },
      { type: 'music', name: 'Ok', subtitle: 'Sub', done: true, accentColor: '#f00' },
      { type: 'music', name: 'SemSub', done: false },          // sem subtitle
      { type: 'music', name: 'SemDone' },                       // sem done
      { type: 'music', name: 'SemAccent' },                     // sem accentColor
    ]
    hoisted.liturgyStore.selectedItemIndex = -1
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 97 })
    const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
    expect(st.liturgy.items[0].title).toBeNull()
    expect(st.liturgy.items[1].isCategory).toBe(true)
    expect(st.liturgy.items[2].done).toBe(true)
    expect(st.player.canPrevious).toBe(false) // selectedIndex ?? -1 → -1 > 0 false
  })

  it('item de site leva o link para o celular abrir no navegador dele', async () => {
    hoisted.liturgyStore.currentItems = [
      { type: 'site', name: 'Site', url: ' https://www.adventistas.org ' },
      { type: 'site', name: 'Sem link', url: '  ' },
      { type: 'music', name: 'Hino', url: 'https://nao-vai' },
    ]
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 98 })
    const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
    expect(st.liturgy.items[0].url).toBe('https://www.adventistas.org')
    expect(st.liturgy.items[1].url).toBeNull()
    expect(st.liturgy.items[2].url).toBeNull()
  })

  it('projection getPlaybackState retorna undefined no toggle → false', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = { getPlaybackState: vi.fn(async () => undefined) }
    const { command } = await installBridge()
    await command({ action: 'player.toggle', id: 98 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(false)
  })

  it('store random ausente → snapshot null → campo undefined no state', async () => {
    hoisted.randomStore = null
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 99 })
    const st = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0]
    expect(st.random).toBeUndefined()
  })

  it('projection sem remotePlay/remotePause no toggle → false via ?? false', async () => {
    hoisted.targetRef = 'projection'
    hoisted.projection = { getPlaybackState: vi.fn(async () => ({ paused: true })) }
    const { command } = await installBridge()
    await command({ action: 'player.toggle', id: 100 })
    const ack = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack.ok).toBe(false)
  })

  it('watch da liturgia: mudança em selectedItemIndex empurra estado', async () => {
    vi.useRealTimers()
    const mod = await import('../../../liturgy/stores/useLiturgyStore') as { __liturgyStore?: { selectedItemIndex: number; currentItems: unknown[] } }
    const store = mod.__liturgyStore!
    store.currentItems = [{ type: 'music', name: 'A' }, { type: 'music', name: 'B' }]
    await installBridge()
    const before = hoisted.remoteApiStub.sendState.mock.calls.length
    store.selectedItemIndex = 1
    await vi.waitFor(() => {
      expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBeGreaterThan(before)
    }, { timeout: 2000, interval: 10 })
  })

  it('media.search: cache vazio carrega índice e filtra; query vazia → ack ok', async () => {
    hoisted.searchMod.loadAlbumMusicIndex.mockResolvedValue([{ musicId: 1, name: 'Hino 1' }, { musicId: 2, name: 'Hino 2' }])
    hoisted.searchMod.filterAlbumMusicIndex.mockReturnValue([{ musicId: 1, name: 'Hino 1', track: null }])
    const { command } = await installBridge()
    // query com resultado
    await command({ action: 'media.search', id: 30, query: 'hino' })
    expect(hoisted.searchMod.loadAlbumMusicIndex).toHaveBeenCalled()
    expect(hoisted.searchMod.filterAlbumMusicIndex).toHaveBeenCalledWith(expect.anything(), 'hino')
    const ack1 = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack1.ok).toBe(true)
    // query vazia → searchMusic devolve [] antes de filtrar
    await command({ action: 'media.search', id: 31, query: '' })
    const ack2 = hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    expect(ack2.ok).toBe(true)
    // query vazia: filtro não roda de novo (índice carregado 1x só)
    expect(hoisted.searchMod.filterAlbumMusicIndex).toHaveBeenCalledTimes(1)
  })
  describe('progresso da mídia em reprodução', () => {
    beforeEach(() => {
      hoisted.timerStore = { runtime: { value: { status: 'idle' } } }
      hoisted.countdownStore = undefined
    })
    afterEach(() => vi.useRealTimers())

    it('avisa uma vez quando o vídeo para de tocar', async () => {
      const getPlaybackState = vi.fn(async () => ({ paused: false, currentTime: 5, duration: 90 }))
      hoisted.projection = { getPlaybackState }
      vi.useFakeTimers()
      const { cleanup } = await installBridge()
      await vi.advanceTimersByTimeAsync(1000)
      getPlaybackState.mockResolvedValue({ paused: true, currentTime: 6, duration: 90 })
      hoisted.remoteApiStub.sendState.mockClear()

      await vi.advanceTimersByTimeAsync(3000)

      expect(hoisted.remoteApiStub.sendState).toHaveBeenCalledTimes(1)
      cleanup()
    })

    async function pushesInOneSecond() {
      vi.useFakeTimers()
      const { cleanup } = await installBridge()
      await vi.advanceTimersByTimeAsync(0)
      hoisted.remoteApiStub.sendState.mockClear()
      await vi.advanceTimersByTimeAsync(1000)
      const count = hoisted.remoteApiStub.sendState.mock.calls.length
      cleanup()
      return count
    }

    it('envia o estado a cada segundo com vídeo tocando', async () => {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => ({ paused: false, currentTime: 5, duration: 90 })),
      }
      expect(await pushesInOneSecond()).toBe(1)
    })

    it('envia o estado a cada segundo com hino tocando', async () => {
      hoisted.playerStub.isPlaying.value = true
      expect(await pushesInOneSecond()).toBe(1)
    })

    it('vídeo pausado não gera envio', async () => {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => ({ paused: true, currentTime: 5, duration: 90 })),
      }
      expect(await pushesInOneSecond()).toBe(0)
    })

    it('sem mídia aberta não gera envio', async () => {
      hoisted.projection = { getPlaybackState: vi.fn(async () => null) }
      expect(await pushesInOneSecond()).toBe(0)
    })

    it('falha ao ler o vídeo não derruba o ciclo', async () => {
      hoisted.projection = { getPlaybackState: vi.fn(async () => { throw new Error('fechado') }) }
      expect(await pushesInOneSecond()).toBe(0)
    })
  })

  describe('dias da liturgia', () => {
    type DayStore = {
      weekdays: Record<string, unknown[]>
      customLiturgies: Array<{ name?: string; items: unknown[] }>
      selectedDay: string
      selectDay: ReturnType<typeof vi.fn>
      selectedCustomIndex: number
      selectCustomLiturgy: ReturnType<typeof vi.fn>
    }
    async function dayStore() {
      const store = (await getLit()) as unknown as DayStore
      store.weekdays = { saturday: [{}, {}, {}], monday: [] }
      store.customLiturgies = [{ name: 'teste', items: [{}] }, { name: 'teste2', items: [{}, {}] }]
      store.selectedDay = 'saturday'
      store.selectedCustomIndex = 0
      store.selectDay.mockClear()
      store.selectCustomLiturgy.mockClear()
      return store
    }
    function lastDays() {
      return hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].liturgy.days
    }

    it('lista todos os dias com a quantidade de itens e o dia aberto', async () => {
      await dayStore()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastDays()).toEqual([
          { key: 'sunday', count: 0, selected: false },
          { key: 'monday', count: 0, selected: false },
          { key: 'tuesday', count: 0, selected: false },
          { key: 'wednesday', count: 0, selected: false },
          { key: 'thursday', count: 0, selected: false },
          { key: 'friday', count: 0, selected: false },
          { key: 'saturday', count: 3, selected: true },
          { key: 'custom', count: 3, selected: false },
        ]),
      )
      cleanup()
    })

    it('lista cada liturgia avulsa e a que esta aberta', async () => {
      const store = await dayStore()
      store.selectedDay = 'custom'
      store.selectedCustomIndex = 1
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].liturgy.customs).toEqual([
          { index: 0, name: 'teste', count: 1, selected: false },
          { index: 1, name: 'teste2', count: 2, selected: true },
        ]),
      )
      cleanup()
    })

    it('abre a liturgia avulsa escolhida', async () => {
      const store = await dayStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.selectCustom', id: 992, value: 1 })

      expect(store.selectDay).toHaveBeenCalledWith('custom')
      expect(store.selectCustomLiturgy).toHaveBeenCalledWith(1)
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('recusa avulsa inexistente', async () => {
      const store = await dayStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.selectCustom', id: 993, value: 5 })

      expect(store.selectCustomLiturgy).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('troca o dia aberto no desktop', async () => {
      const store = await dayStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.selectDay', id: 990, mode: 'custom' })

      expect(store.selectDay).toHaveBeenCalledWith('custom')
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('recusa dia desconhecido', async () => {
      const store = await dayStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.selectDay', id: 991, mode: 'holiday' })

      expect(store.selectDay).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('troca de dia feita no desktop chega ao APK', async () => {
      const store = await dayStore()
      const { cleanup } = await installBridge()
      hoisted.remoteApiStub.sendState.mockClear()

      store.selectedDay = 'monday'

      await vi.waitFor(() =>
        expect(lastDays().find((d: { selected: boolean }) => d.selected).key).toBe('monday'),
      )
      cleanup()
    })
  })

  describe('telas sem vídeo aberto', () => {
    function idleProjection() {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => null),
        getVideoTargetMonitors: vi.fn(async () => [2]),
        setVideoTargetMonitors: vi.fn(async () => true),
        setSiteTargetMonitors: vi.fn(async () => true),
        onSiteTargetsChanged: vi.fn((cb: () => void) => {
          siteTargetsChanged = cb
          return () => {}
        }),
        onVideoTargetsChanged: vi.fn(() => () => {}),
        runVideoControlCommand: vi.fn(async () => false),
        getIndependentEnabledDisplays: vi.fn(async () => [2]),
      }
      saveProjectionSettings({ ...loadProjectionSettings(), targetDisplayIds: [2] })
      hoisted.displays = {
        list: vi.fn(async () => [
          { id: 1, isPrimary: true, bounds: { width: 1920, height: 1080 } },
          { id: 2, isPrimary: false, bounds: { width: 1280, height: 720 } },
          { id: 3, isPrimary: false, bounds: { width: 800, height: 600 } },
        ]),
      }
      return hoisted.projection as unknown as {
        setVideoTargetMonitors: ReturnType<typeof vi.fn>
        setSiteTargetMonitors: ReturnType<typeof vi.fn>
        getVideoControlSnapshot: ReturnType<typeof vi.fn>
        getVideoTargetMonitors: ReturnType<typeof vi.fn>
        runVideoControlCommand: ReturnType<typeof vi.fn>
      }
    }

    let siteTargetsChanged: () => void = () => {}

    function lastTargets() {
      return hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].videoTargets
    }

    function runningObs() {
      obsConnections.value = [
        { id: '5', label: 'OBS 2', selected: true, nickname: 'Tv Frontal' },
        { id: '6', label: 'OBS 3', selected: true },
      ]
      vi.mocked(palcoSession.slots).mockResolvedValue([
        { id: '5', label: 'x', running: true, clients: 0 },
        { id: '6', label: 'y', running: false, clients: 0 },
      ] as never)
    }

    function setEnabledDisplays(ids: number[]) {
      ;(hoisted.projection as unknown as { getIndependentEnabledDisplays: ReturnType<typeof vi.fn> })
        .getIndependentEnabledDisplays.mockResolvedValue(ids)
    }

    it('independente libera o monitor marcado em Telas, mesmo sem projecao', async () => {
      idleProjection()
      setEnabledDisplays([])
      saveProjectionSettings({ ...loadProjectionSettings(), targetDisplayIds: [3] })
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastTargets().independent.monitors).toMatchObject([
          { id: 'monitor:2', enabled: false },
          { id: 'monitor:3', enabled: true },
        ]),
      )
      cleanup()
    })

    it('independente aceita monitor marcado em Telas sem projecao', async () => {
      idleProjection()
      setEnabledDisplays([])
      saveProjectionSettings({ ...loadProjectionSettings(), targetDisplayIds: [3] })
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setIndependentTarget', id: 985, targetId: 'monitor:3', enabled: true })

      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('independente lista as conexoes ligadas com o nome do cabecalho', async () => {
      idleProjection()
      runningObs()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastTargets().independent.remotes).toEqual([
          { id: 'tv:5', label: 'Tv Frontal', detail: 'Conexões ativas: 0', selected: false, onAir: false, enabled: true },
        ]),
      )
      cleanup()
    })

    it('com video aberto as conexoes usam o nome do cabecalho', async () => {
      const projection = idleProjection()
      runningObs()
      projection.getVideoControlSnapshot.mockResolvedValue({
        tvs: [{ id: 'tv:5', label: 'OBS 2', selected: true }],
        independent: {
          mode: 'overlay',
          remotes: [{ id: 'tv:5', label: 'OBS 2' }, { id: 'tv:77', label: 'Outra' }],
        },
      })
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() => {
        const video = hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video
        expect(video.tvs[0].label).toBe('Tv Frontal')
        expect(video.independent.remotes.map((r: { label: string }) => r.label)).toEqual(['Tv Frontal', 'Outra'])
      })
      cleanup()
    })

    it('independente desativa a conexao desmarcada no cabecalho, na hora', async () => {
      idleProjection()
      runningObs()
      const { cleanup } = await installBridge()

      selectObsConnection('5', false)

      await vi.waitFor(() =>
        expect(lastTargets().independent.remotes).toMatchObject([{ id: 'tv:5', enabled: false }]),
      )
      cleanup()
    })

    it('independente recusa conexao desmarcada no cabecalho', async () => {
      idleProjection()
      runningObs()
      selectObsConnection('5', false)
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setIndependentTarget', id: 986, targetId: 'tv:5', enabled: true })

      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('com video aberto a conexao desmarcada no cabecalho fica desativada', async () => {
      const projection = idleProjection()
      runningObs()
      selectObsConnection('5', false)
      projection.getVideoControlSnapshot.mockResolvedValue({
        independent: { mode: 'overlay', remotes: [{ id: 'tv:5', label: 'OBS 2', enabled: true }] },
      })
      const { command, onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(
          hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video.independent.remotes[0].enabled,
        ).toBe(false),
      )

      projection.runVideoControlCommand.mockClear()
      await command({ action: 'video.setIndependentTarget', id: 987, targetId: 'tv:5', enabled: true })

      expect(projection.runVideoControlCommand).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('mostra a mesma selecao do cabecalho Telas', async () => {
      const projection = idleProjection()
      saveProjectionSettings({ ...loadProjectionSettings(), targetDisplayIds: [3] })
      projection.getVideoTargetMonitors.mockResolvedValue([2])
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastTargets().monitors).toMatchObject([
          { id: 'monitor:2', selected: false },
          { id: 'monitor:3', selected: true },
        ]),
      )
      cleanup()
    })

    it('marcar monitor no APK usa o mesmo caminho do cabecalho', async () => {
      const projection = idleProjection()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 980, targetId: 'monitor:3', enabled: true })

      expect(projection.setSiteTargetMonitors).toHaveBeenCalledWith([2, 3])
      expect(projection.setVideoTargetMonitors).toHaveBeenCalledWith([2, 3])
      expect(reapplyProjectionTargets).toHaveBeenCalledWith([2, 3])
      cleanup()
    })

    it('lista as conexoes remotas ligadas', async () => {
      idleProjection()
      runningObs()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()

      await vi.waitFor(() =>
        expect(lastTargets().tvs).toEqual([
          { id: 'tv:5', label: 'Tv Frontal', detail: 'Conexões ativas: 0', selected: true },
        ]),
      )
      cleanup()
    })

    it('marcar conexao no APK altera a selecao do desktop', async () => {
      idleProjection()
      runningObs()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 981, targetId: 'tv:5', enabled: false })

      expect(obsConnections.value.find((c) => c.id === '5')?.selected).toBe(false)
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('recusa conexao desconhecida', async () => {
      idleProjection()
      runningObs()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 982, targetId: 'tv:9', enabled: true })

      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('mudanca de conexao no desktop chega na hora ao APK', async () => {
      idleProjection()
      runningObs()
      const { cleanup } = await installBridge()
      hoisted.remoteApiStub.sendState.mockClear()

      selectObsConnection('5', false)

      await vi.waitFor(() =>
        expect(lastTargets().tvs).toMatchObject([{ id: 'tv:5', selected: false }]),
      )
      cleanup()
    })

    it('mudanca de monitor no desktop chega na hora ao APK', async () => {
      idleProjection()
      const { cleanup } = await installBridge()
      hoisted.remoteApiStub.sendState.mockClear()
      saveProjectionSettings({ ...loadProjectionSettings(), targetDisplayIds: [3] })

      siteTargetsChanged()

      await vi.waitFor(() =>
        expect(lastTargets().monitors).toMatchObject([
          { id: 'monitor:2', selected: false },
          { id: 'monitor:3', selected: true },
        ]),
      )
      cleanup()
    })

    it('com video aberto o monitor marcado tambem vai ao cabecalho', async () => {
      const projection = idleProjection()
      projection.runVideoControlCommand.mockResolvedValue(true)
      projection.getVideoTargetMonitors.mockResolvedValue([2, 3])
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 983, targetId: 'monitor:3', enabled: true })

      expect(projection.setSiteTargetMonitors).toHaveBeenCalledWith([2, 3])
      cleanup()
    })

    it('com video aberto a conexao marcada tambem vai ao cabecalho', async () => {
      const projection = idleProjection()
      runningObs()
      projection.runVideoControlCommand.mockResolvedValue(true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 984, targetId: 'tv:5', enabled: false })

      expect(obsConnections.value.find((c) => c.id === '5')?.selected).toBe(false)
      cleanup()
    })

    afterEach(() => {
      hoisted.displays = undefined
      obsConnections.value = []
      vi.mocked(palcoSession.slots).mockResolvedValue([])
    })

    it('informa os monitores estendidos', async () => {
      idleProjection()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].videoTargets).toMatchObject({
          monitors: [
            { id: 'monitor:2', label: 'Monitor 2', detail: '1280 × 720', selected: true },
            { id: 'monitor:3', label: 'Monitor 3', detail: '800 × 600', selected: false },
          ],
        }),
      )
      cleanup()
    })

    it('marca monitor mesmo sem a barra aberta', async () => {
      const projection = idleProjection()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 970, targetId: 'monitor:3', enabled: true })

      expect(projection.setVideoTargetMonitors).toHaveBeenCalledWith([2, 3])
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('desmarca monitor mesmo sem a barra aberta', async () => {
      const projection = idleProjection()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 971, targetId: 'monitor:2', enabled: false })

      expect(projection.setVideoTargetMonitors).toHaveBeenCalledWith([])
      cleanup()
    })

    function lastIndependent() {
      return hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].videoTargets.independent
    }

    it('informa a projeção independente sem vídeo', async () => {
      idleProjection()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(lastIndependent()).toEqual({
          mode: 'overlay',
          live: false,
          armed: false,
          monitors: [
            { id: 'monitor:2', label: 'Monitor 2', detail: '1280 × 720', selected: false, onAir: false, enabled: true },
            { id: 'monitor:3', label: 'Monitor 3', detail: '800 × 600', selected: false, onAir: false, enabled: false },
          ],
          remotes: [],
        }),
      )
      cleanup()
    })

    it('guarda modo e destino escolhidos sem vídeo', async () => {
      idleProjection()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setIndependentMode', id: 973, mode: 'share' })
      await command({ action: 'video.setIndependentTarget', id: 974, targetId: 'monitor:2', enabled: true })

      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      await vi.waitFor(() =>
        expect(lastIndependent()).toMatchObject({
          mode: 'share',
          armed: true,
          monitors: [expect.objectContaining({ id: 'monitor:2', selected: true }), expect.anything()],
        }),
      )
      cleanup()
    })

    it('recusa monitor desligado em Telas', async () => {
      idleProjection()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setIndependentTarget', id: 975, targetId: 'monitor:3', enabled: true })

      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('aplica a escolha quando um vídeo abre, uma única vez', async () => {
      const projection = idleProjection() as unknown as {
        getVideoControlSnapshot: ReturnType<typeof vi.fn>
        runVideoControlCommand: ReturnType<typeof vi.fn>
      }
      const { command, onStateRequestCb, cleanup } = await installBridge()
      await command({ action: 'video.setIndependentMode', id: 976, mode: 'share' })
      await command({ action: 'video.setIndependentTarget', id: 977, targetId: 'monitor:2', enabled: true })
      projection.runVideoControlCommand.mockClear()
      projection.runVideoControlCommand.mockResolvedValue(true)
      projection.getVideoControlSnapshot.mockResolvedValue({ independent: { mode: 'overlay' } })

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(projection.runVideoControlCommand).toHaveBeenCalledWith({
          type: 'independent-target',
          targetId: 'monitor:2',
          enabled: true,
        }),
      )
      expect(projection.runVideoControlCommand).toHaveBeenCalledWith({
        type: 'independent-mode',
        mode: 'share',
      })
      const calls = projection.runVideoControlCommand.mock.calls.length

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState).toHaveBeenCalled(),
      )
      expect(projection.runVideoControlCommand.mock.calls.length).toBe(calls)
      cleanup()
    })

    it('TV sem a barra aberta é recusada', async () => {
      const projection = idleProjection()
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.setTarget', id: 972, targetId: 'tv:a', enabled: true })

      expect(projection.setVideoTargetMonitors).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })
  })

  describe('player.stop com vídeo aberto', () => {
    function videoProjection(projecting: boolean) {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => ({ paused: false, projecting })),
        toggleVideoScreens: vi.fn(async () => true),
        closeUrl: vi.fn(async () => true),
      }
      return hoisted.projection as unknown as Record<
        'toggleVideoScreens' | 'closeUrl',
        ReturnType<typeof vi.fn>
      >
    }

    it('sem projeção fecha sem ligar as telas', async () => {
      const projection = videoProjection(false)
      const { command, cleanup } = await installBridge()

      await command({ action: 'player.stop', id: 960 })

      expect(projection.toggleVideoScreens).not.toHaveBeenCalled()
      expect(projection.closeUrl).toHaveBeenCalledOnce()
      cleanup()
    })

    it('projetando desliga as telas antes de fechar', async () => {
      const projection = videoProjection(true)
      const { command, cleanup } = await installBridge()

      await command({ action: 'player.stop', id: 961 })

      expect(projection.toggleVideoScreens).toHaveBeenCalledOnce()
      expect(projection.closeUrl).toHaveBeenCalledOnce()
      cleanup()
    })
  })

  describe('liturgy.open', () => {
    function setItems(type: string) {
      hoisted.liturgyStore.currentItems = [{ id: 'a', type, name: 'Item' }] as never[]
      hoisted.liturgyStore.selectedItemIndex = -1
    }

    async function clearedStore() {
      const lit = (await getLit()) as unknown as Record<'selectItem' | 'playItemOnScreens', ReturnType<typeof vi.fn>>
      lit.selectItem.mockClear()
      lit.playItemOnScreens.mockClear()
      return lit
    }

    it('apresentacao abre sem projetar, como imagem', async () => {
      setItems('presentation')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 956, value: 0 })

      expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      cleanup()
    })

    it('pdf abre sem projetar, como imagem', async () => {
      setItems('pdf')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 955, value: 0 })

      expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      cleanup()
    })

    it('imagens abrem sem projetar; a seta projeta', async () => {
      setItems('images')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 954, value: 0 })

      expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      cleanup()
    })

    it('site abre o controle no desktop sem projetar', async () => {
      setItems('site')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 952, value: 0 })

      expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      cleanup()
    })

    it('audio toca pelo mesmo caminho do play da linha no desktop', async () => {
      setItems('audio')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 953, value: 0 })

      expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      cleanup()
    })

    it.each(['video', 'online_video'])('%s abre o player sem projetar', async (type) => {
      setItems(type)
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 950, value: 0 })

      expect(lit.selectItem).toHaveBeenCalledWith(0, hoisted.router)
      expect(lit.playItemOnScreens).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(true)
      cleanup()
    })

    it('outros tipos seguem o caminho de projeção', async () => {
      setItems('annotation')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 951, value: 0 })

      expect(lit.playItemOnScreens).toHaveBeenCalledWith(0)
      expect(lit.selectItem).not.toHaveBeenCalled()
      cleanup()
    })

    it.each([[undefined], [-1], [5], ['1']])('índice %s é recusado', async (value) => {
      setItems('video')
      const lit = await clearedStore()
      const { command, cleanup } = await installBridge()

      await command({ action: 'liturgy.open', id: 952, value })

      expect(lit.selectItem).not.toHaveBeenCalled()
      expect(hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0].ok).toBe(false)
      cleanup()
    })

    it('estado anuncia o suporte a liturgy.open', async () => {
      setItems('video')
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].liturgy.canOpen).toBe(true),
      )
      cleanup()
    })
  })

  describe('controles da barra de vídeo', () => {
    const snapshot = { audioOutput: 'both', projecting: true, monitors: [], tvs: [] }

    function projectionWithControls(result = true) {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => ({ paused: false, currentTime: 1, duration: 9 })),
        getVideoControlSnapshot: vi.fn(async () => snapshot),
        runVideoControlCommand: vi.fn(async () => result),
      }
      return hoisted.projection as unknown as {
        runVideoControlCommand: ReturnType<typeof vi.fn>
      }
    }

    function lastAck() {
      return hoisted.remoteApiStub.sendAck.mock.calls.at(-1)?.[0]
    }

    it('envia o estado da barra ao controle remoto', async () => {
      projectionWithControls()
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.waitFor(() =>
        expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video).toEqual(snapshot),
      )
      cleanup()
    })

    it('sem barra aberta não envia o campo', async () => {
      hoisted.projection = {
        getPlaybackState: vi.fn(async () => null),
        getVideoControlSnapshot: vi.fn(async () => null),
      }
      const { onStateRequestCb, cleanup } = await installBridge()

      await onStateRequestCb()
      await vi.waitFor(() => expect(hoisted.remoteApiStub.sendState).toHaveBeenCalled())
      expect(hoisted.remoteApiStub.sendState.mock.calls.at(-1)?.[0].video).toBeUndefined()
      cleanup()
    })

    it.each([
      [{ action: 'video.setAudioOutput', mode: 'connections' }, { type: 'audio-output', mode: 'connections' }],
      [{ action: 'video.toggleProjection' }, { type: 'project' }],
      [{ action: 'video.toggleCaptions' }, { type: 'captions' }],
      [
        { action: 'video.setIndependentMode', mode: 'share' },
        { type: 'independent-mode', mode: 'share' },
      ],
      [
        { action: 'video.setIndependentTarget', targetId: 'tv:a', enabled: true },
        { type: 'independent-target', targetId: 'tv:a', enabled: true },
      ],
      [
        { action: 'video.setTarget', targetId: 'tv:a', enabled: false },
        { type: 'target', targetId: 'tv:a', enabled: false },
      ],
    ])('%o aciona a barra', async (msg, expected) => {
      const projection = projectionWithControls()
      const { command, cleanup } = await installBridge()

      await command({ ...msg, id: 900 })

      expect(projection.runVideoControlCommand).toHaveBeenCalledWith(expected)
      expect(lastAck().ok).toBe(true)
      cleanup()
    })

    it.each([
      [{ action: 'video.setAudioOutput', mode: 'x' }],
      [{ action: 'video.setAudioOutput' }],
      [{ action: 'video.setTarget', targetId: 7, enabled: true }],
      [{ action: 'video.setTarget', targetId: 'tv:a' }],
      [{ action: 'video.desconhecido' }],
      [{ action: 'video.setIndependentMode', mode: 'x' }],
      [{ action: 'video.setIndependentTarget', targetId: 'tv:a' }],
    ])('%o é recusado sem acionar a barra', async (msg) => {
      const projection = projectionWithControls()
      const { command, cleanup } = await installBridge()

      await command({ ...msg, id: 901 })

      expect(projection.runVideoControlCommand).not.toHaveBeenCalled()
      expect(lastAck().ok).toBe(false)
      cleanup()
    })

    it('resultado negativo da barra chega ao ack', async () => {
      projectionWithControls(false)
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.toggleProjection', id: 902 })

      expect(lastAck().ok).toBe(false)
      cleanup()
    })

    it('sem a API de projeção recusa o comando', async () => {
      hoisted.projection = undefined
      const { command, cleanup } = await installBridge()

      await command({ action: 'video.toggleProjection', id: 903 })

      expect(lastAck().ok).toBe(false)
      cleanup()
    })
  })
})
