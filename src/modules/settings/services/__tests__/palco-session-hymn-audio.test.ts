// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { palcoSession } from '../palco-session'
import { obsConnections } from '../obs-connections'

const send = vi.fn(async () => true)
const servePath = vi.fn(async (_path: string, slotId: string) => `http://192.168.0.5:${slotId === '0' ? 7080 : slotId}/media/hino.mp3`)
let slots: Array<{ id: string; running: boolean }>

beforeEach(() => {
  vi.clearAllMocks()
  obsConnections.value = []
  palcoSession.setSlot('0')
  slots = [{ id: '0', running: true }, { id: '7082', running: true }, { id: '7084', running: false }]
  ;(window as never as { louvorja: unknown }).louvorja = {
    palco: { send, servePath, slots: vi.fn(async () => slots.map(slot => ({ ...slot, label: '', clients: 0, httpPort: 0, wsPort: 0 }))) },
  }
})

const targets = () => (send.mock.calls as unknown as Array<[{ action?: string }, string]>).map(([, slotId]) => slotId)

it('plays the hymn on every connection on air, not only the main one', async () => {
  await palcoSession.hymnAudio({ url: 'https://cdn.example/hino.mp3', action: 'play', positionMs: 0 })
  expect(targets().sort()).toEqual(['0', '7082'])
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio', action: 'play', url: 'https://cdn.example/hino.mp3' }), '7082')
})

it('serves a local hymn file from each connection that plays it', async () => {
  await palcoSession.hymnAudio({ url: 'file:///hinos/hino.mp3', action: 'play' })
  expect(servePath).toHaveBeenCalledTimes(2)
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ url: 'http://192.168.0.5:7082/media/hino.mp3' }), '7082')
})

it('skips connections that do not mirror hymns, but stops audio everywhere', async () => {
  obsConnections.value = [{ id: '7082', label: 'OBS 2', selected: false }]
  await palcoSession.hymnAudio({ action: 'pause' })
  expect(targets()).toEqual(['0'])
  send.mockClear()
  await palcoSession.hymnAudio({ action: 'stop' })
  expect(targets().sort()).toEqual(['0', '7082'])
  expect(palcoSession.slotId).toBe('0')
})

it('does nothing outside the desktop app', async () => {
  ;(window as never as { louvorja: unknown }).louvorja = undefined
  await palcoSession.hymnAudio({ action: 'stop' })
  expect(send).not.toHaveBeenCalled()
})
