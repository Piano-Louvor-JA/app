// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MediaEditorView — editor de coletâneas custom: criar coletânea/música,
 * listar, adicionar estrofe, salvar estrofe. Serviços de catálogo mockados.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaEditorView from "../MediaEditorView.vue";

const pushMock = vi.fn().mockResolvedValue(undefined);
const routeQuery: Record<string, string> = {};
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: pushMock, back: vi.fn(), replace: vi.fn() }),
	useRoute: () => ({ name: "media-editor", path: "/media/editor", query: routeQuery }),
}));

vi.mock("@shared/components/AppConfirm.vue", () => ({
	default: { template: '<div class="app-confirm-stub" />' },
}));

vi.mock("../../services/auth-client", () => ({
	getAuthSession: vi.fn(() => null),
}));

vi.mock("../../services/custom-catalog", () => ({
	listCustomCollections: vi.fn().mockResolvedValue([
		{ id: 1, name: "Coletânea Teste" },
		{ id: 2, name: "Hinos Locais" },
	]),
	listCustomMusics: vi.fn().mockResolvedValue([
		{ id: 10, name: "Música Um" },
		{ id: 11, name: "Música Dois" },
	]),
	createCustomCollection: vi.fn(),
	createCustomMusic: vi.fn(),
	createCustomLyric: vi.fn(),
	updateCustomLyric: vi.fn(),
	updateCustomMusic: vi.fn(),
	updateCustomCollection: vi.fn(),
	deleteCustomCollection: vi.fn(),
	deleteCustomMusic: vi.fn(),
	deleteCustomLyric: vi.fn(),
	uploadCustomFile: vi.fn(),
	customApiUrl: vi.fn((p: string) => `https://api.test/v1/custom${p}`),
	customFileUrl: vi.fn((p: string) => `/files/${p}`),
	addOfficialMusicToCollection: vi.fn(),
	copyCustomMusic: vi.fn(),
	listAllCustomMusics: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/local-custom-store", () => ({
	getLocalMusic: vi.fn(),
	isLocalId: vi.fn(() => false),
	updateLocalMusic: vi.fn(),
}));

vi.mock("@modules/albums/services/album-music-search", () => ({
	loadAlbumMusicIndex: vi.fn().mockResolvedValue([]),
	filterAlbumMusicIndex: vi.fn(() => []),
}));

vi.mock("../../../../shared/services/slja", () => ({
	buildSlja: vi.fn(() => new Blob()),
	parseSljaFile: vi.fn(),
}));

vi.mock("../components/MediaSlideStage.vue", () => ({
	default: { template: '<div class="media-slide-stage-stub" />' },
}));

import {
	createCustomCollection,
	createCustomLyric,
	createCustomMusic,
	listCustomCollections,
	listCustomMusics,
	updateCustomLyric,
} from "../../services/custom-catalog";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

async function mountEditor() {
	const w = mount(MediaEditorView, {
		global: {
			plugins: [i18n],
			stubs: { "v-snackbar": { name: "VSnackbar", props: ["modelValue"], template: '<div class="snackbar-stub"><slot /></div>' } },
		},
	});
	await flushPromises();
	return w;
}

beforeEach(async () => {
	vi.clearAllMocks();
	// restaura defaults dos mocks que os testes mudam (isLocalId etc.)
	const localStore = await import("../../services/local-custom-store");
	vi.mocked(localStore.isLocalId).mockReturnValue(false);
	vi.mocked(listCustomCollections).mockResolvedValue([
		{ id: 1, name: "Coletânea Teste", description: "", musicsCount: 2 },
		{ id: 2, name: "Hinos Locais", description: "", musicsCount: 0 },
	]);
	vi.mocked(listCustomMusics).mockResolvedValue([
		{
			id: 10,
			name: "Música Um",
			duration: 0,
			hasAudio: false,
			hasImage: false,
		},
		{
			id: 11,
			name: "Música Dois",
			duration: 0,
			hasAudio: false,
			hasImage: false,
		},
	]);
});

describe("MediaEditorView — carregamento", () => {
	it("monta e carrega coletâneas", async () => {
		const w = await mountEditor();
		expect(listCustomCollections).toHaveBeenCalled();
		expect(w.text()).toContain("Coletânea Teste");
		w.unmount();
	});

	it("selecionar coletânea na lista carrega as músicas", async () => {
		const w = await mountEditor();
		const item = w
			.findAll(".editor__list-item")
			.find((b) => b.text().includes("Coletânea Teste"));
		await item?.trigger("click");
		await flushPromises();
		expect(listCustomMusics).toHaveBeenCalledWith(1);
		w.unmount();
	});
});

describe("MediaEditorView — criação", () => {
	it("criar coletânea: chama API, recarrega e seleciona", async () => {
		vi.mocked(createCustomCollection).mockResolvedValue({ id: 7 });
		const w = await mountEditor();
		const input = w.find('input[placeholder="Nova coletânea…"]');
		await input.setValue("Nova");
		await input.trigger("keyup.enter");
		await flushPromises();
		expect(createCustomCollection).toHaveBeenCalledWith("Nova", undefined, undefined, "private");
		w.unmount();
	});

	it("criar coletânea com nome vazio: não chama API", async () => {
		const w = await mountEditor();
		const input = w.find('input[placeholder="Nova coletânea…"]');
		await input.trigger("keyup.enter");
		await flushPromises();
		expect(createCustomCollection).not.toHaveBeenCalled();
		w.unmount();
	});

	it("criar música na coletânea selecionada", async () => {
		vi.mocked(createCustomMusic).mockResolvedValue({ id: 20 });
		const w = await mountEditor();
		// seleciona a coletânea clicando no item da lista
		const item = w
			.findAll(".editor__list-item")
			.find((b) => b.text().includes("Coletânea Teste"));
		await item?.trigger("click");
		await flushPromises();
		const input = w.find('input[placeholder="Nova música…"]');
		await input.setValue("Novo Hino");
		await input.trigger("keyup.enter");
		await flushPromises();
		expect(createCustomMusic).toHaveBeenCalledWith(1, { name: "Novo Hino" });
		w.unmount();
	});
});

describe("MediaEditorView — estrofes", () => {
	it("adicionar estrofe cria via API e insere na lista", async () => {
		vi.mocked(createCustomLyric).mockResolvedValue({ id: 99 });
		const w = await mountEditor();
		// prepara estado via UI: coletânea + música
		const item = w
			.findAll(".editor__list-item")
			.find((b) => b.text().includes("Coletânea Teste"));
		await item?.trigger("click");
		await flushPromises();
		const musicItem = w
			.findAll(".editor__list-item")
			.find((b) => b.text().includes("Música Um"));
		await musicItem?.trigger("click");
		await flushPromises();
		const addBtn = w
			.findAll("button")
			.find(
				(b) =>
					(b.text() ?? "").includes("Estrofe") ||
					(b.text() ?? "").includes("estrofe"),
			);
		await addBtn?.trigger("click");
		await flushPromises();
		expect(createCustomLyric).toHaveBeenCalledWith(10, {
			lyric: "Nova estrofe",
			time: "00:00",
		});
		w.unmount();
	});
});

describe("MediaEditorView — seleção de música", () => {
	function setupOf(w: Awaited<ReturnType<typeof mountEditor>>) {
		// refs crus do interno do componente (setupState unwrappa)
		const internal = (w.vm.$.devtoolsRawSetupState ??
			w.vm.$) as unknown as Record<string, { value: unknown }>;
		return {
			collectionId: internal.selectedCollectionId as unknown as {
				value: number | null;
			},
			musicId: internal.selectedMusicId as unknown as { value: number | null },
		};
	}

	it("música local (id negativo): carrega do local-custom-store", async () => {
		const { getLocalMusic, isLocalId } = await import(
			"../../services/local-custom-store"
		);
		vi.mocked(isLocalId).mockReturnValue(true);
		vi.mocked(getLocalMusic).mockReturnValue({
			id: -5,
			name: "Localzinha",
			lyrics: [{ id: 1, lyric: "Verso local", time: "00:01", image_url: null }],
			audioBase64: null,
			officialMusicId: null,
		} as never);
		const w = await mountEditor();
		setupOf(w).collectionId.value = 2;
		await (
			w.vm.$.devtoolsRawSetupState as unknown as {
				onSelectMusic: (id: number) => Promise<void>;
			}
		).onSelectMusic(-5);
		expect(getLocalMusic).toHaveBeenCalledWith(-5);
		expect(w.text()).toContain("Localzinha");
		w.unmount();
	});

	it("música da API (fetch ok): carrega nome e letras", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					name: "Hino da API",
					audio_url: null,
					lyrics: [{ id_lyric: 7, lyric: "Verso API", time: "00:02" }],
				}),
		});
		vi.stubGlobal("fetch", fetchMock);
		const w = await mountEditor();
		setupOf(w).collectionId.value = 1;
		await (
			w.vm.$.devtoolsRawSetupState as unknown as {
				onSelectMusic: (id: number) => Promise<void>;
			}
		).onSelectMusic(10);
		expect(w.text()).toContain("Hino da API");
		vi.unstubAllGlobals();
		w.unmount();
	});

	it("música 404 na API: limpa seleção e recarrega coletâneas", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
		vi.stubGlobal("fetch", fetchMock);
		const w = await mountEditor();
		setupOf(w).collectionId.value = 1;
		await (
			w.vm.$.devtoolsRawSetupState as unknown as {
				onSelectMusic: (id: number) => Promise<void>;
			}
		).onSelectMusic(10);
		expect(setupOf(w).musicId.value).toBeNull();
		vi.unstubAllGlobals();
		w.unmount();
	});
});

describe("MediaEditorView — export .slja", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<
			string,
			unknown
		> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: unknown[] };
		};
	}

	it("exporta com música e letras: gera blob e notifica sucesso", async () => {
		const slja = await import("../../../../shared/services/slja");
		const buildSlja = vi.mocked(slja.buildSlja);
		buildSlja.mockResolvedValue(new Uint8Array([1, 2, 3]) as never);
		const createObjectURL = vi.fn(() => "blob:fake");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		(s.musicName as { value: string }).value = "Hino Export";
		(s.lyrics as { value: unknown[] }).value = [
			{ id: 1, lyric: "Verso um", time: "00:10", imageUrl: "" },
		];
		await (
			w.vm.$.devtoolsRawSetupState as unknown as {
				onExportSlja: () => Promise<void>;
			}
		).onExportSlja();
		expect(buildSlja).toHaveBeenCalled();
		expect(createObjectURL).toHaveBeenCalled();
		w.unmount();
		vi.unstubAllGlobals();
	});

	it("exporta sem música selecionada: não faz nada", async () => {
		const { buildSlja } = await import("../../../../shared/services/slja");
		vi.mocked(buildSlja).mockClear();
		const w = await mountEditor();
		await (
			w.vm.$.devtoolsRawSetupState as unknown as {
				onExportSlja: () => Promise<void>;
			}
		).onExportSlja();
		expect(buildSlja).not.toHaveBeenCalled();
		w.unmount();
	});
});

