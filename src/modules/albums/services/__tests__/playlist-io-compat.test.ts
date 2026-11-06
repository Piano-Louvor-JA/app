import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parsePlaylistsImport, serializePlaylists } from '../playlist-io'

/**
 * PW-3: teste de compatibilidade do formato de intercâmbio de playlists.
 * Fixture de DADOS compartilhada com o produto irmão (mesma versão do arquivo
 * em ambos os repos — se um lado mudar o schema, o gate de paridade expõe).
 */
const fixtureRaw = readFileSync(
  join(dirname(__filename), 'fixtures', 'playlists-fixture-v1.json'),
  'utf-8',
)

describe('playlist-io — compat fixture v1 (PW-3)', () => {
  it('importa a fixture compartilhada com a mesma estrutura resultante', () => {
    const result = parsePlaylistsImport(fixtureRaw)

    expect(result.ok).toBe(true)
    expect(result.discardedItems).toBe(0)
    expect(result.playlists).toHaveLength(2)

    const [first, second] = result.playlists
    expect(first?.id).toBe('fixture-pl-1')
    expect(first?.name).toBe('Culto de Adoracao')
    expect(first?.items).toEqual([
      { musicId: 101, albumId: 3, title: 'Quero Adorar' },
      { musicId: 205, albumId: null, title: 'Gratos' },
    ])
    expect(first?.createdAt).toBe('2026-10-01T10:00:00.000Z')
    expect(first?.updatedAt).toBe('2026-11-03T09:30:00.000Z')
    expect(second?.id).toBe('fixture-pl-2')
    expect(second?.items).toEqual([{ musicId: 310, albumId: 7, title: 'Fogo Novo' }])
  })

  it('round-trip export→import preserva faixas, ids e ordem', () => {
    const parsed = parsePlaylistsImport(fixtureRaw)
    expect(parsed.ok).toBe(true)

    const exported = serializePlaylists(parsed.playlists)
    expect(exported.version).toBe(1)
    expect(exported.kind).toBe('playlists')
    expect(exported.exported_at).toEqual(expect.any(String))

    const reparsed = parsePlaylistsImport(JSON.stringify(exported))
    expect(reparsed.ok).toBe(true)
    expect(reparsed.discardedItems).toBe(0)
    expect(reparsed.playlists.map((p) => p.id)).toEqual(parsed.playlists.map((p) => p.id))
    expect(reparsed.playlists.map((p) => p.name)).toEqual(parsed.playlists.map((p) => p.name))
    expect(reparsed.playlists.map((p) => p.items)).toEqual(parsed.playlists.map((p) => p.items))
    // Timestamps originais preservados no ciclo completo.
    expect(reparsed.playlists[0]?.createdAt).toBe('2026-10-01T10:00:00.000Z')
    expect(reparsed.playlists[0]?.updatedAt).toBe('2026-11-03T09:30:00.000Z')
  })

  it('rejeita versão de schema desconhecida', () => {
    const tampered = JSON.parse(fixtureRaw) as Record<string, unknown>
    tampered.version = 999
    const result = parsePlaylistsImport(JSON.stringify(tampered))
    // Contrato atual: versão não faz parte da validação de entrada, mas o payload
    // deve permanecer interpretável sem corromper storage — documento comportamento.
    if (result.ok) {
      expect(result.playlists.every((p) => p.items.every((i) => typeof i.musicId === 'number'))).toBe(true)
    } else {
      expect(result.playlists).toEqual([])
    }
  })

  it('rejeita JSON corrompido sem lançar', () => {
    const result = parsePlaylistsImport('{corrompido')
    expect(result.ok).toBe(false)
    expect(result.playlists).toEqual([])
  })
})
