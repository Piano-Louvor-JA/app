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
  sha256ToUuid: vi.fn(),
  getAuthSession: vi.fn(),
}))

vi.mock('@modules/media/services/custom-catalog', () => ({
  createCustomCollection: mocks.createCustomCollection,
  createCustomLyric: vi.fn(async () => ({ id_lyric: 1 })),
  createCustomMusic: mocks.createCustomMusic,
  deleteCustomMusic: vi.fn(async () => true),
  listCustomCollections: mocks.listCustomCollections,
  toCustomMusicId: (id: number) => id + 1_000_000,
  updateCustomMusic: mocks.updateCustomMusic,
  uploadCustomFile: mocks.uploadCustomFile,
  ensureImportCollectionId: mocks.ensureImportCollectionId,
}))

vi.mock('@shared/services/slja', () => ({
  parseSljaFile: mocks.parseSljaFile,
}))

vi.mock('@shared/services/content-hash', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/services/content-hash')>()),
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
      { id: 77, name: 'Importações .slja', ownerId: 42 },
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

    await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'hino.slja' },
      { confirmUpload: async () => true },
    )

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

    const result = await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'hino.slja' },
      { confirmUpload: async () => true },
    )

    expect(result.updatedExisting).toBe(true)
    expect(mocks.uploadCustomFile).not.toHaveBeenCalled()
    expect(mocks.updateCustomMusic).not.toHaveBeenCalled()
  })

  it('bg da CAPA vira id_file_image da MÚSICA (editor de letras mostra o bg)', async () => {
    mocks.sha256Hex.mockResolvedValue('e'.repeat(64))
    mocks.createCustomMusic.mockResolvedValue({ id: 9, existed: false })
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 55 })
    mocks.parseSljaFile.mockResolvedValue({
      title: 'Hino BG',
      audio: null,
      assets: [{ path: 'fundo.jpg', bytes: new Uint8Array(3) }],
      slides: [
        { type: 'CAPA', lyric: '', order: 0, image: { name: 'imagens\\fundo.jpg', bytes: new Uint8Array(0) } },
        { type: 'LETRA', lyric: 'verso', order: 1 },
      ],
    })

    await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'bg.slja' },
      { confirmUpload: async () => true },
    )

    // upload das imagens aconteceu e a custom_music recebeu o bg
    expect(mocks.uploadCustomFile).toHaveBeenCalled()
    expect(mocks.updateCustomMusic).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ id_file_image: expect.any(Number) }),
    )
  })

  it('logado + confirmUpload=false → LOCAL (não toca a API)', async () => {
    mocks.sha256Hex.mockResolvedValue('c'.repeat(64))
    const result = await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'hino.slja' },
      { confirmUpload: async () => false },
    )
    expect(result.local).toBe(true)
    expect(mocks.createCustomMusic).not.toHaveBeenCalled()
    expect(mocks.uploadCustomFile).not.toHaveBeenCalled()
  })

  it('logado + confirmUpload=true → sobe pra API (dedup ativo)', async () => {
    mocks.sha256Hex.mockResolvedValue('d'.repeat(64))
    mocks.createCustomMusic.mockResolvedValue({ id: 9, existed: false })
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 5 })
    const result = await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'hino.slja' },
      { confirmUpload: async () => true },
    )
    expect(result.local).toBeFalsy()
    expect(mocks.createCustomMusic).toHaveBeenCalledTimes(1)
  })

  it('hashes diferentes → uuids diferentes (imports independentes)', async () => {
    mocks.createCustomMusic.mockResolvedValue({ id: 9, existed: false })
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 5 })

    mocks.sha256Hex.mockResolvedValueOnce('1'.repeat(64))
    await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'a.slja' },
      { confirmUpload: async () => true },
    )

    mocks.sha256Hex.mockResolvedValueOnce('2'.repeat(64))
    await importSljaAsLiturgyMusic(
      { bytes: new ArrayBuffer(8), name: 'b.slja' },
      { confirmUpload: async () => true },
    )

    const first = mocks.createCustomMusic.mock.calls[0][1].client_uuid
    const second = mocks.createCustomMusic.mock.calls[1][1].client_uuid
    expect(first).not.toBe(second)
  })
})
