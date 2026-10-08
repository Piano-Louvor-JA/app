import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchRemoteCatalogJsonMock, readCatalogRecordMock } = vi.hoisted(() => ({
  fetchRemoteCatalogJsonMock: vi.fn(),
  readCatalogRecordMock: vi.fn(),
}))

vi.mock('@shared/services/remote-catalog', () => ({
  fetchRemoteCatalogJson: fetchRemoteCatalogJsonMock,
}))
vi.mock('@shared/services/workspace-api', () => ({
  readCatalogRecord: readCatalogRecordMock,
  resolveDatabaseUrl: (path: string) => path,
}))

import { collectTrackMediaItems } from '../track-media'

describe('collectTrackMediaItems — id local', () => {
  beforeEach(() => {
    fetchRemoteCatalogJsonMock.mockReset()
    readCatalogRecordMock.mockReset()
    readCatalogRecordMock.mockResolvedValue(null)
  })

  it('id negativo não consulta o catálogo oficial', async () => {
    const items = await collectTrackMediaItems(-4)
    expect(items).toEqual([])
    expect(readCatalogRecordMock).not.toHaveBeenCalled()
    expect(fetchRemoteCatalogJsonMock).not.toHaveBeenCalled()
  })
})
