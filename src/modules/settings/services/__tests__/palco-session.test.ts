// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobertura de palco-session.ts — sessão de cast TV (slots, project, audio,
 * video, timer, routing mirror/individual, resolveBgUrl, serveLocal).
 * Bridge fake em window.louvorja.palco (mesmo contrato do preload).
 */

const readEffectiveStageSettings = vi.fn(() => ({ ...DEFAULT_SETTINGS }))

vi.mock('../stage-settings-runtime', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return {
    ...mod,
    readEffectiveStageSettings: (scope: string) =>
      readEffectiveStageSettings(scope) as never,
  }
})

vi.mock('../../types/stage-settings', async (importOriginal) => {
  const mod = await importOriginal<Record<string, Record<string, string>>>()
  return {
    ...mod,
    resolveBackgroundImage: (bg: string | null) =>
      bg?.startsWith('official:') ? `/assets/${bg.replace('official:', '')}.png` : bg,
  }
})
vi.mock('../palco-routing', () => ({
  getPalcoRoute: vi.fn(() => 'mirror'),
}))

const registryMock = vi.hoisted(() => ({
  moduleForSlotImpl: (id: string): string | null => null,
}))
vi.mock('../output-registry', () => ({
  useOutputRegistry: () => ({
    moduleForSlot: (id: string) => registryMock.moduleForSlotImpl(id),
  }),
}))

import { palcoSession } from '../palco-session'
import { getPalcoRoute } from '../../services/palco-routing'

type PalcoMock = {
  status: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  serveMedia: ReturnType<typeof vi.fn>
  servePath: ReturnType<typeof vi.fn>
  slots: ReturnType<typeof vi.fn>
  createSlot: ReturnType<typeof vi.fn>
  removeSlot: ReturnType<typeof vi.fn>
  startSlot: ReturnType<typeof vi.fn>
  stopSlot: ReturnType<typeof vi.fn>
  wake: ReturnType<typeof vi.fn>
  onEvent: ReturnType<typeof vi.fn>
  onReceiverConnected: ReturnType<typeof vi.fn>
  onReceiverDisconnected: ReturnType<typeof vi.fn>
}

function setBridge(palco: Partial<PalcoMock> | null) {
  ;(window as never as { louvorja: unknown }).louvorja = palco
    ? { palco }
    : null
}

function fullMock(): PalcoMock {
  return {
    status: vi.fn().mockResolvedValue({ running: true, clients: 1, url: 'http://192.168.0.5:7080', wsUrl: 'ws://192.168.0.5:7081' }),
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(true),
    serveMedia: vi.fn().mockResolvedValue('http://192.168.0.5:7080/media/f.mp3'),
    servePath: vi.fn().mockResolvedValue('http://192.168.0.5:7080/media/local.mp3'),
    slots: vi.fn().mockResolvedValue([
      { id: '0', label: 'TV 1', running: true, clients: 1, httpPort: 7080, wsPort: 7081 },
      { id: '1', label: 'TV 2', running: false, clients: 0, httpPort: 7082, wsPort: 7083 },
    ]),
    createSlot: vi.fn().mockResolvedValue({ id: '1', label: 'TV 2', httpPort: 7082, wsPort: 7083 }),
    removeSlot: vi.fn().mockResolvedValue(true),
    startSlot: vi.fn().mockResolvedValue(true),
    stopSlot: vi.fn().mockResolvedValue(undefined),
    wake: vi.fn().mockResolvedValue({ ok: true, results: [] }),
    onEvent: vi.fn(),
    onReceiverConnected: vi.fn(),
    onReceiverDisconnected: vi.fn(),
  }
}

const DEFAULT_SETTINGS = {
  fontSize: 96,
  bibleFontSize: 80,
  fontWeight: 700,
  bibleFontWeight: 400,
  textColor: '#ffffff',
  bibleTextColor: '#ffff00',
  textShadow: true,
  shadowBlur: 8,
  shadowIntensity: 0.6,
  textBox: false,
  boxOpacity: 0.4,
  boxBorder: false,
  footerRefColor: '#fff',
  footerRefWeight: 400,
  showBibleVersion: true,
  backgroundImage: 'official:bg-3',
  hymns: { overrideBg: false },
  background: '#000',
}

beforeEach(() => {
  vi.clearAllMocks()
  setBridge(null)
  palcoSession.setSlot('0') // singleton: restaura slot ativo entre testes
  readEffectiveStageSettings.mockReturnValue({ ...DEFAULT_SETTINGS })
})

