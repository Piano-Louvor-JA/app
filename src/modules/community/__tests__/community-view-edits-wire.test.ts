/**
 * Wire do MyEditsPanel na Comunidade desktop (fix paridade — fase 1 entregou o
 * painel mas nunca o montou; web PR #244 já tem o wire). RED primeiro.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: vi.fn(() => ({ token: 'tok', user: { id_user: 7 } })),
  authTokenAsync: vi.fn(async () => 'tok'),
  getAuthReadiness: vi.fn(async () => undefined),
}));
vi.mock('../services/community-catalog', () => ({
  listCommunityCollectionsPage: vi.fn(async () => ({
    items: [], total: 0, page: 1, lastPage: 1,
  })),
}));
vi.mock('../services/ranking', () => ({
  registerUse: vi.fn(async () => undefined),
  reportCollection: vi.fn(async () => undefined),
}));
vi.mock('../services/seasonal-event', () => ({
  getSeasonalEvent: vi.fn(async () => null),
}));
vi.mock('../services/weekly-tasks', () => ({
  getWeeklyTasks: vi.fn(async () => []),
}));
vi.mock('../services/notifications', () => ({
  getNotifications: vi.fn(async () => []),
}));
vi.mock('@modules/community-edits/views/MyEditsPanel.vue', () => ({
  default: { template: '<section data-testid="my-edits-panel">PANEL-STUB</section>' },
}));
vi.mock('@modules/community-edits/services/publish-edit', () => ({
  publishEdit: vi.fn(async () => ({ published: true, clientUuid: 'x'.padEnd(64, '0') })),
}));

import CommunityView from '../views/CommunityView.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      community: {
        title: 'Comunidade', subtitle: 'x', back: 'Voltar', ranking: 'Ranking',
        conductLink: 'Conduta', createCollection: 'Criar coletânea',
        edits: {
          title: 'Minhas Edições',
          empty: 'Você ainda não editou nenhuma música do catálogo.',
          musicLabel: 'Música #{id}',
          publish: 'Publicar correção',
          delete: 'Excluir',
          published: 'Correção publicada — aguardando o concilio.',
          publishFailed: 'Não foi possível publicar: {error}',
          statusPublished: 'Publicada',
          statusDraft: 'Rascunho',
        },
      },
    },
  },
});

const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  const w = mount(CommunityView, {
    global: { plugins: [i18n, router, createPinia()] },
    stubs: { PageBackStack: true, teleport: true },
  });
  await flushPromises();
  return w;
};

describe('CommunityView — wire MyEditsPanel (fix desktop)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('logado: painel Minhas Edições aparece', async () => {
    const w = await mountView();
    // isLogged é setado no load() async — garantir flush extra
    await flushPromises();
    expect(w.find('[data-testid="my-edits-panel"]').exists()).toBe(true);
  });

  it('deslogado: painel NÃO aparece', async () => {
    const auth = await import('@modules/media/services/auth-client');
    vi.mocked(auth.getAuthSession).mockReturnValue(null);
    const w = await mountView();
    expect(w.find('[data-testid="my-edits-panel"]').exists()).toBe(false);
    vi.mocked(auth.getAuthSession).mockReturnValue({ token: 'tok', user: { id_user: 7 } });
  });

  it('edit local draft do usuário aparece na lista do painel', async () => {
    window.localStorage.setItem(
      'louvorja.local-edits.v1',
      JSON.stringify({
        '42': { musicId: 42, lyrics: 'x', timing: null, status: 'draft', updatedAtMs: 1 },
      }),
    );
    const w = await mountView();
    await flushPromises();
    // painel stubado no wire-test — a LISTA é responsabilidade do teste do painel
    // (my-edits-panel.test.ts da fase 1); aqui provamos só o wire condicional.
    expect(w.find('[data-testid="my-edits-panel"]').exists()).toBe(true);
    expect(w.html()).toContain('PANEL-STUB');
  });
});
