import { expect, it } from 'vitest'
// @ts-ignore Runtime Electron module.
import { updateReplayState } from '../replay-state.mjs'

it('não reaplica espera antiga por cima do Cronômetro ao conectar o OBS', () => {
  const cache = new Map()
  updateReplayState(cache, { type: 'timer', text: '00:00:00' })
  updateReplayState(cache, { type: 'idle' })
  expect(cache.has('timer')).toBe(false)
  updateReplayState(cache, { type: 'timer', text: '00:01:23' })
  expect([...cache.values()]).toEqual([{ type: 'timer', text: '00:01:23' }])
})
it('preserva espera principal enquanto há conteúdo somente no lado compartilhado', () => {
  const cache = new Map()
  updateReplayState(cache, { type: 'idle' })
  updateReplayState(cache, { type: 'projection', obsPane: true, text: 'Bíblia' })
  expect(cache.has('idle')).toBe(true)
  expect(cache.has('obs-secondary')).toBe(true)
})
