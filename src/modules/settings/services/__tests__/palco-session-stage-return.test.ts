// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_MEDIA_PROJECTION } from '../../../media/types/media'
import { DEFAULT_STAGE_SETTINGS } from '../../types/stage-settings'

const readEffectiveStageSettings = vi.hoisted(() => vi.fn())
vi.mock('../stage-settings-runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readEffectiveStageSettings,
}))

import { palcoSession } from '../palco-session'
import { obsConnections } from '../obs-connections'

const send = vi.fn()
const status = vi.fn()
const servePath = vi.fn()
const music = { ...DEFAULT_MEDIA_PROJECTION, active: true, title: 'Santo, Santo, Santo', lyric: 'Santo, santo, santo', nextLyric: 'Cedo de manhã', slideIndex: 1, slideProgressRatio: 0.5 }

beforeEach(() => {
  vi.clearAllMocks()
  readEffectiveStageSettings.mockReturnValue({ ...DEFAULT_STAGE_SETTINGS, backgroundImage: 'C:/fundos/palco.jpg', footerRefColor: '#00ff00' })
  status.mockImplementation(async (id: string) => ({ running: true, clients: 1, url: `http://192.168.0.5:${id === '0' ? 47080 : 47082}`, wsUrl: null }))
  servePath.mockImplementation(async (_path: string, id: string) => `http://192.168.0.5:${id === '0' ? 47080 : 47082}/media/palco.jpg`)
  ;(window as never as { louvorja: unknown }).louvorja = {
    palco: {
      send, status, servePath,
      slots: vi.fn().mockResolvedValue([
        { id: '0', running: true, clients: 1, httpPort: 47080, wsPort: 47081 },
        { id: '47082', running: true, clients: 0, httpPort: 47082, wsPort: 47083 },
        { id: '47084', running: false, clients: 0, httpPort: 47084, wsPort: 47085 },
      ]),
    },
  }
})

it('sends the stage return to every source on air, with the hymns look and each source background', async () => {
  await palcoSession.stageReturn(music)
  expect(readEffectiveStageSettings).toHaveBeenCalledWith('hymns')
  expect(send).toHaveBeenCalledTimes(2)
  const [first, firstSlot] = send.mock.calls[0]!
  const [second, secondSlot] = send.mock.calls[1]!
  expect([firstSlot, secondSlot]).toEqual(['0', '47082'])
  expect(first).toMatchObject({ type: 'stageReturn', active: true, current: 'Santo, santo, santo', next: 'Cedo de manhã', progress: 0.5,
    background: 'http://192.168.0.5:47080/media/palco.jpg', style: { barColor: '#00ff00' } })
  expect(second.background).toBe('http://192.168.0.5:47082/media/palco.jpg')
})

it('turns the stage return off on sources unchecked in the screen selector', async () => {
  obsConnections.value = [
    { id: '0', label: 'OBS 1', selected: false },
    { id: '47082', label: 'OBS 2', selected: true, nickname: 'TV Retorno', kind: 'return' },
  ]
  await palcoSession.stageReturn(music)
  const bySlot = Object.fromEntries(send.mock.calls.map(([message, slot]) => [slot, message]))
  expect(bySlot['0']).toEqual({ v: 1, type: 'stageReturn', active: false })
  expect(bySlot['47082']).toMatchObject({ type: 'stageReturn', active: true, current: 'Santo, santo, santo' })
  expect(servePath).toHaveBeenCalledTimes(1)
  obsConnections.value = [
    { id: '0', label: 'OBS 1', selected: true },
    { id: '47082', label: 'OBS 2', selected: false },
  ]
  send.mockClear()
  await palcoSession.stageReturn(music)
  const again = Object.fromEntries(send.mock.calls.map(([message, slot]) => [slot, message]))
  expect(again['0']).toMatchObject({ active: true })
  expect(again['47082']).toEqual({ v: 1, type: 'stageReturn', active: false })
  obsConnections.value = []
})

it('falls back to the song image when the stage has no background of its own', async () => {
  readEffectiveStageSettings.mockReturnValue({ ...DEFAULT_STAGE_SETTINGS, backgroundImage: null })
  await palcoSession.stageReturn({ ...music, imageUrl: 'https://cdn.example.com/capa.jpg' })
  expect(send.mock.calls[0]![0].background).toBe('https://cdn.example.com/capa.jpg')
})

it('tells the sources the stage return is off when no song is on air', async () => {
  await palcoSession.stageReturn({ ...music, active: false })
  expect(send.mock.calls.map(([message, slot]) => [message, slot])).toEqual([
    [{ v: 1, type: 'stageReturn', active: false }, '0'],
    [{ v: 1, type: 'stageReturn', active: false }, '47082'],
  ])
  expect(servePath).not.toHaveBeenCalled()
})

it('does nothing outside the desktop app', async () => {
  ;(window as never as { louvorja: unknown }).louvorja = undefined
  await palcoSession.stageReturn(music)
  expect(send).not.toHaveBeenCalled()
})
