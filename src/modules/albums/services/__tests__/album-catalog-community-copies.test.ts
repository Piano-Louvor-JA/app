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
			collectionId: 42,
			copiedAt: '2026-11-23T12:00:00.000Z',
		})
		const relido = getLocalCollection(copy.id)
		expect(relido?.origin).toEqual({ type: 'community', collectionId: 42, copiedAt: '2026-11-23T12:00:00.000Z' })
	})

	it('coletânea comum (sem origin) fica com origin null (manual)', () => {
		const plain = createLocalCollection('Normal')
		// loadDb normaliza ausência → null (SPEC D1: null/ausência = manual)
		expect(getLocalCollection(plain.id)?.origin).toBeNull()
	})

	it('trackCount do card usa listLocalMusics (músicas da cópia contadas)', () => {
		const copy = createLocalCollection('Com músicas', undefined, {
			type: 'community',
			collectionId: 7,
			copiedAt: '2026-11-23T12:00:00.000Z',
		})
		createLocalMusic(copy.id, { name: 'Hino 1' })
		createLocalMusic(copy.id, { name: 'Hino 2' })
		const card = buildCommunityCopyCard(copy.id)
		expect(card?.trackCount).toBe(2)
	})
})

describe('D2 ampliado (adendo v1.1.0) — NENHUMA custom em /albums', () => {
	it('cópia E local comum: categoria null (as duas vivem só na Comunidade)', async () => {
		const copy = createLocalCollection('Cópia Comunidade', undefined, {
			type: 'community',
			collectionId: 42,
			copiedAt: '2026-11-23T12:00:00.000Z',
		})
		createLocalCollection('Minha Local Comum')
		mocks.listCustomCollections.mockResolvedValue([
			{ id: copy.id, name: copy.name, description: null, coverUrl: null, ownerId: null, authorName: null, musicsCount: 3, visibility: 'private' },
		])
		expect(await loadCustomAlbumCategory()).toBeNull()
	})
})

describe('D3 — card da cópia resolvido sob demanda (rota community/copies/:id)', () => {
	it('aceita id local CRU (negativo) e retorna card isCustom com id offsetado', () => {
		const copy = createLocalCollection('Cópia Y', undefined, {
			type: 'community',
			collectionId: 42,
			copiedAt: '2026-11-23T12:00:00.000Z',
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
			collectionId: 42,
			copiedAt: '2026-11-23T12:00:00.000Z',
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
