// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ slots: vi.fn(async () => [] as Array<{ id: string; running: boolean }>), refreshObs: vi.fn(async (_id: string) => true) }))
const config = vi.hoisted(() => ({ value: [] as Array<{ id: string; selected: boolean }> }))
vi.mock('../palco-session', () => ({ palcoSession: api }))

const refresh = vi.hoisted(() => vi.fn())
vi.mock('../../composables/useObsConnections', () => ({ refreshObsConnections: refresh }))
vi.mock('../obs-connections', () => ({ notifyObsChanged: vi.fn(), obsConnections: config }))
import { detectObsBeforeProjection, obsDetecting } from '../obs-detection'
import { notifyObsChanged } from '../obs-connections'

beforeEach(() => { vi.clearAllMocks(); config.value = []; refresh.mockResolvedValue(undefined); api.slots.mockResolvedValue([]) })

it('só atualiza a lista de conexões: as fontes abertas não recarregam a cada projeção', async () => {
  config.value = [{ id: '0', selected: true }, { id: '7082', selected: true }]
  api.slots.mockResolvedValue([{ id: '0', running: true }, { id: '7082', running: true }])
  await detectObsBeforeProjection()
  expect(refresh).toHaveBeenCalledOnce()
  expect(api.refreshObs).not.toHaveBeenCalled()
  expect(notifyObsChanged).toHaveBeenCalledOnce()
})

it('aguarda detectar conexões antes de liberar a projeção e avisa a bridge', async () => {
  let finish!: () => void
  refresh.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
  const detection = detectObsBeforeProjection()
  expect(detectObsBeforeProjection()).toBe(detection)
  expect(obsDetecting.value).toBe(true)
  expect(notifyObsChanged).not.toHaveBeenCalled()
  finish()
  await detection
  expect(notifyObsChanged).toHaveBeenCalledOnce()
  expect(obsDetecting.value).toBe(false)
})
