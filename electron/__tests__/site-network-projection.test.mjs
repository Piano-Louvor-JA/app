// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
const html = readFileSync(new URL('../player/site-control-bar.html', import.meta.url), 'utf8')
it('enables site projection when only a connected receiver is selected', () => {
  const context = { networkActive: false, tvSlots: [{ id: '0', clients: 1 }], tvChecked: {}, selectedIds: [],
    projectBtn: { classList: { add() {}, remove() {} }, setAttribute() {} }, projectIcon: {}, ARROW_PATH: '', STOP_PATH: '' }
  runInNewContext(html.slice(html.indexOf('function setProjectingUi'), html.indexOf('function updateBadge')), context)
  context.setProjectingUi(false)
  expect(context.projectBtn.disabled).toBe(false)
  context.tvChecked['0'] = false
  context.setProjectingUi(false)
  expect(context.projectBtn.disabled).toBe(true)
})
it('starts network projection without toggling physical monitors in network-only mode', async () => {
  let click
  const startConnections = vi.fn()
  const toggleSiteScreens = vi.fn()
  const context = { projectBtn: { disabled: false, addEventListener: (_, fn) => { click = fn } },
    networkActive: false, selectedIds: [], startConnections, refreshNav: vi.fn(),
    window: { louvorja: { projection: { getNavigationState: async () => ({ projecting: false }), toggleSiteScreens } } } }
  runInNewContext(html.slice(html.indexOf("projectBtn.addEventListener('click'"), html.indexOf("monitorBtn.addEventListener('click'")), context)
  await click()
  expect(toggleSiteScreens).not.toHaveBeenCalled()
  expect(startConnections).toHaveBeenCalledOnce()
})
