// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({ video: vi.fn(), site: vi.fn(), bridge: null as unknown }))
vi.mock('@modules/liturgy/services/link-info', () => ({
  fetchOnlineVideoInfo: mocks.video,
  fetchSiteLinkInfo: mocks.site,
}))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: () => mocks.bridge }))

import type { Announcement } from '../../types/announcements'
import { URL_TITLE_DEBOUNCE_MS, useUrlTitleAutofill } from '../useUrlTitleAutofill'

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const SITE = 'https://adventistas.org'

function setup(initial: Announcement = { id: 'u', kind: 'url', title: '', url: '' }) {
  const draft = ref(initial) as Ref<Announcement>
  let loading!: Ref<boolean>
  const wrapper = mount(defineComponent({
    setup() {
      loading = useUrlTitleAutofill(draft).loading
      return () => h('div')
    },
  }))
  return { draft, wrapper, loading: () => loading.value }
}

async function typeUrl(draft: Ref<Announcement>, url: string) {
  if (draft.value.kind === 'url') draft.value.url = url
  await nextTick()
}

async function settle() {
  vi.advanceTimersByTime(URL_TITLE_DEBOUNCE_MS)
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.video.mockReset()
  mocks.site.mockReset()
  mocks.bridge = { siteInfo: { get: vi.fn() }, ytInfo: { get: vi.fn() } }
})

afterEach(() => vi.useRealTimers())

describe('useUrlTitleAutofill', () => {
  it('colar link do YouTube com título vazio preenche o título do vídeo', async () => {
    mocks.video.mockResolvedValue({ title: 'Hino 100 - Arautos do Rei' })
    const { draft, loading } = setup()
    await typeUrl(draft, YT)
    expect(mocks.video).not.toHaveBeenCalled()
    vi.advanceTimersByTime(URL_TITLE_DEBOUNCE_MS)
    expect(loading()).toBe(true)
    await flushPromises()
    expect(loading()).toBe(false)
    expect(mocks.video).toHaveBeenCalledWith(YT, expect.objectContaining({ ytInfo: expect.anything() }))
    expect(draft.value.title).toBe('Hino 100 - Arautos do Rei')
  })

  it('título digitado antes permanece', async () => {
    mocks.video.mockResolvedValue({ title: 'Do vídeo' })
    const { draft } = setup({ id: 'u', kind: 'url', title: 'Meu título', url: '' })
    await typeUrl(draft, YT)
    await settle()
    expect(mocks.video).not.toHaveBeenCalled()
    expect(draft.value.title).toBe('Meu título')
  })

  it('título digitado enquanto busca permanece', async () => {
    let resolve!: (v: unknown) => void
    mocks.video.mockReturnValue(new Promise((r) => { resolve = r }))
    const { draft } = setup()
    await typeUrl(draft, YT)
    vi.advanceTimersByTime(URL_TITLE_DEBOUNCE_MS)
    draft.value.title = 'Digitado'
    resolve({ title: 'Do vídeo' })
    await flushPromises()
    expect(draft.value.title).toBe('Digitado')
  })

  it('trocar o link troca o título que foi preenchido sozinho', async () => {
    mocks.video.mockResolvedValueOnce({ title: 'Primeiro' })
    mocks.site.mockResolvedValueOnce({ title: 'Portal Adventista' })
    const { draft } = setup()
    await typeUrl(draft, YT)
    await settle()
    expect(draft.value.title).toBe('Primeiro')
    await typeUrl(draft, SITE)
    await settle()
    expect(mocks.site).toHaveBeenCalledWith(SITE, expect.anything())
    expect(draft.value.title).toBe('Portal Adventista')
  })

  it('link que muda antes da resposta descarta a resposta velha', async () => {
    let resolve!: (v: unknown) => void
    mocks.video.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    mocks.site.mockResolvedValueOnce({ title: 'Site' })
    const { draft } = setup()
    await typeUrl(draft, YT)
    vi.advanceTimersByTime(URL_TITLE_DEBOUNCE_MS)
    await typeUrl(draft, SITE)
    resolve({ title: 'Velho' })
    await settle()
    expect(draft.value.title).toBe('Site')
  })

  it('site fora do desktop, link inválido, sem título na resposta ou link apagado não preenchem', async () => {
    mocks.bridge = null
    const { draft, wrapper } = setup()
    await typeUrl(draft, SITE)
    await settle()
    expect(mocks.site).not.toHaveBeenCalled()
    await typeUrl(draft, 'http://exa mple')
    await settle()
    mocks.video.mockResolvedValue(null)
    await typeUrl(draft, YT)
    await settle()
    await typeUrl(draft, '')
    await settle()
    expect(draft.value.title).toBe('')
    wrapper.unmount()
  })

  it('aviso que não é URL não busca nada', async () => {
    const { draft } = setup({ id: 't', kind: 'text', title: '', titleColor: '', html: '', plainText: '' })
    draft.value.title = 'x'
    await settle()
    expect(mocks.video).not.toHaveBeenCalled()
  })

  it('resposta que chega com o aviso já trocado de tipo é ignorada', async () => {
    let resolve!: (v: unknown) => void
    mocks.video.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { draft } = setup()
    await typeUrl(draft, YT)
    vi.advanceTimersByTime(URL_TITLE_DEBOUNCE_MS)
    draft.value = { id: 'u', kind: 'url', title: '', url: SITE }
    resolve({ title: 'Velho' })
    await flushPromises()
    expect(draft.value.title).toBe('')
  })
})
