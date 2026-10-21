import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

/**
 * Integração bridge (spec 2026-08-27): publica runtime do sorteio no canal
 * e verifica que a projeção sai ao slot certo — reproduz o bug relatado
 * ("cliquei Projetar no sorteio, TV continuou idle, nada chegou no WS").
 */

// JSDOM global (padrão stage-settings-runtime.test.ts)
const dom = new JSDOM('', { url: 'http://localhost/' })
const g = globalThis as unknown as Record<string, unknown>
vi.stubGlobal('window', dom.window)
vi.stubGlobal('document', dom.window.document)
vi.stubGlobal('localStorage', dom.window.localStorage)
vi.stubGlobal('sessionStorage', dom.window.sessionStorage)
g.BroadcastChannel = dom.window.BroadcastChannel
if (!g.setInterval) g.setInterval = dom.window.setInterval.bind(dom.window)
if (!g.clearInterval) g.clearInterval = dom.window.clearInterval.bind(dom.window)

// i18n roda no import-time e puxa user-preferences (localStorage) — mockar
// com o MESMO specifier que o consumidor usa (alias @shared), senão o hoist
// do vi.mock não intercepta.
vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: vi.fn(<T,>(_key: string, fallback: T): T => fallback),
  loadUserPreferences: vi.fn(() => ({})),
  saveUserPreferences: vi.fn(),
  setUserPreference: vi.fn(),
}))

vi.mock('../services/palco-session', async () => {
  const sends: Array<{ slot: string; msg: unknown }> = []
  const fake = {
    isElectron: true,
    activeSlotId: '0',
    setSlot(id: string) { this.activeSlotId = id },
    async slots() {
      return [
        { id: '0', label: 'Principal', running: true },
        { id: '7082', label: 'TV 2', running: true },
      ]
    },
    async projectTo(slot: string, scope: string, input: unknown) {
      sends.push({ slot, msg: { type: 'projection', scope, input } })
    },
    idleTo(slot: string) { sends.push({ slot, msg: { type: 'idle' } }) },
    timerTo(slot: string, opts: unknown) { sends.push({ slot, msg: { type: 'timer', opts } }) },
    idle() { this.idleTo(this.activeSlotId) },
    async projectRouted() { /* não deve ser chamado no novo fluxo */ },
    timerRouted() {},
    audio: () => {},
    onEvent: () => () => {},
    __sends: sends,
  }
  return { palcoSession: fake }
})

// registry em estado limpo por teste
vi.mock('../services/output-registry', async () => {
  const targets: Array<{ id: string; kind: string; slotId?: string; module: string | null }> = []
  return {
    useOutputRegistry: () => ({
      targets,
      moduleForSlot: (slotId: string) =>
        targets.find((t) => t.kind === 'palco-slot' && t.slotId === slotId)?.module ?? null,
      setModule: (id: string, module: string | null) => {
        const t = targets.find((x) => x.id === id)
        if (t) t.module = module
      },
      syncDetected: () => {},
      resetAll: () => { for (const t of targets) t.module = null },
    }),
  }
})

import * as bridgeModule from '../services/palco-bridge'
import { startPalcoBridge, stopPalcoBridge } from '../services/palco-bridge'
import { palcoSession } from '../services/palco-session'

/** Sends capturados pelo mock do palco-session neste worker. */
function sends(): Array<{ slot: string; msg: { type: string } }> {
  return (palcoSession as unknown as { __sends?: Array<{ slot: string; msg: { type: string } }> }).__sends ?? []
}
import { setPalcoRoute } from '../services/palco-routing'
import { RANDOM_RUNTIME_CHANNEL, RANDOM_RUNTIME_STORAGE_KEY } from '../../random/services/random-runtime'

function publishRandom(currentDisplay: string, isDrawing = false, projecting = false) {
  const payload = JSON.stringify({ currentDisplay, isDrawing, projecting })
  localStorage.setItem(RANDOM_RUNTIME_STORAGE_KEY, payload)
  const ch = new MockBroadcastChannel(RANDOM_RUNTIME_CHANNEL)
  // store real publica o OBJETO no canal (publishRandomRuntime), não a string
  ch.postMessage({ currentDisplay, isDrawing, projecting })
  ch.close()
}

// BroadcastChannel mock cross-context (padrão stage-settings-runtime.test.ts)
class MockBroadcastChannel {
  private name: string
  private listeners: ((msg: MessageEvent) => void)[] = []
  static instances = new Set<MockBroadcastChannel>()
  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.add(this)
  }
  addEventListener(_t: string, cb: (msg: MessageEvent) => void) { this.listeners.push(cb) }
  removeEventListener(_t: string, cb: (msg: MessageEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb)
  }
  postMessage(data: unknown) {
    for (const inst of MockBroadcastChannel.instances) {
      if (inst === this || inst.name !== this.name) continue
      for (const cb of [...inst.listeners]) cb({ data } as MessageEvent)
    }
  }
  close() { MockBroadcastChannel.instances.delete(this) }
}
;(globalThis as unknown as Record<string, unknown>).BroadcastChannel = MockBroadcastChannel

describe('bridge: sorteio projeta na TV roteada (bug 27/08)', () => {
  beforeEach(async () => {
    localStorage.clear()
    stopPalcoBridge()
    // reseta runtime sticky do módulo e o buffer de sends entre testes
    publishRandom('')
    await new Promise((r) => setTimeout(r, 30))
    sends().length = 0
  })
  afterEach(() => stopPalcoBridge())

  it('sorteio com conteúdo + rota pra TV 2 → projection chega no slot 7082', async () => {
    setPalcoRoute('random', '7082')
    startPalcoBridge()
    publishRandom('Maria', false, true)
    await new Promise((r) => setTimeout(r, 150))
    const all = sends()
    const toTv2 = all.filter((s) => s.slot === '7082')
    expect(toTv2.length).toBeGreaterThan(0)
    expect(toTv2.some((s) => s.msg.type === 'projection')).toBe(true)
  })

  it('projetando SEM sorteio → projection vazia (bg do escopo, tela de espera)', async () => {
    setPalcoRoute('random', '7082')
    startPalcoBridge()
    publishRandom('', false, true)
    await new Promise((r) => setTimeout(r, 150))
    const all = sends()
    const proj = all.find((s) => s.slot === '7082' && s.msg.type === 'projection')
    expect(proj).toBeTruthy()
    expect((proj?.msg as { input: { text: string } }).input.text).toBe('')
  })

  it('sem projeção e sem conteúdo → nada além do idle inicial', async () => {
    setPalcoRoute('random', '7082')
    startPalcoBridge()
    publishRandom('')
    await new Promise((r) => setTimeout(r, 150))
    const all = sends()
    expect(all.some((s) => s.msg.type === 'projection')).toBe(false)
  })

  it('rota mirror: sorteio vai a todos os slots espelho', async () => {
    setPalcoRoute('random', 'mirror')
    startPalcoBridge()
    publishRandom('João', false, true)
    await new Promise((r) => setTimeout(r, 150))
    const all = sends()
    expect(all.some((s) => s.slot === '0' && s.msg.type === 'projection')).toBe(true)
    expect(all.some((s) => s.slot === '7082' && s.msg.type === 'projection')).toBe(true)
  })
})
