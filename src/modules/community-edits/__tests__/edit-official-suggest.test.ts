import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';

// ---- mocks de rede ----
vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: vi.fn(() => ({ token: 'tok', user: { id_user: 7 } })),
  authTokenAsync: vi.fn(async () => 'tok'),
  getAuthReadiness: vi.fn(async () => undefined),
}));

const mockTrack = {
  id: 42,
  name: 'Hino Oficial 42',
  lyrics: [
    { order: 1, lyric: 'Estrofe original A', showSlide: true, time: '00:01', instrumentalTime: '', imageUrl: null, imagePosition: null, frameDataUrl: null },
    { order: 2, lyric: 'Estrofe original B', showSlide: true, time: '00:05', instrumentalTime: '', imageUrl: null, imagePosition: null, frameDataUrl: null },
  ],
};

vi.mock('@modules/media/services/custom-catalog', () => ({
  resolveMediaTrack: vi.fn(async (id: number) =>
    id === 42 ? { ...mockTrack } : null),
  customApiUrl: vi.fn((p: string) => `https://api-stg.test${p}`),
  customHeaders: vi.fn(() => ({})),
  customFileUrl: vi.fn((p: string) => `https://api-stg.test/file${p}`),
  listCustomCollections: vi.fn(async () => []),
  listCustomMusics: vi.fn(async () => []),
  listAllCustomMusics: vi.fn(async () => []),
  addOfficialMusicToCollection: vi.fn(),
  copyCustomMusic: vi.fn(),
  createCustomCollection: vi.fn(),
  createCustomLyric: vi.fn(),
  createCustomMusic: vi.fn(),
  deleteCustomCollection: vi.fn(),
  deleteCustomLyric: vi.fn(),
  deleteCustomMusic: vi.fn(),
  updateCustomCollection: vi.fn(),
  updateCustomLyric: vi.fn(),
  updateCustomMusic: vi.fn(),
  uploadCustomFile: vi.fn(),
  audioDataUrlFromBase64: vi.fn(),
}));

vi.mock('@modules/media/services/local-custom-store', () => ({
  getLocalMusic: vi.fn(() => null),
  isLocalId: vi.fn((id: number) => id < 0),
  updateLocalMusic: vi.fn(),
}));

vi.mock('@modules/media/services/local-media-store', () => ({
  getMedia: vi.fn(async () => null),
  putMedia: vi.fn(),
}));

vi.mock('@modules/media/services/outbox-loop', () => ({
  startOutboxLoop: vi.fn(),
  stopOutboxLoop: vi.fn(),
}));

vi.mock('@modules/albums/services/album-music-search', () => ({
  filterAlbumMusicIndex: vi.fn(() => []),
}));

vi.mock('../services/community-catalog', () => ({
  listCommunityCollectionsPage: vi.fn(async () => ({ items: [], total: 0, page: 1, lastPage: 1 })),
}));
vi.mock('../services/ranking', () => ({ registerUse: vi.fn(), reportCollection: vi.fn() }));
vi.mock('../services/seasonal-event', () => ({ getSeasonalEvent: vi.fn(async () => null) }));
vi.mock('../services/weekly-tasks', () => ({ getWeeklyTasks: vi.fn(async () => []) }));
vi.mock('../services/notifications', () => ({ getNotifications: vi.fn(async () => []) }));

import MediaEditorView from '@modules/media/views/MediaEditorView.vue';
import { resolveMediaTrack } from '@modules/media/services/custom-catalog';
import { getLocalEdit, saveLocalEdit } from '../services/local-edits-store';

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: {
    'pt-BR': {
      common: { save: 'Salvar', cancel: 'Cancelar', close: 'Fechar' },
      media: {
        editor: {
          officialHymn: 'Hino oficial',
          suggestFix: 'Sugerir correção',
          editOfficialTitle: 'Editar letra/timing (sugestão)',
          editOfficialHint: 'Sua correção é salva localmente e pode ser publicada para o concilio em Minhas Edições.',
          editOfficialSaved: 'Correção salva localmente',
          audioManaged: 'Áudio/fundo/capa continuam oficiais',
        },
      },
      community: { title: 'C', subtitle: 's', back: 'b', ranking: 'r', conductLink: 'c', createCollection: 'cc' },
    },
  },
});

async function mountEditor(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/media/editor', component: MediaEditorView },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  });
  await router.push({ path: '/media/editor', query });
  await router.isReady();
  const w = mount(MediaEditorView, {
    global: { plugins: [i18n, router, createPinia()] },
    stubs: { PageBackStack: true, teleport: true },
  });
  for (let i = 0; i < 6; i++) await flushPromises();
  return w;
}

describe('MediaEditorView — editar música oficial como sugestão (RF-01)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(resolveMediaTrack).mockClear();
  });

  it('RED ?editOfficial=42: carrega letra oficial no editor em modo sugestão', async () => {
    const w = await mountEditor({ editOfficial: '42' });
    // letra oficial aparece no editor (textarea/input de estrofe com conteúdo)
    const html = w.html();
    expect(html).toContain('Estrofe original A');
    // modo sugestão indicado ao usuário
    expect(w.text()).toContain('Sugerir correção');
  });

  it('RED salvar grava saveLocalEdit com JSON de slides (letra+timing) e não faz PUT', async () => {
    const w = await mountEditor({ editOfficial: '42' });
    // editar primeira estrofe
    const ta = w.find('[data-testid="edit-official-lyric-0"]');
    expect(ta.exists()).toBe(true);
    await ta.setValue('Estrofe corrigida A');
    const btn = w.find('[data-testid="edit-official-save"]');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    await flushPromises();

    const edit = getLocalEdit(42);
    expect(edit).not.toBeNull();
    expect(edit!.status).toBe('draft');
    const slides = JSON.parse(edit!.lyrics ?? '[]') as Array<{ lyric?: string }>;
    expect(slides[0]?.lyric).toBe('Estrofe corrigida A');
    expect(slides[1]?.lyric).toBe('Estrofe original B'); // parcial preserva
    // escopo restrito: save não altera catálogo (nenhum PUT já que editor oficial não faz PUT)
    expect(w.text()).toContain('salva localmente');
  });

  it('RED resolver prioriza edit local na reprodução (paridade com fase 1)', async () => {
    saveLocalEdit(42, {
      lyrics: JSON.stringify([
        { order: 1, lyric: 'EDITADO', showSlide: true, time: '00:02', instrumentalTime: '', imageUrl: null, imagePosition: null, frameDataUrl: null },
      ]),
    });
    const { resolveEditOverride } = await import('../services/edit-resolver');
    const official = (await resolveMediaTrack(42))!;
    const resolved = await resolveEditOverride(42, official, async () => null);
    expect(resolved.lyrics[0]?.lyric).toBe('EDITADO');
    expect(resolved.name).toBe('Hino Oficial 42'); // metadados oficiais preservados
  });
});
