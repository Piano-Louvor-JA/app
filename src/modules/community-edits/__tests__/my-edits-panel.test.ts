/**
 * UI "Minhas Edições" (PLAN §1.2) — componente puro, lista localEdits com
 * status e motivo de rejeição. TDD: componente testado isolado da view.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import MyEditsPanel from '../views/MyEditsPanel.vue';

const localStorage = (() => {
  let map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
})();
vi.stubGlobal('localStorage', localStorage);

// lição app tests: mock de vue-i18n SEM locale quebra computed no mount
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    locale: { value: 'pt' },
  }),
}));

beforeEach(() => localStorage.clear());

describe('MyEditsPanel', () => {
  it('lista vazia → estado vazio', () => {
    const w = mount(MyEditsPanel, { props: { serverStatuses: [] } });
    expect(w.find('[data-testid="edits-empty"]').exists()).toBe(true);
  });

  it('lista edits locais com status draft', async () => {
    localStorage.setItem('louvorja.local-edits.v1', JSON.stringify({
      '42': { musicId: 42, lyrics: '[{"lyric":"x"}]', timing: null, status: 'draft', updatedAtMs: 1 },
    }));
    const w = mount(MyEditsPanel, { props: { serverStatuses: [] } });
    const item = w.find('[data-testid="edit-item-42"]');
    expect(item.exists()).toBe(true);
    expect(item.text()).toContain('draft');
  });

  it('status do servidor (approved/rejected+motivo) vence o local quando existe', () => {
    localStorage.setItem('louvorja.local-edits.v1', JSON.stringify({
      '7': { musicId: 7, lyrics: null, timing: '[0,1]', status: 'published', updatedAtMs: 2 },
    }));
    const w = mount(MyEditsPanel, {
      props: { serverStatuses: [{ musicId: 7, status: 'rejected', reason: 'letra diverge da fonte' }] },
    });
    const item = w.find('[data-testid="edit-item-7"]');
    expect(item.text()).toContain('rejected');
    expect(item.text()).toContain('letra diverge da fonte');
  });

  it('emite publish ao clicar no botão', async () => {
    localStorage.setItem('louvorja.local-edits.v1', JSON.stringify({
      '42': { musicId: 42, lyrics: '[{"lyric":"x"}]', timing: null, status: 'draft', updatedAtMs: 1 },
    }));
    const w = mount(MyEditsPanel, { props: { serverStatuses: [] } });
    await w.find('[data-testid="edit-publish-42"]').trigger('click');
    expect(w.emitted('publish')?.[0]).toEqual([42]);
  });
});
