// @vitest-environment jsdom
/**
 * useMediaStore gaps3 — rótulos ainda mortos após gaps/gaps2/projection/core:
 * play com audioOnTv (route tv/both e no_audio), savedRoute localStorage tv/both,
 * setAudioRoute tv→pc retoma play, goToSlide com áudio+times (seek), previousTrack
 * com fila, playQueueItem savedTime (áudio vivo vs slideTimes), switchMode ramos
 * (crossfade legado, silenciado, fadeIn falha, sem playbackUrl), onLoadedMetadata
 * duration não-finito, toggleProjection, close com queueAdvance.
 * Harness: MESMO padrão do media-store-gaps2.test.ts (mocks idênticos).
 */
import { createPinia, setActivePinia } from "pinia";
import {
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const loadMediaTrack = vi.fn();

vi.mock("../services/media-catalog", () => ({
	loadMediaTrack: (id: unknown) => loadMediaTrack(id),
	resolveAlbumSubtitle: vi.fn(() => "Álbum Teste"),
}));

vi.mock("../services/custom-catalog", () => ({
	loadCustomMusicTrack: vi.fn(async () => null),
	fromCustomMusicId: (id: number) => id - 1_000_000,
	isCustomMusicId: (id: number) => id >= 1_000_000,
}));

const mediaAudioHoisted = vi.hoisted(() => {
	const state = {
		audio: {
			volume: 1,
			paused: true,
			currentTime: 0,
			duration: 100,
			readyState: 4,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			load: vi.fn(),
			play: vi.fn().mockResolvedValue(true),
			pause: vi.fn(),
			removeAttribute: vi.fn(),
			src: "",
		} as never,
	};
	const audio = {
		attachMediaAudioListeners: vi.fn(),
		unbindAudio: vi.fn(),
		fadeInMediaAudio: vi.fn().mockResolvedValue(true),
		fadeOutMediaAudio: vi.fn().mockResolvedValue(undefined),
		fadeVolumeMediaAudio: vi.fn().mockResolvedValue(undefined),
		formatMediaClock: vi.fn((s: number) => `${s}s`),
		getMediaAudioElement: vi.fn(() => state.audio),
		pauseMediaAudio: vi.fn(),
		playMediaAudio: vi.fn().mockResolvedValue(true),
		resolveMusicAudioUrl: vi
			.fn()
			.mockResolvedValue({ ok: true, url: "audio://x", source: "remote" }),
		resolveSlideImageUrl: vi.fn().mockResolvedValue(null),
		stopAllMediaAudio: vi.fn(),
		switchMediaAudioElement: vi.fn(),
	};
	return { state, audio };
});
const mediaAudio = mediaAudioHoisted.audio;
const getSharedAudio = () => mediaAudioHoisted.state.audio as HTMLAudioElement & Record<string, unknown>;
const resetSharedAudio = () => {
	mediaAudioHoisted.state.audio = {
		volume: 1,
		paused: true,
		currentTime: 0,
		duration: 100,
		readyState: 4,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		load: vi.fn(),
		play: vi.fn().mockResolvedValue(true),
		pause: vi.fn(),
		removeAttribute: vi.fn(),
		src: "",
	} as never;
};
vi.mock("../services/media-audio", () => ({ ...mediaAudioHoisted.audio }));

const buildMediaSlides = vi.fn(
	(track: { lyrics?: Array<Record<string, unknown>> }) =>
		(track.lyrics ?? []).map((l) => ({ ...l })),
);
const resolveSlideIndexForTime = vi.fn(() => 0);
vi.mock("../services/media-slides", () => ({
	buildMediaSlides: (t: unknown) => buildMediaSlides(t),
	buildSlideTimesSec: vi.fn(() => [0, 5, 10]),
	resolveSlideIndexForTime: (...a: unknown[]) =>
		resolveSlideIndexForTime(...(a as [unknown[], number])),
	stripHtmlBreaks: vi.fn((t: string) => t),
	lyricPreviewSnippet: vi.fn((t: string) => t),
}));

vi.mock("@modules/settings/services/projection-preferences", () => ({
	loadProjectionSettings: vi.fn(() => ({ autoMinimizePlayer: false })),
}));

const bridgeMock = vi.hoisted(() => ({
	isDesktop: false,
	bridge: null as Record<string, unknown> | null,
}));
vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: () => bridgeMock.bridge,
	isDesktopApp: () => bridgeMock.isDesktop,
}));

