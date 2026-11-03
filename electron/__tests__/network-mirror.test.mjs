// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
function setup() {
  const peers = []
  class Peer {
    constructor() { this.tracks = []; peers.push(this) }
    addTrack(track) { this.tracks.push(track) }
    async createOffer() { return { type: 'offer', sdp: 'offer' } }
    async createAnswer() { return { type: 'answer', sdp: 'answer' } }
    async setLocalDescription(value) { this.localDescription = value }
    async setRemoteDescription(value) { this.remoteDescription = value }
    async addIceCandidate(value) { (this.candidates ||= []).push(value) }
    close() { this.closed = true }
  }
  const context = { RTCPeerConnection: Peer, Map, Promise, Math, Date, console, crypto: webcrypto }
  context.globalThis = context
  runInNewContext(readFileSync(new URL('../palco/network-mirror.js', import.meta.url), 'utf8'), context)
  return { ...context.PianoNetworkMirror, peers }
}
it('captures once, negotiates targeted peers, and stops capture when projection ends', async () => {
  const { createSender, peers } = setup()
  const track = { stop: vi.fn() }
  const capture = vi.fn(async () => ({ getTracks: () => [track] }))
  const send = vi.fn(async () => true)
  const sender = createSender({ capture, send })
  await sender.start('0'); await sender.start('7082')
  expect(capture).toHaveBeenCalledOnce()
  const sessionId = send.mock.calls[0][0].mirrorSession
  await sender.handle({ type: 'mirror-signal', action: 'request', receiverId: 'a', sessionId, slotId: '0' })
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'offer', receiverId: 'a' }), '0')
  expect(peers[0].tracks).toEqual([track])
  await sender.handle({ type: 'mirror-signal', action: 'answer', receiverId: 'a', sessionId, slotId: '0', description: { type: 'answer', sdp: 'ok' } })
  expect(peers[0].remoteDescription.sdp).toBe('ok')
  await sender.stop()
  expect(peers[0].closed).toBe(true)
  expect(track.stop).toHaveBeenCalledOnce()
  await sender.handle({ type: 'mirror-signal', action: 'request', receiverId: 'late', sessionId, slotId: '0' })
  expect(peers).toHaveLength(1)
})
it('receiver accepts only its own offer and attaches the clean captured stream', async () => {
  const { createReceiver, peers } = setup()
  const send = vi.fn()
  const attach = vi.fn()
  const receiver = createReceiver({ send, attach, clear: vi.fn() })
  receiver.start('session')
  const receiverId = send.mock.calls[0][0].receiverId
  await receiver.handle({ action: 'offer', receiverId: 'other', sessionId: 'session' })
  expect(peers).toHaveLength(0)
  await receiver.handle({ action: 'offer', receiverId, sessionId: 'session', description: { type: 'offer', sdp: 'ok' } })
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'answer', receiverId }))
  const stream = {}
  peers[0].ontrack({ streams: [stream] })
  peers[0].ontrack({ streams: [stream] })
  expect(attach).toHaveBeenCalledTimes(1)
  expect(attach).toHaveBeenCalledWith(stream)
  receiver.stop()
  expect(peers[0].closed).toBe(true)
  expect(receiver.active()).toBe(false)
})
it('does not mute or show an autoplay prompt when a pending play is interrupted', async () => {
  const html = readFileSync(new URL('../palco/receiver.html', import.meta.url), 'utf8')
  const video = { muted: false, play: vi.fn(() => Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }))) }
  const context = { connectionAudioMuted: false, $: () => video, dlog() {}, showMuteBadge: vi.fn(), hideMuteBadge: vi.fn(), mutedUnlock: false }
  runInNewContext(html.slice(html.indexOf('function playVideoWithFallback()'), html.indexOf('function playWithFallback()')), context)
  context.playVideoWithFallback()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(video.muted).toBe(false)
  expect(video.play).toHaveBeenCalledOnce()
  expect(context.showMuteBadge).not.toHaveBeenCalled()
})
it('unchecking a connection closes only its peer and keeps capture and other receivers alive', async () => {
  const { createSender, peers } = setup()
  const track = { stop: vi.fn() }
  const send = vi.fn(async () => true)
  const sender = createSender({ capture: async () => ({ getTracks: () => [track] }), send })
  await sender.start('0'); await sender.start('7082')
  const sessionId = send.mock.calls[0][0].mirrorSession
  for (const slotId of ['0', '7082']) await sender.handle({ type: 'mirror-signal', action: 'request', receiverId: slotId, slotId, sessionId })
  send.mockClear()
  await sender.remove('0')
  expect(peers[0].closed).toBe(true)
  expect(peers[1].closed).not.toBe(true)
  expect(track.stop).not.toHaveBeenCalled()
  expect(send).toHaveBeenCalledExactlyOnceWith({ v: 2, type: 'video', action: 'stop' }, '0')
})

it('uses 128-bit random identifiers and rotates the session after stop', async () => {
  const { createSender, createReceiver } = setup()
  const send = vi.fn(async () => true)
  const sender = createSender({ capture: async () => ({ getTracks: () => [] }), send })
  await sender.start('0')
  const first = send.mock.calls[0][0].mirrorSession
  expect(first).toMatch(/^[0-9a-f]{32}$/)
  await sender.stop()
  await sender.start('0')
  const second = send.mock.calls.at(-1)[0].mirrorSession
  expect(second).toMatch(/^[0-9a-f]{32}$/)
  expect(second).not.toBe(first)
  const signal = vi.fn()
  createReceiver({ send: signal, clear: vi.fn() }).start(second)
  expect(signal.mock.calls[0][0].receiverId).toMatch(/^[0-9a-f]{32}$/)
})
