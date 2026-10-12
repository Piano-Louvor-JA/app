import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * app#337 — bootstrap retomável (B1/B3):
 * syncEssentialCatalogFromApi gravava tudo all-or-nothing; se a janela
 * perdesse foco no meio (throttle de timers em bg), o bootstrap abortava
 * e o próximo boot RE-BAIXAVA tudo do zero.
 *
 * Novo contrato: progresso POR ARQUIVO persistido (bootstrapComplete.files)
 * — o loop pula os já salvos e retoma de onde parou.
 */

const store = new Map<string, unknown>()

vi.mock('@shared/constants/storage-keys', () => ({
  WORKSPACE_RECORD_KEYS: {
    bootstrapComplete: 'bootstrapComplete',
    config: 'config',
  },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => null,
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: vi.fn(async (file: string) => ({ file, at: Date.now() })),
}))

vi.mock('@shared/services/workspace-api', () => ({
  clearWorkspace: vi.fn(async () => {}),
  readCatalogRecord: vi.fn(async (key: string) => store.get(key) ?? null),
  writeCatalogRecord: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
    return true
  }),
}))

vi.mock('@modules/sync/services/library-catalog', () => ({
  getCurrentApiPrefix: () => 'pt',
}))

import {
  isBootstrapComplete,
  syncEssentialCatalogFromApi,
} from '../bootstrap-service'
import { fetchRemoteCatalogJson } from '@shared/services/remote-catalog'

const FILES = [
  'pt_categories',
  'pt_hymnal',
  'pt_hymnal_1996',
  'pt_musics',
  'pt_bible_book',
  'pt_bible_version',
]

describe('bootstrap retomável por arquivo (app#337)', () => {
  beforeEach(() => {
    store.clear()
    vi.mocked(fetchRemoteCatalogJson).mockClear()
  })

  it('B3: bootstrap completo grava a lista de arquivos concluídos', async () => {
    await syncEssentialCatalogFromApi(() => {})
    const flag = store.get('bootstrapComplete.files') as { files: string[] }
    expect(flag.files).toEqual(FILES)
  })

  it('B1: interrupção no meio → retomada baixa SÓ os que faltam', async () => {
    // primeira rodada: rede cai no 3º arquivo
    const fetchMock = vi.mocked(fetchRemoteCatalogJson)
    fetchMock.mockImplementationOnce(async (file: string) => ({ file }))
    fetchMock.mockImplementationOnce(async (file: string) => ({ file }))
    fetchMock.mockImplementationOnce(async () => {
      throw new Error('Failed to fetch')
    })

    await expect(syncEssentialCatalogFromApi(() => {})).rejects.toThrow(
      'Failed to fetch',
    )

    // estado parcial persistido: 2 arquivos completos
    const flag = store.get('bootstrapComplete.files') as { files: string[] }
    expect(flag.files).toEqual(['pt_categories', 'pt_hymnal'])

    // retomada: só os 4 restantes são baixados
    const callsBefore = fetchMock.mock.calls.length
    await syncEssentialCatalogFromApi(() => {})
    expect(fetchMock.mock.calls.length - callsBefore).toBe(4)
    expect(fetchMock.mock.calls.slice(callsBefore).map((c) => c[0])).toEqual(
      FILES.slice(2),
    )
  })

  it('B1: bootstrap completo → retomada baixa ZERO arquivos', async () => {
    await syncEssentialCatalogFromApi(() => {})
    const callsBefore = vi.mocked(fetchRemoteCatalogJson).mock.calls.length
    await syncEssentialCatalogFromApi(() => {})
    expect(
      vi.mocked(fetchRemoteCatalogJson).mock.calls.length - callsBefore,
    ).toBe(0)
  })

  it('B3: isBootstrapComplete só true com TODOS os arquivos', async () => {
    store.set('bootstrapComplete', { complete: true })
    store.set('bootstrapComplete.files', { files: FILES.slice(0, 2) })
    expect(await isBootstrapComplete()).toBe(false)
    store.set('bootstrapComplete.files', { files: FILES })
    expect(await isBootstrapComplete()).toBe(true)
  })
})
