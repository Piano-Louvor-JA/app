// @vitest-environment jsdom
// t_c68a47ac (cover privacy, decisão Rafael 27/11): capa LOCAL (IndexedDB)
// enquanto deslogado; ao autenticar, capa local existente → upload com
// escolha de privacidade (default: privada). app#cover-privacy-upload.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
	getSession: vi.fn((): null | { token: string; user: { id_user: number; email: string; displayName: string } } => null),
	createCustomCollection: vi.fn(async () => ({ id: 9 })),
	updateCustomCollection: vi.fn(async (_id: number, patch: Record<string, unknown>) => ({
		id: _id,
		name: 'Local',
		description: null,
		coverUrl: (patch.cover_url as string) ?? null,
		visibility: 'public',
		musicsCount: 0,
	})),
	listCustomCollections: vi.fn(async () => [] as Array<unknown>),
	uploadCustomFile: vi.fn(async () => ({ idFile: 42, url: '/custom/9/imagens/capa.png' })),
	listLocalCollections: vi.fn(() => [
		{ id: -1, name: 'Local', description: null, coverMediaId: 'local-collection--1-cover' },
	]),
	listLocalMusics: vi.fn(() => []),
	putMedia: vi.fn(async () => true),
	getMedia: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

vi.mock('@modules/media/services/auth-client', () => ({
	getAuthSession: mocks.getSession,
	authHeaders: () => ({}),
}))

vi.mock('../../services/custom-catalog', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../services/custom-catalog')>()
	return {
		...actual,
		createCustomCollection: mocks.createCustomCollection,
		updateCustomCollection: mocks.updateCustomCollection,
		listCustomCollections: mocks.listCustomCollections,
		uploadCustomFile: mocks.uploadCustomFile,
		listCustomMusics: vi.fn(async () => []),
		listAllCustomMusics: vi.fn(async () => []),
		listCustomLyrics: vi.fn(async () => []),
		deleteCustomCollection: vi.fn(),
		deleteCustomMusic: vi.fn(),
		deleteCustomLyric: vi.fn(),
		updateCustomMusic: vi.fn(),
		updateCustomLyric: vi.fn(),
		createCustomMusic: vi.fn(),
		customFileUrl: vi.fn((p: string) => `/files/${p}`),
	}
})

vi.mock('../../services/local-custom-store', () => ({
	isLocalId: (id: number | string) => Number(id) < 0,
	listLocalCollections: mocks.listLocalCollections,
	listLocalMusics: mocks.listLocalMusics,
	createLocalCollection: vi.fn(() => ({ id: -2, name: 'Nova', description: null })),
	createLocalMusic: vi.fn(),
	createLocalLyric: vi.fn(),
	deleteLocalCollection: vi.fn(),
	deleteLocalMusic: vi.fn(),
	deleteLocalLyric: vi.fn(),
	getLocalMusic: vi.fn(() => null),
	updateLocalCollection: vi.fn(() => true),
	updateLocalMusic: vi.fn(() => true),
	updateLocalLyric: vi.fn(() => true),
}))

vi.mock('../../services/local-media-store', () => ({
	putMedia: mocks.putMedia,
	getMedia: mocks.getMedia,
	deleteMedia: vi.fn(),
}))

vi.mock('vue-router', () => ({
	useRoute: () => ({ query: {}, params: {} }),
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
import { authSession } from '../../../auth/services/auth-session-ref'

vi.mock('../../components/MediaSlideStage.vue', () => ({
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
	const wrapper = mount(MediaEditorView, {
		global: {
			stubs: {
				'v-snackbar': {
					name: 'VSnackbar',
					props: ['modelValue'],
					template: '<div class="snackbar-stub"><slot /></div>',
				},
			},
		},
	})
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

describe('t_c68a47ac — capa local deslogado, upload na autenticação', () => {
	it('deslogado: onCoverFile salva capa em IndexedDB (nada sobe)', async () => {
		const wrapper = await mountEditor()
		const st = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			onCoverFile: (e: Event) => Promise<void>
			selectedCollectionId: { value: number | null }
		}
		st.selectedCollectionId.value = -1
		const file = new File([new Uint8Array([1, 2, 3])], 'capa.png', { type: 'image/png' })
		const input = { files: [file], value: 'x' } as unknown as HTMLInputElement
		await st.onCoverFile({ target: input } as Event)
		await flushPromises()

		expect(mocks.putMedia).toHaveBeenCalledWith(
			'local-collection--1-cover',
			expect.any(Uint8Array),
		)
		expect(mocks.uploadCustomFile).not.toHaveBeenCalled()
	})

	it('logado: onCoverFile faz upload + PUT com cover_private default true', async () => {
		mocks.getSession.mockReturnValue({
			token: 'tok',
			user: { id_user: 9, email: 'a@b.c', displayName: 'A' },
		} as never)
		mocks.listLocalCollections.mockReturnValue([])
		const wrapper = await mountEditor()
		const st = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			onCoverFile: (e: Event) => Promise<void>
			selectedCollectionId: { value: number | null }
		}
		st.selectedCollectionId.value = 9
		const file = new File([new Uint8Array([1, 2, 3])], 'capa.png', { type: 'image/png' })
		const input = { files: [file], value: 'x' } as unknown as HTMLInputElement
		await st.onCoverFile({ target: input } as Event)
		await flushPromises()

		expect(mocks.uploadCustomFile).toHaveBeenCalled()
		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(9, {
			cover_url: '/custom/9/imagens/capa.png',
			cover_private: true,
		})
	})

	it('logado: cover local pendente é oferecida → aceitar sobe com privacidade escolhida', async () => {
		mocks.getSession.mockReturnValue(null)
		authSession.value = null
		const wrapper = await mountEditor()
		const st = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			pendingCoverUpload: { value: boolean }
			onConfirmPendingCover: (privacy: 'private' | 'public') => Promise<void>
		}
		// login chega depois do mount (dialog do header muda o ref global)
		// coletânea local com capa fica selecionada antes do login
		// teste 2 sobrescreveu o retorno do mock: restaura a coletânea local com capa
		mocks.listLocalCollections.mockReturnValue([
			{ id: -1, name: 'Local', description: null, coverMediaId: 'local-collection--1-cover' },
		])
		const stSetup = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			selectedCollectionId: { value: number | null }
		}
		stSetup.selectedCollectionId.value = -1
		mocks.getSession.mockReturnValue({
			token: 'tok',
			user: { id_user: 9, email: 'a@b.c', displayName: 'A' },
		} as never)
		authSession.value = {
			token: 'tok',
			user: { id_user: 9, email: 'a@b.c', displayName: 'A' },
		}
		await flushPromises()
		expect(st.pendingCoverUpload.value).toBe(true)
		await st.onConfirmPendingCover('public')
		await flushPromises()
		expect(mocks.getMedia).toHaveBeenCalledWith('local-collection--1-cover')
		expect(mocks.uploadCustomFile).toHaveBeenCalled()
		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(
			expect.any(Number),
			expect.objectContaining({ cover_private: false }),
		)
		authSession.value = null
	})
})
