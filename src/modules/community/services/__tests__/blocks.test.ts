import { afterEach, describe, expect, it, vi } from 'vitest'

import { blockAuthor, listBlockedAuthors, unblockAuthor } from '../blocks'

function respond(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('blocks (App Store 1.2)', () => {
  it('blockAuthor: POST /collections/{id}/block-author com Bearer e X-Tenant', async () => {
    const f = respond(200, { blocked: { id_user: 12, displayName: 'Autor' } })
    vi.stubGlobal('fetch', f)
    expect(await blockAuthor(10, 'tok')).toEqual({ id: 12, name: 'Autor' })
    const [url, init] = f.mock.calls[0]
    expect(String(url)).toMatch(/\/v1\/custom\/collections\/10\/block-author$/)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Tenant': 'piano' })
  })

  it.each([[null, 'sem token'], ['tok', 'erro']])('blockAuthor %s → null (%s)', async (token) => {
    vi.stubGlobal('fetch', respond(400))
    expect(await blockAuthor(10, token)).toBeNull()
  })

  it('blockAuthor: rede caiu ou resposta sem autor → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await blockAuthor(10, 'tok')).toBeNull()
    vi.stubGlobal('fetch', respond(200, {}))
    expect(await blockAuthor(10, 'tok')).toBeNull()
  })

  it('listBlockedAuthors: GET /blocks, ignora linhas inválidas e nome vazio vira ""', async () => {
    const f = respond(200, { data: [{ id_user: 12, displayName: 'Autor' }, { id_user: 0 }, { id_user: 3, displayName: '  ' }] })
    vi.stubGlobal('fetch', f)
    expect(await listBlockedAuthors('tok')).toEqual([{ id: 12, name: 'Autor' }, { id: 3, name: '' }])
    expect(String(f.mock.calls[0][0])).toMatch(/\/v1\/custom\/blocks$/)
  })

  it('listBlockedAuthors: sem token, erro HTTP ou rede → null; sem data → []', async () => {
    expect(await listBlockedAuthors(null)).toBeNull()
    vi.stubGlobal('fetch', respond(500))
    expect(await listBlockedAuthors('tok')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await listBlockedAuthors('tok')).toBeNull()
    vi.stubGlobal('fetch', respond(200, {}))
    expect(await listBlockedAuthors('tok')).toEqual([])
  })

  it('unblockAuthor: DELETE /blocks/{id}', async () => {
    const f = respond(204)
    vi.stubGlobal('fetch', f)
    expect(await unblockAuthor(12, 'tok')).toBe(true)
    expect(String(f.mock.calls[0][0])).toMatch(/\/v1\/custom\/blocks\/12$/)
    expect(f.mock.calls[0][1].method).toBe('DELETE')
    expect(await unblockAuthor(12, null)).toBe(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')))
    expect(await unblockAuthor(12, 'tok')).toBe(false)
  })
})