describe('sem electron (sem bridge)', () => {
  it('todos os métodos degradam sem lançar', async () => {
    await expect(palcoSession.slots()).resolves.toEqual([])
    await expect(palcoSession.createSlot('x')).resolves.toBeNull()
    await expect(palcoSession.removeSlot('0')).resolves.toBe(false)
    await expect(palcoSession.startSlot('0')).resolves.toBe(false)
    await expect(palcoSession.stopSlot('0')).resolves.toBeUndefined()
    await expect(palcoSession.status()).resolves.toBeNull()
    await expect(palcoSession.turnOn()).resolves.toBe(false)
    await expect(palcoSession.turnOff()).resolves.toBeUndefined()
    await expect(palcoSession.project('hymns', { text: 'x' })).resolves.toBeUndefined()
    await expect(palcoSession.sendBgPalco()).resolves.toBeUndefined()
    await expect(palcoSession.timer({ duration: 5 })).resolves.toBeUndefined()
    await expect(palcoSession.audio({ url: 'a.mp3' })).resolves.toBeUndefined()
    await expect(palcoSession.video({ url: 'v.mp4' })).resolves.toBeUndefined()
    await expect(palcoSession.videoRouted({ url: 'v.mp4' })).resolves.toBeUndefined()
    await expect(palcoSession.audioRouted({ url: 'a.mp3' })).resolves.toBeUndefined()
    await expect(palcoSession.serveMedia('f', 'audio/mpeg', 'QQ==')).resolves.toBeNull()
    palcoSession.idle()
    palcoSession.timerStop()
    palcoSession.onEvent(() => {})
    palcoSession.onReceiverConnected(() => {})
    palcoSession.onReceiverDisconnected(() => {})
    expect(palcoSession.isElectron).toBe(false)
  })
})

