// @vitest-environment node
import { describe, expect, it } from 'vitest'

// @ts-ignore Native runtime module.
import { createHeartbeat, createLostTvSearch, HEARTBEAT_TIMEOUT_MS, LOST_SEARCH_MS, WAKE_EVERY_MS } from '../heartbeat.mjs'

function setup() {
  let clock = 1_000
  const sent: Array<[string, unknown]> = []
  const pinged: string[] = []
  const terminated: string[] = []
  const lost: string[] = []
  const hb = createHeartbeat({
    now: () => clock,
    send: (s: string, m: unknown) => sent.push([s, m]),
    ping: (s: string) => pinged.push(s),
    terminate: (s: string) => terminated.push(s),
    onLost: (s: string) => lost.push(s),
  })
  return { hb, sent, pinged, terminated, lost, advance: (ms: number) => { clock += ms } }
}

describe('heartbeat do servidor', () => {
  it('manda beat só a quem entende e o ping do WebSocket a todos', () => {
    const { hb, sent, pinged } = setup()
    hb.track('nova')
    hb.track('antiga')
    hb.announce('nova')
    hb.tick()
    expect(sent).toEqual([['nova', { v: 2, type: 'beat' }]])
    expect(pinged).toEqual(['nova', 'antiga'])
  })

  it('tela que respondia e ficou calada cai; quem responde segue', () => {
    const { hb, terminated, lost, advance } = setup()
    hb.track('viva')
    hb.track('muda')
    hb.announce('viva')
    hb.announce('muda')
    for (let i = 0; i < 4; i++) {
      advance(10_000)
      hb.seen('viva')
      hb.tick()
    }
    expect(terminated).toEqual(['muda'])
    expect(lost).toEqual(['muda'])
    expect(hb.has('muda')).toBe(false)
    expect(hb.has('viva')).toBe(true)
  })

  it('tela que nunca respondeu (webOS 4.x, app antigo) não é derrubada', () => {
    const { hb, terminated, advance } = setup()
    hb.track('webos4')
    advance(HEARTBEAT_TIMEOUT_MS * 10)
    hb.tick()
    expect(terminated).toEqual([])
    // respondeu o ping uma vez: daí em diante é cobrada
    hb.seen('webos4')
    advance(HEARTBEAT_TIMEOUT_MS + 1)
    hb.tick()
    expect(terminated).toEqual(['webos4'])
  })

  it('tela que saiu não é mais cobrada', () => {
    const { hb, terminated, pinged, advance } = setup()
    hb.track('a')
    hb.announce('a')
    hb.forget('a')
    advance(HEARTBEAT_TIMEOUT_MS * 2)
    hb.tick()
    expect(terminated).toEqual([])
    expect(pinged).toEqual([])
  })
})

describe('servidor procurando a Android TV que caiu', () => {
  it('manda wake de tempos em tempos até ela voltar ou passar o prazo', () => {
    let clock = 0
    const woken: string[] = []
    const connected = new Set<string>()
    const search = createLostTvSearch({ now: () => clock, wake: (ip: string) => woken.push(ip), isConnected: (ip: string) => connected.has(ip) })
    search.lost('192.168.0.40')
    search.tick()
    expect(woken).toEqual(['192.168.0.40'])
    clock += WAKE_EVERY_MS / 2
    search.tick()
    expect(woken).toHaveLength(1)
    clock += WAKE_EVERY_MS
    search.tick()
    expect(woken).toHaveLength(2)
    // voltou: para de procurar
    connected.add('192.168.0.40')
    clock += WAKE_EVERY_MS
    search.tick()
    expect(woken).toHaveLength(2)
    expect(search.pending()).toEqual([])

    // não voltou em 10 min: desiste
    search.lost('192.168.0.41')
    clock += LOST_SEARCH_MS + 1
    search.tick()
    expect(search.pending()).toEqual([])
    expect(woken.filter(ip => ip === '192.168.0.41')).toHaveLength(0)
  })
})
