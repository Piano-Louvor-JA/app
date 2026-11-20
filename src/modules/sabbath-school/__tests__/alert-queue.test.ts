import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Fila de alertas (feedback Ezequias 02/10): "adiciona queue".
 * Dois marcos cruzando no mesmo tick (rAF congelado em bg salta de 10min
 * pra 1min) tocavam SIMULTANEAMENTE; agora entram em fila serial.
 */

// mock do WebAudio/Audio ANTES do import do módulo
class FakeAudio {
  volume = 1
  currentTime = 0
  paused = true
  preload = 'auto'
  listeners = new Map<string, (() => void)[]>()
  addEventListener(ev: string, cb: () => void) {
    const list = this.listeners.get(ev) ?? []
    list.push(cb)
    this.listeners.set(ev, list)
  }
  async play() {
    this.paused = false
    // simula duração: resolve 'ended' só quando o teste mandar
    return new Promise<void>((resolve) => {
      this.listeners.set('ended-resolve', [...(this.listeners.get('ended-resolve') ?? []), resolve])
    })
  }
  pause() {
    this.paused = true
  }
  get canplaythrough() {
    return this.listeners.get('canplaythrough') ?? []
  }
  fireCanPlay() {
    for (const cb of this.listeners.get('canplaythrough') ?? []) cb()
  }
}

vi.stubGlobal('Audio', FakeAudio)
vi.stubGlobal('AudioContext', class {
  currentTime = 0
  destination = {}
  createOscillator() {
    return { type: '', frequency: { value: 0, setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  }
})

import {
  clearAlertQueue,
  droppedAlertCount,
  enqueueAlert,
  pendingAlertCount,
} from '../services/alert-tone'

describe('fila de alertas (queue) — feedback Ezequias', () => {
  beforeEach(() => {
    clearAlertQueue()
  })

  it('enfileira e executa em sequência — pending volta a 0', async () => {
    const order: string[] = []
    enqueueAlert(async () => {
      order.push('a')
    })
    enqueueAlert(async () => {
      order.push('b')
    })
    // aguarda a cadeia drenar
    await new Promise((r) => setTimeout(r, 20))
    expect(order).toEqual(['a', 'b'])
    expect(pendingAlertCount()).toBe(0)
  })

  it('excesso de pendências descarta (não empilha alertas atrasados)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    enqueueAlert(() => gate) // ocupa a fila
    enqueueAlert(async () => {}) // 2º entra (max default 2)
    enqueueAlert(async () => {}) // 3º é descartado
    expect(droppedAlertCount()).toBeGreaterThan(0)
    release()
    await new Promise((r) => setTimeout(r, 10))
  })

  it('clearAlertQueue zera pendências (Stop do operador corta a fila)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    enqueueAlert(() => gate)
    enqueueAlert(async () => {})
    clearAlertQueue()
    expect(pendingAlertCount()).toBe(0)
    release()
  })

  it('erro num alerta não bloqueia os seguintes', async () => {
    const ran: string[] = []
    enqueueAlert(async () => {
      throw new Error('falha deliberada')
    })
    enqueueAlert(async () => {
      ran.push('segundo')
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(ran).toEqual(['segundo'])
  })
})
