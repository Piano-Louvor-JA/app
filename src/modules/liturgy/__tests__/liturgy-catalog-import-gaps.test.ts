import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ customs: vi.fn(), collections: vi.fn(), locals: vi.fn() }));
vi.mock('@shared/services/remote-catalog', () => ({ fetchRemoteCatalogJson: vi.fn(async () => []) }));
vi.mock('@shared/services/workspace-api', () => ({ readCatalogRecord: vi.fn(async () => []) }));
vi.mock('@modules/sync/services/library-catalog', () => ({ getCurrentApiPrefix: () => 'pt' }));
vi.mock('@modules/media/services/custom-catalog', () => ({ listAllCustomMusics: m.customs, toCustomMusicId: (id: number) => 1000000 + id }));
vi.mock('@modules/media/services/local-custom-store', () => ({ listLocalCollections: m.collections, listLocalMusics: m.locals }));
import { loadLiturgyMusicOptions } from '../services/liturgy-catalog';
beforeEach(() => { vi.resetAllMocks(); m.customs.mockResolvedValue([]); m.collections.mockReturnValue([]); });
it('ignores invalid custom IDs and preserves the first entry for duplicate IDs', async () => {
  m.customs.mockResolvedValue([{ id: 0 }, { id: NaN }, { id: 1, name: null, collectionName: null, duration: 0 }, { id: 1, name: 'Duplicate', duration: -1 }]);
  const result = await loadLiturgyMusicOptions();
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: 1000001, name: 'Custom #1', albumNames: 'Minhas coletâneas', durationMs: null });
});
it('uses fallback names for blank custom entries', async () => {
  m.customs.mockResolvedValue([{ id: 2, name: '  ', collectionName: ' ', duration: null }]);
  expect((await loadLiturgyMusicOptions())[0].name).toBe('Custom #2');
});
it('deduplicates local entries and preserves local fallback metadata', async () => {
  m.collections.mockReturnValue([{ id: -1, name: 'Local collection' }]);
  m.locals.mockReturnValue([{ id: -2, name: null }, { id: -2, name: 'Duplicate' }, { id: -3, name: ' ', durationMs: null }]);
  const result = await loadLiturgyMusicOptions();
  expect(result).toHaveLength(2);
  expect(result.find(v => v.id === -2)).toMatchObject({ name: 'Local #-2', durationMs: null });
  expect(result.find(v => v.id === -3)?.name).toBe('Local #-3');
});

it('preserves a local song duration in milliseconds', async () => {
  m.collections.mockReturnValue([{ id: -1, name: 'Local' }]);
  m.locals.mockReturnValue([{ id: -2, name: 'Timed', durationMs: 31000 }]);
  expect((await loadLiturgyMusicOptions())[0].durationMs).toBe(31000);
});
