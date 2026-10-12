// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@modules/bible/views/BibleProjectionView.vue', () => ({
  default: { name: 'BibleProjectionView', template: '<div class="stub-bible" />' },
}))
vi.mock('@modules/clock/views/ClockProjectionView.vue', () => ({
  default: { name: 'ClockProjectionView', template: '<div class="stub-clock" />' },
}))
vi.mock('@modules/countdown/views/CountdownProjectionView.vue', () => ({
  default: { name: 'CountdownProjectionView', template: '<div class="stub-countdown" />' },
}))
vi.mock('@modules/liturgy/views/LiturgyWebProjectionView.vue', () => ({
  default: { name: 'LiturgyWebProjectionView', template: '<div class="stub-liturgy" />' },
}))
vi.mock('@modules/media/views/MediaProjectionView.vue', () => ({
  default: { name: 'MediaProjectionView', template: '<div class="stub-media" />' },
}))
vi.mock('@modules/media/views/MediaReturnProjectionView.vue', () => ({
  default: { name: 'MediaReturnProjectionView', template: '<div class="stub-media-return" />' },
}))
vi.mock('@modules/random/views/RandomProjectionView.vue', () => ({
  default: { name: 'RandomProjectionView', template: '<div class="stub-random" />' },
}))
vi.mock('@modules/timer/views/TimerProjectionView.vue', () => ({
  default: { name: 'TimerProjectionView', template: '<div class="stub-timer" />' },
}))

import ProjectionHost from '../ProjectionHost.vue'

async function createWrapper(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: ProjectionHost }],
  })
  await router.push({ path: '/', query })
  const wrapper = mount(ProjectionHost, { global: { plugins: [router] } })
  return wrapper
}

describe('ProjectionHost.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('module=clock → ClockProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'clock' })
    expect(wrapper.find('.stub-clock').exists()).toBe(true)
  })

  it('module=timer → TimerProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'timer' })
    expect(wrapper.find('.stub-timer').exists()).toBe(true)
  })

  it('module=countdown → CountdownProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'countdown' })
    expect(wrapper.find('.stub-countdown').exists()).toBe(true)
  })

  it('module=random → RandomProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'random' })
    expect(wrapper.find('.stub-random').exists()).toBe(true)
  })

  it('module=bible → BibleProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'bible' })
    expect(wrapper.find('.stub-bible').exists()).toBe(true)
  })

  it('module=media + layout=return → MediaReturnProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'media', layout: 'return' })
    expect(wrapper.find('.stub-media-return').exists()).toBe(true)
  })

  it('module=media → MediaProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'media' })
    expect(wrapper.find('.stub-media').exists()).toBe(true)
  })

  it('module=liturgy-web → LiturgyWebProjectionView', async () => {
    const wrapper = await createWrapper({ module: 'liturgy-web' })
    expect(wrapper.find('.stub-liturgy').exists()).toBe(true)
  })

  it('sem module → empty state', async () => {
    const wrapper = await createWrapper()
    expect(wrapper.find('.projection-host-empty').exists()).toBe(true)
  })

  it('module desconhecido → empty state', async () => {
    const wrapper = await createWrapper({ module: 'xyz' })
    expect(wrapper.find('.projection-host-empty').exists()).toBe(true)
  })
})