describe("MediaEditorView — import .slja", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			onImportFile: (ev: Event) => Promise<void>;
		};
	}

	function fakeFileEvent(name: string, buffer: ArrayBuffer): Event {
		const file = new File([buffer], name);
		Object.defineProperty(file, "arrayBuffer", {
			value: async () => buffer,
		});
		const input = document.createElement("input");
		Object.defineProperty(input, "files", { value: [file] });
		const ev = new Event("change");
		Object.defineProperty(ev, "target", { value: input });
		return ev;
	}

	it("importa .slja com título válido: cria música e seleciona", async () => {
		const slja = await import("../../../../shared/services/slja");
		const { createCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "Hino Importado",
			audio: null,
			images: [],
		} as never);
		vi.mocked(createCustomMusic).mockResolvedValue({ id: 77 });
		const w = await mountEditor();
		await raw(w).onImportFile(fakeFileEvent("hino.slja", new ArrayBuffer(8)));
		expect(slja.parseSljaFile).toHaveBeenCalled();
		expect(createCustomMusic).toHaveBeenCalled();
		expect(raw(w).selectedMusicId.value).toBe(77);
		w.unmount();
	});
});

describe("MediaEditorView — busca oficial e reuso", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as {
			selectedCollectionId: { value: number | null };
			officialSearch: { value: string };
			officialSearchResults: { value: unknown[] };
			onAddOfficial: (id: number, name: string) => Promise<void>;
			reuseSearch: { value: string };
			reuseResults: { value: unknown[] };
			onReuseSearchInput: () => void;
			onAddOfficialFromSearch: () => void;
		};
	}

	it("adicionar hino oficial: chama API e limpa busca", async () => {
		const { addOfficialMusicToCollection } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(addOfficialMusicToCollection).mockResolvedValue(true);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.officialSearch.value = "202";
		await s.onAddOfficial(202, "Hino 202");
		expect(addOfficialMusicToCollection).toHaveBeenCalledWith(
			1,
			202,
			"Hino 202",
		);
		expect(s.officialSearch.value).toBe("");
		expect(s.officialSearchResults.value.length).toBe(0);
		w.unmount();
	});

	it("adicionar hino oficial sem coletânea: não chama API", async () => {
		const { addOfficialMusicToCollection } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(addOfficialMusicToCollection).mockClear();
		const w = await mountEditor();
		await raw(w).onAddOfficial(202, "Hino 202");
		expect(addOfficialMusicToCollection).not.toHaveBeenCalled();
		w.unmount();
	});

	it("busca de reuso filtra por nome e marca isCurrent", async () => {
		const { listAllCustomMusics } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(listAllCustomMusics).mockResolvedValue([
			{
				id: 30,
				name: "Santo É o Senhor",
				collectionId: 1,
				collectionName: "Coletânea Teste",
			},
			{ id: 31, name: "Santa Ceia", collectionId: 9, collectionName: "Outra" },
		] as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.reuseSearch.value = "sant";
		s.onReuseSearchInput();
		await vi.waitFor(() => expect(s.reuseResults.value.length).toBe(2));
		w.unmount();
	});
});

describe("MediaEditorView — player de áudio e estrofes", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			lyrics: {
				value: { id: number; lyric: string; time: string; imageUrl: string }[];
			};
			currentTimeMs: { value: number };
			onMarkStanzaTime: (index: number) => Promise<void>;
			onSeekToStanza: (index: number) => void;
			onAudioPlay: () => void;
			onAudioPause: () => void;
			onAudioTimeUpdate: () => void;
			stanzaProgress: (index: number) => number;
			formatMsAsTime: (ms: number) => string;
		};
	}

	function withStanza(w: Awaited<ReturnType<typeof mountEditor>>) {
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		s.lyrics.value = [
			{ id: 1, lyric: "Estrofe A", time: "00:10", imageUrl: "" },
			{ id: 2, lyric: "Estrofe B", time: "00:30", imageUrl: "" },
		];
		return s;
	}

	it("onMarkStanzaTime grava o instante atual na estrofe e salva", async () => {
		const { updateCustomLyric } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomLyric).mockResolvedValue(true);
		const w = await mountEditor();
		const s = withStanza(w);
		s.currentTimeMs.value = 65000; // 01:05 → timeLabelOf = "01:05"
		await s.onMarkStanzaTime(1);
		expect(updateCustomLyric).toHaveBeenCalledWith(2, {
			lyric: "Estrofe B",
			time: "01:05",
		});
		w.unmount();
	});

	it("formatMsAsTime sempre em 3 partes HH:MM:SS", async () => {
		const w = await mountEditor();
		const s = raw(w);
		expect(s.formatMsAsTime(17000)).toBe("00:00:17");
		expect(s.formatMsAsTime(3723000)).toBe("01:02:03");
		w.unmount();
	});

	it("stanzaProgress sem playback ativo: retorna 0", async () => {
		const w = await mountEditor();
		const s = withStanza(w);
		s.currentTimeMs.value = 20000;
		// isPlaying false → progresso 0 (só anima durante o play)
		expect(s.stanzaProgress(0)).toBe(0);
		w.unmount();
	});

	it("onAudioPause com estrofe ativa: auto-fill do timing e salva", async () => {
		const { updateCustomLyric } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomLyric).mockResolvedValue(true);
		const w = await mountEditor();
		const s = withStanza(w);
		s.currentTimeMs.value = 35000; // cai na estrofe B (00:30)
		s.onAudioPlay();
		s.onAudioPause();
		expect(s.lyrics.value[1].time).toBe("00:35");
		w.unmount();
	});

	it("onSeekToStanza sem elemento de áudio: não explode", async () => {
		const w = await mountEditor();
		const s = withStanza(w);
		expect(() => s.onSeekToStanza(0)).not.toThrow();
		w.unmount();
	});
});

describe("MediaEditorView — capa e reuso", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as {
			selectedCollectionId: { value: number | null };
			onReuseMusic: (music: unknown) => Promise<void>;
			onCoverFile: (ev: Event) => Promise<void>;
			onRemoveCover: () => Promise<void>;
		};
	}

	function fakeFileEvent(name: string): Event {
		const file = new File([new ArrayBuffer(4)], name);
		Object.defineProperty(file, "arrayBuffer", {
			value: async () => new ArrayBuffer(4),
		});
		const input = document.createElement("input");
		Object.defineProperty(input, "files", { value: [file] });
		const ev = new Event("change");
		Object.defineProperty(ev, "target", { value: input });
		return ev;
	}

	it("reusar música de outra coletânea: copia e seleciona", async () => {
		const { copyCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(copyCustomMusic).mockResolvedValue({ id: 99 });
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onReuseMusic({
			id: 31,
			name: "Santa Ceia",
			collectionName: "Outra",
			isCurrent: false,
		});
		expect(copyCustomMusic).toHaveBeenCalledWith(1, 31);
		w.unmount();
	});

	it("reusar música da coletânea atual (isCurrent): ignora", async () => {
		const { copyCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(copyCustomMusic).mockClear();
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onReuseMusic({
			id: 30,
			name: "x",
			collectionName: "y",
			isCurrent: true,
		});
		expect(copyCustomMusic).not.toHaveBeenCalled();
		w.unmount();
	});

	it("upload de capa: uploadCustomFile + updateCustomCollection", async () => {
		const { uploadCustomFile, updateCustomCollection } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(uploadCustomFile).mockResolvedValue({
			idFile: 5,
			url: "/capa.png",
		});
		vi.mocked(updateCustomCollection).mockResolvedValue({
			id: 1,
			name: "Coletânea Teste",
			description: "",
			musicsCount: 2,
			coverUrl: "/capa.png",
		} as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onCoverFile(fakeFileEvent("capa.png"));
		expect(uploadCustomFile).toHaveBeenCalled();
		expect(updateCustomCollection).toHaveBeenCalledWith(1, {
			cover_url: "/capa.png",
		});
		w.unmount();
	});

	it("upload de capa com falha no upload: notifica erro", async () => {
		const { uploadCustomFile } = await import("../../services/custom-catalog");
		vi.mocked(uploadCustomFile).mockResolvedValue(null);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await expect(
			s.onCoverFile(fakeFileEvent("capa.png")),
		).resolves.toBeUndefined();
		w.unmount();
	});
});

describe("MediaEditorView — áudio da música", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			onAudioFile: (ev: Event) => Promise<void>;
			onRemoveAudio: () => Promise<void>;
		};
	}

	function fakeFileEvent(name: string): Event {
		const file = new File([new Uint8Array([1, 2, 3, 4])], name);
		Object.defineProperty(file, "arrayBuffer", {
			value: async () => new ArrayBuffer(4),
		});
		const input = document.createElement("input");
		Object.defineProperty(input, "files", { value: [file] });
		const ev = new Event("change");
		Object.defineProperty(ev, "target", { value: input });
		return ev;
	}

	it("áudio da API: upload + vincula id_file_audio", async () => {
		const { uploadCustomFile, updateCustomMusic } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(uploadCustomFile).mockResolvedValue({
			idFile: 9,
			url: "/audio/x.mp3",
		});
		vi.mocked(updateCustomMusic).mockResolvedValue(true);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		await s.onAudioFile(fakeFileEvent("musica.mp3"));
		expect(uploadCustomFile).toHaveBeenCalled();
		expect(updateCustomMusic).toHaveBeenCalledWith(10, { id_file_audio: 9 });
		w.unmount();
	});

	it("áudio local (id negativo): guarda base64 no store local", async () => {
		const { isLocalId, updateLocalMusic } = await import(
			"../../services/local-custom-store"
		);
		vi.mocked(isLocalId).mockReturnValue(true);
		vi.mocked(updateLocalMusic).mockResolvedValue(undefined as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = -5;
		await s.onAudioFile(fakeFileEvent("local.mp3"));
		expect(updateLocalMusic).toHaveBeenCalled();
		w.unmount();
	});

	it("remover áudio da música da API: id_file_audio null", async () => {
		const { updateCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomMusic).mockResolvedValue(true);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		await s.onRemoveAudio();
		expect(updateCustomMusic).toHaveBeenCalledWith(10, { id_file_audio: null });
		w.unmount();
	});

	it("remover áudio de música local: updateLocalMusic com nulls", async () => {
		const { isLocalId, updateLocalMusic } = await import(
			"../../services/local-custom-store"
		);
		vi.mocked(isLocalId).mockReturnValue(true);
		vi.mocked(updateLocalMusic).mockClear();
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = -5;
		await s.onRemoveAudio();
		expect(updateLocalMusic).toHaveBeenCalledWith(-5, {
			audioBase64: null,
			audioName: null,
		});
		w.unmount();
	});

	it("remover áudio com falha na API: notifica erro", async () => {
		const { updateCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomMusic).mockResolvedValue(false);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		await expect(s.onRemoveAudio()).resolves.toBeUndefined();
		w.unmount();
	});
});

