import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => values.get(k) ?? null,
  setItem: (k: string, v: string) => void values.set(k, v),
  removeItem: (k: string) => void values.delete(k),
  clear: () => values.clear(),
})

import {
  parsePlaylistsImport,
  serializePlaylists,
} from '../playlist-io'
import {
  createPlaylist,
  addPlaylistItem,
  listPlaylists,
} from '../playlist-storage'
import { savePlaylists } from '../playlist-storage'

describe('playlist-io', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('serializa e re-importa mantendo conteúdo', () => {
    const playlist = createPlaylist('Culto Domingo')
    addPlaylistItem(playlist.id, { musicId: 10, albumId: 5, title: 'Hino 10' })

    const exported = serializePlaylists(listPlaylists())
    const json = JSON.stringify(exported)
    const result = parsePlaylistsImport(json)

    expect(result.ok).toBe(true)
    expect(result.playlists).toHaveLength(1)
    expect(result.playlists[0]?.name).toBe('Culto Domingo')
    expect(result.playlists[0]?.items[0]?.musicId).toBe(10)
    expect(result.discardedItems).toBe(0)
  })

  it('rejeita JSON inválido, sem kind ou sem playlists', () => {
    expect(parsePlaylistsImport('não json').ok).toBe(false)
    expect(parsePlaylistsImport('{"kind":"outro"}').ok).toBe(false)
    expect(parsePlaylistsImport('{"kind":"playlists","playlists":"x"}').ok).toBe(false)
  })

  it('descarta itens inválidos mas mantém os válidos', () => {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      kind: 'playlists',
      playlists: [
        {
          id: 'p1',
          name: 'Mista',
          createdAt: '2026-08-28T00:00:00Z',
          updatedAt: '2026-08-28T00:00:00Z',
          items: [
            { musicId: 1, albumId: null, title: 'Boa' },
            { musicId: 'x', albumId: null, title: 'Ruim' },
            { title: 'Sem id' },
          ],
        },
      ],
    }
    const result = parsePlaylistsImport(JSON.stringify(payload))

    expect(result.ok).toBe(true)
    expect(result.playlists[0]?.items).toHaveLength(1)
    expect(result.discardedItems).toBe(2)
  })
  it('todas as playlists inválidas: ok false com discardedItems', () => {
    const payload = {
      kind: 'playlists',
      playlists: [
        { id: 'x', name: '', items: [] },
        { id: 'y', name: '   ', items: [] },
      ],
    }
    const result = parsePlaylistsImport(JSON.stringify(payload))
    expect(result.ok).toBe(false)
    expect(result.playlists).toEqual([])
    expect(result.discardedItems).toBe(0)
  })

  it('item com title vazio/whitespace é descartado', () => {
    const payload = {
      kind: 'playlists',
      playlists: [
        {
          id: 'p1',
          name: 'Lista',
          items: [
            { musicId: 1, albumId: null, title: 'OK' },
            { musicId: 2, albumId: null, title: '   ' },
            { musicId: 'não-número', albumId: null, title: 'X' },
            { musicId: 3, albumId: null, title: '' },
          ],
        },
      ],
    }
    const result = parsePlaylistsImport(JSON.stringify(payload))
    expect(result.ok).toBe(true)
    expect(result.playlists[0]?.items).toHaveLength(1)
    expect(result.discardedItems).toBe(3)
  })

  it('item null/primitivo e playlist não-objeto são descartados', () => {
    const raw = JSON.stringify({
      version: 1,
      kind: 'playlists',
      playlists: [
        { id: 'p1', name: 'Ok', items: [null, 42, 'x', { musicId: 1, albumId: null, title: 'Válida' }] },
        null,
        7,
        'string',
        { id: 'p2', name: 'Com lixo', items: [{ musicId: 'não-numérico', title: 'x' }] },
      ],
    })
    const result = parsePlaylistsImport(raw)
    expect(result.ok).toBe(true)
    expect(result.playlists).toHaveLength(2)
    expect(result.playlists[0]!.items).toHaveLength(1)
    expect(result.discardedItems).toBe(4)
  })

  it('createdAt/updatedAt não-string viram ISO atual', () => {
    const payload = {
      kind: 'playlists',
      playlists: [
        { id: 'p1', name: 'Lista', items: [], createdAt: 12345, updatedAt: null },
      ],
    }
    const result = parsePlaylistsImport(JSON.stringify(payload))
    expect(result.ok).toBe(true)
    expect(new Date(result.playlists[0]!.createdAt).toString()).not.toBe('Invalid Date')
    expect(new Date(result.playlists[0]!.updatedAt).toString()).not.toBe('Invalid Date')
  })

})