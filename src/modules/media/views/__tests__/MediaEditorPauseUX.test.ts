// @vitest-environment jsdom
// SPEC-audio-removal v1.2.0 — feedback UX Rafael 14/11: pause NÃO salva o
// timing da estrofe. Pause = só controlar o áudio (iniciar/parar/tocar do
// começo p/ conferir sync). Timing só é gravado via botão "Marcar" explícito.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string }),
	listCustomCollections: vi.fn(async () => []),
}))

vi.mock('@modules/media/services/auth-client', () => ({
	getAuthSession: mocks.getSession,
	authHeaders: () => {},
}))

vi.mock('../../services/custom-catalog', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../services/custom-catalog')>()
	return {
		...actual,
		listCustomCollections: mocks.listCustomCollections,
		listCustomMusics: vi.fn(async () => []),
		listAllCustomMusics: vi.fn(async () => []),
		listCustomLyrics: vi.fn(async () => []),
		deleteCustomCollection: vi.fn(),
		deleteCustomMusic: vi.fn(),
		deleteCustomLyric: vi.fn(),
		updateCustomMusic: vi.fn(async () => true),
		updateCustomLyric: vi.fn(async () => true),
		createCustomMusic: vi.fn(),
		createCustomLyric: vi.fn(),
		createCustomCollection: vi.fn(),
		uploadCustomFile: vi.fn(),
		customFileUrl: vi.fn((p: string) => p),
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
	const wrapper = mount(MediaEditorView, { attachTo: document.body })
	await flushPromises()
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	vi.clearAllMocks()
	localStorage.clear()
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo
})

describe('UX timing: pause não salva; Marcar salva', () => {
	it('onAudioPause NÃO grava timing da estrofe (só alterna isPlaying)', async () => {
		const wrapper = await mountEditor()
		const vm = wrapper.vm as unknown as {
			lyrics: Array<{ time: string | null }>
			isPlaying: boolean
			onAudioPause: () => void
		}
		vm.lyrics = [{ time: null }]
		vm.isPlaying = true
		const updateSpy = vi.spyOn(
			(await import('../../services/custom-catalog')) as never as {
				updateCustomLyric: ReturnType<typeof vi.fn>
			},
			'updateCustomLyric',
		)

		vm.onAudioPause()

		expect(vm.isPlaying).toBe(false)
		expect(vm.lyrics[0]!.time).toBeNull() // nada foi gravado
		expect(updateSpy).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it('onMarkStanzaTime continua gravando (botão Marcar)', async () => {
		const wrapper = await mountEditor()
		const vm = wrapper.vm as unknown as {
			lyrics: Array<{ time: string | null }>
			onMarkStanzaTime: (i: number) => Promise<void>
		}
		vm.lyrics = [{ time: null }]
		// currentTime simulado
		const audioProto = HTMLMediaElement.prototype
		Object.defineProperty(audioProto, 'currentTime', {
			configurable: true,
			get: () => 12.34,
		})
		await vm.onMarkStanzaTime(0)
		expect(vm.lyrics[0]!.time).toBeTruthy()
		wrapper.unmount()
	})
})