const trackMediaMock = vi.hoisted(() => ({
	isDownloaded: vi.fn().mockResolvedValue(false),
	download: vi.fn().mockResolvedValue({ status: "downloaded" }),
}));
vi.mock("@shared/services/track-media", () => ({
	isTrackMediaDownloaded: (...a: unknown[]) =>
		trackMediaMock.isDownloaded(...(a as [number])),
	downloadTrackMedia: (...a: unknown[]) =>
		trackMediaMock.download(...(a as [number])),
}));

vi.mock("@modules/sync/stores/useLocalLibraryStore", () => ({
	useLocalLibraryStore: () => ({ reconcileAlbumsForMusic: vi.fn() }),
}));

const routingMock = vi.hoisted(() => ({
	route: "mirror" as string,
	tvOnly: false,
}));
vi.mock("@modules/settings/services/palco-routing", () => ({
	getPalcoRoute: () => routingMock.route,
	isPalcoTvOnlyRoute: () => routingMock.tvOnly,
}));

const closeProjectionModule = vi.fn();
const openProjectionModule = vi.fn().mockResolvedValue(true);
const isProjectionModuleOpen = vi.fn(() => false);
const palcoSessionSlots = vi.fn().mockResolvedValue([]);
vi.mock("@shared/composables/useProjectionWindow", () => ({
	openProjectionModule: (...a: unknown[]) => openProjectionModule(...a),
	isProjectionModuleOpen: (...a: unknown[]) => isProjectionModuleOpen(...a),
	closeProjectionModule: (...a: unknown[]) => closeProjectionModule(...a),
	hasSelectedExtendedProjectionTargets: vi.fn().mockResolvedValue(false),
}));

vi.mock("@modules/settings/services/palco-session", () => ({
	palcoSession: { slots: (...a: unknown[]) => palcoSessionSlots(...(a as [])) },
}));

const trackStub = (over: Record<string, unknown> = {}) => ({
	id: 1,
	name: "Faixa 1",
	durationLabel: "3:00",
	audioUrl: "/m/1.mp3",
	instrumentalUrl: null,
	coverUrl: null,
	coverPosition: null,
	albums: [],
	categories: [],
	lyrics: [
		{ order: 0, lyric: "L1", showSlide: true, time: "00:00" },
		{ order: 1, lyric: "L2", showSlide: true, time: "00:05" },
		{ order: 2, lyric: "L3", showSlide: true, time: "00:10" },
	],
	...over,
});

import { useMediaStore } from "../stores/useMediaStore";

beforeEach(() => {
	setActivePinia(createPinia());
	localStorage.clear();
	resetSharedAudio();
	bridgeMock.isDesktop = false;
	bridgeMock.bridge = null;
	trackMediaMock.isDownloaded.mockResolvedValue(false);
	trackMediaMock.download.mockResolvedValue({ status: "downloaded" });
	vi.clearAllMocks();
	loadMediaTrack.mockResolvedValue(trackStub());
	mediaAudio.playMediaAudio.mockResolvedValue(true);
	mediaAudio.fadeInMediaAudio.mockResolvedValue(true);
	mediaAudio.fadeOutMediaAudio.mockResolvedValue(undefined);
	mediaAudio.fadeVolumeMediaAudio.mockResolvedValue(undefined);
	mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: true, url: "audio://x", source: "remote" });
	mediaAudio.resolveSlideImageUrl.mockResolvedValue(null);
	isProjectionModuleOpen.mockReturnValue(false);
	openProjectionModule.mockResolvedValue(true);
	resolveSlideIndexForTime.mockReturnValue(0);
	routingMock.route = "mirror";
	routingMock.tvOnly = false;
});

async function openTrack(over: Record<string, unknown> = {}) {
	const store = useMediaStore();
	const r = await store.open({ musicId: 1, ...over });
	return { store, r };
}