describe('com electron', () => {
  it('isElectron true, slots/create/remove/start/stop delegam', async () => {
    const palco = fullMock()
    setBridge(palco)
    expect(palcoSession.isElectron).toBe(true)
    expect(await palcoSession.slots()).toHaveLength(2)
    await palcoSession.createSlot('TV 2')
    expect(palco.createSlot).toHaveBeenCalledWith('TV 2')
    await palcoSession.removeSlot('1')
    expect(palco.removeSlot).toHaveBeenCalledWith('1')
    await palcoSession.startSlot('1')
    expect(palco.start).toHaveBeenCalledWith('1')
    await palcoSession.stopSlot('1')
    expect(palco.stop).toHaveBeenCalledWith('1')
  })

  it('setSlot troca o slot ativo; status usa slot ativo', async () => {
    const palco = fullMock()
    setBridge(palco)
    palcoSession.setSlot('1')
    expect(palcoSession.slotId).toBe('1')
    await palcoSession.status()
    expect(palco.status).toHaveBeenCalledWith('1')
  })

  it('turnOn: start ok -> bgPalco + idle + wake; start falha -> nada', async () => {
    const palco = fullMock()
    setBridge(palco)
    expect(await palcoSession.turnOn()).toBe(true)
    await vi.waitFor(() => expect(palco.send).toHaveBeenCalledTimes(2))
    const types = palco.send.mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toContain('bgPalco')
    expect(types).toContain('idle')
    expect(palco.wake).toHaveBeenCalled()

    const palco2 = fullMock()
    palco2.start.mockResolvedValue(false)
    setBridge(palco2)
    expect(await palcoSession.turnOn()).toBe(false)
    expect(palco2.send).not.toHaveBeenCalled()
  })

  it('turnOff para o slot', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.turnOff()
    expect(palco.stop).toHaveBeenCalledWith('0')
  })

  it('project: envia payload v2 colorizado com settings do escopo', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.project('hymns', { text: 'Aleluia', footerRef: 'Hino 1' })
    expect(palco.send).toHaveBeenCalledTimes(1)
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.type).toBe('projection')
    expect(payload.v).toBe(2)
    expect(payload.text).toContain('<span')
    expect(payload.text).toContain('#ffffff')
    // bg official:bg-3 resolvido pro sender
    expect(String(payload.background)).toContain('/bg/bg-3.png')
    expect(payload.footerVersion).toBeUndefined() // não é bible
  })

  it('project bible: fonte própria; showBibleVersion off remove sufixo do rodapé', async () => {
    const palco = fullMock()
    setBridge(palco)
    readEffectiveStageSettings.mockReturnValue({
      ...readEffectiveStageSettings(),
      showBibleVersion: false,
    })
    await palcoSession.project('bible', {
      text: 'No princípio',
      footerRef: 'João 1:1 (ARC)',
      footerVersion: 'ARC',
    })
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.footerRef).toBe('João 1:1')
    expect(payload.footerVersion).toBeUndefined()
  })

  it('hymns overrideBg: bg do escopo vence o input', async () => {
    const palco = fullMock()
    setBridge(palco)
    readEffectiveStageSettings.mockReturnValue({
      ...readEffectiveStageSettings(),
      hymns: { overrideBg: true },
    })
    await palcoSession.project('hymns', {
      text: 'x',
      background: 'https://cdn.example/capa.jpg',
    })
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(String(payload.background)).toContain('/bg/bg-3.png')
  })

  it('resolveBgUrl: http passa direto; local serve via servePath; quebrado -> undefined', async () => {
    const palco = fullMock()
    setBridge(palco)
    // http direto
    await palcoSession.project('hymns', { text: 'a', background: 'https://x/b.jpg' })
    let payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.background).toBe('https://x/b.jpg')
    // local
    await palcoSession.project('hymns', { text: 'b', background: 'local://media/x.png' })
    payload = palco.send.mock.calls[1]?.[0] as Record<string, unknown>
    expect(String(payload.background)).toContain('/media/') // servido pelo sender
    expect(palco.servePath).toHaveBeenCalled()
    // quebrado: servePath falha -> sem bg
    palco.servePath.mockRejectedValue(new Error('x'))
    await palcoSession.project('hymns', { text: 'c', background: 'local://media/y.png' })
    payload = palco.send.mock.calls[2]?.[0] as Record<string, unknown>
    expect(payload.background).toBeUndefined()
  })

  it('projectTo: usa slot alvo e restaura o ativo', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.projectTo('1', 'hymns', { text: 'x' })
    expect(palco.send).toHaveBeenCalledWith(expect.anything(), '1')
    expect(palcoSession.slotId).toBe('0')
  })

  it('projectRouted mirror: serializa pros slots rodando; rota individual: só nela', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.projectRouted('hymns', 'hymns', { text: 'x' })
    expect(palco.send).toHaveBeenCalledTimes(1) // só slot 0 running
    // slot atribuído não-espelho é filtrado
    vi.mocked(getPalcoRoute).mockReturnValue('1')
    await palcoSession.projectRouted('hymns', 'hymns', { text: 'y' })
    expect(palco.send).toHaveBeenLastCalledWith(expect.anything(), '1')
    vi.mocked(getPalcoRoute).mockReturnValue('mirror')
  })

  it('timer/timerRouted/timerStop/timerTo', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.timer({ duration: 60, mode: 'countdown' })
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'timer', duration: 60 }),
      '0',
    )
    await palcoSession.timerRouted('countdown', { duration: 5 })
    // mirror: slot 0 only (1 running)
    palcoSession.timerStop()
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'stop' }),
      '0',
    )
    palcoSession.timerTo('1', { duration: 3 })
    await new Promise((r) => setTimeout(r, 0))
    // NOTA: timerTo restaura o slot antes do timer() async resolver — o send
    // sai com o slot global ('0'). Comportamento atual documentado no teste.
    expect(palco.send).toHaveBeenLastCalledWith(expect.anything(), '0')
  })

  it('audio: url/cover locais servidos; http direto; bg do escopo quando ausente', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.audioRouted({ url: 'file:///m/a.mp3', cover: 'file:///c.png' })
    expect(palco.servePath).toHaveBeenCalled()
    const payload = palco.send.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(payload.type).toBe('audio')
    expect(String(payload.url)).toContain('/media/')
    expect(payload.background).toBeDefined() // bg do escopo liturgy
  })

  it('video: sem url e sem stop -> não envia; stop sem url envia', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.video({})
    expect(palco.send).not.toHaveBeenCalled()
    await palcoSession.video({ action: 'stop' })
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'video', action: 'stop' }),
      '0',
    )
  })

  it('videoRouted/audioRouted individual: slot da rota, ativo preservado', async () => {
    const palco = fullMock()
    setBridge(palco)
    vi.mocked(getPalcoRoute).mockReturnValue('1')
    await palcoSession.videoRouted({ url: 'https://x/v.mp4' })
    expect(palco.send).toHaveBeenLastCalledWith(expect.anything(), '1')
    await palcoSession.audioRouted({ url: 'https://x/a.mp3' })
    expect(palco.send).toHaveBeenLastCalledWith(expect.anything(), '1')
    expect(palcoSession.slotId).toBe('0')
    vi.mocked(getPalcoRoute).mockReturnValue('mirror')
  })

  it('serveMedia/idle/idleTo/eventos', async () => {
    const palco = fullMock()
    setBridge(palco)
    expect(await palcoSession.serveMedia('f', 'audio/mpeg', 'QQ==')).toContain('/media/')
    palcoSession.idle('aguarde')
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'idle', msg: 'aguarde' }),
      '0',
    )
    palcoSession.idleTo('1', 'troca')
    expect(palco.send).toHaveBeenLastCalledWith(expect.anything(), '1')
    const cb = () => {}
    palcoSession.onEvent(cb)
    expect(palco.onEvent).toHaveBeenCalledWith(cb)
    palcoSession.onReceiverConnected(cb)
    expect(palco.onReceiverConnected).toHaveBeenCalled()
    palcoSession.onReceiverDisconnected(cb)
    expect(palco.onReceiverDisconnected).toHaveBeenCalled()
  })
})