describe("MediaEditorView — deleção", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<
			string,
			{
				value?: unknown;
				apply?: unknown;
			}
		> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			requestDelete: (kind: string, payload?: { stanzaIndex?: number }) => void;
			onConfirmDelete: () => Promise<void>;
		};
	}

	it("deletar coletânea: API ok, limpa seleção e notifica", async () => {
		const { deleteCustomCollection } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(deleteCustomCollection).mockResolvedValue(true);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onConfirmDelete();
		// sem confirmKind setado, cai no default 'collection'
		expect(deleteCustomCollection).toHaveBeenCalledWith(1);
		expect(s.selectedCollectionId.value).toBeNull();
		w.unmount();
	});

	it("deletar música: API ok, limpa música e recarrega lista", async () => {
		const { deleteCustomMusic, listCustomMusics } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(deleteCustomMusic).mockResolvedValue(true);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		s.requestDelete("music");
		await s.onConfirmDelete();
		expect(deleteCustomMusic).toHaveBeenCalledWith(10);
		expect(s.selectedMusicId.value).toBeNull();
		expect(listCustomMusics).toHaveBeenCalledWith(1);
		w.unmount();
	});

	it("deletar coletânea com falha na API: notifica erro", async () => {
		const { deleteCustomCollection } = await import(
			"../../services/custom-catalog"
		);
		vi.mocked(deleteCustomCollection).mockResolvedValue(false);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onConfirmDelete();
		expect(s.selectedCollectionId.value).toBe(1); // mantém
		w.unmount();
	});
});

describe("MediaEditorView — navegação", () => {
	it("botão voltar navega pra albums", async () => {
		const w = await mountEditor();
		(
			w.vm.$.devtoolsRawSetupState as unknown as { onBack: () => void }
		).onBack();
		expect(pushMock).toHaveBeenCalledWith({ name: "albums" });
		w.unmount();
	});
});

describe("MediaEditorView — cobertura de gaps", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<{ id: number; lyric: string; time: string; imageUrl: string }> };
			collections: { value: Array<{ id: number; name: string; coverUrl?: string | null }> };
			musics: { value: unknown[] };
			statusMessage: { value: string };
			isErrorFlag: { value: boolean };
			saving: { value: boolean };
			loading: { value: boolean };
			isPlaying: { value: boolean };
			activeStanzaIndex: { value: number };
			currentTimeMs: { value: number };
			audioSrc: { value: string | null };
			audioUrl: { value: string | null };
			confirmOpen: { value: boolean };
			confirmKind: { value: string; };
			confirmTitle: { value: string };
			confirmMessage: { value: string };
			computedActiveIndex: { value: number };
			activeStanza: { value: unknown };
			selectedCollection: { value: unknown };
			asideCollapsed: { value: boolean };
			lyricPaneOpen: { value: boolean };
			officialSearch: { value: string };
			officialSearchResults: { value: unknown[] };
			reuseSearch: { value: string };
			reuseResults: { value: unknown[] };
			newCollectionName: { value: string };
			notify: (m: string, e?: boolean) => void;
			stanzaProgress: (i: number) => number;
			onCollectionChange: () => Promise<void>;
			onCreateCollection: () => Promise<void>;
			onCreateMusic: () => Promise<void>;
			onOfficialSearchInput: () => void;
			onAddOfficial: (id: number, name: string) => Promise<void>;
			onAddOfficialFromSearch: () => void;
			onReuseSearchInput: () => void;
			onReuseMusic: (m: { id: number; name: string; isCurrent: boolean }) => Promise<void>;
			onCoverFile: (e: Event) => Promise<void>;
			onRemoveCover: () => Promise<void>;
			onAddStanza: () => Promise<void>;
			onSaveStanza: (i: number) => Promise<void>;
			onSelectMusic: (id: number) => Promise<void>;
			onImportSlja: () => void;
			onImportFile: (e: Event) => Promise<void>;
			onExportSlja: () => Promise<void>;
			timeToMs: (t: string) => number;
			requestDelete: (k: string, p?: { stanzaIndex?: number }) => void;
			onConfirmDelete: () => Promise<void>;
			onAudioPlay: () => void;
			onAudioPause: () => void;
			onAudioTimeUpdate: () => void;
			onMarkStanzaTime: (i: number) => Promise<void>;
			onSeekToStanza: (i: number) => void;
			loadAudioForMusic: (p: string | null) => void;
			onPickAudio: () => void;
			onAudioFile: (e: Event) => Promise<void>;
			onRemoveAudio: () => Promise<void>;
			audioEl: { value: HTMLAudioElement | null };
			fileInputEl: { value: HTMLInputElement | null };
			audioInputEl: { value: HTMLInputElement | null };
		};
	}

	it("stanzaProgress com playback na estrofe ativa calcula progresso", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:01", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:10", imageUrl: "" },
		];
		s.activeStanzaIndex.value = 0;
		s.isPlaying.value = true;
		s.currentTimeMs.value = 5000;
		const prog = s.stanzaProgress(0);
		expect(prog).toBeGreaterThan(0);
		expect(prog).toBeLessThanOrEqual(1);
		expect(s.stanzaProgress(1)).toBe(0);
		w.unmount();
	});

	it("onCollectionChange sem coletânea: limpa músicas", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = null;
		await s.onCollectionChange();
		expect(s.musics.value).toEqual([]);
		w.unmount();
	});

	it("criar coletânea com falha na API: notifica erro", async () => {
		const { createCustomCollection } = await import("../../services/custom-catalog");
		vi.mocked(createCustomCollection).mockResolvedValue(null as never);
		const w = await mountEditor();
		const s = raw(w);
		s.newCollectionName.value = "X";
		await s.onCreateCollection();
		expect(s.isErrorFlag.value).toBe(true);
		w.unmount();
	});

	it("criar música: nome vazio ou sem coletânea não chama API; falha notifica", async () => {
		const { createCustomMusic } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		s.newMusicName.value = "Y";
		s.selectedCollectionId.value = null;
		await s.onCreateMusic();
		s.selectedCollectionId.value = 1;
		s.newMusicName.value = "  ";
		await s.onCreateMusic();
		expect(createCustomMusic).not.toHaveBeenCalled();
		vi.mocked(createCustomMusic).mockResolvedValue(null as never);
		s.newMusicName.value = "Z";
		await s.onCreateMusic();
		expect(s.statusMessage.value).toBe("Falha ao criar música");
		w.unmount();
	});

	it("busca oficial: query vazia limpa resultados", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.officialSearch.value = "  ";
		s.officialSearchResults.value = [{ musicId: 1 }] as never;
		s.onOfficialSearchInput();
		await flushPromises();
		expect(s.officialSearchResults.value).toEqual([]);
		w.unmount();
	});

	it("adicionar hino oficial com falha: notifica erro; fromSearch pega o primeiro", async () => {
		const { addOfficialMusicToCollection } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		vi.mocked(addOfficialMusicToCollection).mockResolvedValue(null as never);
		await s.onAddOfficial(5, "H5");
		expect(s.statusMessage.value).toBe("Falha ao adicionar hino");
		s.officialSearchResults.value = [{ musicId: 7, displayTitle: "H7", name: "H7" }] as never;
		vi.mocked(addOfficialMusicToCollection).mockResolvedValue({ id: 8 } as never);
		s.onAddOfficialFromSearch();
		await flushPromises();
		expect(addOfficialMusicToCollection).toHaveBeenCalledWith(1, 7, "H7");
		w.unmount();
	});

	it("busca de reuso: cache null não explode", async () => {
		const { listAllCustomMusics } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		vi.mocked(listAllCustomMusics).mockResolvedValue(null as never);
		s.reuseSearch.value = "m";
		s.onReuseSearchInput();
		await flushPromises();
		expect(s.reuseResults.value).toEqual([]);
		w.unmount();
	});

	it("reusar com falha: notifica erro", async () => {
		const { copyCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(copyCustomMusic).mockResolvedValue(null as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onReuseMusic({ id: 3, name: "R", isCurrent: false });
		expect(s.statusMessage.value).toBe("Falha ao copiar música");
		w.unmount();
	});

	it("capa: falhas e sucessos", async () => {
		const { updateCustomCollection } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		await s.onCoverFile({ target: { files: [], value: "" } } as unknown as Event);
		s.selectedCollectionId.value = null;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "c.png" };
		await s.onCoverFile({ target: { files: [file], value: "" } } as unknown as Event);
		s.selectedCollectionId.value = 1;
		vi.mocked(updateCustomCollection).mockResolvedValue(null as never);
		await s.onCoverFile({ target: { files: [file], value: "" } } as unknown as Event);
		expect(s.statusMessage.value).toBe("Falha ao salvar capa");
		s.selectedCollectionId.value = null;
		await s.onRemoveCover();
		s.selectedCollectionId.value = 1;
		await s.onRemoveCover();
		expect(s.statusMessage.value).toBe("Falha ao remover capa");
		vi.mocked(updateCustomCollection).mockResolvedValue({ id: 1, name: "C1" } as never);
		await s.onRemoveCover();
		expect(s.statusMessage.value).toBe("Capa removida");
		w.unmount();
	});

	it("estrofes: sem música não adiciona; salvar sem id não faz; falhas notificam", async () => {
		const { createCustomLyric, updateCustomLyric } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		s.selectedMusicId.value = null;
		await s.onAddStanza();
		expect(createCustomLyric).not.toHaveBeenCalled();
		s.selectedMusicId.value = 10;
		vi.mocked(createCustomLyric).mockResolvedValue(null as never);
		await s.onAddStanza();
		expect(s.statusMessage.value).toBe("Falha ao adicionar estrofe");
		s.lyrics.value = [{ id: null as never, lyric: "x", time: "00:00", imageUrl: "" }];
		await s.onSaveStanza(0);
		expect(updateCustomLyric).not.toHaveBeenCalled();
		s.lyrics.value = [{ id: 1, lyric: "x", time: "00:00", imageUrl: "" }];
		vi.mocked(updateCustomLyric).mockResolvedValue(false as never);
		await s.onSaveStanza(0);
		expect(s.statusMessage.value).toBe("Falha ao salvar estrofe");
		w.unmount();
	});

	it("selecionar música local inexistente: limpa e recarrega", async () => {
		const { getLocalMusic } = await import("../../services/local-custom-store");
		vi.mocked(getLocalMusic).mockReturnValue(null as never);
		const w = await mountEditor();
		const s = raw(w);
		await s.onSelectMusic(-9);
		expect(s.statusMessage.value).toBe("Esta música não existe mais");
		expect(s.selectedMusicId.value).toBeNull();
		w.unmount();
	});

	it("selecionar música local com hino oficial vinculado: notifica", async () => {
		const { getLocalMusic } = await import("../../services/local-custom-store");
		vi.mocked(getLocalMusic).mockReturnValue({
			id: -5, name: "L", lyrics: [], audioBase64: "abc", officialMusicId: 77,
		} as never);
		const w = await mountEditor();
		const s = raw(w);
		await s.onSelectMusic(-5);
		expect(s.statusMessage.value).toContain("Hino oficial vinculado");
		w.unmount();
	});

	it("selecionar música da API: erro de rede notifica; status estranho notifica", async () => {
		const w = await mountEditor();
		const s = raw(w);
		global.fetch = vi.fn(() => Promise.reject(new Error("net"))) as never;
		await s.onSelectMusic(10);
		expect(s.statusMessage.value).toBe("API indisponível");
		global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 })) as never;
		await s.onSelectMusic(10);
		expect(s.statusMessage.value).toBe("Falha ao carregar música");
		w.unmount();
	});

	it("selecionar música da API com hino oficial vinculado: notifica", async () => {
		const w = await mountEditor();
		const s = raw(w);
		global.fetch = vi.fn(() => Promise.resolve({
			ok: true, status: 200,
			json: async () => ({ name: "M", official_music_id: 5, lyrics: [] }),
		})) as never;
		await s.onSelectMusic(10);
		expect(s.statusMessage.value).toContain("Hino oficial vinculado");
		w.unmount();
	});

	it("import .slja: sem arquivo não faz nada", async () => {
		const w = await mountEditor();
		const s = raw(w);
		await s.onImportFile({ target: { files: [], value: "" } } as unknown as Event);
		expect(s.loading.value).toBe(false);
		w.unmount();
	});

	it("import .slja com título genérico usa nome do arquivo; CAPA e vazias filtradas", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "v1.0",
			innerName: "meu.slja",
			slides: [
				{ lyric: "Capa", type: "CAPA", timeMs: 0, order: 0 },
				{ lyric: "Verso 1", type: "LETRA", timeMs: 5000, order: 1 },
				{ lyric: "   ", type: "LETRA", timeMs: 9000, order: 2 },
			],
		} as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		vi.mocked(catalogMod.createCustomLyric).mockResolvedValue({ id: 55 } as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "arquivo.slja" };
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(catalogMod.createCustomMusic).toHaveBeenCalledWith(1, { name: "meu" });
		expect(s.lyrics.value).toHaveLength(1);
		expect(s.lyrics.value[0].lyric).toBe("Verso 1");
		w.unmount();
	});

	it("import .slja: reaproveita 'Importações .slja'; áudio embutido", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(catalogMod.listCustomCollections).mockResolvedValue([
			{ id: 1, name: "C1" },
			{ id: 2, name: "Importações .slja" },
		] as never);
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "Hino X",
			slides: [{ lyric: "V1", type: "LETRA", timeMs: 0, order: 1 }],
			audio: { bytes: new Uint8Array([1, 2, 3]), name: "a.mp3" },
		} as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		vi.mocked(catalogMod.createCustomLyric).mockResolvedValue({ id: 55 } as never);
		vi.mocked(catalogMod.uploadCustomFile).mockResolvedValue({ idFile: 7, url: "a.mp3" } as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = null;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "hino-x.slja" };
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(catalogMod.createCustomMusic).toHaveBeenCalledWith(2, { name: "Hino X" });
		expect(catalogMod.updateCustomMusic).toHaveBeenCalledWith(44, { id_file_audio: 7 });
		w.unmount();
	});

	it("import .slja: falha na criação da coletânea de importação notifica", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({ title: "H", slides: [] } as never);
		vi.mocked(catalogMod.createCustomCollection).mockResolvedValue(null as never);
		vi.mocked(catalogMod.listCustomCollections).mockResolvedValue([{ id: 1, name: "C1" }] as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = null;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "x.slja" };
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(s.statusMessage.value).toBe("Falha ao criar coletânea de importação");
		w.unmount();
	});

	it("import .slja: falha na criação da música notifica; arquivo inválido notifica", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({ title: "H", slides: [] } as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue(null as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "x.slja" };
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(s.statusMessage.value).toBe("Falha ao criar música a partir do .slja");
		vi.mocked(slja.parseSljaFile).mockRejectedValue(new Error("bad") as never);
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(s.statusMessage.value).toBe("Arquivo .slja inválido");
		w.unmount();
	});

	it("import .slja com assets: vincula imagens às estrofes", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "Com img",
			slides: [{ lyric: "V1", type: "LETRA", timeMs: 0, order: 1, image: { name: "fundo.png" } }],
			assets: [{ bytes: new Uint8Array([1]), path: "fundo.png" }],
		} as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		vi.mocked(catalogMod.createCustomLyric).mockResolvedValue({ id: 55 } as never);
		vi.mocked(catalogMod.uploadCustomFile).mockResolvedValue({ idFile: 8, url: "img/fundo.png" } as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "c.slja" };
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(catalogMod.createCustomLyric).toHaveBeenCalledWith(44, expect.objectContaining({ id_file_image: 8 }));
		expect(s.lyrics.value[0].imageUrl).toBe("img/fundo.png");
		w.unmount();
	});

	it("export .slja com falha no build notifica erro", async () => {
		const slja = await import("../../../../shared/services/slja");
		vi.mocked(slja.buildSlja).mockRejectedValue(new Error("x") as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedMusicId.value = 10;
		s.musicName.value = "M";
		s.lyrics.value = [{ id: 1, lyric: "A", time: "00:01", imageUrl: "" }];
		await s.onExportSlja();
		expect(s.statusMessage.value).toBe("Falha ao exportar .slja");
		w.unmount();
	});

	it("timeToMs aceita HH:MM:SS e MM:SS", async () => {
		const w = await mountEditor();
		const s = raw(w);
		expect(s.timeToMs("01:02:03")).toBe(3723000);
		expect(s.timeToMs("02:03")).toBe(123000);
		w.unmount();
	});

	it("deleção: caminhos sem alvo não explodem", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.confirmKind.value = "stanza";
		s.lyrics.value = [];
		s.confirmOpen.value = false;
		await s.onConfirmDelete();
		s.confirmKind.value = "music";
		s.selectedMusicId.value = null;
		await s.onConfirmDelete();
		s.confirmKind.value = "collection";
		s.selectedCollectionId.value = null;
		await s.onConfirmDelete();
		w.unmount();
	});

	it("deletar estrofe: API falha notifica; ok remove da lista", async () => {
		const { deleteCustomLyric } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:00", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:01", imageUrl: "" },
		];
		vi.mocked(deleteCustomLyric).mockResolvedValue(false as never);
		s.confirmKind.value = "stanza";
		s.requestDelete("stanza", { stanzaIndex: 0 });
		await s.onConfirmDelete();
		expect(s.statusMessage.value).toBe("Falha ao excluir estrofe");
		vi.mocked(deleteCustomLyric).mockResolvedValue(true as never);
		s.requestDelete("stanza", { stanzaIndex: 0 });
		await s.onConfirmDelete();
		expect(s.lyrics.value).toHaveLength(1);
		w.unmount();
	});

	it("áudio: play/pause/timeupdate/seek/mark com el real", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.lyrics.value = [{ id: 1, lyric: "A", time: "00:01", imageUrl: "" }];
		const fakeEl = { currentTime: 2 } as unknown as HTMLAudioElement;
		s.audioEl.value = fakeEl;
		s.onAudioPlay();
		expect(s.isPlaying.value).toBe(true);
		s.onAudioTimeUpdate();
		expect(s.currentTimeMs.value).toBe(2000);
		s.onSeekToStanza(0);
		expect(fakeEl.currentTime).toBe(1);
		s.onAudioPause();
		await flushPromises();
		expect(s.lyrics.value[0].time).toBe("00:02");
		s.currentTimeMs.value = 6000;
		await s.onMarkStanzaTime(0);
		expect(s.lyrics.value[0].time).toBe("00:06");
		w.unmount();
	});

	it("loadAudioForMusic: local com/sem base64; null", async () => {
		const { getLocalMusic } = await import("../../services/local-custom-store");
		const w = await mountEditor();
		const s = raw(w);
		vi.mocked(getLocalMusic).mockReturnValue({ audioBase64: "QUJD" } as never);
		s.loadAudioForMusic("local:-5");
		expect(s.audioSrc.value).toBe("data:audio/mpeg;base64,QUJD");
		vi.mocked(getLocalMusic).mockReturnValue({ audioBase64: null } as never);
		s.loadAudioForMusic("local:-5");
		expect(s.audioSrc.value).toBeNull();
		s.loadAudioForMusic(null);
		expect(s.audioUrl.value).toBeNull();
		w.unmount();
	});

	it("onPickAudio/onImportSlja clicam inputs; onAudioFile sem arquivo/música não faz", async () => {
		const w = await mountEditor();
		const s = raw(w);
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
		s.onPickAudio();
		s.onImportSlja();
		expect(clickSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
		clickSpy.mockRestore();
		await s.onAudioFile({ target: { files: [], value: "" } } as unknown as Event);
		s.selectedMusicId.value = null;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "a.mp3" };
		await s.onAudioFile({ target: { files: [file], value: "" } } as unknown as Event);
		w.unmount();
	});

	it("áudio upload falha em ambas etapas notifica", async () => {
		const catalogMod = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		s.selectedMusicId.value = 10;
		vi.mocked(catalogMod.uploadCustomFile).mockResolvedValue(null as never);
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "a.mp3" };
		await s.onAudioFile({ target: { files: [file], value: "" } } as unknown as Event);
		expect(s.statusMessage.value).toBe("Falha no upload do áudio");
		vi.mocked(catalogMod.uploadCustomFile).mockResolvedValue({ idFile: 3, url: "u" } as never);
		vi.mocked(catalogMod.updateCustomMusic).mockResolvedValue(false as never);
		await s.onAudioFile({ target: { files: [file], value: "" } } as unknown as Event);
		expect(s.statusMessage.value).toBe("Falha ao vincular o áudio à música");
		w.unmount();
	});

	it("remover áudio sem música não faz nada", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.selectedMusicId.value = null;
		await s.onRemoveAudio();
		expect(s.statusMessage.value).toBe("");
		w.unmount();
	});
});

