// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  albumDisableKey,
  loadDisabledAlbums,
  saveDisabledAlbums,
} from '../disabled-albums'

describe('álbuns desativados (preferência local, offline-first)', () => {
  beforeEach(() => localStorage.clear())

  it('salva e lê de volta depois de recarregar', () => {
    saveDisabledAlbums(['hymnal_1996', '77', '77'])
    expect(loadDisabledAlbums()).toEqual(['hymnal_1996', '77'])
  })

  it('sem nada salvo ou valor inválido: nenhum desativado', () => {
    expect(loadDisabledAlbums()).toEqual([])
    saveDisabledAlbums(['', 'ok'])
    expect(loadDisabledAlbums()).toEqual(['ok'])
  })

  it('chave do álbum: hinários pelo tipo ou nome, demais pelo id', () => {
    expect(albumDisableKey({ id_album: 900, type: 'hymnal', name: 'Hinário Adventista' })).toBe('hymnal')
    expect(albumDisableKey({ id_album: 901, type: 'hymnal_1996', name: 'x' })).toBe('hymnal_1996')
    expect(albumDisableKey({ id_album: 902, name: 'Hinário Adventista - Edição 1996' })).toBe('hymnal_1996')
    expect(albumDisableKey({ id_album: 903, name: 'Hinário Adventista' })).toBe('hymnal')
    expect(albumDisableKey({ id_album: '77', name: 'CD Jovem 2004' })).toBe('77')
    expect(albumDisableKey({ name: 'Sem id' })).toBeNull()
  })
})