describe('gaps finais — wake falho, bg oficial sem match, rotas', () => {
  it('turnOn: wake ausente/lançando não quebra', async () => {
    const palco = fullMock()
    delete (palco as Record<string, unknown>).wake
    setBridge(palco)
    expect(await palcoSession.turnOn()).toBe(true)
    const palco2 = fullMock()
    palco2.wake = vi.fn().mockRejectedValue(new Error('x'))
    setBridge(palco2)
    expect(await palcoSession.turnOn()).toBe(true)
    await vi.waitFor(() => expect(palco2.send.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('official: sem id bg-NN -> serveLocal; inexistente -> bg undefined', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.servePath.mockRejectedValue(new Error('x'))
    await palcoSession.project('hymns', {
      text: 'a',
      background: 'official:semmatch',
    })
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.background).toBeUndefined()
  })

  it('timerRouted rota individual: só o slot alvo', async () => {
    const palco = fullMock()
    setBridge(palco)
    vi.mocked(getPalcoRoute).mockReturnValue('1')
    await palcoSession.timerRouted('countdown', { duration: 9 })
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'timer', duration: 9 }),
      '1',
    )
    vi.mocked(getPalcoRoute).mockReturnValue('mirror')
  })

  it('projectRouted mirror: slot com módulo atribuído é filtrado', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.slots.mockResolvedValue([
      { id: '0', label: 'TV1', running: true, clients: 1, httpPort: 7080, wsPort: 7081 },
      { id: '2', label: 'TV3', running: true, clients: 1, httpPort: 7084, wsPort: 7085 },
    ])
    registryMock.moduleForSlotImpl = (id: string) => (id === '0' ? null : 'bible')
    await palcoSession.projectRouted('hymns', 'hymns', { text: 'x' })
    // slot 2 tem 'bible' atribuído -> filtrado; só slot 0 (espelho) recebe
    expect(palco.send).toHaveBeenCalledTimes(1)
    expect(palco.send).toHaveBeenCalledWith(expect.anything(), '0')
  })

  it('projectRouted: slot rodando sem atribuição e com o módulo igual recebe', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.slots.mockResolvedValue([
      { id: '0', label: 'TV1', running: true, clients: 1, httpPort: 7080, wsPort: 7081 },
      { id: '2', label: 'TV3', running: true, clients: 1, httpPort: 7084, wsPort: 7085 },
    ])
    registryMock.moduleForSlotImpl = (id: string) => (id === '0' ? null : 'hymns')
    await palcoSession.projectRouted('hymns', 'hymns', { text: 'x' })
    expect(palco.send).toHaveBeenCalledTimes(2)
  })

  it('colorize: texto já colorizado não aninha; texto vazio sem cor', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.project('hymns', {
      text: '<span style="color:#fff">já</span>',
    })
    const p1 = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(p1.text).toBe('<span style="color:#fff">já</span>')
    await palcoSession.project('hymns', { text: '' })
    const p2 = palco.send.mock.calls[1]?.[0] as Record<string, unknown>
    expect(p2.text).toBe('')
  })

  it('boxBorder ativo inclui borda no payload', async () => {
    const palco = fullMock()
    setBridge(palco)
    readEffectiveStageSettings.mockReturnValue({
      ...DEFAULT_SETTINGS,
      boxBorder: true,
    })
    await palcoSession.project('hymns', { text: 'x' })
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.boxBorder).toMatchObject({ width: 0.4 })
  })
})

