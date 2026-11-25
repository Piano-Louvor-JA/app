// @vitest-environment jsdom
// SPEC-editor-ux-v1 (frozen 1cf6907): pills de visibilidade saíram da sidebar
// e vivem no menu ⋮ da coletânea (só logado, só coletânea selecionada).
// Form de criação: default privado SEM pills (escolha pública via ⋮ depois).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string }),
	createCustomCollection: vi.fn(async () => ({ id: 9 })),
	updateCustomCollection: vi.fn(async () => null),
	listCustomCollections: vi.fn(async () => []),
}))

vi.mock('@modules/media/services/auth-client', () => ({
	getAuthSession: mocks.getSession,
	authHeaders: (token?: string | null) =>
		token ? { Authorization: `Bearer ${token}` } : {},
}))

vi.mock('../../services/custom-catalog', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../services/custom-catalog')>()
	return {
		...actual,
		createCustomCollection: mocks.createCustomCollection,
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
		uploadCustomFile: vi.fn(),
		customFileUrl: vi.fn((p: string) => `/files/${p}`),
	}
})

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
	mocks.getSession.mockReturnValue({ token: 'tok' } as never)
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo
})

/** Abre o kebab da coletânea selecionada. */
async function openKebab(wrapper: ReturnType<typeof mount>) {
	await wrapper.find('button[data-testid="collection-kebab"]').trigger('click')
	await flushPromises()
}

describe('SPEC editor-ux — criação sem pills (redesenho)', () => {
	it('form de criação: SEM pills de visibilidade; default interno privado', async () => {
		const wrapper = await mountEditor()
		// zero .editor__visibility fora do menu ⋮ (menus fechados no mount)
		expect(wrapper.findAll('.editor__visibility')).toHaveLength(0)
		const st = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			newCollectionVisibility: { value: string }
		}
		expect(st.newCollectionVisibility.value).toBe('private')
	})

	it('cria coletânea com visibility privada (default) e reseta depois', async () => {
		const wrapper = await mountEditor()
		const input = wrapper.find('input[data-testid="new-collection-input"]')
		await input.setValue('Nova')
		await input.trigger('keyup.enter')
		await flushPromises()
		expect(mocks.createCustomCollection).toHaveBeenCalledWith(
			'Nova',
			undefined,
			undefined,
			'private',
		)
		const st = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			newCollectionVisibility: { value: string }
		}
		expect(st.newCollectionVisibility.value).toBe('private')
	})
})

describe('SPEC editor-ux — visibilidade no menu ⋮ (só logado)', () => {
	it('logado: kebab da coletânea selecionada mostra pills; troca chama updateCustomCollection', async () => {
		localStorage.setItem('louvorja.publishRulesSeen', '1') // já viu as regras
		mocks.listCustomCollections.mockResolvedValue([
			{
				id: 9,
				name: 'Minha coletânea API',
				description: null,
				ownerId: 4,
				visibility: 'private',
				musicsCount: 0,
			},
		])
		mocks.updateCustomCollection.mockResolvedValue({
			id: 9,
			name: 'Minha coletânea API',
			description: null,
			visibility: 'public',
			musicsCount: 0,
		})
		const wrapper = await mountEditor()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		await openKebab(wrapper)
		const menu = wrapper.find('[data-testid="collection-kebab-menu"]')
		expect(menu.exists()).toBe(true)
		const pills = menu.findAll('.editor__visibility-btn')
		expect(pills).toHaveLength(2)
		// ativo atual = private (herdado do summary)
		expect(pills[0]!.classes()).toContain('editor__visibility-btn--active')
		// trocar pra público
		await pills[1]!.trigger('click')
		await flushPromises()
		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(9, {
			visibility: 'public',
		})
		// regras agora só via modal (sem botão fixo na sidebar)
		expect(wrapper.findAll('.editor__btn--rules')).toHaveLength(0)
	})

	it('modal de regras abre/fecha (regras só em modal sob demanda)', async () => {
		const wrapper = await mountEditor()
		// modal direto (SPEC: botão fixo removido da sidebar)
		const st = wrapper.vm.$.devtoolsRawSetupState as unknown as {
			rulesOpen: { value: boolean }
		}
		st.rulesOpen.value = true
		await flushPromises()
		const dlg = document.body.querySelector('.rules-dialog')
		expect(dlg).not.toBeNull()
		expect(dlg?.querySelector('.pub-rules')).not.toBeNull()
		const ok = document.body.querySelector('.rules-dialog__ok') as HTMLButtonElement
		ok.click()
		await flushPromises()
		expect(document.body.querySelector('.rules-dialog')).toBeNull()
	})

	it('1ª vez tornando pública: modal abre ANTES de persistir; fechar marca seen', async () => {
		localStorage.setItem('louvorja.publishRulesSeen', '')
		mocks.listCustomCollections.mockResolvedValue([
			{
				id: 9,
				name: 'API',
				description: null,
				ownerId: 4,
				visibility: 'private',
				musicsCount: 0,
			},
		])
		const wrapper = await mountEditor()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		await openKebab(wrapper)
		const menu = () => wrapper.find('[data-testid="collection-kebab-menu"]')
		await menu()
			.findAll('.editor__visibility-btn')[1]!
			.trigger('click')
		await flushPromises()
		// modal aberto e PUT ainda NAO chamado
		expect(document.body.querySelector('.rules-dialog')).not.toBeNull()
		expect(mocks.updateCustomCollection).not.toHaveBeenCalled()
		const ok = document.body.querySelector('.rules-dialog__ok') as HTMLButtonElement
		ok.click()
		await flushPromises()
		expect(localStorage.getItem('louvorja.publishRulesSeen')).toBe('1')
	})

	it('troca falha na API: estado da UI NÃO muda', async () => {
		localStorage.setItem('louvorja.publishRulesSeen', '1') // já viu as regras
		mocks.listCustomCollections.mockResolvedValue([
			{
				id: 9,
				name: 'API',
				description: null,
				ownerId: 4,
				visibility: 'private',
				musicsCount: 0,
			},
		])
		mocks.updateCustomCollection.mockResolvedValue(null)
		const wrapper = await mountEditor()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		await openKebab(wrapper)
		const menu = () => wrapper.find('[data-testid="collection-kebab-menu"]')
		await menu()
			.findAll('.editor__visibility-btn')[1]!
			.trigger('click')
		await flushPromises()
		// continua privado (ativo no botão 0)
		expect(
			menu()
				.findAll('.editor__visibility-btn')[0]!
				.classes(),
		).toContain('editor__visibility-btn--active')
	})

	it('deslogado: kebab SEM pills (AC1 zero UI de rede)', async () => {
		mocks.getSession.mockReturnValue(null)
		mocks.listCustomCollections.mockResolvedValue([
			{ id: 9, name: 'API', description: null, ownerId: 4, visibility: 'public', musicsCount: 0 },
		])
		const wrapper = await mountEditor()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		await openKebab(wrapper)
		await flushPromises()
		expect(wrapper.findAll('.editor__visibility')).toHaveLength(0)
	})
})
