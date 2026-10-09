// @vitest-environment jsdom
/**
 * Testes do Receiver de Controle Remoto (Palco).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteControlReceiver, type RemoteControlOptions } from '../remote-control-receiver'

class FakeWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3

  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  closed = false

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  closeCount = 0

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closeCount++
    if (this.closeCount > 1) return
    this.closed = true
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  // helpers de teste
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  receive(data: unknown): void {
    this.onmessage?.({ data })
  }

  lastMessage<T = Record<string, unknown>>(): T {
    return JSON.parse(this.sent[this.sent.length - 1]!) as T
  }
}

function makeOpts(overrides: Partial<RemoteControlOptions> = {}): RemoteControlOptions & {
  actions: {
    play: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    setVolume: ReturnType<typeof vi.fn>
    seek: ReturnType<typeof vi.fn>
  }
  getState: ReturnType<typeof vi.fn>
  log: ReturnType<typeof vi.fn>
} {
  return {
    actions: {
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      setVolume: vi.fn(),
      seek: vi.fn(),
    },
    getState: vi.fn(() => ({ playing: true, volume: 0.5 })),
    log: vi.fn(),
    ...overrides,
  } as never
}

describe('RemoteControlReceiver', () => {
  let opts: ReturnType<typeof makeOpts>
  let receiver: RemoteControlReceiver

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    opts = makeOpts()
    receiver = new RemoteControlReceiver('ws://x', opts)
  })

  afterEach(() => {
    receiver.stop()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function firstSocket(): FakeWebSocket {
    return FakeWebSocket.instances[0]!
  }

  it('não conecta quando stopped e start() reseta stopped', () => {
    receiver.stop()
    receiver.start()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(receiver.connected).toBe(false) // ainda CONNECTING
  })

  it('envia hello v2 ao abrir conexão', () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    expect(ws.lastMessage()).toMatchObject({ v: 2, type: 'hello', role: 'desktop' })
    expect(opts.log).toHaveBeenCalledWith('remote: conectado ao', 'ws://x')
    expect(receiver.connected).toBe(true)
  })

  it('executa play/pause/stop e responde ack ok', async () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'play', id: 'a' }))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'pause', id: 'b' }))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'stop', id: 'c' }))
    await vi.waitFor(() => {
      expect(opts.actions.play).toHaveBeenCalled()
      expect(opts.actions.pause).toHaveBeenCalled()
      expect(opts.actions.stop).toHaveBeenCalled()
    })
    expect(ws.sent).toHaveLength(4) // hello + 3 acks
    expect(ws.lastMessage()).toMatchObject({ type: 'remote.ack', id: 'c', ok: true })
  })

  it('clamp de volume entre 0 e 1 e aceita limites', async () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'volume', value: 2 }))
    await vi.waitFor(() => expect(opts.actions.setVolume).toHaveBeenCalledWith(1))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'volume', value: -5 }))
    await vi.waitFor(() => expect(opts.actions.setVolume).toHaveBeenCalledWith(0))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'volume', value: 0.7 }))
    await vi.waitFor(() => expect(opts.actions.setVolume).toHaveBeenCalledWith(0.7))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'volume', value: Number.NaN }))
    await vi.waitFor(() => expect(opts.actions.setVolume).toHaveBeenCalledTimes(3))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'volume' }))
    await vi.waitFor(() => expect(opts.actions.setVolume).toHaveBeenCalledTimes(3))
  })

  it('seek com valor finito e ignora inválido', async () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'seek', value: 12 }))
    await vi.waitFor(() => expect(opts.actions.seek).toHaveBeenCalledWith(12))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'seek', value: Number.NaN }))
    await vi.waitFor(() => expect(opts.actions.seek).toHaveBeenCalledTimes(1))
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'seek' }))
    await vi.waitFor(() => expect(opts.actions.seek).toHaveBeenCalledTimes(1))
  })

  it('responde ok=false a comando desconhecido', async () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'boom', id: 'z' }))
    await vi.waitFor(() => {
      expect(ws.lastMessage()).toMatchObject({ type: 'remote.ack', id: 'z', ok: false })
    })
  })

  it('ignora mensagens sem remote.command e JSON inválido', () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.receive('nope{{{')
    ws.receive(JSON.stringify({ type: 'other' }))
    ws.receive(JSON.stringify({ type: 'remote.command' }))
    expect(opts.actions.play).not.toHaveBeenCalled()
    expect(ws.sent).toHaveLength(1) // apenas hello
  })

  it('ack com ok=false quando a ação lança erro', async () => {
    opts.actions.play.mockRejectedValue(new Error('x'))
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.receive(JSON.stringify({ type: 'remote.command', command: 'play', id: 'e' }))
    await vi.waitFor(() => {
      expect(ws.lastMessage()).toMatchObject({ type: 'remote.ack', id: 'e', ok: false })
    })
    expect(opts.log).toHaveBeenCalledWith('remote: erro no comando', 'play', expect.any(Error))
  })

  it('reconecta após fechar não-intencional', () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.close() // dispara onclose com stopped=false
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(3000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('não reconecta quando fechou por stop()', () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    receiver.stop()
    vi.advanceTimersByTime(10000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(receiver.connected).toBe(false)
  })

  it('limpa timer pendente ao stop()', () => {
    receiver.start()
    firstSocket().close()
    expect(vi.getTimerCount()).toBe(1)
    receiver.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('scheduleReconnect não duplica timer', () => {
    receiver.start()
    firstSocket().close()
    // onerror fecha de novo — sem segundo timer
    firstSocket().onerror?.()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('onerror fecha o socket', () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    ws.onerror?.()
    expect(ws.closed).toBe(true)
  })

  it('reportState envia snapshot espontâneo', () => {
    receiver.start()
    const ws = firstSocket()
    ws.open()
    receiver.reportState()
    expect(ws.lastMessage()).toMatchObject({
      v: 2,
      type: 'remote.state',
      state: { playing: true, volume: 0.5 },
    })
  })

  it('send não faz nada sem conexão nem com socket lançando', () => {
    receiver.reportState() // ws === null → send() sai cedo
    receiver.start()
    const ws = firstSocket()
    ws.open()
    vi.spyOn(ws, 'send').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => receiver.reportState()).not.toThrow()
  })

  it('reagenda reconexão se new WebSocket lançar', () => {
    const original = WebSocket
    vi.stubGlobal('WebSocket', function () {
      throw new Error('refused')
    })
    receiver.start()
    vi.advanceTimersByTime(3000)
    expect(opts.log).toHaveBeenCalledWith('remote: falha ao conectar', expect.any(Error))
    expect(vi.getTimerCount()).toBe(1)
    // recupera para o afterEach
    vi.stubGlobal('WebSocket', original)
  })

	describe("connect pós-stop (74)", () => {
		it("stop() seguido de connect manual: não reconecta", () => {
			receiver.stop();
			// acessar connect via re-entrada: scheduleReconnect após stop não agenda
			// dispara erro de conexão após stop → scheduleReconnect não deve criar timer
			const ws = receiver["ws"] as unknown as { onerror?: (e: unknown) => void; onclose?: (e: unknown) => void } | null;
			// chamar connect() privado via cast
			(receiver as unknown as { connect: () => void }).connect();
			expect(receiver["reconnectTimer"]).toBeNull();
		});
	});
})