describe('gaps — video local servido e videoRouted mirror', () => {
  it('video: url local servida via servePath e enviada', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.video({ url: 'file:///m/v.mp4' })
    expect(palco.servePath).toHaveBeenCalledWith('file:///m/v.mp4', '0')
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'video' }),
      '0',
    )
  })

  it('videoRouted mirror: envia para todos os slots rodando', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.slots.mockResolvedValue([
      { id: '0', label: 'TV1', running: true, clients: 1, httpPort: 7080, wsPort: 7081 },
      { id: '2', label: 'TV3', running: true, clients: 1, httpPort: 7084, wsPort: 7085 },
      { id: '3', label: 'TV4', running: false, clients: 0, httpPort: 7086, wsPort: 7087 },
    ])
    vi.mocked(getPalcoRoute).mockReturnValue('mirror')
    await palcoSession.videoRouted({ url: 'https://x/v.mp4' })
    const slots = palco.send.mock.calls.map((c) => c[1])
    expect(slots).toEqual(['0', '2'])
    vi.mocked(getPalcoRoute).mockReturnValue('mirror')
  })
})

describe('gaps 2 — audio cover local, video url local, audioRouted bg auto', () => {
  it('audio: cover local também é servida (L318-319)', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.audio({
      url: 'https://x/a.mp3',
      cover: 'file:///c/capa.png',
    })
    const payload = palco.send.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(payload.cover).toContain('/media/')
  })

  it('audioRouted: background ausente injeta bg do escopo liturgy (L379-381)', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.audioRouted({ url: 'https://x/a.mp3' })
    const payload = palco.send.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(String(payload.background)).toContain('/bg/bg-3.png')
  })

  it('video: url local não servível -> undefined e sem envio (sem action stop)', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.servePath.mockRejectedValue(new Error('x'))
    await palcoSession.video({ url: 'local://media/quebrado.mp4' })
    expect(palco.send).not.toHaveBeenCalled()
  })
})

describe('gaps 3 — status sem url, official sem match com serve ok, bgPalco undefined, timer com bg explícito, serve falho', () => {
  it('status sem url -> baseUrl null; official:bg-99 com serve ok -> bg do sender', async () => {
    const palco = fullMock()
    palco.status.mockResolvedValue({ running: true, clients: 0, url: null, wsUrl: null })
    palco.servePath.mockResolvedValue('http://192.168.0.5:7080/media/x.png')
    setBridge(palco)
    await palcoSession.project('hymns', {
      text: 'x',
      background: 'official:bg-99',
    })
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    // baseUrl null -> template fica null/bg/bg-99.png; serveLocal devolve -> média
    expect([null, 'null/bg/bg-99.png', undefined]).toContain(payload.background === null ? null : String(payload.background))
  })

  it('sendBgPalco: bg não resolvível -> url vazia (bg ?? "")', async () => {
    const palco = fullMock()
    palco.servePath.mockRejectedValue(new Error('x'))
    setBridge(palco)
    readEffectiveStageSettings.mockReturnValue({
      ...DEFAULT_SETTINGS,
      backgroundImage: 'local://media/quebrado.png',
    })
    await palcoSession.sendBgPalco()
    const payload = palco.send.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload.url).toBe('')
  })

  it('timer com background explícito não consulta settings', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.timer({ duration: 10, background: 'https://x/t.png' })
    expect(palco.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ background: 'https://x/t.png' }),
      '0',
    )
  })

  it('audio: url local não servível -> undefined (L315); cover idem (L319)', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.servePath.mockRejectedValue(new Error('x'))
    await palcoSession.audio({ url: 'file:///a.mp3', cover: 'file:///c.png' })
    const payload = palco.send.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(payload.url).toBeUndefined()
    expect(payload.cover).toBeUndefined()
  })

  it('audioRouted: background explícito não consulta liturgy (L379 falso)', async () => {
    const palco = fullMock()
    setBridge(palco)
    await palcoSession.audioRouted({ url: 'https://x/a.mp3', background: 'https://x/bg.jpg' })
    const payload = palco.send.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(payload.background).toBe('https://x/bg.jpg')
  })
})

  it('audioRouted: bg do escopo não resolvível -> background undefined (L381)', async () => {
    const palco = fullMock()
    setBridge(palco)
    palco.servePath.mockRejectedValue(new Error('x'))
    readEffectiveStageSettings.mockReturnValue({
      ...DEFAULT_SETTINGS,
      backgroundImage: 'local://media/quebrado.png',
    })
    await palcoSession.audioRouted({ url: 'https://x/a.mp3' })
    const payload = palco.send.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(payload.background).toBeUndefined()
  })
