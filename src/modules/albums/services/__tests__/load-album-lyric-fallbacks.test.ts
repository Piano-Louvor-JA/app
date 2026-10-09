import { expect, it, vi } from 'vitest';
const load = vi.hoisted(() => vi.fn());
vi.mock('@modules/media/services/custom-catalog', () => ({ loadCustomMusicTrack: load, isCustomMusicId: (id: number) => id >= 1000000, fromCustomMusicId: (id: number) => id - 1000000, toCustomMusicId: (id: number) => id + 1000000, listCustomMusics: vi.fn(), fromCustomCollectionId: (id: number) => id }));
import { loadAlbumLyric } from '../album-tracks';
it('handles legacy custom adapter rows without order or lyric text', async () => {
  load.mockResolvedValue({ name: 'Legacy', lyrics: [{ lyric: 'Verse' }, { order: 2 }] });
  expect((await loadAlbumLyric(1000001))?.lines).toEqual([{ order: 1, text: 'Verse' }]);
});
