import { describe, expect, it, vi } from 'vitest'

import { P2pRemoteHost } from '../services/p2p-remote-host'

// Mock mínimo de RTCPeerConnection/DataChannel
class FakeChannel {
  readyState = 'connecting'
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  sent: string[] = []
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 'closed' }
}

class FakePC {
  localDescription: unknown = null
  iceGatheringState = 'complete' // já completo: waitForIce resolve imediato
  channel = new FakeChannel()
  ondatachannel: ((ev: { channel: FakeChannel }) => void) | null = null
  createDataChannel() { return this.channel }
  async createOffer() { return { type: 'offer', sdp: 'v=0 fake-offer' } }
  async setLocalDescription(d: unknown) { this.localDescription = d }
  async setRemoteDescription(d: unknown) {
    if (typeof d !== 'object' || d === null) throw new Error('bad desc')
    if ((d as { sdp?: string }).sdp === 'invalid') throw new Error('bad sdp')
  }
  close() { /* noop */ }
}

vi.stubGlobal('RTCPeerConnection', FakePC)

describe('P2pRemoteHost', () => {
  it('createOffer retorna SDP offer serializado', async () => {
    const host = new P2pRemoteHost()
    const offerJson = await host.createOffer()
    const parsed = JSON.parse(offerJson) as { type: string; sdp: string }
    expect(parsed.type).toBe('offer')
    expect(parsed.sdp).toContain('fake-offer')
    host.destroy()
  })

  it('acceptAnswer valida JSON e SDP', async () => {
    const host = new P2pRemoteHost()
    await host.createOffer()
    const ok = await host.acceptAnswer(JSON.stringify({ type: 'answer', sdp: 'v=0 ok' }))
    expect(ok).toBe(true)
    const bad = await host.acceptAnswer(JSON.stringify({ type: 'answer', sdp: 'invalid' }))
    expect(bad).toBe(false)
    const notJson = await host.acceptAnswer('não-json')
    expect(notJson).toBe(false)
    host.destroy()
  })

  it('channel: onMessage recebe JSON, send só quando open', async () => {
    const host = new P2pRemoteHost()
    await host.createOffer()
    const received: unknown[] = []
    host.onMessage = (d) => received.push(d)
    // simula channel aberto + mensagem chegando
    const pc = (host as unknown as { pc: FakePC }).pc
    pc.channel.readyState = 'open'
    pc.channel.onmessage?.({ data: JSON.stringify({ action: 'player.play' }) })
    expect(received).toEqual([{ action: 'player.play' }])

    host.send({ a: 1 })
    expect(pc.channel.sent).toEqual([JSON.stringify({ a: 1 })])
    host.destroy()
  })

  it('sem offer: acceptAnswer falha e send não lança', async () => {
    const host = new P2pRemoteHost()
    expect(host.isOpen).toBe(false)
    await expect(host.acceptAnswer('{}')).resolves.toBe(false)
    expect(() => host.send({ x: 1 })).not.toThrow()
    host.destroy()
  })
})
