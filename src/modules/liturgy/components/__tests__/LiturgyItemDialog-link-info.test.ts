// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getInfoMock, getSiteMock, fetchMock, bridge } = vi.hoisted(() => {
  const getInfoMock = vi.fn()
  const getSiteMock = vi.fn()
  return {
    getInfoMock,
    getSiteMock,
    fetchMock: vi.fn(),
    bridge: { current: null as unknown },
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { name?: string }) =>
      params?.name ? `${key.endsWith('siteName') ? 'Site' : 'Canal'}: ${params.name}` : key,
    locale: { value: 'pt-BR' },
  }),
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => bridge.current,
  isDesktopApp: () => bridge.current != null,
}))

vi.mock('../../stores/useScheduledStore', () => ({
  useScheduledStore: () => ({ categories: [], items: [] }),
}))

vi.stubGlobal('fetch', fetchMock)

import type { LiturgyItemDraft } from '../../types/liturgy'
import { DEFAULT_LITURGY_ITEM_DRAFT } from '../../types/liturgy'
import LiturgyItemDialog from '../LiturgyItemDialog.vue'

const ID_A = '0GnC-QzIpyo'
const ID_B = 'dQw4w9WgXcQ'
const INFO_A = { title: 'Quarteto Athus - Deus o Pode', channel: 'Eder Bomfim', description: 'Canção belíssima', durationMs: 303_000 }
const INFO_B = { title: 'Arautos do Rei - Hino', channel: 'Arautos', description: '', durationMs: 200_000 }

function mountDialog(partial: Partial<LiturgyItemDraft> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(LiturgyItemDialog, {
    props: {
      open: true,
      draft: { ...DEFAULT_LITURGY_ITEM_DRAFT, type: 'online_video', ...partial },
      isEditing: false,
      isValid: true,
      categoryOptions: [],
      complementaryTitleSuggestions: [],
      musicOptions: [],
      musicQuery: '',
      musicCatalogEmpty: false,
      selectedMusic: null,
      'onUpdate:draft': (draft: LiturgyItemDraft) => wrapper.setProps({ draft }),
    },
    global: { plugins: [pinia], config: { globalProperties: { $t: (key: string) => key } } },
    attachTo: document.body,
  })
  return wrapper
}

const draftOf = (wrapper: ReturnType<typeof mountDialog>) => wrapper.props('draft') as LiturgyItemDraft

