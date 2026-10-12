import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
})

import {
  addPlaylistItem,
  savePlaylists,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  removePlaylistItem,
  renamePlaylist,
} from '../playlist-storage'

describe('playlist-storage', () => {
  beforeEach(() => localStorage.clear())

  it('cria e lista playlist persistida', () => {
    const playlist = createPlaylist('Culto jovem')

    expect(playlist.name).toBe('Culto jovem')
    expect(playlist.items).toEqual([])
    expect(playlist.createdAt).toBe(playlist.updatedAt)
    expect(listPlaylists()).toEqual([playlist])
  })

  it('adiciona faixa e evita duplicata consecutiva', () => {
    const playlist = createPlaylist('Ensaio')
    const item = { musicId: 7, albumId: 3, title: 'Vem, Senhor' }

    const updated = addPlaylistItem(playlist.id, item)
    const duplicated = addPlaylistItem(playlist.id, item)

    expect(updated?.playlist.items).toEqual([item])
    expect(updated?.added).toBe(true)
    expect(duplicated?.added).toBe(false)
    expect(listPlaylists()[0]?.items).toEqual([item])
  })

  it('remove faixa, renomeia e remove playlist', () => {
    const playlist = createPlaylist('Antiga')
    addPlaylistItem(playlist.id, { musicId: 1, albumId: null, title: 'Uma' })

    expect(removePlaylistItem(playlist.id, 0)?.items).toEqual([])
    expect(renamePlaylist(playlist.id, 'Nova')?.name).toBe('Nova')
    expect(deletePlaylist(playlist.id)).toBe(true)
    expect(listPlaylists()).toEqual([])
  })
  describe('gaps — storage corrompido', () => {
    it('JSON não-array: retorna []', () => {
      values.set('louvorja-playlists-v1', JSON.stringify({ foo: 1 }))
      expect(listPlaylists()).toEqual([])
    })

    it('JSON inválido: retorna []', () => {
      values.set('louvorja-playlists-v1', 'not-json{')
      expect(listPlaylists()).toEqual([])
    })
  })

  it('rename/delete/addItem/removeItem com id inexistente: null/false', () => {
    expect(renamePlaylist('nope', 'X')).toBe(null)
    expect(deletePlaylist('nope')).toBe(false)
    expect(addPlaylistItem('nope', { musicId: 1, albumId: null, title: 'A' })).toBe(null)
    expect(removePlaylistItem('nope', 0)).toBe(null)
  })

  it('savePlaylists persiste lista bruta; removeItem índices inválidos: null', () => {
    savePlaylists([{ id: 'p1', name: 'A', items: [{ musicId: 1, albumId: null, title: 'T' }], createdAt: '', updatedAt: '' }])
    expect(removePlaylistItem('p1', 5)).toBe(null)
    expect(removePlaylistItem('p1', -1)).toBe(null)
    const after = listPlaylists()
    expect(after[0]!.items).toHaveLength(1)
  })

})