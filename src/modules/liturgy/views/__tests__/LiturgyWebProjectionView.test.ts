// @vitest-environment jsdom
// LiturgyWebProjectionView — runtime storage/channel, youtube embed params, local-video ended
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  readLiturgyWebRuntimeFromStorage: vi.fn(),
  normalizeLiturgyWebRuntime: vi.fn((v: unknown) => v),
  closeProjectionModule: vi.fn(),
}))

vi.mock('@shared/composables/useProjectionWindow', () => ({
  closeProjectionModule: mocks.closeProjectionModule,
}))

vi.mock('../../services/liturgy-web-runtime', () => ({
  DEFAULT_LITURGY_WEB_RUNTIME: { active: false, kind: 'site', url: '', title: '' },
  LITURGY_WEB_RUNTIME_CHANNEL: 'liturgy-web-runtime-test',
  LITURGY_WEB_RUNTIME_STORAGE_KEY: 'louvorja-liturgy-web-runtime-state',
  normalizeLiturgyWebRuntime: mocks.normalizeLiturgyWebRuntime,
  readLiturgyWebRuntimeFromStorage: mocks.readLiturgyWebRuntimeFromStorage,
}))

import LiturgyWebProjectionView from '../LiturgyWebProjectionView.vue'

function createWrapper() {
  return mount(LiturgyWebProjectionView, { attachTo: document.body })
}

describe('LiturgyWebProjectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    document.head.querySelectorAll('meta[name="referrer"]').forEach((m) => m.remove())
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({ active: false, kind: 'site', url: '', title: '' })
  })

  it('runtime idle: div empty, sem frame', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.liturgy-web-projection__empty').exists()).toBe(true)
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('site ativo: iframe com url', async () => {
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({
      active: true, kind: 'site', url: 'https://exemplo.com', title: 'Site',
    })
    const wrapper = createWrapper()
    await flushPromises()
    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toBe('https://exemplo.com')
    expect(iframe.attributes('title')).toBe('Site')
    wrapper.unmount()
  })

  it('youtube: reescreve params do embed', async () => {
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({
      active: true, kind: 'youtube', url: 'https://youtube.com/watch?v=abc', title: '',
    })
    const wrapper = createWrapper()
    await flushPromises()
    const src = wrapper.find('iframe').attributes('src')!
    expect(src).toContain('autoplay=1')
    expect(src).toContain('controls=1')
    expect(src).toContain('rel=0')
    expect(src).toContain('playsinline=1')
    expect(src).not.toContain('mute=1')
    wrapper.unmount()
  })

  it('youtube url inválida: usa url crua', async () => {
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({
      active: true, kind: 'youtube', url: ':::não-url:::', title: '',
    })
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('iframe').attributes('src')).toBe(':::não-url:::')
    wrapper.unmount()
  })

  it('local-video ativo: video element com blob url', async () => {
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({
      active: true, kind: 'local-video', url: 'blob:video', title: 'Vídeo',
    })
    const wrapper = createWrapper()
    await flushPromises()
    const video = wrapper.find('video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('src')).toBe('blob:video')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('local-video ended: revoga url, fecha janela e módulo', async () => {
    const revokeSpy = vi.fn()
    const closeSpy = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { revokeObjectURL: revokeSpy }))
    Object.defineProperty(window, 'close', { value: closeSpy, writable: true })
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({
      active: true, kind: 'local-video', url: 'blob:video', title: '',
    })
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('video').trigger('ended')
    expect(revokeSpy).toHaveBeenCalledWith('blob:video')
    expect(closeSpy).toHaveBeenCalled()
    expect(mocks.closeProjectionModule).toHaveBeenCalled()
    vi.unstubAllGlobals()
    wrapper.unmount()
  })

  it('storage da chave do runtime: refresca', async () => {
    const wrapper = createWrapper()
    mocks.readLiturgyWebRuntimeFromStorage.mockReturnValue({
      active: true, kind: 'site', url: 'https://novo.com', title: 'Novo',
    })
    window.dispatchEvent(new StorageEvent('storage', { key: 'louvorja-liturgy-web-runtime-state' }))
    await flushPromises()
    expect(wrapper.find('iframe').attributes('src')).toBe('https://novo.com')
    wrapper.unmount()
  })

  it('storage de outra chave: ignora', async () => {
    const wrapper = createWrapper()
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra' }))
    await flushPromises()
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('referrer meta: cria se não existe', () => {
    const wrapper = createWrapper()
    const meta = document.querySelector('meta[name="referrer"]')
    expect(meta).toBeTruthy()
    expect(meta!.getAttribute('content')).toBe('strict-origin-when-cross-origin')
    wrapper.unmount()
  })

  it('referrer meta: atualiza se já existe', async () => {
    const existing = document.createElement('meta')
    existing.name = 'referrer'
    existing.content = 'no-referrer'
    document.head.appendChild(existing)
    const wrapper = createWrapper()
    expect(existing.getAttribute('content')).toBe('strict-origin-when-cross-origin')
    wrapper.unmount()
    existing.remove()
  })

  it('unmount: remove storage listener', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = createWrapper()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function))
    removeSpy.mockRestore()
  })
})
