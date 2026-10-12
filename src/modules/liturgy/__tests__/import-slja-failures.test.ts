import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), parse: vi.fn(), list: vi.fn(), collection: vi.fn(), music: vi.fn(), lyric: vi.fn(), upload: vi.fn(), update: vi.fn(), remove: vi.fn(), localList: vi.fn(), localCreate: vi.fn(), localMusic: vi.fn(), localGet: vi.fn(), localUpdate: vi.fn(), localLyric: vi.fn(), localDelete: vi.fn() }));
vi.mock('@modules/media/services/auth-client', () => ({ getAuthSession: m.auth }));
vi.mock('@shared/services/slja', () => ({ parseSljaFile: m.parse }));
vi.mock('@modules/media/services/custom-catalog', () => ({ listCustomCollections: m.list, createCustomCollection: m.collection, createCustomMusic: m.music, createCustomLyric: m.lyric, uploadCustomFile: m.upload, updateCustomMusic: m.update, deleteCustomMusic: m.remove, toCustomMusicId: (id: number) => 1000000 + id }));
vi.mock('@modules/media/services/local-custom-store', () => ({ listLocalCollections: m.localList, createLocalCollection: m.localCreate, createLocalMusic: m.localMusic, getLocalMusic: m.localGet, updateLocalMusic: m.localUpdate, createLocalLyric: m.localLyric, deleteLocalMusic: m.localDelete }));
import { importSljaAsLiturgyMusic, sljaDisplayName } from '../services/import-slja-to-liturgy';
const source = { bytes: new ArrayBuffer(1), name: 'song.slja' };
const archive = () => ({ title: 'Song', assets: [], slides: [{ lyric: 'Verse', timeMs: 0, type: 'LETRA' }] });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockReturnValue({ user: { id_user: 1 } });
  m.parse.mockResolvedValue(archive());
  m.list.mockResolvedValue([]); m.collection.mockResolvedValue({ id: 7 });
  m.music.mockResolvedValue({ id: 8 }); m.lyric.mockResolvedValue({ id: 9 });
  m.update.mockResolvedValue(true);
  m.localList.mockReturnValue([]); m.localCreate.mockReturnValue({ id: -1 }); m.localMusic.mockReturnValue({ id: -2 });
  m.localGet.mockReturnValue({ lyrics: [{ lyric: 'Verse' }], durationMs: 31000 }); m.localUpdate.mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());
it('falls back to the file name when title is missing', () => expect(sljaDisplayName({}, 'fallback.slja')).toBe('fallback'));
it('reuses only an existing owned import collection', async () => {
  m.list.mockResolvedValue([{ name: 'Importações .slja', id: 3, ownerId: 1 }]);
  expect((await importSljaAsLiturgyMusic(source)).collectionId).toBe(3);
  expect(m.collection).not.toHaveBeenCalled();
});
it('rejects a failed music creation', async () => {
  m.music.mockResolvedValue(null);
  await expect(importSljaAsLiturgyMusic(source)).rejects.toThrow('SLJA_IMPORT_MUSIC_FAILED');
  expect(m.lyric).not.toHaveBeenCalled();
});
it('rejects a failed collection creation', async () => {
  m.collection.mockResolvedValue(null);
  await expect(importSljaAsLiturgyMusic(source)).rejects.toThrow('SLJA_IMPORT_COLLECTION_FAILED');
});
it('aborts when the collection query completed after its deadline', async () => {
  const controller = new AbortController(); controller.abort();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  await expect(importSljaAsLiturgyMusic(source)).rejects.toThrow('SLJA_IMPORT_COLLECTION_FAILED');
  expect(m.music).not.toHaveBeenCalled();
});
it.each([['folder/BG.png'], ['one/bg.png', 'two/bg.png']])('matches image basenames only if unique (%s)', async (...paths) => {
  const assetPaths = paths.flat();
  m.parse.mockResolvedValue({ ...archive(), assets: assetPaths.map(path => ({ path, bytes: new Uint8Array([1]) })), slides: [{ lyric: 'Verse', timeMs: 0, type: 'LETRA', image: { name: 'bg.png' } }] });
  m.upload.mockImplementation(async (_bytes, path) => ({ idFile: 10, url: path }));
  await importSljaAsLiturgyMusic(source);
  expect(m.lyric.mock.calls[0][1].id_file_image).toBe(assetPaths.length === 1 ? 10 : undefined);
});
it('reuses the local import collection and reports slide images omitted', async () => {
  m.auth.mockReturnValue(null); m.localList.mockReturnValue([{ id: -1, name: 'Importações .slja' }]);
  m.parse.mockResolvedValue({ ...archive(), slides: [{ lyric: 'Verse', timeMs: 0, type: 'LETRA', image: { name: 'bg.png' } }] });
  expect((await importSljaAsLiturgyMusic(source)).imagesOmitted).toBe(true);
  expect(m.localCreate).not.toHaveBeenCalled();
});
it('rejects missing persisted local lyrics and removes the partial song', async () => {
  m.auth.mockReturnValue(null); m.localGet.mockReturnValue({ lyrics: [] });
  await expect(importSljaAsLiturgyMusic(source)).rejects.toThrow('SLJA_LOCAL_LYRIC_PERSIST_FAILED');
  expect(m.localDelete).toHaveBeenCalledWith(-2);
});
it.each([new Error('local-persist-failed'), new Error('unexpected failure')])('removes the partial song if local lyric storage throws', async error => {
  m.auth.mockReturnValue(null); m.localLyric.mockImplementation(() => { throw error; });
  await expect(importSljaAsLiturgyMusic(source)).rejects.toThrow(error.message === 'local-persist-failed' ? 'SLJA_LOCAL_LYRIC_PERSIST_FAILED' : error.message);
  expect(m.localDelete).toHaveBeenCalledWith(-2);
});
it('retains zero duration if local metadata could not be read back', async () => {
  m.auth.mockReturnValue(null); m.parse.mockResolvedValue({ ...archive(), slides: [{ lyric: 'Verse', timeMs: 1000, type: 'LETRA' }] });
  m.localGet.mockReturnValue({ lyrics: [{ lyric: 'Verse' }] });
  expect((await importSljaAsLiturgyMusic(source)).durationMs).toBe(0);
});

it('reports no omitted images when the parsed local archive has no asset list', async () => {
  m.auth.mockReturnValue(null); m.parse.mockResolvedValue({ title: 'Song', slides: [{ lyric: 'Verse', timeMs: 0, type: 'LETRA' }] });
  expect((await importSljaAsLiturgyMusic(source)).imagesOmitted).toBe(false);
});
