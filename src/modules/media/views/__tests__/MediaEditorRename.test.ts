// @vitest-environment jsdom
// SPEC v1.2.0 RF-08: o editor tem UI de renomear coletânea (input + botão
// check) visível quando há coletânea selecionada; salvar chama
// updateCustomCollection({ name }) e reflete o nome novo na lista.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useRoute } from 'vue-router'

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string }),
	updateCustomCollection: vi.fn(async () => null),
	listCustomCollections: vi.fn(async () => []),
}))

vi.mock('@modules/media/services/auth-client', () => ({
	getAuthSession: mocks.getSession,
	authHeaders: () => (mocks.getSession() ? { Authorization: 'Bearer tok' } : {}),
}))

vi.mock('../../services/custom-catalog', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../services/custom-catalog')>()
	return {
		...actual,
		updateCustomCollection: mocks.updateCustomCollection,
		listCustomCollections: mocks.listCustomCollections,
		listCustomMusics: vi.fn(async () => []),
		listAllCustomMusics: vi.fn(async () => []),
		listCustomLyrics: vi.fn(async () => []),
		deleteCustomCollection: vi.fn(),
		deleteCustomMusic: vi.fn(),
		deleteCustomLyric: vi.fn(),
		updateCustomMusic: vi.fn(),
		updateCustomLyric: vi.fn(),
		createCustomMusic: vi.fn(),
		createCustomLyric: vi.fn(),
		createCustomCollection: vi.fn(),
		uploadCustomFile: vi.fn(),
		customFileUrl: vi.fn((p: string) => p),
	}
})

vi.mock('vue-router', () => ({
	useRoute: vi.fn(() => ({ query: {}, params: {} })),
	useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
	onBeforeRouteLeave: vi.fn(),
}))
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (k: string) => k,
		locale: { value: 'pt-BR' },
	}),
	createI18n: () => ({ global: { locale: 'pt-BR', t: (k: string) => k } }),
}))

import MediaEditorView from '../MediaEditorView.vue'

vi.mock('../../components/MediaSlideStage.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('../../components/MediaAccountBar.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@shared/components/AppConfirm.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@modules/albums/services/album-music-search', () => ({
	filterAlbumMusicIndex: vi.fn(async () => []),
	loadAlbumMusicIndex: vi.fn(async () => []),
}))
vi.mock('../../../shared/services/slja', () => ({
	buildSlja: vi.fn(),
	parseSljaFile: vi.fn(),
}))

async function mountEditor() {
	const wrapper = mount(MediaEditorView)
	await flushPromises()
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	vi.clearAllMocks()
	localStorage.clear()
	mocks.getSession.mockReturnValue(null)
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo
})

/** Seed: lista mockada com a coletânea local + query param de seleção. */
async function mountWithLocalCollection() {
	localStorage.setItem(
		'louvorja-custom-local-v1',
		JSON.stringify({
			nextCollectionId: -2,
			nextMusicId: -2,
			nextLyricId: -2,
			collections: [{ id: -1, name: 'Velha', description: null, createdAt: '2026-11-14T00:00:00Z' }],
			musics: [],
			lyrics: [],
		}),
	)
	mocks.listCustomCollections.mockResolvedValue([
		{
			id: -1,
			name: 'Velha',
			description: null,
			musicsCount: 0,
			ownerId: null,
			authorName: null,
		},
	])
	vi.mocked(useRoute).mockReturnValue({ query: { collection: '-1' }, params: {} } as never)
	const wrapper = mount(MediaEditorView)
	await flushPromises()
	await flushPromises()
	return wrapper
}

describe('RF-08 renomear coletânea — UI do editor', () => {
	it('com coletânea selecionada, input + botão de rename existem', async () => {
		const wrapper = await mountWithLocalCollection()
		expect(
			wrapper.find('[data-testid="collection-rename-input"]').exists(),
		).toBe(true)
		expect(
			wrapper.find('[data-testid="collection-rename-save"]').exists(),
		).toBe(true)
		wrapper.unmount()
	})

	it('renomear coletânea local: chama updateCustomCollection e atualiza a lista', async () => {
		mocks.listCustomCollections.mockResolvedValue([])
		mocks.updateCustomCollection.mockResolvedValue({
			id: -1,
			name: 'Nome novo',
			description: null,
			musicsCount: 0,
		})

		const wrapper = await mountWithLocalCollection()
		const input = wrapper.find('[data-testid="collection-rename-input"]')
		await input.setValue('Nome novo')
		await wrapper.find('[data-testid="collection-rename-save"]').trigger('click')
		await flushPromises()

		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(-1, { name: 'Nome novo' })
		wrapper.unmount()
	})
})