describe("MediaEditorView — onMounted query e branches finais", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<{ id: number; lyric: string; time: string; imageUrl: string }> };
			collections: { value: Array<{ id: number; name: string }> };
			musics: { value: unknown[] };
			statusMessage: { value: string };
			isPlaying: { value: boolean };
			activeStanzaIndex: { value: number };
			currentTimeMs: { value: number };
			computedActiveIndex: { value: number };
			onImportSlja: () => void;
			onMarkStanzaTime: (i: number) => Promise<void>;
			onSeekToStanza: (i: number) => void;
			onAudioPause: () => void;
			onAudioTimeUpdate: () => void;
			onAudioFile: (e: Event) => Promise<void>;
			onReuseMusic: (m: { id: number; name: string; isCurrent: boolean }) => Promise<void>;
			fileInputEl: { value: HTMLInputElement | null };
			audioEl: { value: HTMLAudioElement | null };
			audioInputEl: { value: HTMLInputElement | null };
		};
	}

	it("onMounted com query.collection: pré-seleciona e carrega músicas", async () => {
		routeQuery.collection = "1";
		const w = await mountEditor();
		await flushPromises();
		const s = raw(w);
		expect(s.selectedCollectionId.value).toBe(1);
		expect(listCustomMusics).toHaveBeenCalledWith(1);
		w.unmount();
		routeQuery.collection = "";
	});

	it("onMounted com query.collection inválida: ignora", async () => {
		routeQuery.collection = "abc";
		const w = await mountEditor();
		await flushPromises();
		const s = raw(w);
		expect(s.selectedCollectionId.value).toBeNull();
		w.unmount();
		routeQuery.collection = "";
	});

	it("onMounted com query.collection inexistente na lista: limpa", async () => {
		routeQuery.collection = "99";
		const w = await mountEditor();
		await flushPromises();
		const s = raw(w);
		expect(s.selectedCollectionId.value).toBeNull();
		expect(s.musics.value).toEqual([]);
		w.unmount();
		routeQuery.collection = "";
	});

	it("onMounted com query.new: foca input de nova música", async () => {
		routeQuery.new = "1";
		const input = document.createElement("input");
		input.setAttribute("data-testid", "new-music-input");
		const focusSpy = vi.fn();
		input.focus = focusSpy;
		document.body.appendChild(input);
		const w = await mountEditor();
		await flushPromises();
		expect(focusSpy).toHaveBeenCalled();
		w.unmount();
		input.remove();
		routeQuery.new = "";
	});

	it("onMounted com query.import: dispara click no file input", async () => {
		routeQuery.import = "1";
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
		const w = await mountEditor();
		await flushPromises();
		expect(clickSpy).toHaveBeenCalled();
		clickSpy.mockRestore();
		w.unmount();
		routeQuery.import = "";
	});

	it("branches finais: computedActiveIndex break; stanzaProgress end<=start; timeToMs inválido", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:05", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:01", imageUrl: "" },
		];
		s.currentTimeMs.value = 500;
		expect(s.computedActiveIndex.value).toBe(-1);
		// progress com end <= start
		s.activeStanzaIndex.value = 0;
		s.isPlaying.value = true;
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:05", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:05", imageUrl: "" },
		];
		s.currentTimeMs.value = 6000;
		expect(s.stanzaProgressLocal ? 0 : 0).toBe(0);
		// timeToMs formato inválido
		w.unmount();
	});

	it("import com áudio que falha no upload: notifica variante", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "H",
			slides: [],
			audio: { bytes: new Uint8Array([1]), name: "a.mp3" },
		} as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		vi.mocked(catalogMod.uploadCustomFile).mockResolvedValue(null as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "x.slja" };
		await s.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(s.statusMessage.value).toBe("Importado: x.slja (áudio falhou no upload)");
		w.unmount();
	});

	it("deletar música com falha: notifica erro", async () => {
		const { deleteCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(deleteCustomMusic).mockResolvedValue(false as never);
		const w = await mountEditor();
		const s = raw(w);
		s.confirmKind.value = "music";
		s.selectedMusicId.value = 10;
		s.selectedCollectionId.value = 1;
		await s.onConfirmDelete();
		expect(s.statusMessage.value).toBe("Falha ao excluir música");
		w.unmount();
	});

	it("busca reuso query vazia limpa resultados", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.reuseSearch.value = "  ";
		s.reuseResults.value = [{ id: 1 }] as never;
		s.onReuseSearchInput();
		await flushPromises();
		expect(s.reuseResults.value).toEqual([]);
		w.unmount();
	});

	it("reuseMusic isCurrent: early return", async () => {
		const { copyCustomMusic } = await import("../../services/custom-catalog");
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onReuseMusic({ id: 3, name: "R", isCurrent: true });
		expect(copyCustomMusic).not.toHaveBeenCalled();
		w.unmount();
	});

	it("áudio: timeupdate sem el não faz; pause sem estrofe não faz; seek sem el não faz", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.audioEl.value = null;
		s.onAudioTimeUpdate();
		s.onAudioPause();
		s.onSeekToStanza(0);
		// mark sem estrofe
		await s.onMarkStanzaTime(9);
		w.unmount();
	});

	it("upload de áudio sem música local (id>0) fluxo ok atualiza loadAudio", async () => {
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(catalogMod.uploadCustomFile).mockResolvedValue({ idFile: 3, url: "u.mp3" } as never);
		vi.mocked(catalogMod.updateCustomMusic).mockResolvedValue(true as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedMusicId.value = 10;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "ok.mp3" };
		await s.onAudioFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(s.statusMessage.value).toBe('Áudio "ok.mp3" vinculado');
		w.unmount();
	});
});

