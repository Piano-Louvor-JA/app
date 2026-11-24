// @vitest-environment jsdom
// SPEC-editor-ux-v1 (frozen 1cf6907) + covers coletânea/single (Rafael 24/11):
// AC1 deslogado zero UI rede/login; AC2 excluir via ⋮+confirm; AC3 único "+"
// com menu 3 ações; AC4 canvas onboarding 3 CTAs; AC5 micro-fixes; cover local
// persiste (IndexedDB) e cover de música (single) via thumb.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(() => null as null | { token: string }),
  updateCustomCollection: vi.fn(async () => null),
  listCustomCollections: vi.fn(async () => [] as Array<Record<string, unknown>>),
  listCustomMusics: vi.fn(async () => [] as Array<Record<string, unknown>>),
  updateCustomMusic: vi.fn(async () => null),
  uploadCustomFile: vi.fn(async () => null),
  createCustomCollection: vi.fn(async () => ({ id: 9 })),
  createCustomMusic: vi.fn(async () => ({ id: -5 })),
}))

vi.mock('../../services/auth-client', () => ({
  getAuthSession: mocks.getSession,
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'media-editor', path: '/media/editor', query: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

vi.mock('../../components/MediaSlideStage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../components/MediaAccountBar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../components/PublicationRulesCard.vue', () => ({
  default: { template: '<div class="pub-rules" />' },
}))
vi.mock('@shared/components/AppConfirm.vue', () => ({
  default: {
    template: '<div class="confirm-stub" />',
    props: ['open', 'title', 'message'],
    emits: ['confirm', 'cancel'],
  },
}))
vi.mock('@modules/albums/services/album-music-search', () => ({
  filterAlbumMusicIndex: vi.fn(() => []),
  loadAlbumMusicIndex: vi.fn(async () => []),
}))
vi.mock('../../../../shared/services/slja', () => ({
  buildSlja: vi.fn(async () => new ArrayBuffer(8)),
  parseSljaFile: vi.fn(),
}))
vi.mock('@modules/auth/services/firebase-client', () => ({
  getAuthReadiness: vi.fn(async () => null),
}))
vi.mock('@modules/auth/composables/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: { value: mocks.getSession() != null } }),
}))
vi.mock('../../services/outbox-loop', () => ({ startOutboxLoop: vi.fn() }))
vi.mock('../../services/local-media-store', () => ({
  putMedia: vi.fn(async () => {}),
  getMedia: vi.fn(async () => null),
  deleteMedia: vi.fn(async () => {}),
}))
vi.mock('../../services/local-custom-store', () => ({
  getLocalMusic: vi.fn(),
  getLocalCollection: vi.fn(() => null),
  isLocalId: vi.fn((id: number | string | null | undefined) => Number(id) < 0),
  updateLocalMusic: vi.fn(() => true),
  updateLocalCollection: vi.fn(() => true),
  publishLocalMusic: vi.fn(() => true),
  listLocalCollections: vi.fn(() => []),
  createLocalCollection: vi.fn(() => ({ id: -1, name: 'Singles' })),
  createLocalMusic: vi.fn(() => ({ id: -5, name: 'x' })),
  listLocalMusics: vi.fn(() => []),
  loadLocalDb: vi.fn(() => ({ collections: [], musics: [] })),
}))
vi.mock('../../services/custom-catalog', () => ({
  listCustomCollections: mocks.listCustomCollections,
  listCustomMusics: mocks.listCustomMusics,
  createCustomCollection: mocks.createCustomCollection,
  createCustomMusic: mocks.createCustomMusic,
  createCustomLyric: vi.fn(async () => null),
  updateCustomLyric: vi.fn(async () => null),
  updateCustomMusic: mocks.updateCustomMusic,
  updateCustomCollection: mocks.updateCustomCollection,
  deleteCustomCollection: vi.fn(async () => true),
  deleteCustomMusic: vi.fn(async () => true),
  deleteCustomLyric: vi.fn(async () => true),
  uploadCustomFile: mocks.uploadCustomFile,
  audioDataUrlFromBase64: (b64: string) => `data:audio/mpeg;base64,${b64}`,
  customApiUrl: (p: string) => `https://api.test/v1/custom${p}`,
  customFileUrl: (p: string) => `/files/${p}`,
  addOfficialMusicToCollection: vi.fn(async () => null),
  copyCustomMusic: vi.fn(async () => null),
  listAllCustomMusics: vi.fn(async () => []),
  resolveMediaTrack: vi.fn(async () => null),
}))

import MediaEditorView from '../MediaEditorView.vue'

async function mountEditor() {
  const w = mount(MediaEditorView, {
    global: {
      stubs: {
        'v-snackbar': {
          name: 'VSnackbar',
          props: ['modelValue'],
          template: '<div class="snackbar-stub"><slot /></div>',
        },
      },
    },
  })
  await flushPromises()
  return w
}

function btn(w: ReturnType<typeof mount>, text: string) {
  return w.findAll('button').find((b) => b.text().trim().includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockReturnValue(null)
  mocks.listCustomCollections.mockResolvedValue([
    { id: 3, name: 'Adoração', coverUrl: null, musicsCount: 0, isOwner: true },
  ])
  mocks.listCustomMusics.mockResolvedValue([])
})

describe('SPEC-editor-ux-v1 — deslogado (AC1)', () => {
  it('zero UI de rede: sem pills visibilidade, sem regras, sem Publicar, sem MediaAccountBar', async () => {
    const w = await mountEditor()
    // seleciona coletânea
    await btn(w, 'Adoração')!.trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'MediaAccountBar' }).exists()).toBe(false)
    expect(w.text()).not.toContain('Visibilidade')
    expect(w.text()).not.toContain('Regras da comunidade')
    expect(w.text()).not.toContain('Publicar')
    expect(w.text()).not.toContain('Entrar')
    w.unmount()
  })
})