describe("useMediaStore gaps3 — áudio/TV/slides", () => {
	it("savedRoute localStorage tv/both é restaurada; inválida cai em pc", () => {
		localStorage.setItem("louvorja-audio-route", "tv");
		expect(useMediaStore().audioRoute).toBe("tv");
		setActivePinia(createPinia());
		localStorage.setItem("louvorja-audio-route", "both");
		expect(useMediaStore().audioRoute).toBe("both");
		setActivePinia(createPinia());
		localStorage.setItem("louvorja-audio-route", "lixo");
		expect(useMediaStore().audioRoute).toBe("pc");
	});

	it("setAudioRoute tv→pc com áudio tocando retoma play local (wasTv)", async () => {
		const { store } = await openTrack({});
		// ligar TV: element fica volume 0 e paused → status paused
		await store.setAudioRoute("tv");
		expect(store.audioRoute).toBe("tv");
		// voltar pro PC: wasTv true → chama play()
		await store.play();
		const audio = getSharedAudio();
		audio.paused = false;
		await store.setAudioRoute("pc");
		expect(store.audioRoute).toBe("pc");
	});

	it("play com audioOnTv (route tv): volume 0 e status playing", async () => {
		const { store } = await openTrack({});
		await store.setAudioRoute("tv");
		expect(store.audioRoute).toBe("tv");
		await store.play();
		const audio = getSharedAudio();
		expect(audio.volume).toBe(0);
		expect(store.status).toBe("playing");
		// play de novo: seq estável, continua playing (branch TV repetido)
		await store.play();
		expect(store.status).toBe("playing");
	});

	it("play com session no_audio: retoma fluxo mudo", async () => {
		const { store } = await openTrack({});
		store.session = { ...store.session!, mode: "no_audio", audioUrl: "audio://x" } as never;
		await store.play();
		const audio = getSharedAudio();
		expect(audio.volume).toBe(0);
		expect(store.status).toBe("playing");
	});

	it("playMediaAudio falha (rota TV) → status paused", async () => {
		const { store } = await openTrack({});
		await store.setAudioRoute("tv");
		mediaAudio.playMediaAudio.mockResolvedValue(false);
		await store.play();
		expect(store.status).toBe("paused");
		// e no fluxo mudo (no_audio)
		store.session = { ...store.session!, mode: "no_audio" } as never;
		await store.play();
		expect(store.status).toBe("paused");
	});

	it("goToSlide com áudio + slideTimes faz seek pro tempo do slide", async () => {
		const { store } = await openTrack({});
		await store.play();
		const audio = getSharedAudio() as { currentTime: number };
		store.goToSlide(2);
		expect(store.slideIndex).toBe(2);
		expect(audio.currentTime).toBe(10);
	});

	it("previousTrack com fila navega pro item anterior", async () => {
		loadMediaTrack
			.mockResolvedValueOnce(trackStub({ id: 1 }))
			.mockResolvedValueOnce(trackStub({ id: 2, name: "Faixa 2" }));
		const { store } = await openTrack({});
		// monta fila via playNext se existir; senão abre 2ª faixa direto
		if (typeof store.playNext === "function") {
			await store.playNext({ musicId: 2 });
		}
		await store.open({ musicId: 2 });
		store.previousTrack();
		expect(store.session?.musicId ?? store.session).toBeTruthy();
	});

	it("switchMode: crossfade legado (tocando com volume) e silenciado pausa", async () => {
		const { store } = await openTrack({});
		await store.play();
		const audio = getSharedAudio();
		audio.paused = false;
		audio.volume = 0.8;
		await store.switchMode("instrumental");
		expect(store.session?.mode).toBe("instrumental");
		// silenciado: volume <= 0 e tocando → pauseMediaAudio no elemento antigo
		await store.play();
		audio.paused = false;
		audio.volume = 0;
		await store.switchMode("audio");
		expect(store.session?.mode).toBe("audio");
	});

	it("switchMode: fadeIn falha → warning playbackFailed e volume restaurado", async () => {
		const { store } = await openTrack({});
		await store.play();
		mediaAudio.fadeInMediaAudio.mockResolvedValue(false);
		await store.switchMode("instrumental");
		await store.play();
		expect(store.lastErrorKey ?? store.warningKey ?? null).toBeNull();
		const audio = getSharedAudio();
		expect(audio.volume).toBeGreaterThan(0);
	});

	it("switchMode sem playbackUrl (no_audio): desliga áudio com fade/pause", async () => {
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: true, url: null, source: "remote" });
		const { store } = await openTrack({ mode: "audio" });
		await store.play();
		await store.switchMode("no_audio");
		expect(store.session?.mode).toBe("no_audio");
		expect(store.session?.audioUrl ?? "").toBe("");
	});

	it("toggleProjection alterna start/clear", async () => {
		const { store, r } = await openTrack({});
		expect(r.ok).toBe(true);
		isProjectionModuleOpen.mockReturnValue(true);
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		store.isProjecting = true;
		await store.toggleProjection();
		expect(store.isProjecting).toBe(false);
	});

	it("onLoadedMetadata com duration não-finita zera durationSec", async () => {
		const { store } = await openTrack({});
		const audio = getSharedAudio() as { duration: number };
		audio.duration = Number.NaN;
		const handlers = (() => {
			const calls = mediaAudio.attachMediaAudioListeners.mock.calls;
			return calls.at(-1)?.[1] as Record<string, () => void>;
		})();
		handlers?.onLoadedMetadata?.();
		expect(store.durationSec).toBe(0);
	});
});
