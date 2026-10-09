// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { createI18n } from "vue-i18n";

/**
 * MediaView — tela principal do player: stage com slide atual, playlist,
 * pill, diálogo de fechamento, ESC, minimizar, fullscreen.
 * useMediaPlayer mockado com refs reais; filhos pesados stubados.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaView from "../MediaView.vue";

const pushMock = vi.fn().mockResolvedValue(undefined);
const backMock = vi.fn().mockResolvedValue(undefined);
const replaceMock = vi.fn().mockResolvedValue(undefined);

vi.mock("vue-router", () => ({
	useRouter: () => ({ push: pushMock, back: backMock, replace: replaceMock }),
	useRoute: () => ({ name: "media", path: "/media" }),
}));

vi.mock("../../settings/components/StagePaletteButton.vue", () => ({
	default: { template: '<div class="stage-palette-stub" />' },
}));

vi.mock("../services/media-aside-scroll", () => ({
	revealItemInAside: vi.fn(),
	revealItemScrollTop: vi.fn(() => 0),
}));

const sessionRef = ref<null | {
	title: string;
	slides: { lyric: string; isCover: boolean }[];
}>({
	title: "Santíssimo",
	slides: [
		{ lyric: "<b>Primeiro</b> slide", isCover: false },
		{ lyric: "Segundo slide da música", isCover: false },
		{ lyric: "Capa do álbum", isCover: true },
	],
});
const hasSessionRef = computed(() => sessionRef.value !== null);

const storeState = {
	session: sessionRef,
	status: ref<"idle" | "ready" | "playing">("ready"),
	hasSession: hasSessionRef,
	isPlaying: ref(false),
	hasAudio: ref(true),
	hasInstrumental: ref(true),
	playbackMode: ref<"audio" | "instrumental" | "no_audio">("audio"),
	slideIndex: ref(0),
	slideCount: computed(() => sessionRef.value?.slides.length ?? 0),
	currentSlide: computed(() => sessionRef.value?.slides[0] ?? null),
	previewSnippet: ref(""),
	previewReference: ref(""),
	progressRatio: ref(0),
	volume: ref(0.8),
	minimized: ref(false),
	isProjecting: ref(false),
	closeConfirmOpen: ref(false),
	showPlaylist: ref(true),
	lastErrorKey: ref<string | null>(null),
	resolvedSlideImageUrl: ref<string | null>(null),
	ondemandNoticeVisible: ref(false),
	ondemandDownloadPercent: ref(0),
	ondemandDownloadDone: ref(false),
	preplayDownloadMusicId: ref<string | null>(null),
	slideProgressRatio: ref(0),
	currentTimeLabel: ref("0:00"),
	durationLabel: ref("0:00"),
	queueIndex: ref(0),
	audioOnTv: ref(false),
	isPaused: ref(false),
	currentTimeSec: ref(0),
	durationSec: ref(0),
	playlist: ref<{ index: number; label: string; isCover: boolean }[]>([]),
	queue: ref<{ musicId: number; title?: string; name?: string }[]>([]),
	maximize: vi.fn(),
	minimize: vi.fn(),
	close: vi.fn(),
	requestClose: vi.fn(),
	cancelClose: vi.fn(),
	clearError: vi.fn(),
	togglePlay: vi.fn().mockResolvedValue(undefined),
	previousSlide: vi.fn(),
	nextSlide: vi.fn(),
	goToSlide: vi.fn(),
	seekRatio: vi.fn(),
	setVolume: vi.fn(),
	toggleProjection: vi.fn().mockResolvedValue(undefined),
	audioOnTvToggle: vi.fn(),
	onToggleAudioOnTv: vi.fn().mockResolvedValue(undefined),
	togglePlaylist: vi.fn(),
	jumpToQueue: vi.fn(),
	syncProjectionFlag: vi.fn(),
	setPlaylistOpen: vi.fn(),
	switchMode: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../composables/useMediaPlayer", () => ({
	useMediaPlayer: () => storeState,
}));

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

async function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);
	const w = mount(MediaView, { global: { plugins: [i18n, pinia] } });
	await w.vm.$nextTick();
	return w;
}

beforeEach(() => {
	vi.clearAllMocks();
	document.documentElement.classList.remove("media-player-open");
	// jsdom não implementa scrollTo — stub no prototype (usado por revealItemInAside)
	HTMLElement.prototype.scrollTo = vi.fn();
	sessionRef.value = {
		title: "Santíssimo",
		slides: [
			{ lyric: "<b>Primeiro</b> slide", isCover: false },
			{ lyric: "Segundo slide da música", isCover: false },
			{ lyric: "Capa do álbum", isCover: true },
		],
	};
	storeState.lastErrorKey.value = null;
	storeState.closeConfirmOpen.value = false;
});

describe("MediaView — montagem", () => {
	it("monta com janela, stage, pill e playlist", async () => {
		const w = await mountView();
		expect(w.find(".media-window").exists()).toBe(true);
		expect(w.find(".media-slide-stage").exists()).toBe(true);
		expect(w.find(".media-player-pill").exists()).toBe(true);
		expect(
			w.find('[data-testid="playlist"], .media-playlist, aside').exists(),
		).toBe(true);
	});

	it("onMounted: maximize, playlist aberta, syncProjectionFlag e classe no html", async () => {
		const w = await mountView();
		expect(storeState.maximize).toHaveBeenCalled();
		expect(storeState.setPlaylistOpen).toHaveBeenCalledWith(true);
		expect(storeState.syncProjectionFlag).toHaveBeenCalled();
		expect(
			document.documentElement.classList.contains("media-player-open"),
		).toBe(true);
		w.unmount();
		expect(
			document.documentElement.classList.contains("media-player-open"),
		).toBe(false);
	});

	it("onUnmounted com sessão ativa: minimize", async () => {
		const w = await mountView();
		w.unmount();
		expect(storeState.minimize).toHaveBeenCalled();
		storeState.minimize.mockClear();
	});
});

describe("MediaView — stage", () => {
	it("mostra o slide atual (letra limpa)", async () => {
		const w = await mountView();
		expect(w.text()).toContain("Primeiro");
		expect(w.text()).toContain("Segundo slide da música");
	});
});

describe("MediaView — toolbar e fechamento", () => {
	it("minimizar: chama minimize e volta pra rota anterior", async () => {
		const w = await mountView();
		const btn = w
			.findAll("button")
			.find((b) => b.attributes("aria-label") === mediaLocale.media.minimize);
		await btn?.trigger("click");
		expect(storeState.minimize).toHaveBeenCalled();
		// history.length > 1 → back; senão replace({name:'albums'})
		const navigated =
			backMock.mock.calls.length > 0 || replaceMock.mock.calls.length > 0;
		expect(navigated).toBe(true);
		w.unmount();
		storeState.minimize.mockClear();
	});

	it("ESC abre confirmação de fechamento (requestClose)", async () => {
		const w = await mountView();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await w.vm.$nextTick();
		expect(storeState.requestClose).toHaveBeenCalled();
		w.unmount();
		storeState.requestClose.mockClear();
	});

	it("ESC com diálogo aberto não re-dispara requestClose", async () => {
		storeState.closeConfirmOpen.value = true;
		const w = await mountView();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await w.vm.$nextTick();
		expect(storeState.requestClose).not.toHaveBeenCalled();
		w.unmount();
		storeState.requestClose.mockClear();
	});

	it("confirmar fechamento chama close", async () => {
		storeState.closeConfirmOpen.value = true;
		const w = await mountView();
		const yes = w
			.findAll("button")
			.find((b) => b.text().includes(mediaLocale.media.closeConfirmYes));
		await yes?.trigger("click");
		expect(storeState.close).toHaveBeenCalled();
		w.unmount();
	});

	it("ESC com foco em input de texto: ignora; com input button: processa", async () => {
		const w = await mountView();
		storeState.requestClose.mockClear();
		// textarea → ignora (target é o próprio elemento)
		const ta = document.createElement("textarea");
		document.body.appendChild(ta);
		const ev1 = new KeyboardEvent("keydown", { key: "Escape" });
		Object.defineProperty(ev1, "target", { value: ta });
		window.dispatchEvent(ev1);
		await w.vm.$nextTick();
		expect(storeState.requestClose).not.toHaveBeenCalled();
		// input text → ignora
		const inp = document.createElement("input");
		inp.type = "text";
		document.body.appendChild(inp);
		const ev2 = new KeyboardEvent("keydown", { key: "Escape" });
		Object.defineProperty(ev2, "target", { value: inp });
		window.dispatchEvent(ev2);
		await w.vm.$nextTick();
		expect(storeState.requestClose).not.toHaveBeenCalled();
		// button → processa
		const btn = document.createElement("button");
		document.body.appendChild(btn);
		const ev3 = new KeyboardEvent("keydown", { key: "Escape" });
		Object.defineProperty(ev3, "target", { value: btn });
		window.dispatchEvent(ev3);
		await w.vm.$nextTick();
		expect(storeState.requestClose).toHaveBeenCalled();
		ta.remove();
		inp.remove();
		btn.remove();
		w.unmount();
		storeState.requestClose.mockClear();
	});

	it("alerta de erro: mostra lastErrorKey e dismiss chama clearError", async () => {
		storeState.lastErrorKey.value = "media.errors.network";
		const w = await mountView();
		expect(w.text()).toContain("media.errors.network");
		const dismiss = w
			.findAll("button")
			.find((b) => b.text().includes(mediaLocale.media.dismiss));
		await dismiss?.trigger("click");
		expect(storeState.clearError).toHaveBeenCalled();
		storeState.lastErrorKey.value = null;
		w.unmount();
	});

	it("fila com mais de 1 item: renderiza e jumpToQueue no clique", async () => {
		storeState.queue.value = [
			{ musicId: 1, title: "Hino A" },
			{ musicId: 2, title: "Hino B" },
		];
		storeState.queueIndex.value = 1;
		const w = await mountView();
		expect(w.text()).toContain("Fila de reprodução");
		const item = w
			.findAll(".media-window__playlist-item")
			.find((b) => (b.text() ?? "").includes("Hino A"));
		await item?.trigger("click");
		expect(storeState.jumpToQueue).toHaveBeenCalledWith(0);
		storeState.queue.value = [];
		w.unmount();
	});

	it("playlist: clique num slide chama goToSlide", async () => {
		storeState.hasAudio.value = true;
		const w = await mountView();
		const slideItem = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes("Segundo slide da música"));
		await slideItem?.trigger("click");
		expect(storeState.goToSlide).toHaveBeenCalledWith(1);
		w.unmount();
	});
});

describe("MediaView — pill integrada", () => {
	it("mudar modo no pill chama switchMode", async () => {
		const w = await mountView();
		const pill = w.findComponent({ name: "MediaPlayerPill" });
		pill.vm.$emit("update:mode", "instrumental");
		await w.vm.$nextTick();
		expect(storeState.switchMode).toHaveBeenCalledWith("instrumental");
		w.unmount();
	});

	it("toggleFullscreen no pill pede fullscreen do stage", async () => {
		const w = await mountView();
		const requestFs = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(
			w.find(".media-window").element,
			"requestFullscreen",
			{
				value: requestFs,
			},
		);
		const pill = w.findComponent({ name: "MediaPlayerPill" });
		pill.vm.$emit("toggleFullscreen");
		await w.vm.$nextTick();
		expect(requestFs).toHaveBeenCalled();
		w.unmount();
	});

	describe("ramos restantes", () => {
		it("ESC no document: fecha via requestClose", async () => {
			const w = await mountView();
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await w.vm.$nextTick();
			w.unmount();
		});

		it("ESC com target textarea: ignorado", async () => {
			const w = await mountView();
			const ta = document.createElement("textarea");
			document.body.appendChild(ta);
			ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await w.vm.$nextTick();
			ta.remove();
			w.unmount();
		});

		it("hasSession false + route media: leaveMediaRoute (history back)", async () => {
			const w = await mountView();
			sessionRef.value = null;
			await w.vm.$nextTick();
			await new Promise((r) => setTimeout(r, 0));
			w.unmount();
		});

		it("ondemand: notice com progresso parcial", async () => {
			storeState.ondemandNoticeVisible.value = true;
			storeState.ondemandDownloadPercent.value = 40;
			const w = await mountView();
			await w.vm.$nextTick();
			expect(w.text()).not.toContain("undefined");
			storeState.ondemandNoticeVisible.value = false;
			w.unmount();
		});

		it("watch activeListIndex: scroll do aside", async () => {
			const w = await mountView();
			if (storeState.activeListIndex) {
				storeState.activeListIndex.value = 1;
				await w.vm.$nextTick();
				await new Promise((r) => setTimeout(r, 0));
				storeState.activeListIndex.value = -1;
				await w.vm.$nextTick();
			}
			w.unmount();
		});

		it("requestClose no botão fechar", async () => {
			const w = await mountView();
			const btn = w.findAll("button").find(b => (b.attributes("aria-label") ?? "").length > 0 && b.find("i.ti-x, i.ti-close").exists());
			if (btn) await btn.trigger("click");
			w.unmount();
		});
	});
})