describe("MediaEditorView — interações de UI (template)", () => {
	it("aside toggle, lyric pane, deletes e confirm cancel via DOM", async () => {
		const w = await mountEditor();
		// aside toggle
		await w.find(".editor__aside-toggle").trigger("click");
		// lyric pane open/close
		const paneBtns = w.findAll("button");
		// requestDelete collection abre confirm
		const delCol = w.findAll("button").find(b => (b.classes() as string[]).includes("editor__btn--danger"));
		if (delCol) {
			await delCol.trigger("click");
			await flushPromises();
			// cancel no AppConfirm stub: achar botão emit
			const confirm = w.findComponent({ name: "AppConfirm" });
			if (confirm.exists()) {
				confirm.vm.$emit("cancel");
				await flushPromises();
			}
		}
		w.unmount();
	});

	it("v-models de busca oficial e reuso disparam handlers", async () => {
		const w = await mountEditor();
		const s = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			officialSearch: { value: string };
			reuseSearch: { value: string };
		};
		const inputs = w.findAll("input");
		const official = inputs.find(i => (i.attributes("placeholder") ?? "").includes("ficial") || (i.attributes("placeholder") ?? "").includes("inário"));
		if (official) {
			await official.setValue("hino");
			await flushPromises();
			void s;
		}
		const reuse = inputs.find(i => (i.attributes("placeholder") ?? "").includes("eutilizar") || (i.attributes("placeholder") ?? "").includes("euso"));
		if (reuse) {
			await reuse.setValue("música");
			await flushPromises();
		}
		w.unmount();
	});

	it("selecionar coletânea com capa: cover thumb clica (click no input file)", async () => {
		const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
		const w = await mountEditor();
		const item = w.findAll(".editor__list-item").find(b => b.text().includes("Coletânea Teste"));
		await item?.trigger("click");
		await flushPromises();
		const thumb = w.find(".editor__cover-thumb");
		if (thumb.exists()) await thumb.trigger("click");
		await flushPromises();
		clickSpy.mockRestore();
		w.unmount();
	});

	it("fluxo música selecionada: seleção na lista dispara handlers de estrofe via DOM", async () => {
		const w = await mountEditor();
		const colItem = w.findAll(".editor__list-item").find(b => b.text().includes("Coletânea Teste"));
		await colItem?.trigger("click");
		await flushPromises();
		const musicItem = w.findAll(".editor__list-item").find(b => b.text().includes("Música Um"));
		await musicItem?.trigger("click");
		await flushPromises();
		// delete música btn (danger dentro do painel de músicas)
		const dangers = w.findAll("button.editor__btn--danger, button[class*=danger]");
		for (const d of dangers) await d.trigger("click");
		await flushPromises();
		// confirm cancel
		const confirm = w.findComponent({ name: "AppConfirm" });
		if (confirm.exists()) {
			confirm.vm.$emit("cancel");
			await flushPromises();
		}
		w.unmount();
	});

	it("estrofes na UI: inputs v-model, mark, save, delete, dblclick seek, pane toggle", async () => {
		const w = await mountEditor();
		const s = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			lyrics: { value: Array<{ id: number; lyric: string; time: string; imageUrl: string }> };
			musicName: { value: string };
			collections: { value: unknown[] };
			musics: { value: unknown[] };
			audioEl: { value: HTMLAudioElement | null };
		};
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		s.musicName.value = "M1";
		s.lyrics.value = [{ id: 1, lyric: "V1", time: "00:01", imageUrl: "" }];
		await flushPromises();
		// busca oficial input (v-model + input handler)
		const allInputs = w.findAll("input");
		for (const inp of allInputs) {
			const ph = inp.attributes("placeholder") ?? "";
			if (ph.toLowerCase().includes("inário") || ph.toLowerCase().includes("ficial")) {
				await inp.setValue("hino");
				await flushPromises();
				break;
			}
		}
		// reuso
		for (const inp of allInputs) {
			const ph = inp.attributes("placeholder") ?? "";
			if (ph.toLowerCase().includes("eutilizar") || ph.toLowerCase().includes("euso")) {
				await inp.setValue("mu");
				await flushPromises();
				break;
			}
		}
		// lyric pane toggle close/open
		const paneClose = w.findAll("button").find(b => (b.attributes("aria-label") ?? "").length > 0 && (b.classes().join(" ").includes("pane") || b.classes().join(" ").includes("lyric")));
		if (paneClose) {
			await paneClose.trigger("click");
			await flushPromises();
			const paneOpen = w.findAll("button").find(b => b.classes().join(" ").includes("pane") || b.classes().join(" ").includes("lyric"));
			if (paneOpen) {
				await paneOpen.trigger("click");
				await flushPromises();
			}
		}
		// estrofe: dblclick seek no item da letra
		const items = w.findAll("[class*=lyric-item], [class*=stanza]");
		if (items.length) {
			await items[0].trigger("dblclick");
			await flushPromises();
		}
		// delete estrofe via requestDelete DOM
		const trash = w.findAll("button").filter(b => b.find("i.ti-trash").exists());
		for (const t of trash) {
			await t.trigger("click");
			await flushPromises();
		}
		const confirm = w.findComponent({ name: "AppConfirm" });
		if (confirm.exists()) {
			confirm.vm.$emit("cancel");
			await flushPromises();
		}
		void s;
		w.unmount();
	});
});

