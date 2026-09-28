// @vitest-environment jsdom
// Contrato de rede de createCustomCollection/updateCustomCollection/listCustomCollections
// com foco na VISIBILIDADE (t_35e4d3ea): default PRIVADO no app, toggle explícito.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string }),
}))

vi.mock('@modules/media/services/auth-client', () => ({
	getAuthSession: mocks.getSession,
	authHeaders: (token?: string | null) =>
		token ? { Authorization: `Bearer ${token}` } : {},
}))

import {
	createCustomCollection,
	listCustomCollections,
	updateCustomCollection,
} from '../custom-catalog'

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	} as unknown as Response
}

beforeEach(() => {
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
	localStorage.clear()
	mocks.getSession.mockReturnValue(null)
})

describe('createCustomCollection — visibilidade (t_35e4d3ea)', () => {
	it('com auth e SEM visibility explícita: envia "private" (default do app)', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		let body: Record<string, unknown> | undefined
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				body = JSON.parse(String(init?.body))
				return jsonResponse({ id_collection: 9 })
			}),
		)
		await createCustomCollection('Minha coletânea')
		// mutante: visibility ausente → API aplica default 'public' (pegadinha antiga)
		expect(body?.visibility).toBe('private')
	})

	it('com auth e visibility "public": envia "public"', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		let body: Record<string, unknown> | undefined
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				body = JSON.parse(String(init?.body))
				return jsonResponse({ id_collection: 9 })
			}),
		)
		await createCustomCollection('X', undefined, undefined, 'public')
		expect(body?.visibility).toBe('public')
	})

	it('sem auth: cria LOCAL e NUNCA chama a API (independent da visibility)', async () => {
		mocks.getSession.mockReturnValue(null)
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		await createCustomCollection('Local', undefined, undefined, 'public')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('falha da API → null', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false)))
		expect(await createCustomCollection('X')).toBeNull()
	})
})

describe('updateCustomCollection — visibility no PATCH/PUT', () => {
	it('envia visibility no body do PUT', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		let body: Record<string, unknown> | undefined
		let method = ''
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				method = init?.method ?? ''
				body = JSON.parse(String(init?.body))
				return jsonResponse({
					id_collection: 9,
					name: 'X',
					description: null,
					visibility: 'public',
					musics_count: 0,
				})
			}),
		)
		const result = await updateCustomCollection(9, { visibility: 'public' })
		expect(method).toBe('PUT')
		expect(body?.visibility).toBe('public')
		expect(result?.visibility).toBe('public')
	})

	it('resposta da API sem visibility → undefined no summary (não inventa)', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({ id_collection: 9, name: 'X', description: null }),
			),
		)
		const result = await updateCustomCollection(9, { name: 'X' })
		expect(result?.visibility).toBeUndefined()
	})
})

describe('listCustomCollections — visibility na listagem', () => {
	it('mapeia visibility da API; ausente → public (legado)', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse({
					data: [
						{
							id_collection: 1,
							name: 'Pública legado',
							description: null,
							musics_count: 0,
						},
						{
							id_collection: 2,
							name: 'Privada',
							description: null,
							visibility: 'private',
							musics_count: 0,
						},
					],
				}),
			),
		)
		const all = await listCustomCollections()
		const remote = all.filter((c) => c.id > 0)
		// legado sem coluna → tratado como public (estado real do banco antigo)
		expect(remote[0]?.visibility).toBe('public')
		expect(remote[1]?.visibility).toBe('private')
	})
})

describe('custom-catalog — fechamento de branches (local/falha)', () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
		vi.unstubAllEnvs()
		localStorage.clear()
	})

	it('updateCustomCollection em coletânea LOCAL: atualiza store e retorna summary', async () => {
		localStorage.setItem(
			'louvorja.local-custom.v1',
			JSON.stringify({
				nextCollectionId: -1,
				nextMusicId: -1,
				nextLyricId: -1,
				collections: [{ id: -7, name: 'Local', description: null }],
				musics: [],
			}),
		)
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		const result = await updateCustomCollection(-7, { name: 'Local 2' })
		expect(fetchMock).not.toHaveBeenCalled()
		expect(result?.name).toBe('Local 2')
		expect(result?.musicsCount).toBe(0)
	})

	it('listCustomCollections: API falha → retorna só as locais (fallback)', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		localStorage.setItem(
			'louvorja.local-custom.v1',
			JSON.stringify({
				nextCollectionId: -1,
				nextMusicId: -1,
				nextLyricId: -1,
				collections: [{ id: -7, name: 'Local', description: null }],
				musics: [],
			}),
		)
		vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false)))
		const all = await listCustomCollections()
		expect(all).toHaveLength(1)
		expect(all[0]?.id).toBe(-7)
	})

	it('createCustomCollection: exceção de rede autenticado → enfileira e retorna id 0', async () => {
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline')
			}),
		)
		expect(await createCustomCollection('X')).toEqual({ id: 0 })
	})
})

describe('custom-catalog — exceções de rede (catch)', () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
		vi.unstubAllEnvs()
		localStorage.clear()
		mocks.getSession.mockReturnValue({ token: 'tok' } as never)
	})

	it('updateCustomCollection: fetch lança → null', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline')
			}),
		)
		expect(await updateCustomCollection(9, { name: 'X' })).toBeNull()
	})

	it('listCustomCollections: fetch lança → só locais', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('offline')
			}),
		)
		const all = await listCustomCollections()
		expect(all).toEqual([])
	})
})
