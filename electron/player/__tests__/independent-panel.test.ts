/** Painel "Projeção independente" das barras dos players do Piano. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PANEL_JS = readFileSync(resolve(__dirname, '../independent-panel.js'), 'utf-8')
const MIRROR_JS = readFileSync(resolve(__dirname, '../../palco/network-mirror.js'), 'utf-8')
const BARS = ['control-bar', 'image-control-bar', 'pdf-control-bar', 'site-control-bar']

let dom: JSDOM | null = null

function wait(ms = 20) {
  return new Promise((r) => setTimeout(r, ms))
}

type Bridge = ReturnType<typeof makeBridge>

function makeBridge(overrides: { state?: unknown; slots?: unknown[]; enabled?: number[] } = {}) {
  let state = (overrides.state ?? null) as { displayIds: number[]; mode: string } | null
  const sent: Array<{ msg: Record<string, unknown>; slotId: string }> = []
  const events: Array<(m: unknown) => void> = []
  return {
    sent,
    events,
    projection: {
      openIndependent: vi.fn(async (displayIds: number[], mode: string) => { state = { displayIds, mode }; return true }),
      closeIndependent: vi.fn(async () => { state = null; return true }),
      getIndependentState: vi.fn(async () => state),
      setSiteControlPanelOpen: vi.fn(async () => true),
      getSourceMediaId: vi.fn(async () => 'tab:1'),
      getIndependentEnabledDisplays: vi.fn(async () => overrides.enabled ?? [20, 30]),
    },
    displays: {
      list: vi.fn(async () => [
        { id: 10, isPrimary: true, bounds: { width: 2560, height: 1080 } },
        { id: 20, isPrimary: false, bounds: { width: 2560, height: 1080 } },
        { id: 30, isPrimary: false, bounds: { width: 1080, height: 2560 } },
      ]),
      identify: vi.fn(async () => {}),
    },
    palco: {
      slots: vi.fn(async () => overrides.slots ?? [{ id: '7082', label: 'OBS', clients: 3 }, { id: '7083', label: 'TV', clients: 0 }]),
      send: vi.fn(async (msg: Record<string, unknown>, slotId: string) => { sent.push({ msg, slotId }); return true }),
      onEvent: (cb: (m: unknown) => void) => { events.push(cb); return () => {} },
    },
  }
}

function setup(bridge: Bridge, search = '') {
  dom = new JSDOM(
    '<!doctype html><html><head></head><body><div class="shell" id="shell"><div class="bar"><div class="transport"><button id="project" aria-pressed="false" disabled></button><span class="monitor-wrap"><button id="monitorSelect"></button></span></div></div></div></body></html>',
    { url: `http://localhost/bar.html${search}`, runScripts: 'outside-only', pretendToBeVisual: true },
  )
  const w = dom.window as unknown as Window & { eval: (c: string) => void; PianoIndependentPanel: { mount: () => unknown } }
  Object.defineProperty(w, 'louvorja', { value: bridge, configurable: true })
  Object.defineProperty(w.navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) }, configurable: true })
  w.eval(MIRROR_JS)
  w.eval(PANEL_JS)
  const doc = dom.window.document
  const barClicks: string[] = []
  // handler da própria barra (roda depois do painel, que escuta na captura)
  doc.getElementById('project')!.addEventListener('click', () => barClicks.push('bar'))
  const handle = w.PianoIndependentPanel.mount()
  const $ = (s: string) => doc.querySelector(s) as HTMLElement | null
  const $$ = (s: string) => [...doc.querySelectorAll(s)] as HTMLElement[]
  return { handle, doc, $, $$, barClicks }
}

afterEach(() => {
  dom?.window.close()
  dom = null
})

describe('independent-panel: controle remoto', () => {
  type Control = {
    snapshot: () => Promise<Record<string, unknown>>
    setMode: (mode: string) => boolean
    setTarget: (id: string, enabled: boolean) => boolean
  }
  function control() {
    return (dom!.window as unknown as { __independentControl: Control }).__independentControl
  }

  it('descreve modo, monitores e conexões ativas', async () => {
    setup(makeBridge({ enabled: [20] }))
    await wait()

    const snap = await control().snapshot()

    expect(snap).toMatchObject({ mode: 'overlay', live: false, armed: false })
    expect(snap.monitors).toEqual([
      { id: 'monitor:20', label: 'Monitor 2', detail: '2560 × 1080', selected: false, onAir: false, enabled: true },
      { id: 'monitor:30', label: 'Monitor 3', detail: '1080 × 2560', selected: false, onAir: false, enabled: false },
    ])
    expect((snap.remotes as unknown[])[0]).toMatchObject({ id: 'tv:7082', label: 'OBS', selected: false })
  })

  it('controle remoto vê conexão ligada mesmo sem cliente', async () => {
    setup(makeBridge({
      slots: [{ id: '7082', label: 'OBS', clients: 0, running: true }, { id: '7084', label: 'Off', clients: 0, running: false }],
    }))
    await wait()

    const snapshot = await control().snapshot()

    expect(snapshot.remotes.map((r: { id: string }) => r.id)).toEqual(['tv:7082'])
  })

  it('marcar destino só arma; a seta projeta', async () => {
    const bridge = makeBridge()
    const { $ } = setup(bridge)
    await wait()

    expect(control().setTarget('monitor:20', true)).toBe(true)
    const snap = await control().snapshot()
    expect(snap).toMatchObject({ armed: true, live: false })
    expect(bridge.projection.openIndependent).not.toHaveBeenCalled()

    $('#project')!.click()
    await wait()
    expect(bridge.projection.openIndependent).toHaveBeenCalledWith([20], 'overlay')
  })

  it('desmarcar remove o destino', async () => {
    setup(makeBridge())
    await wait()
    control().setTarget('tv:7082', true)
    control().setTarget('tv:7082', false)

    expect(await control().snapshot()).toMatchObject({ armed: false })
  })

  it('recusa monitor desligado em Telas', async () => {
    setup(makeBridge({ enabled: [20] }))
    await wait()

    expect(control().setTarget('monitor:30', true)).toBe(false)
  })

  it('troca de modo e recusa modo desconhecido', async () => {
    setup(makeBridge())
    await wait()

    expect(control().setMode('share')).toBe(true)
    expect(control().setMode('x')).toBe(false)
    expect(await control().snapshot()).toMatchObject({ mode: 'share' })
  })

  it('recusa destino em formato desconhecido', async () => {
    setup(makeBridge())
    await wait()

    expect(control().setTarget('outro:1', true)).toBe(false)
  })
})

describe('independent-panel', () => {
  it('as 4 barras dos players carregam o espelho de rede e montam o painel', () => {
    for (const bar of BARS) {
      const html = readFileSync(resolve(__dirname, `../${bar}.html`), 'utf-8')
      expect(html, bar).toContain('<script src="../palco/network-mirror.js"></script>')
      expect(html, bar).toContain('<script src="independent-panel.js"></script>')
      expect(html, bar).toContain('PianoIndependentPanel.mount()')
    }
  })

  it('botão entra logo depois de "Selecionar telas"; só áudio ou sem ponte não monta', () => {
    const { $ } = setup(makeBridge())
    expect($('.monitor-wrap')!.nextElementSibling!.id).toBe('independentProjection')
    dom!.window.close()
    expect(setup(makeBridge(), '?audioOnly=1').handle).toBeNull()
  })

  it('abre o painel com Sobrepor marcado, monitores estendidos e conexões ativas', async () => {
    const bridge = makeBridge()
    const { $, $$ } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    expect($('#independentPanel')!.classList.contains('is-open')).toBe(true)
    // pede a altura do painel inteiro + barra (JSDOM mede 0 → só a barra + folga)
    expect(bridge.projection.setSiteControlPanelOpen).toHaveBeenCalledWith(true, expect.any(Number))
    const asked = bridge.projection.setSiteControlPanelOpen.mock.calls.at(-1)![1] as number
    expect(asked).toBeGreaterThan(0)
    expect($('#independentPanel')!.style.maxHeight).toMatch(/^calc\(100% - \d+px\)$/)
    expect($('.bar')!.style.position).toBe('absolute')
    expect($$('.ip-mode').map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect($$('#independentMonitors .ip-name').map((n) => n.textContent)).toEqual(['Monitor 2', 'Monitor 3'])
    expect($$('#independentMonitors .ip-meta').map((n) => n.textContent)).toEqual(['2560 × 1080', '1080 × 2560'])
    expect($$('#independentRemotes .ip-name').map((n) => n.textContent)).toEqual(['OBS'])
    expect($('#independentRemotes .ip-meta')!.textContent).toBe('Conexões ativas: 3')
  })

  it('escolher monitor só seleciona; a seta projeta e para; a seta fica habilitada', async () => {
    const bridge = makeBridge()
    const { $, $$, barClicks } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    $$('#independentMonitors .ip-item')[0]!.click()
    await wait()
    expect(bridge.projection.openIndependent).not.toHaveBeenCalled()
    expect($$('#independentMonitors .ip-item')[0]!.classList.contains('is-active')).toBe(true)
    expect($('#independentProjection')!.classList.contains('is-armed')).toBe(true)
    expect(($('#project') as HTMLButtonElement).disabled).toBe(false)

    $$('.ip-mode')[1]!.click()
    $('#project')!.click()
    await wait()
    expect(bridge.projection.openIndependent).toHaveBeenCalledWith([20], 'share')
    expect(barClicks).toEqual(['bar'])
    expect($('#independentProjection')!.classList.contains('is-active')).toBe(true)
    expect($('#project')!.classList.contains('ip-project-live')).toBe(true)
    expect($('#independentMonitors .ip-live')!.textContent).toBe('NO AR')

    // só a independente no ar: a seta desliga e NÃO chega à barra (não liga a principal)
    $('#project')!.click()
    await wait()
    expect(bridge.projection.closeIndependent).toHaveBeenCalled()
    expect(barClicks).toEqual(['bar'])
    expect($('#independentProjection')!.classList.contains('is-active')).toBe(false)
    expect($('#independentProjection')!.classList.contains('is-armed')).toBe(true)
  })

  it('caixas de seleção: vários monitores e várias conexões projetam juntos pela seta', async () => {
    const bridge = makeBridge({ slots: [{ id: '7082', label: 'OBS', clients: 3 }, { id: '7084', label: 'OBS 2', clients: 1 }] })
    const { $, $$ } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    expect($('#independentMonitors .ip-item')!.getAttribute('role')).toBe('checkbox')
    $$('#independentMonitors .ip-item')[0]!.click()
    await wait()
    $$('#independentMonitors .ip-item')[1]!.click()
    await wait()
    $$('#independentRemotes .ip-item')[0]!.click()
    await wait()
    $$('#independentRemotes .ip-item')[1]!.click()
    await wait()
    expect($$('#independentMonitors .ip-item').map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'true'])
    $('#project')!.click()
    await wait(40)
    expect(bridge.projection.openIndependent).toHaveBeenCalledWith([20, 30], 'overlay')
    const started = bridge.sent.filter((e) => e.msg.cleanMirror).map((e) => e.slotId)
    expect(started).toEqual(['7082', '7084'])
    expect($$('#independentMonitors .ip-live')).toHaveLength(2)
    expect($$('#independentRemotes .ip-live')).toHaveLength(2)

    $('#project')!.click()
    await wait(40)
    const stopped = bridge.sent.filter((e) => e.msg.action === 'stop').map((e) => e.slotId)
    expect(stopped).toEqual(['7082', '7084'])
    // desmarcar muda o destino da próxima vez
    $$('#independentMonitors .ip-item')[0]!.click()
    await wait()
    $('#project')!.click()
    await wait(40)
    expect(bridge.projection.openIndependent).toHaveBeenLastCalledWith([30], 'overlay')
  })

  it('com a principal no ar, a seta para as duas (a barra também recebe o clique)', async () => {
    const bridge = makeBridge({ state: { displayIds: [20], mode: 'overlay' } })
    const { $, barClicks } = setup(bridge)
    await wait()
    $('#project')!.setAttribute('aria-pressed', 'true')
    $('#project')!.click()
    await wait()
    expect(bridge.projection.closeIndependent).toHaveBeenCalled()
    expect(barClicks).toEqual(['bar'])
  })

  it('sem destino escolhido, a seta segue só com a principal', async () => {
    const bridge = makeBridge()
    const { $, barClicks } = setup(bridge)
    await wait()
    ;($('#project') as HTMLButtonElement).disabled = false
    $('#project')!.click()
    await wait()
    expect(bridge.projection.openIndependent).not.toHaveBeenCalled()
    expect(barClicks).toEqual(['bar'])
  })

  it('estado já no ar ao abrir: monitor marcado e modo do main', async () => {
    const bridge = makeBridge({ state: { displayIds: [30], mode: 'share' } })
    const { $, $$ } = setup(bridge)
    await wait()
    expect($('#independentProjection')!.classList.contains('is-active')).toBe(true)
    $('#independentProjection')!.click()
    await wait()
    expect($$('#independentMonitors .ip-item')[1]!.classList.contains('is-active')).toBe(true)
    expect($$('.ip-mode')[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('conexão remota: escolher só seleciona; a seta liga o espelho e depois desliga', async () => {
    const bridge = makeBridge()
    const { $ } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    ;($('#independentRemotes .ip-item') as HTMLElement).click()
    await wait()
    expect(bridge.sent).toEqual([])
    expect($('#independentRemotes .ip-item')!.classList.contains('is-active')).toBe(true)
    $('#project')!.click()
    await wait()
    expect(bridge.sent.at(-1)).toMatchObject({ slotId: '7082', msg: { type: 'video', cleanMirror: true } })
    expect($('#independentRemotes .ip-live')).not.toBeNull()
    $('#project')!.click()
    await wait()
    expect(bridge.sent.at(-1)).toMatchObject({ slotId: '7082', msg: { type: 'video', action: 'stop' } })
    expect($('#independentRemotes .ip-live')).toBeNull()
  })

  it('sem monitor estendido nem conexão: mensagens de vazio', async () => {
    const bridge = makeBridge({ slots: [] })
    bridge.displays.list.mockResolvedValue([{ id: 10, isPrimary: true, bounds: { width: 1920, height: 1080 } }])
    const { $ } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    expect($('#independentMonitors')!.textContent).toContain('Nenhum monitor estendido')
    expect($('#independentRemotes')!.textContent).toContain('Nenhuma conexão remota ativa')
  })

  it('fecha com ESC e com o painel "Selecionar telas"; desprende a barra', async () => {
    const bridge = makeBridge()
    const { $, doc } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    doc.dispatchEvent(new dom!.window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect($('#independentPanel')!.classList.contains('is-open')).toBe(false)
    expect($('.bar')!.getAttribute('style')).toBeNull()
    expect(bridge.projection.setSiteControlPanelOpen).toHaveBeenLastCalledWith(false)

    $('#independentProjection')!.click()
    await wait()
    $('#shell')!.classList.add('is-panel-open')
    await wait()
    expect($('#independentPanel')!.classList.contains('is-open')).toBe(false)
  })

  it('monitor desligado no "Telas" aparece desativado com o aviso; no ar ainda dá para desmarcar', async () => {
    const bridge = makeBridge({ enabled: [20] })
    const { $, $$ } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    const [on, off] = $$('#independentMonitors .ip-item') as HTMLButtonElement[]
    expect(on!.disabled).toBe(false)
    expect(off!.disabled).toBe(true)
    expect(off!.querySelector('.ip-note')!.textContent).toBe('Ative em Telas para usar')
    expect(on!.querySelector('.ip-note')).toBeNull()

    const live = makeBridge({ enabled: [], state: { displayIds: [30], mode: 'overlay' } })
    dom!.window.close()
    const second = setup(live)
    second.$('#independentProjection')!.click()
    await wait()
    const items = second.$$('#independentMonitors .ip-item') as HTMLButtonElement[]
    expect(items[0]!.disabled).toBe(true)
    expect(items[1]!.disabled).toBe(false)
    expect(items[1]!.getAttribute('aria-checked')).toBe('true')
  })

  it('Compartilhar mostra o aviso das conexões remotas; identificar monitores', async () => {
    const bridge = makeBridge()
    const { $, $$ } = setup(bridge)
    $('#independentProjection')!.click()
    await wait()
    const remoteHint = $$('.ip-hint')[1]!
    expect(remoteHint.style.display).toBe('none')
    $$('.ip-mode')[1]!.click()
    expect(remoteHint.style.display).toBe('block')
    ;($('.ip-identify') as HTMLElement).click()
    expect(bridge.displays.identify).toHaveBeenCalled()
  })
})