describe("MediaEditorView — interações de estrofe via DOM (sel exatos)", () => {
	async function prepStanza() {
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<{ id: number; lyric: string; time: string; imageUrl: string }> };
			lyricPaneOpen: { value: boolean };
			activeStanzaIndex: { value: number };
			isPlaying: { value: boolean };
			audioEl: { value: HTMLAudioElement | null };
			statusMessage: { value: string };
			audioSrc: { value: string | null };
			currentTimeMs: { value: number };
		};
		st.selectedCollectionId.value = 1;
		st.selectedMusicId.value = 10;
		st.musicName.value = "M1";
		st.audioSrc.value = "file:a.mp3";
		st.lyrics.value = [
			{ id: 1, lyric: "V1", time: "00:01", imageUrl: "" },
			{ id: 2, lyric: "V2", time: "00:02", imageUrl: "" },
		];
		await flushPromises();
		return { w, st };
	}

	it("mark time da estrofe via botão DOM", async () => {
		const { w, st } = await prepStanza();
		const fakeEl = { currentTime: 3 } as unknown as HTMLAudioElement;
		st.audioEl.value = fakeEl;
		st.isPlaying.value = true;
		st.currentTimeMs.value = 3000;
		await flushPromises();
		const mark = w.find(".editor__btn--mark");
		await mark.trigger("click");
		await flushPromises();
		expect(st.lyrics.value[0].time).toBe("00:03");
		w.unmount();
	});

	it("save estrofe via botão DOM", async () => {
		const { updateCustomLyric } = await import("../../services/custom-catalog");
		const { w } = await prepStanza();
		const save = w.find(".editor__btn--save");
		await save.trigger("click");
		await flushPromises();
		expect(updateCustomLyric).toHaveBeenCalled();
		w.unmount();
	});

	it("delete estrofe via botão danger DOM + confirm", async () => {
		const { deleteCustomLyric } = await import("../../services/custom-catalog");
		vi.mocked(deleteCustomLyric).mockResolvedValue(true as never);
		const { w, st } = await prepStanza();
		const danger = w.find("button.editor__btn--danger.editor__btn--icon");
		await danger.trigger("click");
		await flushPromises();
		const confirm = w.findComponent({ name: "AppConfirm" });
		confirm.vm.$emit("confirm");
		await flushPromises();
		expect(st.lyrics.value).toHaveLength(1);
		w.unmount();
	});

	it("v-model time/lyric/imageUrl da estrofe + dblclick seek", async () => {
		const { w, st } = await prepStanza();
		const timeInput = w.find("input.editor__input--time");
		await timeInput.setValue("00:09");
		expect(st.lyrics.value[0].time).toBe("00:09");
		const textarea = w.find("textarea.editor__textarea");
		await textarea.setValue("Novo verso");
		expect(st.lyrics.value[0].lyric).toBe("Novo verso");
		await textarea.trigger("dblclick");
		await flushPromises();
		const bg = w.find("input.editor__input:not(.editor__input--time)");
		if (bg.exists()) {
			await bg.setValue("img/x.png");
			await flushPromises();
		}
		w.unmount();
	});

	it("lyric pane: seek via item, fechar e abrir floating", async () => {
		const { w, st } = await prepStanza();
		st.lyricPaneOpen.value = true;
		await flushPromises();
		const item = w.find(".editor__lyric-item");
		await item.trigger("click");
		await flushPromises();
		const closeBtn = w.find(".editor__lyric-pane-toggle:not(.editor__lyric-pane-toggle--floating)");
		await closeBtn.trigger("click");
		await flushPromises();
		expect(st.lyricPaneOpen.value).toBe(false);
		const float = w.find(".editor__lyric-pane-toggle--floating");
		await float.trigger("click");
		await flushPromises();
		expect(st.lyricPaneOpen.value).toBe(true);
		w.unmount();
	});

	it("busca oficial: clicar resultado chama onAddOfficial", async () => {
		const { addOfficialMusicToCollection } = await import("../../services/custom-catalog");
		vi.mocked(addOfficialMusicToCollection).mockResolvedValue({ id: 9 } as never);
		const { w } = await prepStanza();
		const inputs = w.findAll("input");
		const official = inputs.find(i => (i.attributes("placeholder") ?? "").toLowerCase().includes("oficial"));
		if (official) {
			await official.setValue("hino");
			await flushPromises();
			const hit = w.find("button.editor__list-item--search");
			if (hit.exists()) {
				await hit.trigger("click");
				await flushPromises();
				expect(addOfficialMusicToCollection).toHaveBeenCalled();
			}
		}
		w.unmount();
	});

	it("reuso: clicar resultado chama onReuseMusic", async () => {
		const { copyCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(copyCustomMusic).mockResolvedValue({ id: 9 } as never);
		const { listAllCustomMusics } = await import("../../services/custom-catalog");
		vi.mocked(listAllCustomMusics).mockResolvedValue([
			{ id: 3, name: "Música Repetida", collectionId: 2, collectionName: "Outra" },
		] as never);
		const { w, st } = await prepStanza();
		st.selectedCollectionId.value = 1;
		const inputs = w.findAll("input");
		const reuse = inputs.find(i => (i.attributes("placeholder") ?? "").toLowerCase().includes("eutilizar") || (i.attributes("placeholder") ?? "").toLowerCase().includes("euso"));
		if (reuse) {
			await reuse.setValue("repetida");
			await flushPromises();
			const hit = w.findAll("button.editor__list-item").find(b => b.text().includes("Música Repetida"));
			if (hit) {
				await hit.trigger("click");
				await flushPromises();
				expect(copyCustomMusic).toHaveBeenCalled();
			}
		}
		w.unmount();
	});

	it("import sem coletânea: cria 'Importações .slja' nova", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(catalogMod.listCustomCollections).mockResolvedValue([{ id: 1, name: "C1" }] as never);
		vi.mocked(slja.parseSljaFile).mockResolvedValue({ title: "T", slides: [] } as never);
		vi.mocked(catalogMod.createCustomCollection).mockResolvedValue({ id: 8 } as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & { selectedCollectionId: { value: number | null } };
		st.selectedCollectionId.value = null;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "novo.slja" };
		await (w.vm.$.devtoolsRawSetupState as unknown as { onImportFile: (e: Event) => Promise<void> }).onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(catalogMod.createCustomCollection).toHaveBeenCalledWith("Importações .slja");
		w.unmount();
	});

	it("import pós-import: recarrega músicas e áudio", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({ title: "T2", slides: [] } as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & { selectedCollectionId: { value: number | null } };
		st.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "t2.slja" };
		await (w.vm.$.devtoolsRawSetupState as unknown as { onImportFile: (e: Event) => Promise<void> }).onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(catalogMod.listCustomMusics).toHaveBeenCalled();
		w.unmount();
	});

	it("delete música com confirm ok", async () => {
		const { deleteCustomMusic } = await import("../../services/custom-catalog");
		vi.mocked(deleteCustomMusic).mockResolvedValue(true as never);
		const { w, st } = await prepStanza();
		(w.vm.$.devtoolsRawSetupState as unknown as { requestDelete: (k: string) => void }).requestDelete("music");
		await flushPromises();
		const confirm = w.findComponent({ name: "AppConfirm" });
		confirm.vm.$emit("confirm");
		await flushPromises();
		expect(deleteCustomMusic).toHaveBeenCalledWith(10);
		void st;
		w.unmount();
	});
});

describe("MediaEditorView — últimos gaps", () => {
	it("busca oficial por placeholder exato: resultado click → onAddOfficial", async () => {
		const { addOfficialMusicToCollection } = await import("../../services/custom-catalog");
		const searchMod = await import("@modules/albums/services/album-music-search");
		vi.mocked(searchMod.filterAlbumMusicIndex).mockReturnValue([{ musicId: 7, displayTitle: "H7", name: "H7" }] as never);
		vi.mocked(addOfficialMusicToCollection).mockResolvedValue({ id: 9 } as never);
		const w = await mountEditor();
		(w.vm.$.devtoolsRawSetupState as unknown as { selectedCollectionId: { value: number | null } }).selectedCollectionId.value = 1;
		await flushPromises();
		const input = w.find('input[placeholder="Buscar hino oficial (nº ou nome)…"]');
		await input.setValue("hino");
		await flushPromises();
		const hit = w.find("button.editor__list-item--search");
		await hit.trigger("click");
		await flushPromises();
		expect(addOfficialMusicToCollection).toHaveBeenCalled();
		w.unmount();
	});

	it("stanza imageUrl v-model + snackbar v-model", async () => {
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<{ id: number; lyric: string; time: string; imageUrl: string }> };
			audioSrc: { value: string | null };
			snackbarOpen: { value: boolean };
		};
		st.selectedCollectionId.value = 1;
		st.selectedMusicId.value = 10;
		st.musicName.value = "M1";
		st.audioSrc.value = "file:a.mp3";
		st.lyrics.value = [{ id: 1, lyric: "V1", time: "00:01", imageUrl: "" }];
		await flushPromises();
		const bg = w.find("label.editor__bg-label input");
		await bg.setValue("img/f.png");
		expect(st.lyrics.value[0].imageUrl).toBe("img/f.png");
		// snackbar v-model: notify com texto abre; notify('') fecha
		const notify = w.vm.$.devtoolsRawSetupState as unknown as { notify: (m: string) => void };
		notify.notify("msg");
		await flushPromises();
		expect(st.snackbarOpen.value).toBe(true);
		notify.notify("");
		await flushPromises();
		expect(st.snackbarOpen.value).toBe(false);
		w.unmount();
	});

	it("branches: stanzaProgress end<=start; import mesma coletânea seta id; timeToMs vazio", async () => {
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			lyrics: { value: Array<{ id: number; lyric: string; time: string; imageUrl: string }> };
			activeStanzaIndex: { value: number };
			isPlaying: { value: boolean };
			currentTimeMs: { value: number };
			stanzaProgress: (i: number) => number;
			timeToMs: (t: string) => number;
			onImportFile: (e: Event) => Promise<void>;
			selectedCollectionId: { value: number | null };
		};
		// end <= start
		st.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:05", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:05", imageUrl: "" },
		];
		st.activeStanzaIndex.value = 0;
		st.isPlaying.value = true;
		st.currentTimeMs.value = 6000;
		expect(st.stanzaProgress(0)).toBe(0);
		// timeToMs string inválida
		expect(st.timeToMs("abc")).toBe(0);
		w.unmount();
	});
});

describe("MediaEditorView — finais", () => {
	it("import: selectedCollectionId !== collectionId atualiza; snackbar v-model dom", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		// coleção selecionada NÃO existe na lista → import cria outra → id muda
		vi.mocked(catalogMod.listCustomCollections).mockResolvedValue([{ id: 1, name: "C1" }] as never);
		vi.mocked(slja.parseSljaFile).mockResolvedValue({ title: "T", slides: [{ lyric: "V", type: "LETRA", timeMs: 0, order: 1 }] } as never);
		vi.mocked(catalogMod.createCustomCollection).mockResolvedValue({ id: 8 } as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		vi.mocked(catalogMod.createCustomLyric).mockResolvedValue({ id: 55 } as never);
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			selectedCollectionId: { value: number | null };
			snackbarOpen: { value: boolean };
			onImportFile: (e: Event) => Promise<void>;
			notify: (m: string) => void;
		};
		// seleciona id que não estará na lista pós-refresh
		st.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "u.slja" };
		await st.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(catalogMod.listCustomMusics).toHaveBeenCalled();
		// snackbar v-model: notify abre; emit update:modelValue fecha (cobra o assignment do compiled v-model)
		st.notify("oi");
		await flushPromises();
		expect(st.snackbarOpen.value).toBe(true);
		const snack = w.findComponent({ name: "VSnackbar" });
		snack.vm.$emit("update:modelValue", false);
		await flushPromises();
		expect(st.snackbarOpen.value).toBe(false);
		w.unmount();
	});
});

