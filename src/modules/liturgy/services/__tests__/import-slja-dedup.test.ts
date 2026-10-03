import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * app#336 fase 3 — dedup de imports .slja:
 * re-import do MESMO arquivo não pode duplicar música no banco.
 *
 * Contrato:
 * - client_uuid determinístico derivado do hash do arquivo vai no create
 * - API retornando existed (200) → import vira no-op (sem re-upload de mídias)
 * - hashes diferentes → imports independentes (não agressivo demais)
 */

const mocks = vi.hoisted(() => ({
  createCustomMusic: vi.fn(),
  listCustomCollections: vi.fn(),
  createCustomCollection: vi.fn(),
  updateCustomMusic: vi.fn(),
  uploadCustomFile: vi.fn(),
  ensureImportCollectionId: vi.fn(),
  uploadCustomFile: vi.fn(),
  updateCustomMusic: vi.fn(),
  parseSljaFile: vi.fn(),
  sha256Hex: vi.fn(),
  getAuthSession: vi.fn(),
}))

vi.mock('@modules/media/services/custom-catalog', () => ({
  createCustomCollection: mocks.createCustomCollection,
  createCustomLyric: vi.fn(),
  createCustomMusic: mocks.createCustomMusic,
  listCustomCollections: mocks.listCustomCollections,
  toCustomMusicId: vi.fn(),
  updateCustomMusic: mocks.updateCustomMusic,
  uploadCustomFile: mocks.uploadCustomFile,
  ensureImportCollectionId: mocks.ensureImportCollectionId,
}))

vi.mock('@shared/services/slja', () => ({
  parseSljaFile: mocks.parseSljaFile,
}))

vi.mock('@shared/services/content-hash', () => ({
  sha256Hex: mocks.sha256Hex,
}))

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: mocks.getAuthSession,
}))

import { importSljaAsLiturgyMusic } from '../import-slja-to-liturgy'

const ARCHIVE = {
  title: 'Hino Teste',
  audio: null,
  assets: [],
  slides: [{ type: 'LETRA', lyric: 'verso 1', order: 1 }],
}

describe('dedup de import .slja (app#336 fase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listCustomCollections.mockResolvedValue([
      { id: 77, name: 'Importações .slja' },
    ])
    mocks.parseSljaFile.mockResolvedValue(ARCHIVE)
    mocks.getAuthSession.mockReturnValue({
      token: 'tok',
      user: { id_user: 42 },
    })
  })

  it('passa client_uuid determinístico (mesmo hash → mesmo uuid)', async () => {
    mocks.sha256Hex.mockResolvedValue('a'.repeat(64))
    mocks.createCustomMusic.mockResolvedValue({ id: 9, existed: false })
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 5 })

    await importSljaAsLiturgyMusic({ bytes: new ArrayBuffer(8), name: 'hino.slja' })

    expect(mocks.createCustomMusic).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        client_uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }),
    )
  })

  it('re-import (existed=true): NO-OP — sem uploads, retorna a existente', async () => {
    mocks.sha256Hex.mockResolvedValue('b'.repeat(64))
    mocks.createCustomMusic.mockResolvedValue({ id: 9, existed: true })

    const result = await importSljaAsLiturgyMusic({ bytes: new ArrayBuffer(8), name: 'hino.slja' })

    expect(result.updatedExisting).toBe(true)
    expect(mocks.uploadCustomFile).not.toHaveBeenCalled()
    expect(mocks.updateCustomMusic).not.toHaveBeenCalled()
  })

  it('hashes diferentes → uuids diferentes (imports independentes)', async () => {
    mocks.createCustomMusic.mockResolvedValue({ id: 9, existed: false })
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 5 })

    mocks.sha256Hex.mockResolvedValueOnce('1'.repeat(64))
    await importSljaAsLiturgyMusic({ bytes: new ArrayBuffer(8), name: 'a.slja' })

    mocks.sha256Hex.mockResolvedValueOnce('2'.repeat(64))
    await importSljaAsLiturgyMusic({ bytes: new ArrayBuffer(8), name: 'b.slja' })

    const first = mocks.createCustomMusic.mock.calls[0][1].client_uuid
    const second = mocks.createCustomMusic.mock.calls[1][1].client_uuid
    expect(first).not.toBe(second)
  })
})
