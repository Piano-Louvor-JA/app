// @vitest-environment jsdom
// Toggle de visibilidade no editor (t_35e4d3ea): default PRIVADO na criação,
// regras visíveis ao escolher público, troca persiste via PUT na selecionada.
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

// MediaEditorView importa MUITA coisa (player, áudio). Montar só os pedaços
// testáveis: extraímos o comportamento pra um mini-harness real montando a view
// inteira é pesado/fragil — em vez disso testamos o contrato via stubs leves.
// PESO: MediaEditorView tem ~1500 linhas e APIs de browser (audio/file).
// Estratégia: montar a view com stubs globais pros filhos pesados.
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
vi.mock('../../services/custom-catalog', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../services/custom-catalog')>()
	return {
		...actual,
		createCustomCollection: mocks.createCustomCollection,
		updateCustomCollection: mocks.updateCustomCollection,
		listCustomCollections: mocks.listCustomCollections,
		listCustomMusics: vi.fn(async () => []),
		listCustomLyrics: vi.fn(async () => []),
		deleteCustomCollection: vi.fn(),
		deleteCustomMusic: vi.fn(),
		deleteCustomLyric: vi.fn(),
		updateCustomMusic: vi.fn(),
		updateCustomLyric: vi.fn(),
		createCustomMusic: vi.fn(),
		createCustomLyric: vi.fn(),
		uploadCustomFile: vi.fn(),
		customFileUrl: vi.fn(),
	}
})

async function mountEditor() {
	const wrapper = mount(MediaEditorView)
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

describe('MediaEditorView — toggle de visibilidade (t_35e4d3ea)', () => {
	it('criação: default PRIVADO (primeiro botão ativo, sem rules card)', async () => {
		const wrapper = await mountEditor()
		const groups = wrapper.findAll('.editor__visibility')
		expect(groups.length).toBeGreaterThanOrEqual(1)
		// no estado de criação, o card de regras NÃO aparece (privado default)
		const createGroup = groups[0]!
		const btns = createGroup.findAll('.editor__visibility-btn')
		expect(btns[0]!.classes()).toContain('editor__visibility-btn--active')
		expect(btns[1]!.classes()).not.toContain('editor__visibility-btn--active')
	})

	it('criação: escolher público NÃO polui a sidebar com o card (redesenho anti-poluição)', async () => {
		const wrapper = await mountEditor()
		const createGroup = wrapper.findAll('.editor__visibility')[0]!
		await createGroup.findAll('.editor__visibility-btn')[1]!.trigger('click')
		await flushPromises()
		// card fixo removido da criação (regras agora em modal sob demanda)
		expect(wrapper.findComponent({ name: 'PublicationRulesCard' }).exists()).toBe(
			false,
		)
	})

	it('criação: cria com a visibility escolhida e reseta pra privado depois', async () => {
		const wrapper = await mountEditor()
		const createGroup = wrapper.findAll('.editor__visibility')[0]!
		await createGroup.findAll('.editor__visibility-btn')[1]!.trigger('click') // public
		const input = wrapper.find('input[placeholder="Nova coletânea…"]')
		await input.setValue('Nova')
		await wrapper
			.findAll('.editor__visibility')[0]!
			.findAll('.editor__visibility-btn')[1]!
			.trigger('click')
		// dispara o create (Enter no input)
		await input.trigger('keyup.enter')
		await flushPromises()
		expect(mocks.createCustomCollection).toHaveBeenCalledWith(
			'Nova',
			undefined,
			undefined,
			'public',
		)
		// reset: de volta pra privado
		const btns = wrapper.findAll('.editor__visibility')[0]!.findAll(
			'.editor__visibility-btn',
		)
		expect(btns[0]!.classes()).toContain('editor__visibility-btn--active')
	})
})

describe('MediaEditorView — troca de visibilidade da coletânea selecionada', () => {
	it('coletânea da API: trocar pra público chama updateCustomCollection e mostra regras', async () => {
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
		await flushPromises()
		// selecionar a coletânea na lista
		const item = wrapper.find('.editor__list-item')
		await item.trigger('click')
		await flushPromises()
		// grupos: [0] criação, [1] selecionada
		const groups = wrapper.findAll('.editor__visibility')
		expect(groups.length).toBe(2)
		// ativo atual = private (herdado do summary)
		expect(
			groups[1]!
				.findAll('.editor__visibility-btn')[0]!
				.classes(),
		).toContain('editor__visibility-btn--active')
		// trocar pra público
		await groups[1]!.findAll('.editor__visibility-btn')[1]!.trigger('click')
		await flushPromises()
		expect(mocks.updateCustomCollection).toHaveBeenCalledWith(9, {
			visibility: 'public',
		})
		// card fixo não existe mais na sidebar; virou botão "Ver regras"
		expect(
			wrapper.findAllComponents({ name: 'PublicationRulesCard' }).length,
		).toBe(0)
		expect(wrapper.text()).toContain('media.publishRules.showRules')
		// hint de público visível
		expect(wrapper.text()).toContain('media.visibility.publicHint')
	})

	it('botão "Ver regras" abre o modal com o card e "Entendi" fecha', async () => {
		mocks.listCustomCollections.mockResolvedValue([
			{
				id: 9,
				name: 'API',
				description: null,
				ownerId: 4,
				visibility: 'public',
				musicsCount: 0,
			},
		])
		const wrapper = await mountEditor()
		await flushPromises()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		// abrir pelo botão
		await wrapper.find('.editor__btn--rules').trigger('click')
		await flushPromises()
		// modal teleportado pro body
		const dlg = document.body.querySelector('.rules-dialog')
		expect(dlg).not.toBeNull()
		expect(dlg?.querySelector('.pub-rules')).not.toBeNull()
		// fechar pelo "Entendi"
		const ok = document.body.querySelector(
			'.rules-dialog__ok',
		) as HTMLButtonElement
		ok.click()
		await flushPromises()
		expect(document.body.querySelector('.rules-dialog')).toBeNull()
	})

	it('1ª vez tornando pública: modal abre ANTES de persistir; fechar NÃO troca', async () => {
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
		await flushPromises()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		// localStorage.getItem com valor '' retorna '' !== '1' -> primeira vez
		const selectedGroup = () => wrapper.findAll('.editor__visibility')[1]!
		await selectedGroup()
			.findAll('.editor__visibility-btn')[1]!
			.trigger('click')
		await flushPromises()
		// modal aberto e PUT ainda NAO chamado
		expect(document.body.querySelector('.rules-dialog')).not.toBeNull()
		expect(mocks.updateCustomCollection).not.toHaveBeenCalled()
		// fechar modal sem "confirmar" troca: regra é só informativa;
		// o fechamento marca seen. A troca em si o usuário refaz no toggle.
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
		await flushPromises()
		await wrapper.find('.editor__list-item').trigger('click')
		await flushPromises()
		const selectedGroup = () => wrapper.findAll('.editor__visibility')[1]!
		await selectedGroup()
			.findAll('.editor__visibility-btn')[1]!
			.trigger('click')
		await flushPromises()
		// continua privado (ativo no botão 0)
		expect(
			selectedGroup()
				.findAll('.editor__visibility-btn')[0]!
				.classes(),
		).toContain('editor__visibility-btn--active')
		expect(wrapper.text()).toContain('media.visibility.privateHint')
	})
})
