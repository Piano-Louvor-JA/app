// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
	createLocalCollection,
	loadLocalDb,
	replaceLocalDb,
} from '../local-custom-store'
import {
	isCommunityCopy,
	listCommunityCopies,
	listManualLocalCollections,
} from '../community-copies'

function seedCommunityCopy(name: string, collectionId: number, copiedAt: string) {
	const c = createLocalCollection(name, undefined, {
		type: 'community',
		collectionId,
		copiedAt,
	})
	return c
}

describe('community-copies (fonte única RF-3/RF-4 — SPEC AC2/AC3)', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it('isCommunityCopy: origin.type community → true; ausente/null → false', () => {
		const copy = seedCommunityCopy('Cópia', 5, '2026-11-23T12:00:00.000Z')
		const manual = createLocalCollection('Manual')
		expect(isCommunityCopy(copy)).toBe(true)
		expect(isCommunityCopy(manual)).toBe(false)
	})

	it('listCommunityCopies ordena copiedAt DESC e só contém cópias', () => {
		const old = seedCommunityCopy('Antiga', 1, '2026-01-01T00:00:00.000Z')
		const recent = seedCommunityCopy('Recente', 2, '2026-11-23T00:00:00.000Z')
		createLocalCollection('Manual')
		const copies = listCommunityCopies()
		expect(copies.map((c) => c.id)).toEqual([recent.id, old.id])
	})

	it('listManualLocalCollections exclui cópias de comunidade (D2)', () => {
		seedCommunityCopy('Cópia', 9, '2026-11-23T12:00:00.000Z')
		const manual = createLocalCollection('Manual')
		expect(listManualLocalCollections().map((c) => c.id)).toEqual([manual.id])
	})

	it('round-trip preserva a classificação (AC4)', () => {
		seedCommunityCopy('Cópia', 3, '2026-11-23T12:00:00.000Z')
		replaceLocalDb(loadLocalDb())
		expect(listCommunityCopies()).toHaveLength(1)
		expect(listManualLocalCollections()).toHaveLength(0)
	})
})
