import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

/**
 * RF-04 (SPEC-crud-comunidade-hub-v1.0.0): dono vê ações (privar/excluir)
 * no card da Comunidade; não-dono mantém copiar+report e NÃO vê ações.
 */
const mockSession = { token: 't', user: { id_user: 47, email: 'rafa@x.z' } }

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: vi.fn(() => mockSession),
  authTokenAsync: vi.fn(async () => 't'),
}))
vi.mock('@modules/auth/services/firebase-client', () => ({
  getAuthReadiness: vi.fn(async () => undefined),
}))
vi.mock('../../services/community-catalog', () => ({
  listCommunityCollectionsPage: vi.fn(async () => ({
    items: [
      { id: 1, name: 'Minha Na Comunidade', description: null, coverUrl: null, authorName: 'Rafael', musicsCount: 2, updatedAt: null, ownerId: 47, visibility: 'public' },
      { id: 2, name: 'Alheia', description: null, coverUrl: null, authorName: 'Outro', musicsCount: 3, updatedAt: null, ownerId: 49, visibility: 'public' },
    ],
    page: 1, lastPage: 1, total: 2,
  })),
  saveCommunityCopy: vi.fn(async () => 777),
}))
vi.mock('../../services/ranking', () => ({
  registerUse: vi.fn(),
  reportCollection: vi.fn(),
}))
vi.mock('../../services/notifications', () => ({
  getNotifications: vi.fn(async () => []),
}))
vi.mock('../../services/seasonal-event', () => ({
  getSeasonalEvent: vi.fn(async () => null),
}))
vi.mock('../../services/weekly-tasks', () => ({
  getWeeklyTasks: vi.fn(async () => []),
}))
vi.mock('@modules/media/services/custom-catalog', () => ({
  updateCustomCollection: vi.fn(async (id: number, patch: { visibility?: string }) =>
    patch.visibility ? { id, ...patch } : null),
  deleteCustomCollection: vi.fn(async (id: number) => (id === 1 ? true : false)),
}))
vi.mock('@modules/community-edits/services/local-edits-store', () => ({
  listLocalEdits: vi.fn(() => []),
}))
vi.mock('@modules/community-edits/services/publish-edit', () => ({
  publishEdit: vi.fn(),
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))
vi.mock('@shared/composables/useMinimizablePage', () => ({
  useMinimizablePage: () => ({
    minimize: vi.fn(),
    prepare: vi.fn(),
    takeRestoredState: () => null,
  }),
}))
vi.mock('@design-system/index', () => ({
  GlassCard: {
    name: 'GlassCard',
    template: '<div class="glass-card-mock"><slot /></div>',
  },
}))
vi.mock('@shared/components/PageBackStack', () => ({
  default: { template: '<div />' },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

import CommunityView from '../CommunityView.vue'
import { updateCustomCollection, deleteCustomCollection } from '@modules/media/services/custom-catalog'

describe('CommunityView RF-04 — ações do dono', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  async function mountView() {
    const w = mount(CommunityView, {
      global: {
        plugins: [createPinia()],
      },
    })
    await flushPromises()
    await flushPromises()
    return w
  }

  it('dono vê botões privar/excluir; não-dono vê report e não vê ações de dono', async () => {
    const w = await mountView()
    const cards = w.findAll('.community-view__card')
    expect(cards.length).toBe(2)
    // dono (id 1): visibility + delete
    const ownCard = cards[0]
    expect(ownCard.find('[data-testid="community-owner-visibility"]').exists()).toBe(true)
    expect(ownCard.find('[data-testid="community-owner-delete"]').exists()).toBe(true)
    expect(ownCard.find('.community-view__report-btn:not([data-testid])').exists()).toBe(false)
    // não-dono (id 2): report, sem ações de dono
    const otherCard = cards[1]
    expect(otherCard.find('[data-testid="community-owner-visibility"]').exists()).toBe(false)
    expect(otherCard.find('[data-testid="community-owner-delete"]').exists()).toBe(false)
    w.unmount()
  })

  it('privar chama updateCustomCollection com visibility private e atualiza o card', async () => {
    const w = await mountView()
    const btn = w.find('[data-testid="community-owner-visibility"]')
    await btn.trigger('click')
    await flushPromises()
    expect(updateCustomCollection).toHaveBeenCalledWith(1, { visibility: 'private' })
    w.unmount()
  })

  it('excluir chama deleteCustomCollection e remove o card da lista', async () => {
    const w = await mountView()
    await w.find('[data-testid="community-owner-delete"]').trigger('click')
    await flushPromises()
    expect(deleteCustomCollection).toHaveBeenCalledWith(1)
    expect(w.findAll('.community-view__card').length).toBe(1)
    w.unmount()
  })
})
