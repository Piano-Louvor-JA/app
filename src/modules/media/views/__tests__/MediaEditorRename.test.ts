// @vitest-environment jsdom
// RF-01 (SPEC-crud-comunidade-hub v1.0.0): rename de música no editor.
// Online: PUT updateCustomMusic(id, { name }). Local (id negativo): patch no
// store local. Só o dono edita; oficiais NÃO renomeiam (modo sugestão).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string; user: { id_user: number } }),
	updateCustomMusic: vi.fn(async () => true),
	updateLocalMusic: vi.fn(() => true),
	getLocalMusic: vi.fn(() => null),
	isLocalId: vi.fn((id: number) => id < 0),
	listCustomCollections: vi.fn(async () => []),
	listCustomMusics: vi.fn(async () => []),
}))

vi.mock("@modules/auth/services/firebase-client", () => ({
	getAuthReadiness: vi.fn(async () => null),
	revalidateFirebaseSessionOnBoot: vi.fn(async () => null),
	subscribeFirebaseSession: vi.fn(() => () => {}),
}))

vi.mock("../../services/auth-client", () => ({
	getAuthSession: mocks.getSession,
}))

vi.mock("../../services/custom-catalog", () => ({
	listCustomCollections: mocks.listCustomCollections,
	listCustomMusics: mocks.listCustomMusics,
	createCustomCollection: vi.fn(),
	createCustomMusic: vi.fn(),
	createCustomLyric: vi.fn(),
	updateCustomLyric: vi.fn(),
	updateCustomMusic: mocks.updateCustomMusic,
	updateCustomCollection: vi.fn(),
	deleteCustomCollection: vi.fn(),
	deleteCustomMusic: vi.fn(),
	deleteCustomLyric: vi.fn(),
	uploadCustomFile: vi.fn(),
	audioDataUrlFromBase64: (b64: string) => `data:audio/mpeg;base64,${b64}`,
	customApiUrl: vi.fn((p: string) => `https://api.test/v1/custom${p}`),
	customFileUrl: vi.fn((p: string) => `/files/${p}`),
	addOfficialMusicToCollection: vi.fn(),
	copyCustomMusic: vi.fn(),
	listAllCustomMusics: vi.fn(async () => []),
}))

vi.mock("../../services/local-custom-store", () => ({
	getLocalMusic: mocks.getLocalMusic,
	isLocalId: mocks.isLocalId,
	updateLocalMusic: mocks.updateLocalMusic,
	publishLocalMusic: vi.fn(() => true),
}))

vi.mock("@modules/albums/services/album-music-search", () => ({
	loadAlbumMusicIndex: vi.fn(async () => []),
	filterAlbumMusicIndex: vi.fn(() => []),
}))

vi.mock("../../../shared/services/slja", () => ({
	buildSlja: vi.fn(),
	parseSljaFile: vi.fn(),
}))

vi.mock("../../components/MediaSlideStage.vue", () => ({
	default: { template: '<div class="stage-stub" />' },
}))
vi.mock("../../components/MediaAccountBar.vue", () => ({
	default: { template: '<div class="account-stub" />' },
}))
vi.mock("../../components/PublicationRulesCard.vue", () => ({
	default: { name: "PublicationRulesCard", template: '<div class="pub-rules-stub" />' },
}))
const pushMock = vi.fn().mockResolvedValue(undefined);
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
	useRoute: () => ({ name: "media-editor", path: "/media/editor", query: {}, params: {} }),
}));

vi.mock("@shared/components/AppConfirm.vue", () => ({
	default: { template: '<div class="app-confirm-stub" />' },
}))

import mediaLocale from "../../locales/pt-BR";
import MediaEditorView from "../MediaEditorView.vue";
import { createI18n } from "vue-i18n";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

async function mountEditor() {
	const w = mount(MediaEditorView, {
		global: {
			plugins: [i18n],
			stubs: {
				"v-snackbar": {
					name: "VSnackbar",
					props: ["modelValue"],
					template: '<div class="snackbar-stub"><slot /></div>',
				},
			},
		},
	});
	await flushPromises();
	await flushPromises();
	return w;
}