async function typeUrl(url: string) {
  const input = document.body.querySelector('#moment-url') as HTMLInputElement
  input.value = url
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function settle() {
  await vi.advanceTimersByTimeAsync(400)
  await flushPromises()
}

describe('LiturgyItemDialog — dados do vídeo online ao colar o link', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    bridge.current = { ytInfo: { get: getInfoMock }, siteInfo: { get: getSiteMock } }
    getInfoMock.mockReset()
    getSiteMock.mockReset()
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new Error('REDE BLOQUEADA no teste'))
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('campos vazios: título, canal + descrição nas anotações e duração do vídeo', async () => {
    getInfoMock.mockResolvedValue(INFO_A)
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    expect(getInfoMock).not.toHaveBeenCalled()
    await settle()
    expect(getInfoMock).toHaveBeenCalledWith(ID_A)
    expect(draftOf(wrapper)).toMatchObject({
      url: `https://youtu.be/${ID_A}`,
      name: INFO_A.title,
      subtitle: 'Canal: Eder Bomfim\n\nCanção belíssima',
      durationMs: 303_000,
    })
  })

  it('colar de novo o mesmo link (com espaço) não busca outra vez', async () => {
    getInfoMock.mockResolvedValue(INFO_A)
    mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    await typeUrl(` https://youtu.be/${ID_A} `)
    await settle()
    expect(getInfoMock).toHaveBeenCalledTimes(1)
  })

  it('não sobrescreve título e anotações digitados; a duração vem do vídeo', async () => {
    getInfoMock.mockResolvedValue(INFO_A)
    const wrapper = mountDialog({ name: 'Abertura', subtitle: 'Minha nota' })
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    expect(draftOf(wrapper)).toMatchObject({ name: 'Abertura', subtitle: 'Minha nota', durationMs: 303_000 })
  })

  it('trocar o link troca o que foi preenchido automaticamente', async () => {
    getInfoMock.mockImplementation(async (id: string) => (id === ID_A ? INFO_A : INFO_B))
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    await typeUrl(`https://youtu.be/${ID_B}`)
    await settle()
    expect(draftOf(wrapper)).toMatchObject({ name: INFO_B.title, subtitle: 'Canal: Arautos', durationMs: 200_000 })
  })

  it('digitação rápida busca só o último link; mostra o aviso enquanto busca', async () => {
    let resolve!: (info: typeof INFO_B) => void
    getInfoMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await typeUrl(`https://youtu.be/${ID_B}`)
    await settle()
    expect(getInfoMock).toHaveBeenCalledTimes(1)
    expect(getInfoMock).toHaveBeenCalledWith(ID_B)
    expect(document.body.textContent).toContain('liturgy.dialog.videoInfoLoading')
    resolve(INFO_B)
    await flushPromises()
    expect(document.body.textContent).not.toContain('liturgy.dialog.videoInfoLoading')
    expect(draftOf(wrapper).name).toBe(INFO_B.title)
  })

  it('resposta antiga é descartada quando o link muda durante a busca', async () => {
    let resolveA!: (info: typeof INFO_A) => void
    getInfoMock
      .mockReturnValueOnce(new Promise((r) => { resolveA = r }))
      .mockResolvedValueOnce(INFO_B)
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    await typeUrl(`https://youtu.be/${ID_B}`)
    await settle()
    resolveA(INFO_A)
    await flushPromises()
    expect(draftOf(wrapper).name).toBe(INFO_B.title)
  })

  it('fechar o diálogo durante a busca não mexe no item', async () => {
    let resolve!: (info: typeof INFO_A) => void
    getInfoMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    await wrapper.setProps({ open: false })
    resolve(INFO_A)
    await flushPromises()
    expect(draftOf(wrapper).name).toBe('')
  })

  it('sem dados do vídeo nada muda e colar o mesmo link de novo tenta outra vez', async () => {
    getInfoMock.mockResolvedValue(null)
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    expect(draftOf(wrapper)).toMatchObject({ name: '', subtitle: '' })
    getInfoMock.mockResolvedValue(INFO_A)
    await typeUrl(`https://youtu.be/${ID_A} `)
    await settle()
    expect(getInfoMock).toHaveBeenCalledTimes(2)
    expect(draftOf(wrapper).name).toBe(INFO_A.title)
  })

  it('apagar o link cancela a busca pendente', async () => {
    mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await typeUrl('')
    await settle()
    expect(getInfoMock).not.toHaveBeenCalled()
  })

  it('sem desktop o vídeo usa o oEmbed (título e canal)', async () => {
    bridge.current = null
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ title: 'Vox - Hino', author_name: 'Vox Brasil' }) })
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    expect(draftOf(wrapper)).toMatchObject({ name: 'Vox - Hino', subtitle: 'Canal: Vox Brasil' })
  })

  it('não usa a resposta se o tipo do item mudou durante a busca', async () => {
    let resolve!: (info: typeof INFO_A) => void
    getInfoMock.mockReturnValue(new Promise((r) => { resolve = r }))
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    await settle()
    await wrapper.setProps({ draft: { ...draftOf(wrapper), type: 'site' } })
    resolve(INFO_A)
    await flushPromises()
    expect(draftOf(wrapper).name).toBe('')
  })

  it('desmontar com busca agendada cancela o timer', async () => {
    const wrapper = mountDialog()
    await typeUrl(`https://youtu.be/${ID_A}`)
    wrapper.unmount()
    await settle()
    expect(getInfoMock).not.toHaveBeenCalled()
  })

  describe('layout dos itens de link', () => {
    const urlComesFirst = () => {
      const url = document.body.querySelector('#moment-url')!
      const name = document.body.querySelector('#moment-name')!
      return Boolean(url.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING)
    }
    const row = () => document.body.querySelector('.moment-dialog__row')!

    it('vídeo online: URL logo abaixo do tipo, antes da duração e do título', () => {
      mountDialog({ type: 'online_video' })
      expect(urlComesFirst()).toBe(true)
      expect(document.body.querySelector('.moment-dialog__section--duration')).not.toBeNull()
    })

    it('site: URL antes do título e sem o campo de duração', () => {
      mountDialog({ type: 'site' })
      expect(urlComesFirst()).toBe(true)
      expect(document.body.querySelector('.moment-dialog__section--duration')).toBeNull()
      expect(row().classList).toContain('moment-dialog__row--title-category')
    })

    it('site em sub-item (categoria travada): título ocupa a linha toda', async () => {
      const wrapper = mountDialog({ type: 'site' })
      await wrapper.setProps({ lockCategory: true })
      expect(row().classList).toContain('moment-dialog__row--name-only')
    })

    it('escolher site zera a duração', async () => {
      const wrapper = mountDialog({ type: 'online_video', durationMs: 300_000 })
      ;(wrapper.vm as unknown as { selectType: (type: string) => void }).selectType('site')
      await flushPromises()
      expect(draftOf(wrapper)).toMatchObject({ type: 'site', durationMs: 0 })
    })

    it.each(['annotation', 'images', 'pdf', 'presentation'] as const)('%s também não tem duração', (type) => {
      mountDialog({ type })
      expect(document.body.querySelector('.moment-dialog__section--duration')).toBeNull()
    })

    it.each(['online_video', 'audio', 'video', 'verse', 'scheduled'] as const)('%s mantém a duração', (type) => {
      mountDialog({ type })
      expect(document.body.querySelector('.moment-dialog__section--duration')).not.toBeNull()
    })
  })

  describe('item de site', () => {
    const PAGE = { title: 'Igreja Adventista do Sétimo Dia', siteName: 'Adventistas', description: 'Portal oficial' }

    it('preenche título e anotações (site + descrição) sem mexer na duração', async () => {
      let resolve!: (page: typeof PAGE) => void
      getSiteMock.mockReturnValue(new Promise((r) => { resolve = r }))
      const wrapper = mountDialog({ type: 'site', durationMs: 0 })
      await typeUrl('adventistas.org/pt')
      await settle()
      expect(document.body.textContent).toContain('liturgy.dialog.siteInfoLoading')
      resolve(PAGE)
      await flushPromises()
      expect(getSiteMock).toHaveBeenCalledWith('https://adventistas.org/pt')
      expect(getInfoMock).not.toHaveBeenCalled()
      expect(draftOf(wrapper)).toMatchObject({
        name: PAGE.title,
        subtitle: 'Site: Adventistas\n\nPortal oficial',
        durationMs: 0,
      })
    })

    it('não sobrescreve o que o usuário digitou', async () => {
      getSiteMock.mockResolvedValue(PAGE)
      const wrapper = mountDialog({ type: 'site', name: 'Avisos', subtitle: 'Mostrar no fim' })
      await typeUrl('https://adventistas.org')
      await settle()
      expect(draftOf(wrapper)).toMatchObject({ name: 'Avisos', subtitle: 'Mostrar no fim' })
    })

    it('sem desktop não tenta ler a página', async () => {
      bridge.current = null
      const wrapper = mountDialog({ type: 'site' })
      await typeUrl('https://adventistas.org')
      await settle()
      expect(getSiteMock).not.toHaveBeenCalled()
      expect(document.body.textContent).not.toContain('liturgy.dialog.siteInfoLoading')
      expect(draftOf(wrapper).name).toBe('')
    })
  })
})
