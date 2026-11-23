// @vitest-environment jsdom
// SPEC louvorja-community-copies v1.0.0: cópias da Comunidade vivem
// EXCLUSIVAMENTE na aba Comunidade — nunca na Central de Mídia (/albums).
// D1: origin persistida no local-custom-store.
// D2: filtro na fonte (buildCustomCollectionCards).
// D3: card resolvido sob demanda (buildCommunityCopyCard) p/ rota community/copies/:id.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	listCustomCollections: vi.fn(),
	getAuthSession: vi.fn(() => null),
}))

vi.mock('@modules/media/services/custom-catalog', () => ({
	listCustomCollections: mocks.listCustomCollections,
	customFileUrl: (p: string) => `cf:${p}`,
	toCustomCollectionId: (id: number) => id + 2_000_000,
	fromCustomCollectionId: (id: number) => id - 2_000_000,
	isCustomCollectionId: (id: number | string) =>
		Number.isFinite(Number(id)) && Number(id) >= 2_000_000,
}))
vi.mock('@modules/media/services/auth-client', () => ({
	getAuthSession: (...a: unknown[]) => mocks.getAuthSession(...a),
}))
vi.mock('@modules/sync/services/media-paths', () => ({
	resolveCoverUrlsFromDisk: vi.fn(async () => ({})),
	resolveRemoteFileUrl: (p: string) => p,
}))

import {
	buildCommunityCopyCard,
	loadCustomAlbumCategory,
} from '../album-catalog'
import {
	createLocalCollection,
	createLocalMusic,
	getLocalCollection,
} from '@modules/media/services/local-custom-store'

beforeEach(() => {
	vi.clearAllMocks()
	localStorage.clear()
	mocks.getAuthSession.mockReturnValue(null)
})

describe('D1 — origin persistida no local-custom-store', () => {
	it('createLocalCollection grava e relê origin (roundtrip localStorage)', () => {
		const copy = createLocalCollection('Cópia X', 'desc', {
			type: 'community',
			sourceId: 42,
		})
		const relido = getLocalCollection(copy.id)
		expect(relido?.origin).toEqual({ type: 'community', sourceId: 42 })
	})

	it('coletânea comum (sem origin) continua sem o campo', () => {
		const plain = createLocalCollection('Normal')
		expect(getLocalCollection(plain.id)?.origin).toBeUndefined()
	})

	it('trackCount do card usa listLocalMusics (músicas da cópia contadas)', () => {
		const copy = createLocalCollection('Com músicas', undefined, {
			type: 'community',
			sourceId: 7,
		})
		createLocalMusic(copy.id, { name: 'Hino 1' })
		createLocalMusic(copy.id, { name: 'Hino 2' })
		const card = buildCommunityCopyCard(copy.id)
		expect(card?.trackCount).toBe(2)
	})
})

describe('D2 — cópia NÃO aparece na categoria custom de /albums', () => {
	it('local com origin.type=community é filtrado da fonte; local comum entra', async () => {
		const copy = createLocalCollection('Cópia Comunidade', undefined, {
			type: 'community',
			sourceId: 42,
		})
		const plain = createLocalCollection('Minha Local Comum')
		mocks.listCustomCollections.mockResolvedValue([
			{ id: copy.id, name: copy.name, description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 3, visibility: 'private' },
			{ id: plain.id, name: plain.name, description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 1, visibility: 'private' },
		])
		const category = await loadCustomAlbumCategory()
		const names = (category?.collections ?? []).map((c) => c.name)
		expect(names).toContain('Minha Local Comum')
		expect(names).not.toContain('Cópia Comunidade')
	})
})

describe('D3 — card da cópia resolvido sob demanda (rota community/copies/:id)', () => {
	it('aceita id local CRU (negativo) e retorna card isCustom com id offsetado', () => {
		const copy = createLocalCollection('Cópia Y', undefined, {
			type: 'community',
			sourceId: 42,
		})
		const card = buildCommunityCopyCard(copy.id)
		expect(card).not.toBeNull()
		expect(card?.isCustom).toBe(true)
		expect(card?.id).toBe(copy.id + 2_000_000)
		expect(card?.name).toBe('Cópia Y')
	})

	it('aceita id como string da rota', () => {
		const copy = createLocalCollection('Cópia String', undefined, {
			type: 'community',
			sourceId: 42,
		})
		expect(buildCommunityCopyCard(String(copy.id))?.isCustom).toBe(true)
	})

	it('retorna null para local SEM origin (não é cópia — permanece na Central)', () => {
		const plain = createLocalCollection('Local comum')
		expect(buildCommunityCopyCard(plain.id)).toBeNull()
	})

	it('retorna null para id positivo/inválido (nunca colide com API custom)', () => {
		expect(buildCommunityCopyCard('abc')).toBeNull()
		expect(buildCommunityCopyCard(123)).toBeNull()
		expect(buildCommunityCopyCard('999999')).toBeNull()
	})
})
