// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
vi.mock('../../services/palco-session', () => ({ palcoSession: {
  slots: async () => ['0', '7082', '7084'].map((id, index) => ({ id, label: `OBS ${index + 1}`, running: true, clients: 1 })),
} }))
import { refreshObsConnections, hasSelectedObsTargets } from '../useObsConnections'
import { selectObsConnection, obsConnections } from '../../services/obs-connections'
it('keeps network projection available while any of the three sources remains selected', async () => {
  obsConnections.value = []
  await refreshObsConnections()
  expect(hasSelectedObsTargets('media')).toBe(true)
  selectObsConnection('0', false)
  selectObsConnection('7082', false)
  expect(hasSelectedObsTargets('media')).toBe(true)
  selectObsConnection('7084', false)
  expect(hasSelectedObsTargets('media')).toBe(false)
})