describe('SPEC-editor-ux-v1 — único + (AC3)', () => {
  it('um único botão "+" abre menu com 3 ações nomeadas', async () => {
    const w = await mountEditor()
    const plus = w.findAll('button[data-testid="add-menu-btn"]')
    expect(plus).toHaveLength(1)
    // menu fechado por padrão
    expect(w.find('[data-testid="add-menu"]').exists()).toBe(false)
    await plus[0]!.trigger('click')
    const menu = w.find('[data-testid="add-menu"]')
    expect(menu.exists()).toBe(true)
    expect(menu.text()).toContain('Nova coletânea')
    expect(menu.text()).toContain('Novo single')
    expect(menu.text()).toContain('Hino oficial')
    w.unmount()
  })
})

describe('SPEC-editor-ux-v1 — excluir via ⋮ (AC2)', () => {
  it('sem botão Excluir solto; menu ⋮ da coletânea tem Excluir', async () => {
    const w = await mountEditor()
    await btn(w, 'Adoração')!.trigger('click')
    await flushPromises()
    expect(w.text()).not.toContain('Excluir coletânea')
    const kebab = w.find('button[data-testid="collection-kebab"]')
    expect(kebab.exists()).toBe(true)
    await kebab.trigger('click')
    const menu = w.find('[data-testid="collection-kebab-menu"]')
    expect(menu.exists()).toBe(true)
    expect(menu.text()).toContain('Editar capa')
    expect(menu.text()).toContain('Renomear')
    expect(menu.text()).toContain('Excluir')
    w.unmount()
  })
})

describe('SPEC-editor-ux-v1 — onboarding (AC4)', () => {
  it('canvas vazio mostra Comece por aqui com 3 CTAs e some com música', async () => {
    const w = await mountEditor()
    const empty = w.find('[data-testid="editor-onboarding"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('Comece por aqui')
    expect(btn(w, 'Criar coletânea')).toBeDefined()
    expect(btn(w, 'Novo single')).toBeDefined()
    expect(btn(w, 'Importar .slja')).toBeDefined()
    // sem textos de loop circular
    expect(w.text()).not.toContain('Selecione uma coletânea à esquerda')
    expect(w.text()).not.toContain('Selecione uma música à esquerda')
    expect(w.text()).not.toContain('Crie a primeira acima')
    w.unmount()
  })
})

describe('SPEC-editor-ux-v1 — micro-fixes (AC5)', () => {
  it('placeholder completo do hino oficial', async () => {
    const w = await mountEditor()
    await btn(w, 'Adoração')!.trigger('click')
    await flushPromises()
    const search = w.find('input[data-testid="official-search"]')
    expect(search.exists()).toBe(true)
    expect(search.attributes('placeholder')).toBe('Buscar hino oficial (nº ou nome)')
    w.unmount()
  })
})

describe('Covers — coletânea local persiste cover (bug Rafael 24/11)', () => {
  it('updateCustomCollection local salva coverMediaId e retorna coverUrl', async () => {
    const { updateCustomCollection } = await import('../../services/custom-catalog')
    const { putMedia } = await import('../../services/local-media-store')
    const { updateLocalMusic } = await import('../../services/local-custom-store')
    // coletânea local id -3 (serviço REAL — mocks só nos limites de rede/IDB)
    const actual = await vi.importActual<typeof import('../../services/custom-catalog')>(
      '../../services/custom-catalog',
    )
    const { getLocalCollection, listLocalMusics } = await import('../../services/local-custom-store')
    vi.mocked(getLocalCollection).mockImplementation((id: number) =>
      id === -3
        ? ({ id: -3, name: 'Teste', createdAt: '', coverMediaId: 'coll--3-cover' } as never)
        : null,
    )
    const { getMedia } = await import('../../services/local-media-store')
    vi.mocked(getMedia).mockResolvedValue(new Blob(['img']))
    const result = await actual.updateCustomCollection(-3, { cover_url: 'data:image/png;base64,AAA' })
    expect(putMedia).toHaveBeenCalled()
    expect(result?.coverUrl).toBeTruthy()
    expect(updateLocalMusic).not.toHaveBeenCalled() // música ≠ coletânea
  })
})
