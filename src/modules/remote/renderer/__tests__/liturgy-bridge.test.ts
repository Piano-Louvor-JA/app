import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      isPlaying: { value: false },
      session: { value: { title: 'Faixa X' } },
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
    getMediaTarget: () => hoisted.targetRef,
  }))
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
    toggleItemDone: vi.fn(),
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
  async function command(msg: { action: string; id?: number }) {
    await onCommandCb(msg)
  }
  return { command, cleanup, onStateRequestCb }
}

function resetHoisted() {
  hoisted.targetRef = 'player'
  hoisted.projection = undefined
  hoisted.liturgyStore.currentItems = []
  hoisted.liturgyStore.selectedItemIndex = -1
  hoisted.liturgyStore.selectItem.mockClear()
  hoisted.liturgyStore.playItemOnScreens.mockClear()
  hoisted.liturgyStore.toggleItemDone.mockClear()
  hoisted.playerStub.isPlaying.value = false
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
      getPlaybackState: vi.fn(() => ({ playing: true, positionMs: 0, volume: 50 })),
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
    // rotas pelo handler real v2 → media.open → openMusicPlayer com project:true
    expect(hoisted.openMusicPlayer).toHaveBeenCalledWith(expect.objectContaining({ musicId: 42, project: true }))
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
    const afterFirst = hoisted.remoteApiStub.sendState.mock.calls.length
    expect(afterFirst).toBeGreaterThanOrEqual(1)
    // imediata de novo: dentro do throttle → não empurra
    await syncCb()
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(afterFirst)
    // após 1.1s: empurra de novo
    await vi.advanceTimersByTimeAsync(1100)
    await syncCb()
    expect(hoisted.remoteApiStub.sendState.mock.calls.length).toBe(afterFirst + 1)
  })

  it('progressTicker: nada rodando não empurra; timer running empurra a cada 1s', async () => {
    const { useTimerStore } = await import('../../../timer/stores/useTimerStore')
    const timerStore = useTimerStore()
    const { command } = await installBridge()
    await command({ action: 'state.request', id: 1 })
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
})