/** Seleciona uma música da API via estado interno (fetch stubado). */
async function selectRemoteMusic(w: Awaited<ReturnType<typeof mountEditor>>, id: number) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					name: "Hino Renomeável",
					audio_url: null,
					lyrics: [],
				}),
		}),
	)
	const internal = w.vm.$.devtoolsRawSetupState as unknown as {
		onSelectMusic: (id: number) => Promise<void>
	}
	await internal.onSelectMusic(id)
	await flushPromises()
	vi.unstubAllGlobals()
}

function setupOf(w: Awaited<ReturnType<typeof mountEditor>>) {
	return w.vm.$.devtoolsRawSetupState as unknown as {
		selectedCollectionId: { value: number | null }
		selectedMusicId: { value: number | null }
		musicName: { value: string }
		editOfficialId: { value: number | null }
		onRenameMusic: () => Promise<void>
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	localStorage.clear()
	vi.unstubAllGlobals()
	mocks.getSession.mockReturnValue({ token: "tok", user: { id_user: 4 } })
	mocks.updateCustomMusic.mockResolvedValue(true)
	mocks.updateLocalMusic.mockReturnValue(true)
	Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo
})

describe("MediaEditorView — RF-01 rename de música (online)", () => {
	it("somente dono logado vê o campo de rename (sem sessão: input ausente)", async () => {
		mocks.getSession.mockReturnValue(null)
		const w = await mountEditor()
		await selectRemoteMusic(w, 10)
		expect(w.find(".editor__rename-input").exists()).toBe(false)
		w.unmount()
	})

	it("logado: rename chama updateCustomMusic(id, { name }) e atualiza o título", async () => {
		const w = await mountEditor()
		await selectRemoteMusic(w, 10)
		const input = w.find(".editor__rename-input")
		expect(input.exists()).toBe(true)
		await input.setValue("Nome Novo")
		await w.find(".editor__rename-save").trigger("click")
		await flushPromises()
		expect(mocks.updateCustomMusic).toHaveBeenCalledWith(10, { name: "Nome Novo" })
		expect(w.text()).toContain("Nome Novo")
		w.unmount()
	})

	it("nome vazio: não chama a API", async () => {
		const w = await mountEditor()
		await selectRemoteMusic(w, 10)
		await w.find(".editor__rename-input").setValue("   ")
		await w.find(".editor__rename-save").trigger("click")
		await flushPromises()
		expect(mocks.updateCustomMusic).not.toHaveBeenCalled()
		w.unmount()
	})

	it("falha na API: título NÃO muda", async () => {
		mocks.updateCustomMusic.mockResolvedValue(false)
		const w = await mountEditor()
		await selectRemoteMusic(w, 10)
		await w.find(".editor__rename-input").setValue("Novo")
		await w.find(".editor__rename-save").trigger("click")
		await flushPromises()
		expect(w.text()).toContain("Hino Renomeável")
		w.unmount()
	})
})

describe("MediaEditorView — RF-01 rename de música (local)", () => {
	it("música local (id negativo): patch no store local, sem PUT", async () => {
		mocks.getLocalMusic.mockReturnValue({
			id: -8,
			name: "Local Antigo",
			status: "published",
			lyrics: [],
			audioBase64: null,
			officialMusicId: null,
		})
		const w = await mountEditor()
		const s = setupOf(w)
		s.selectedCollectionId.value = 1
		s.selectedMusicId.value = -8
		const internal = w.vm.$.devtoolsRawSetupState as unknown as {
			onSelectMusic: (id: number) => Promise<void>
		}
		await internal.onSelectMusic(-8)
		await flushPromises()
		await w.find(".editor__rename-input").setValue("Local Novo")
		await w.find(".editor__rename-save").trigger("click")
		await flushPromises()
		expect(mocks.updateLocalMusic).toHaveBeenCalledWith(-8, { name: "Local Novo" })
		expect(mocks.updateCustomMusic).not.toHaveBeenCalled()
		expect(w.text()).toContain("Local Novo")
		w.unmount()
	})
})

describe("MediaEditorView — RF-01 rename: música oficial não renomeia", () => {
	it("modo sugestão (editOfficialId): campo de rename ausente", async () => {
		const w = await mountEditor()
		const s = setupOf(w)
		s.selectedMusicId.value = null
		s.editOfficialId.value = 123
		s.musicName.value = "Hino Oficial"
		await flushPromises()
		expect(w.find(".editor__rename-input").exists()).toBe(false)
		w.unmount()
	})
})
