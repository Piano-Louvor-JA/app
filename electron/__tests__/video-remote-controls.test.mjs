// @vitest-environment node
/**
 * Controle remoto dos recursos da barra de vídeo (som, projeção, telas, CC).
 * O comando remoto reaproveita o caminho do clique: é a barra que sabe avisar
 * as TVs do Palco e respeitar a regra de cada botão.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const html = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
const START = '/* remote-controls:start */'
const END = '/* remote-controls:end */'

function load(overrides = {}) {
  const window = {
    louvorja: {
      projection: {
        getPlaybackState: async () => ({
          projecting: false,
          audioOutput: 'both',
          canControlCaptions: true,
          captionsHidden: true,
        }),
        getVideoTargetMonitors: async () => [2],
      },
      displays: {
        list: async () => [
          { id: 1, isPrimary: true, bounds: { width: 1920, height: 1080 } },
          { id: 2, isPrimary: false, bounds: { width: 1280, height: 720 } },
          { id: 3, isPrimary: false, bounds: { width: 800, height: 600 } },
        ],
      },
      palco: {
        slots: async () => [
          { id: 'a', label: 'TV Sala', clients: 1 },
          { id: 'b', label: 'TV Off', clients: 0 },
          { id: 'c', label: 'TV Hall', clients: 2 },
        ],
      },
    },
  }
  const context = {
    window,
    Number,
    Boolean,
    String,
    audioOnly: false,
    networkProjectionActive: false,
    tvChecked: { c: false },
    projectBtn: { disabled: false, click: vi.fn() },
    setTimeout: (fn) => fn(),
    Promise,
    captionsBtn: { hidden: false },
    applyAudioOutput: vi.fn(async () => {}),
    toggleProjection: vi.fn(async () => {}),
    toggleCaptions: vi.fn(async () => {}),
    loadMonitors: vi.fn(async () => {}),
    setMonitorEnabled: vi.fn(async () => {}),
    setTvEnabled: vi.fn(async () => {}),
    ...overrides,
  }
  runInNewContext(html.slice(html.indexOf(START), html.indexOf(END)), context)
  return context
}

describe('snapshot da barra para o controle remoto', () => {
  it('descreve som, projeção, legendas e destinos disponíveis', async () => {
    const { window } = load()

    const snapshot = JSON.parse(JSON.stringify(await window.__videoControlSnapshot()))

    expect(snapshot).toEqual({
      audioOutput: 'both',
      canProject: true,
      projecting: false,
      canControlCaptions: true,
      captionsHidden: true,
      monitors: [
        { id: 'monitor:2', label: 'Monitor 2', detail: '1280 × 720', selected: true },
        { id: 'monitor:3', label: 'Monitor 3', detail: '800 × 600', selected: false },
      ],
      tvs: [
        { id: 'tv:a', label: 'TV Sala', selected: true },
        { id: 'tv:c', label: 'TV Hall', selected: false },
      ],
      independent: null,
    })
  })

  it('projeção só nas TVs também conta como projetando', async () => {
    const { window } = load({ networkProjectionActive: true })

    expect((await window.__videoControlSnapshot()).projecting).toBe(true)
  })

  it('reflete o botão de projetar desativado', async () => {
    const { window } = load({ projectBtn: { disabled: true, click: vi.fn() } })

    expect((await window.__videoControlSnapshot()).canProject).toBe(false)
  })

  it('áudio puro não tem esses controles', async () => {
    const { window } = load({ audioOnly: true })

    expect(await window.__videoControlSnapshot()).toBeNull()
  })

  it('sem vídeo aberto retorna null', async () => {
    const context = load()
    context.window.louvorja.projection.getPlaybackState = async () => null

    expect(await context.window.__videoControlSnapshot()).toBeNull()
  })
})