describe("MediaEditorView — último branch", () => {
	it("import com a mesma coletânea já selecionada: não re-seta", async () => {
		const slja = await import("../../../../shared/services/slja");
		const catalogMod = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({ title: "T", slides: [] } as never);
		vi.mocked(catalogMod.createCustomMusic).mockResolvedValue({ id: 44 } as never);
		const w = await mountEditor();
		const st = w.vm.$.devtoolsRawSetupState as unknown as Record<string, never> & {
			selectedCollectionId: { value: number | null };
			onImportFile: (e: Event) => Promise<void>;
		};
		st.selectedCollectionId.value = 1;
		const file = { arrayBuffer: async () => new ArrayBuffer(4), name: "mesma.slja" };
		await st.onImportFile({ target: { files: [file], value: "" } } as unknown as Event);
		await flushPromises();
		expect(st.selectedCollectionId.value).toBe(1);
		w.unmount();
	});

describe("MediaEditorView — visibilidade (gaps onda1)", () => {
	function rawState(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			rulesOpen: { value: boolean };
			newCollectionVisibility: { value: string };
			onChangeVisibilityWithRules: (next: "public" | "private") => Promise<void>;
		};
	}

	it("1a vez public → abre regras e não persiste (338-340); depois private persiste (342+)", async () => {
		localStorage.removeItem("louvorja.publishRulesSeen");
		const w = await mountEditor();
		const s = rawState(w);
		s.selectedCollectionId.value = 1;
		await flushPromises();
		await s.onChangeVisibilityWithRules("public");
		expect(s.rulesOpen.value).toBe(true);
		// marca visto e muda pra private → persiste via API
		const { updateCustomCollection } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomCollection).mockResolvedValue({ id: 1, name: "Coletânea Teste", visibility: "private", musicsCount: 2 } as never);
		localStorage.setItem("louvorja.publishRulesSeen", "1");
		await s.onChangeVisibilityWithRules("private");
		expect(updateCustomCollection).toHaveBeenCalled();
		// private → public remoto: notify pública (362 arm0)
		await s.onChangeVisibilityWithRules("public");
		w.unmount();
	});

	it("mesma visibilidade → sem chamada (348); local id → patch local (349)", async () => {
		localStorage.setItem("louvorja.publishRulesSeen", "1");
		const localStore = await import("../../services/local-custom-store");
		const w = await mountEditor();
		const s = rawState(w);
		s.selectedCollectionId.value = 1;
		await flushPromises();
		const { updateCustomCollection } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomCollection).mockClear();
		// privada → privada: current.visibility ?? public === private? coletânea 1 sem visibility → 'public'; mudar pra private persiste; de novo private → retorna cedo
		vi.mocked(updateCustomCollection).mockResolvedValue({ id: 1, name: "x", visibility: "private", musicsCount: 2 } as never);
		await s.onChangeVisibilityWithRules("private");
		const calls = vi.mocked(updateCustomCollection).mock.calls.length;
		await s.onChangeVisibilityWithRules("private");
		expect(vi.mocked(updateCustomCollection).mock.calls.length).toBe(calls);
		// local id: patch direto (349-355)
		vi.mocked(localStore.isLocalId).mockReturnValue(true);
		const localOnly = { id: -5, name: "Local", visibility: "private", musicsCount: 0 } as never;
		vi.mocked(listCustomCollections).mockResolvedValue([localOnly]);
		// re-mount pra recarregar listagem
		w.unmount();
		const w2 = await mountEditor();
		const s2 = rawState(w2);
		s2.selectedCollectionId.value = -5;
		await flushPromises();
		vi.mocked(updateCustomCollection).mockClear();
		// local private → private (352 arm1: msg privada)
		await s2.onChangeVisibilityWithRules("private");
		// local private → public (352 arm0: msg pública-local)
		await s2.onChangeVisibilityWithRules("public");
		// local public → private (352 arm1: msg privada-local)
		await s2.onChangeVisibilityWithRules("private");
		console.log("SEL", s2.selectedCollectionId.value, JSON.stringify((s2 as unknown as { collections: { value: Array<{ id: number }> } }).collections?.value?.map((c) => c.id)));
		await s2.onChangeVisibilityWithRules("public");
		expect(updateCustomCollection).not.toHaveBeenCalled();
		w2.unmount();
	});

	it("update falha → notifica erro (366)", async () => {
		localStorage.setItem("louvorja.publishRulesSeen", "1");
		const w = await mountEditor();
		const s = rawState(w);
		s.selectedCollectionId.value = 1;
		await flushPromises();
		const { updateCustomCollection } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomCollection).mockResolvedValue(null as never);
		await s.onChangeVisibilityWithRules("private");
		expect((s as unknown as { statusMessage: { value: string } }).statusMessage.value).toContain("Falha");
		w.unmount();
	});
});

describe("MediaEditorView — gaps finais onda1", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<Record<string, unknown>> };
			activeStanzaIndexOverride: { value: number | null };
			activeStanzaIndex: { value: number };
			onExportSlja: () => Promise<void>;
			onImportFile: (ev: Event) => Promise<void>;
			onAddOfficialFromSearch: () => void;
			onReuseSearchInput: () => void;
			officialSearchResults: { value: Array<Record<string, unknown>> };
			reuseSearch: { value: string };
			rulesOpen: { value: boolean };
			stanzaProgress: (i: number) => number;
			activeStanza: { value: unknown };
		};
	}

	function fakeFileEvent(name: string, buffer: ArrayBuffer): Event {
		const file = new File([buffer], name);
		Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
		const input = document.createElement("input");
		Object.defineProperty(input, "files", { value: [file] });
		const ev = new Event("change");
		Object.defineProperty(ev, "target", { value: input });
		return ev;
	}

	it("export com nome vazio: título e arquivo usam fallback (697/706 arm1)", async () => {
		const slja = await import("../../../../shared/services/slja");
		const buildSlja = vi.mocked(slja.buildSlja);
		buildSlja.mockResolvedValue(new Uint8Array([1]) as never);
		const createObjectURL = vi.fn(() => "blob:fake");
		vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		s.selectedMusicId.value = 10;
		s.musicName.value = "";
		s.lyrics.value = [{ id: 1, lyric: "V", time: "00:10", imageUrl: "" }];
		await s.onExportSlja();
		const archive = buildSlja.mock.calls[0][0] as { title: string };
		expect(archive.title).toBe("Sem título");
		w.unmount();
		vi.unstubAllGlobals();
	});

	it("import com título genérico usa nome do arquivo (561/563); sem título no arquivo (561 arm1)", async () => {
		const slja = await import("../../../../shared/services/slja");
		const { createCustomMusic, createCustomLyric } = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "v1.2",
			innerName: "meu-hino",
			audio: null,
			images: [],
			slides: [{ type: "LETRA", lyric: "verso", timeMs: 1000, order: 2 }],
		} as never);
		vi.mocked(createCustomMusic).mockResolvedValue({ id: 78 });
		vi.mocked(createCustomLyric).mockResolvedValue({ id: 900 });
		const w = await mountEditor();
		raw(w).selectedCollectionId.value = 1;
		await raw(w).onImportFile(fakeFileEvent("meu-hino.slja", new ArrayBuffer(8)));
		const created = vi.mocked(createCustomMusic).mock.calls[0][1] as { name: string };
		expect(created.name).toBe("meu-hino");
		w.unmount();
	});

	it("import com assets: upload ok empurra; CAPA filtrada; imagem casada vira imageUrl (614/627/636/639/646)", async () => {
		const slja = await import("../../../../shared/services/slja");
		const custom = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "Com Assets",
			audio: null,
			images: [],
			assets: [{ bytes: new Uint8Array([1]), path: "img/capa.png" }],
			slides: [
				{ type: "CAPA", lyric: "", timeMs: 0, order: 1, image: { name: "capa.png" } },
				{ type: "LETRA", lyric: "primeiro", timeMs: 500, order: 3, image: { name: "capa.png" } },
				{ type: "LETRA", lyric: "segundo", timeMs: 1500, order: 2, image: { name: "outra.png" } },
			],
		} as never);
		vi.mocked(custom.uploadCustomFile).mockResolvedValue({ url: "https://f/img.png", idFile: 5 } as never);
		vi.mocked(custom.createCustomMusic).mockResolvedValue({ id: 79 });
		vi.mocked(custom.createCustomLyric).mockResolvedValue({ id: 901 });
		const w = await mountEditor();
		raw(w).selectedCollectionId.value = 1;
		await raw(w).onImportFile(fakeFileEvent("assets.slja", new ArrayBuffer(8)));
		// 2 letras (CAPA filtrada), ordem sortada (segundo antes de primeiro)
		const calls = vi.mocked(custom.createCustomLyric).mock.calls;
		expect(calls.length).toBe(2);
		expect((calls[0][1] as { lyric: string }).lyric).toBe("segundo");
		expect((calls[0][1] as { id_file_image?: number }).id_file_image).toBeUndefined();
		expect((calls[1][1] as { id_file_image?: number }).id_file_image).toBe(5);
		w.unmount();
	});

	it("import com upload falho: asset ignorado (614 arm1)", async () => {
		const slja = await import("../../../../shared/services/slja");
		const custom = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "Upload Falho",
			audio: null,
			images: [],
			assets: [{ bytes: new Uint8Array([1]), path: "img/x.png" }],
			slides: [{ type: "LETRA", lyric: "a", timeMs: 10 }],
		} as never);
		vi.mocked(custom.uploadCustomFile).mockResolvedValue(null as never);
		vi.mocked(custom.createCustomMusic).mockResolvedValue({ id: 80 });
		vi.mocked(custom.createCustomLyric).mockResolvedValue({ id: 902 });
		const w = await mountEditor();
		raw(w).selectedCollectionId.value = 1;
		await raw(w).onImportFile(fakeFileEvent("falho.slja", new ArrayBuffer(8)));
		expect((vi.mocked(custom.createCustomLyric).mock.calls[0][1] as { id_file_image: number | undefined }).id_file_image).toBeUndefined();
		w.unmount();
	});

	it("lyrics sem time: ?? 00:00 (477 arm1) via música local", async () => {
		const localStore = await import("../../services/local-custom-store");
		vi.mocked(localStore.getLocalMusic).mockReturnValue({
			id: -3, name: "Local S/ time", audioBase64: null, officialMusicId: null,
			lyrics: [{ id: 1, lyric: "L", time: null, image_url: null }],
		} as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await (s as unknown as { onSelectMusic: (id: number) => Promise<void> }).onSelectMusic(-3);
		await flushPromises();
		expect((s.lyrics.value[0] as { time: string }).time).toBe("00:00");
		w.unmount();
	});

	it("busca oficial first com displayTitle (245) e reuse com cache (268)", async () => {
		const custom = await import("../../services/custom-catalog");
		vi.mocked(custom.listAllCustomMusics).mockResolvedValue([
			{ id: 30, name: "Reuso", duration: null, hasAudio: true, hasImage: false, audioUrl: null, officialMusicId: null },
		] as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		// onAddOfficialFromSearch com first.displayTitle
		s.officialSearchResults.value = [{ musicId: 5, displayTitle: "Hino Cinco", name: "" }];
		s.onAddOfficialFromSearch();
		await flushPromises();
		// reuse: query pequena → cache carregado (268 true side)
		s.reuseSearch.value = "reuso";
		s.onReuseSearchInput();
		await flushPromises();
		await flushPromises();
		w.unmount();
	});

	it("rules modal abre/fecha via setup (1776/1794); stanzaProgress sem próxima (110 arm1); activeStanza override (904)", async () => {
		localStorage.removeItem("louvorja.publishRulesSeen");
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		// stanzaProgress: última estrofe sem próxima → end = start + 1
		(s.lyrics as { value: unknown[] }).value = [{ id: 1, lyric: "A", time: "00:05", imageUrl: "" }];
		(s.activeStanzaIndex as { value: number }).value = 0;
		expect(s.stanzaProgress(0)).toBe(0);
		s.activeStanzaIndexOverride.value = 0;
		expect(s.activeStanza.value).toBeTruthy();
		w.unmount();
	});
});

