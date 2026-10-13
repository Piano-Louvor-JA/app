import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * sync v2 fase 3 — migração de imports .slja locais → conta (app#336).
 *
 * Regra (Rafael 03/10): local pode ter N cópias; pro banco sobe UM
 * arquivo (client_uuid determinístico do hash — dedupe da API) e SÓ
 * após aprovação.
 *
 * Contrato do serviço:
 * - lista músicas locais com sljaHash ainda não migradas
 * - PÓS-login: para cada uma, pergunta (confirmUpload) e sobe com o
 *   client_uuid determinístico → API dedupeia se já existe
 * - recusou → marca "oferecido" e NÃO pergunta de novo na sessão
 * - sem locais → no-op (nunca pergunta)
 * - falha de rede → NÃO marca como migrada (tenta de novo no próximo login)
 */

const lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
})

const mocks = vi.hoisted(() => ({
  listLocalCollections: vi.fn(),
  listLocalMusics: vi.fn(),
  getAuthSession: vi.fn(),
  createCustomCollection: vi.fn(),
  createCustomMusic: vi.fn(),
  uploadCustomFile: vi.fn(),
  updateCustomMusic: vi.fn(),
  createCustomLyric: vi.fn(),
  listCustomCollections: vi.fn(),
  dataUrlToBytes: vi.fn(),
}))

vi.mock('@modules/media/services/local-custom-store', () => ({
  listLocalCollections: mocks.listLocalCollections,
  listLocalMusics: mocks.listLocalMusics,
}))

vi.mock('@modules/media/services/auth-client', () => ({
  getAuthSession: mocks.getAuthSession,
}))

vi.mock('@modules/media/services/custom-catalog', () => ({
  createCustomCollection: mocks.createCustomCollection,
  createCustomMusic: mocks.createCustomMusic,
  uploadCustomFile: mocks.uploadCustomFile,
  updateCustomMusic: mocks.updateCustomMusic,
  createCustomLyric: mocks.createCustomLyric,
  listCustomCollections: mocks.listCustomCollections,
}))

import {
  localSljaMigrationCandidates,
  markSljaMigrationOffered,
  runSljaMigration,
} from '../local-slja-migration'

const LOCAL_MUSIC = {
  id: -5,
  collectionId: -1,
  name: 'Hino Local',
  audioBase64: 'data:audio/mpeg;base64,QUJD',
  lyrics: [{ id: -1, musicId: -5, lyric: 'verso', order: 1, time: '00:00:01' }],
  sljaHash: 'a'.repeat(64),
}

const CANDIDATE = {
  localMusic: LOCAL_MUSIC,
  name: 'Hino Local',
  sljaHash: 'a'.repeat(64),
}

describe('migração de .slja locais → conta (fase 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lsStore.clear()
    mocks.getAuthSession.mockReturnValue({ token: 'tok', user: { id_user: 42 } })
    mocks.listLocalCollections.mockReturnValue([{ id: -1, name: 'Importações .slja' }])
    mocks.listLocalMusics.mockReturnValue([LOCAL_MUSIC])
  })

  it('candidato: música local com sljaHash ainda não oferecida', () => {
    const candidates = localSljaMigrationCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ name: 'Hino Local', sljaHash: 'a'.repeat(64) })
  })

  it('já oferecida na sessão → não é mais candidata', () => {
    markSljaMigrationOffered(LOCAL_MUSIC.sljaHash!)
    expect(localSljaMigrationCandidates()).toHaveLength(0)
  })

  it('runSljaMigration com aprovação: sobe com client_uuid do hash', async () => {
    mocks.listCustomCollections.mockResolvedValue([
      { id: 77, name: 'Importações .slja' },
    ])
    mocks.dataUrlToBytes.mockReturnValue(new Uint8Array([65, 66, 67]))
    mocks.uploadCustomFile.mockResolvedValue({ idFile: 9 })
    mocks.createCustomMusic.mockResolvedValue({ id: 500, existed: false })
    mocks.createCustomLyric.mockResolvedValue({ id: 1 })

    const result = await runSljaMigration([CANDIDATE], {
      confirmUpload: async () => true,
    })

    expect(result.uploaded).toBe(1)
    expect(mocks.createCustomMusic).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        client_uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }),
    )
  })

  it('runSljaMigration recusado: nada sobe, marca oferecido', async () => {
    const result = await runSljaMigration([CANDIDATE], {
      confirmUpload: async () => false,
    })
    expect(result.uploaded).toBe(0)
    expect(result.declined).toBe(1)
    expect(mocks.createCustomMusic).not.toHaveBeenCalled()
    expect(localSljaMigrationCandidates()).toHaveLength(0)
  })

  it('sem sessão real: migração não roda', async () => {
    mocks.getAuthSession.mockReturnValue(null)
    const result = await runSljaMigration([CANDIDATE], {
      confirmUpload: async () => true,
    })
    expect(result.uploaded).toBe(0)
    expect(mocks.createCustomMusic).not.toHaveBeenCalled()
  })
})
