// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalCollection } from '../local-custom-store'
import { listCustomCollections } from '../custom-catalog'

describe('listCustomCollections exclui cópias da Comunidade (AC2/AC3 — RF-4)', () => {
	beforeEach(() => {
		localStorage.clear()
		vi.unstubAllGlobals()
	})

	it('cópia community NÃO entra; manual entra (fonte da categoria custom)', async () => {
		createLocalCollection('Manual do usuário')
		createLocalCollection('Cópia pública', undefined, {
			type: 'community',
			collectionId: 77,
			copiedAt: '2026-11-23T12:00:00.000Z',
		})
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ data: [] }),
			}) as unknown as Response),
		)
		const all = await listCustomCollections()
		expect(all.map((c) => c.name)).toEqual(['Manual do usuário'])
	})
})
