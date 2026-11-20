import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// IndexedDB boundary double: requests complete asynchronously, as in the browser.
function database({ openError = false, requestError = false, error = new Error('disk unavailable'), existingStore = false }: { openError?: boolean; requestError?: boolean; error?: Error | null; existingStore?: boolean } = {}) {
  const rows = new Map<string, { id: string; blob: Blob }>()
  function request<T>(result: T) {
    const req = { result, error, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null }
    queueMicrotask(() => requestError ? req.onerror?.() : req.onsuccess?.())
    return req
  }
  const store = { put: vi.fn((row: { id: string; blob: Blob }) => { rows.set(row.id, row); return request(row.id) }), get: vi.fn((id: string) => request(rows.get(id))), delete: vi.fn((id: string) => { rows.delete(id); return request(undefined) }) }
  const db = { objectStoreNames: { contains: vi.fn(() => existingStore) }, createObjectStore: vi.fn(), transaction: vi.fn(() => ({ objectStore: () => store })) }
  const open = vi.fn(() => {
    const req = { result: db, error, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null }
    queueMicrotask(() => { if (openError) req.onerror?.(); else { req.onupgradeneeded?.(); req.onsuccess?.() } })
    return req
  })
  return { open, db, rows, store }
}
beforeEach(() => vi.resetModules())
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('mídia local — armazenamento IndexedDB', () => {
  it('cria o banco, sobrescreve por id, relê após recarregar o módulo e remove', async () => {
    const disk = database()
    vi.stubGlobal('indexedDB', { open: disk.open })
    let media = await import('../local-media-store')
    await media.putMedia('audio', new Blob(['first']))
    await media.putMedia('audio', new Blob(['new audio']))
    expect((await media.getMedia('audio'))?.size).toBe(9)
    expect(disk.db.createObjectStore).toHaveBeenCalledWith('blobs', { keyPath: 'id' })
    expect(disk.open).toHaveBeenCalledOnce()
    vi.resetModules()
    media = await import('../local-media-store')
    expect((await media.getMedia('audio'))?.size).toBe(9)
    await media.deleteMedia('audio')
    expect(await media.getMedia('audio')).toBeNull()
  })
  it('aceita buffers e arrays, e não recria um object store existente', async () => {
    const disk = database({ existingStore: true })
    vi.stubGlobal('indexedDB', { open: disk.open })
    const media = await import('../local-media-store')
    await media.putMedia('buffer', new ArrayBuffer(12))
    await media.putMedia('array', new Uint8Array([1, 2, 3]))
    expect((await media.getMedia('buffer'))?.size).toBe(12)
    expect((await media.getMedia('array'))?.size).toBe(3)
    expect(disk.db.createObjectStore).not.toHaveBeenCalled()
    expect(disk.db.transaction).toHaveBeenCalledWith('blobs', 'readonly')
  })
  it.each([new Error('open denied'), null])('falha ao abrir: escrita informa erro e leitura/remoção continuam seguras (%j)', async error => {
    vi.stubGlobal('indexedDB', { open: database({ openError: true, error }).open })
    const media = await import('../local-media-store')
    await expect(media.putMedia('audio', new Blob(['a']))).rejects.toThrow(error?.message ?? 'LOCAL_MEDIA_OPEN_FAILED')
    expect(await media.getMedia('audio')).toBeNull()
    await expect(media.deleteMedia('audio')).resolves.toBeUndefined()
  })
  it.each([new Error('request denied'), null])('falha de operação: escrita informa erro e player trata mídia como ausente (%j)', async error => {
    vi.stubGlobal('indexedDB', { open: database({ requestError: true, error }).open })
    const media = await import('../local-media-store')
    await expect(media.putMedia('audio', new Blob(['a']))).rejects.toThrow(error?.message ?? 'LOCAL_MEDIA_REQUEST_FAILED')
    expect(await media.getMedia('audio')).toBeNull()
    await expect(media.deleteMedia('audio')).resolves.toBeUndefined()
  })
  it('gera URL somente para mídia existente', async () => {
    vi.stubGlobal('indexedDB', { open: database().open })
    const create = vi.fn(() => 'blob:test')
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create })
    const media = await import('../local-media-store')
    expect(await media.getMediaObjectUrl('missing')).toBeNull()
    const blob = new Blob(['audio'])
    await media.putMedia('audio', blob)
    expect(await media.getMediaObjectUrl('audio')).toBe('blob:test')
    expect(create).toHaveBeenCalledWith(blob)
  })
  it('sem IndexedDB mantém operações em memória durante a sessão', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const media = await import('../local-media-store')
    expect(await media.getMedia('missing')).toBeNull()
    await media.putMedia('audio', new Uint8Array([1, 2]))
    expect((await media.getMedia('audio'))?.size).toBe(2)
    await media.deleteMedia('audio')
    expect(await media.getMedia('audio')).toBeNull()
  })
})