describe('comandos remotos usam o mesmo caminho do clique', () => {
  it('destino do áudio', async () => {
    const context = load()

    expect(
      await context.window.__videoControlCommand({ type: 'audio-output', mode: 'connections' }),
    ).toBe(true)
    expect(context.applyAudioOutput).toHaveBeenCalledWith('connections')
  })

  it('recusa destino do áudio desconhecido', async () => {
    const context = load()

    expect(await context.window.__videoControlCommand({ type: 'audio-output', mode: 'x' })).toBe(
      false,
    )
    expect(context.applyAudioOutput).not.toHaveBeenCalled()
  })

  it('projetar', async () => {
    const context = load()

    expect(await context.window.__videoControlCommand({ type: 'project' })).toBe(true)
    // Clique real: a projeção independente escuta o botão na captura.
    expect(context.projectBtn.click).toHaveBeenCalledOnce()
  })

  it('respeita o botão de projetar desativado', async () => {
    const context = load({ projectBtn: { disabled: true, click: vi.fn() } })

    expect(await context.window.__videoControlCommand({ type: 'project' })).toBe(false)
    expect(context.projectBtn.click).not.toHaveBeenCalled()
  })

  it('legendas', async () => {
    const context = load()

    expect(await context.window.__videoControlCommand({ type: 'captions' })).toBe(true)
    expect(context.toggleCaptions).toHaveBeenCalledOnce()
  })

  it('recusa legendas quando o vídeo não tem', async () => {
    const context = load({ captionsBtn: { hidden: true } })

    expect(await context.window.__videoControlCommand({ type: 'captions' })).toBe(false)
    expect(context.toggleCaptions).not.toHaveBeenCalled()
  })

  it('marca monitor depois de sincronizar a seleção atual', async () => {
    const context = load()

    expect(
      await context.window.__videoControlCommand({
        type: 'target',
        targetId: 'monitor:3',
        enabled: true,
      }),
    ).toBe(true)
    expect(context.loadMonitors).toHaveBeenCalledOnce()
    expect(context.setMonitorEnabled).toHaveBeenCalledWith(3, true)
  })

  it('desmarca TV', async () => {
    const context = load()

    expect(
      await context.window.__videoControlCommand({
        type: 'target',
        targetId: 'tv:a',
        enabled: false,
      }),
    ).toBe(true)
    expect(context.setTvEnabled).toHaveBeenCalledWith('a', false)
  })

  it('recusa destino em formato desconhecido', async () => {
    const context = load()

    expect(
      await context.window.__videoControlCommand({
        type: 'target',
        targetId: 'outra:1',
        enabled: true,
      }),
    ).toBe(false)
  })

  it('repassa modo e destino à projeção independente', async () => {
    const control = { setMode: vi.fn(() => true), setTarget: vi.fn(() => true), snapshot: vi.fn() }
    const context = load()
    context.window.__independentControl = control

    expect(
      await context.window.__videoControlCommand({ type: 'independent-mode', mode: 'share' }),
    ).toBe(true)
    expect(
      await context.window.__videoControlCommand({
        type: 'independent-target',
        targetId: 'tv:a',
        enabled: true,
      }),
    ).toBe(true)
    expect(control.setMode).toHaveBeenCalledWith('share')
    expect(control.setTarget).toHaveBeenCalledWith('tv:a', true)
  })

  it('sem painel independente recusa o comando', async () => {
    const context = load()

    expect(
      await context.window.__videoControlCommand({ type: 'independent-mode', mode: 'share' }),
    ).toBe(false)
  })

  it('recusa comando desconhecido', async () => {
    const context = load()

    expect(await context.window.__videoControlCommand({ type: 'x' })).toBe(false)
  })
})

describe('funções extraídas mantêm o comportamento do clique', () => {
  it('applyAudioOutput salva e avisa as TVs', async () => {
    const setAudioOutput = vi.fn(async () => 'both')
    const tvBroadcast = vi.fn(async () => {})
    const context = {
      window: { louvorja: { projection: { setAudioOutput } } },
      audioOutput: { addEventListener() {}, value: 'player', disabled: false },
      audioOutputMode: 'player',
      changingAudioOutput: false,
      tvBroadcast,
    }
    const start = html.indexOf('async function applyAudioOutput')
    const end = html.indexOf('var volume = document.getElementById')
    runInNewContext(html.slice(start, end), context)

    await context.applyAudioOutput('both')

    expect(setAudioOutput).toHaveBeenCalledWith('both')
    expect(tvBroadcast).toHaveBeenCalledWith('audio-output', { mode: 'both' })
    expect(context.audioOutput.value).toBe('both')
  })
})