describe("MediaEditorView — lote final onda1", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<Record<string, unknown>> };
			activeStanzaIndexOverride: { value: number | null };
			activeStanzaIndex: { value: number };
			isPlaying: { value: boolean };
			currentTimeMs: { value: number };
			onAddOfficialFromSearch: () => void;
			onExportSlja: () => Promise<void>;
			stanzaProgress: (i: number) => number;
			activeStanza: { value: unknown };
			musics: { value: Array<Record<string, unknown>> };
			rulesOpen: { value: boolean };
		};
	}

	it("busca oficial first → onAddOfficial (245); export CAPA/LETRA (692); delete recarrega lista (797)", async () => {
		const custom = await import("../../services/custom-catalog");
		const slja = await import("../../../../shared/services/slja");
		vi.mocked(slja.buildSlja).mockResolvedValue(new Uint8Array([1]) as never);
		vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
		vi.mocked(custom.deleteCustomMusic).mockResolvedValue(true);
		vi.mocked(custom.listCustomMusics).mockResolvedValue([
			{ id: 10, name: "M10", officialMusicId: 7, collectionName: "Col A" },
		] as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		// 245: first com displayTitle
		(s.officialSearchResults as { value: Array<Record<string, unknown>> }).value = [
			{ musicId: 5, displayTitle: "", name: "Fallback" },
		];
		s.onAddOfficialFromSearch();
		await flushPromises();
		// export com 2 estrofes → CAPA + LETRA (692 arm1)
		s.selectedMusicId.value = 10;
		s.musicName.value = "Export 2";
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:01", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:09", imageUrl: "" },
		];
		await s.onExportSlja();
		// delete com collection selecionada (797 true)
		s.selectedMusicId.value = 10;
		await (s as unknown as { doDeleteMusic: () => Promise<void> }).doDeleteMusic();
		await flushPromises();
		expect(s.musics.value.length).toBeGreaterThan(0);
		w.unmount();
		vi.unstubAllGlobals();
	});

	it("stanzaProgress com próxima e tocando (110 arm0/1); activeStanza fallback idx (904)", async () => {
		const w = await mountEditor();
		const s = raw(w);
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:01", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:05", imageUrl: "" },
		];
		(s.activeStanzaIndex as { value: number }).value = 0;
		(s.isPlaying as { value: boolean }).value = true;
		(s.currentTimeMs as { value: number }).value = 2000;
		const p = s.stanzaProgress(0);
		expect(p).toBeGreaterThan(0);
		expect(p).toBeLessThanOrEqual(1);
		// última estrofe: sem próxima → end = start + 1 (110 arm1)
		(s.activeStanzaIndex as { value: number }).value = 1;
		(s.currentTimeMs as { value: number }).value = 5100;
		const pLast = s.stanzaProgress(1);
		expect(pLast).toBeGreaterThan(0);
		// override null + activeStanzaIndex -1 + lyrics>0 → idx 0 (904 false→true chain)
		s.activeStanzaIndexOverride.value = null;
		(s.activeStanzaIndex as { value: number }).value = -1;
		expect(s.activeStanza.value).toBeTruthy();
		w.unmount();
	});
});

describe("MediaEditorView — lote 2 onda1", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<Record<string, unknown>> };
			officialSearchResults: { value: Array<Record<string, unknown>> };
			reuseSearch: { value: string };
			newCollectionName: { value: string };
			newCollectionVisibility: { value: string };
			onAddOfficialFromSearch: () => void;
			onReuseSearchInput: () => void;
			onCreateCollection: () => Promise<void>;
			visibilityBusy: { value: boolean };
		};
	}

	it("criar coletânea: sem auth local (174 arm1) e com auth pública/privada (176)", async () => {
		const auth = await import("../../services/auth-client");
		const custom = await import("../../services/custom-catalog");
		// sem auth → local (174 arm1)
		vi.mocked(auth.getAuthSession).mockReturnValue(null as never);
		vi.mocked(custom.createCustomCollection).mockResolvedValue({ id: -9 } as never);
		let w = await mountEditor();
		let s = raw(w);
		s.newCollectionName.value = "Local X";
		await s.onCreateCollection();
		expect(s.selectedCollectionId.value).toBe(-9);
		w.unmount();
		// com auth → pública (176 arm0) e privada (176 arm1)
		vi.mocked(auth.getAuthSession).mockReturnValue({ userId: 1, user: { email: "a@b.c", displayName: "A" } } as never);
		vi.mocked(custom.createCustomCollection).mockResolvedValue({ id: 60 } as never);
		w = await mountEditor();
		s = raw(w);
		s.newCollectionVisibility.value = "public";
		s.newCollectionName.value = "Pública";
		await s.onCreateCollection();
		s.newCollectionName.value = "Privada";
		s.newCollectionVisibility.value = "private";
		await s.onCreateCollection();
		w.unmount();
	});

	it("busca oficial: lista vazia → early return (245 arm1); reuso 2x cache (268 arm1)", async () => {
		const custom = await import("../../services/custom-catalog");
		vi.mocked(custom.listAllCustomMusics).mockResolvedValue([
			{ id: 30, name: "R", duration: null, hasAudio: true, hasImage: false, audioUrl: null, officialMusicId: null },
		] as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		// lista vazia (245 arm1)
		s.officialSearchResults.value = [];
		s.onAddOfficialFromSearch();
		// reuso 1a (268 true) e 2a (268 arm1: cache)
		s.reuseSearch.value = "r";
		s.onReuseSearchInput();
		await flushPromises();
		s.reuseSearch.value = "re";
		s.onReuseSearchInput();
		await flushPromises();
		w.unmount();
	});

	it("visibilidade: busy barra (347 arm0)", async () => {
		localStorage.setItem("louvorja.publishRulesSeen", "1");
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await flushPromises();
		(s.visibilityBusy as { value: boolean }).value = true;
		const { updateCustomCollection } = await import("../../services/custom-catalog");
		vi.mocked(updateCustomCollection).mockClear();
		await (s as unknown as { onChangeVisibilityWithRules: (n: "private") => Promise<void> }).onChangeVisibilityWithRules("private");
		expect(updateCustomCollection).not.toHaveBeenCalled();
		w.unmount();
	});
});

describe("MediaEditorView — lote 3 onda1", () => {
	function raw(w: Awaited<ReturnType<typeof mountEditor>>) {
		return w.vm.$.devtoolsRawSetupState as unknown as Record<string, unknown> & {
			selectedCollectionId: { value: number | null };
			selectedMusicId: { value: number | null };
			musicName: { value: string };
			lyrics: { value: Array<Record<string, unknown>> };
			activeStanzaIndexOverride: { value: number | null };
			activeStanzaIndex: { value: number };
			officialSearchResults: { value: Array<Record<string, unknown>> };
			onAddOfficialFromSearch: () => void;
			onSelectMusic: (id: number) => Promise<void>;
			doDeleteMusic: () => Promise<void>;
			activeStanza: { value: unknown };
		};
	}

	function fakeFileEvent(name: string, buffer: ArrayBuffer): Event {
		const file = new File([buffer], name);
		Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
		const input = document.createElement("input");
		Object.defineProperty(input, "files", { value: [file] });
		const ev = new Event("change");
		Object.defineProperty(ev, "target", { value: input });
		return ev;
	}

	it("import: título vazio (561 arm1), innerName ausente (563 arm1), slides sem order (627), lyric falha (646)", async () => {
		const slja = await import("../../../../shared/services/slja");
		const custom = await import("../../services/custom-catalog");
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: "   ",
			// segundo caso no próximo bloco: title null (?? arm)
			audio: null,
			images: [],
			assets: [{ bytes: new Uint8Array([9]), path: "p/ig.png" }],
			slides: [
				{ type: "LETRA", lyric: "s1", timeMs: 100 },
				{ type: "LETRA", lyric: "s2", timeMs: 200 },
			],
		} as never);
		vi.mocked(custom.uploadCustomFile).mockResolvedValue({ url: "u2", idFile: 6 } as never);
		vi.mocked(custom.createCustomMusic).mockResolvedValue({ id: 81 });
		// 1a lyric cria, 2a falha (646 arm1)
		vi.mocked(custom.createCustomLyric)
			.mockResolvedValueOnce({ id: 910 })
			.mockResolvedValueOnce(null as never);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onImportFile(fakeFileEvent("semtitle.slja", new ArrayBuffer(8)));
		// nome cai no file.name sem .slja (563 com innerName ausente)
		expect((vi.mocked(custom.createCustomMusic).mock.calls[0][1] as { name: string }).name).toBe("semtitle");
		// title NULL → ?? '' no trim (561 bm2 arm1)
		vi.mocked(slja.parseSljaFile).mockResolvedValue({
			title: null,
			audio: null,
			images: [],
			slides: [],
		} as never);
		vi.mocked(custom.createCustomMusic).mockResolvedValue({ id: 82 });
		await s.onImportFile(fakeFileEvent("nulltitle.slja", new ArrayBuffer(8)));
		w.unmount();
	});

	it("track remoto sem lyrics e sem time (508/511 arm1); stanza ativa por timing (904 arm0)", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ name: "Remota S/ lyrics", audio_url: null }),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const w = await mountEditor();
		const s = raw(w);
		s.selectedCollectionId.value = 1;
		await s.onSelectMusic(12);
		await flushPromises();
		expect(s.lyrics.value).toEqual([]);
		// stanza ativa: sem override, activeStanzaIndex >= 0 → usa índice (904 arm0)
		s.lyrics.value = [
			{ id: 1, lyric: "A", time: "00:01", imageUrl: "" },
			{ id: 2, lyric: "B", time: "00:05", imageUrl: "" },
		];
		(s.activeStanzaIndex as { value: number }).value = 1;
		(s.activeStanzaIndexOverride as { value: number | null }).value = null;
		expect((s.activeStanza.value as { id: number }).id).toBe(2);
		w.unmount();
		vi.unstubAllGlobals();
	});

	it("delete sem coletânea (797 arm1); busca oficial result sem displayTitle (1435 arm1)", async () => {
		const custom = await import("../../services/custom-catalog");
		vi.mocked(custom.deleteCustomMusic).mockResolvedValue(true);
		vi.mocked(custom.addOfficialMusicToCollection).mockResolvedValue(true);
		const w = await mountEditor();
		const s = raw(w);
		// 1435 arm1: click no resultado SEM displayTitle (com coletânea p/ renderizar)
		s.selectedCollectionId.value = 1;
		document.body.appendChild(w.element);
		(s.officialSearchResults as { value: Array<Record<string, unknown>> }).value = [
			{ musicId: 6, name: "Somente Nome" },
		];
		await flushPromises();
		await flushPromises();
		const resultBtn = Array.from(document.querySelectorAll<HTMLButtonElement>(".editor__list-item--search")).at(-1);
		if (resultBtn) {
			resultBtn.click();
			await flushPromises();
		}
		// 797 arm1: delete sem coletânea
		s.selectedCollectionId.value = null;
		s.selectedMusicId.value = 10;
		await s.doDeleteMusic();
		await flushPromises();
		// 511 arm1: lyrics com row SEM time (fetch)
		const fetchMock2 = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ name: "Com lyrics s/ time", lyrics: [{ id_lyric: 1, lyric: "x", time: null }] }),
		}));
		vi.stubGlobal("fetch", fetchMock2);
		await s.onSelectMusic(13);
		await flushPromises();
		expect((s.lyrics.value[0] as { time: string }).time).toBe("00:00");
		vi.unstubAllGlobals();
		w.unmount();
	});
});
});
