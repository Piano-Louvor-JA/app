// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
const html = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
it('enables projection for connected selected receivers without physical monitors', () => {
  const context = { audioOnly: false, networkProjectionActive: false, selectedIds: [], tvSlots: [{ id: '0', clients: 1 }], tvChecked: {},
    projectBtn: { classList: { add() {}, remove() {} }, setAttribute() {} }, projectIcon: {}, STOP_PATH: '', ARROW_PATH: '' }
  runInNewContext(html.slice(html.indexOf('function setProjectingUi'), html.indexOf('function updateMonitorBadge')), context)
  context.setProjectingUi(false)
  expect(context.projectBtn.disabled).toBe(false)
  context.tvChecked['0'] = false
  context.setProjectingUi(false)
  expect(context.projectBtn.disabled).toBe(true)
  context.tvChecked['0'] = true
  context.tvSlots[0].clients = 0
  context.setProjectingUi(false)
  expect(context.projectBtn.disabled).toBe(true)
})
it('sends to receivers without toggling a physical projection when no monitor is selected', async () => {
  let click
  const toggle = vi.fn()
  const loadTvs = vi.fn()
  const context = { audioOnly: false, networkProjectionActive: false, selectedIds: [], projectBtn: { disabled: false, addEventListener: (_, fn) => { click = fn } },
    window: { louvorja: { projection: { toggleVideoScreens: toggle, getPlaybackState: async () => ({ projecting: false }) } } }, loadTvs, refresh: vi.fn() }
  runInNewContext(html.slice(html.indexOf("projectBtn.addEventListener('click'"), html.indexOf("monitorBtn.addEventListener('click'")), context)
  await click()
  expect(toggle).not.toHaveBeenCalled()
  expect(loadTvs).toHaveBeenCalledOnce()
})
it('loading destinations does not transmit before the projection arrow is pressed', async () => {
  const getSourceMediaInfo = vi.fn(async () => ({ youtubeId: 'example' }))
  const send = vi.fn()
  const context = { audioOnly: false, networkProjectionActive: false, tvSlots: [], tvChecked: {}, tvRenderList() {}, refresh: async () => {}, tvSendMedia: send,
    window: { louvorja: { palco: { slots: async () => [{ id: '0', clients: 1 }] }, projection: { getSourceMediaInfo, getPlaybackState: async () => ({ currentTime: 1 }) } } } }
  runInNewContext(html.slice(html.indexOf('async function loadTvs()'), html.indexOf('var networkMirrorSender')), context)
  await context.loadTvs()
  expect(getSourceMediaInfo).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})
it('adds the first physical monitor immediately while projection is active only on connections', async () => {
  const toggle = vi.fn()
  const targets = vi.fn()
  const context = { audioOnly: false, networkProjectionActive: true, selectedIds: [], Number,
    updateMonitorBadge() {}, renderMonitorList() {}, refresh: vi.fn(),
    window: { louvorja: { projection: { setVideoTargetMonitors: targets, getPlaybackState: async () => ({ projecting: false }), toggleVideoScreens: toggle } } } }
  runInNewContext(html.slice(html.indexOf('async function onToggleMonitor'), html.indexOf('function setCaptionsUi')), context)
  await context.onToggleMonitor({ target: { checked: true, getAttribute: () => '4' } })
  expect(targets).toHaveBeenCalledWith([4])
  expect(toggle).toHaveBeenCalledOnce()
})
it('changing monitor selection before projection only selects the destination', async () => {
  const toggle = vi.fn()
  const context = { audioOnly: false, networkProjectionActive: false, selectedIds: [], Number,
    updateMonitorBadge() {}, renderMonitorList() {}, refresh: vi.fn(),
    window: { louvorja: { projection: { setVideoTargetMonitors: vi.fn(), getPlaybackState: async () => ({ projecting: false }), toggleVideoScreens: toggle } } } }
  runInNewContext(html.slice(html.indexOf('async function onToggleMonitor'), html.indexOf('function setCaptionsUi')), context)
  await context.onToggleMonitor({ target: { checked: true, getAttribute: () => '4' } })
  expect(toggle).not.toHaveBeenCalled()
})
