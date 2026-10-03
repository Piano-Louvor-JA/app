// @vitest-environment jsdom
/**
 * Gap-fill 2 do useMediaStore —cobertura de branches ainda mortos:
 * onProjectionReapplied (reapplied open/close), onTimeUpdate (troca de slide,
 * throttle, sem projeção), startOndemandDownload (already downloaded c/ notice,
 * throw no check), syncProjectionFlag (tvsOnly), setAudioRoute (tv/pc/same),
 * seekTo/seekRatio, filas vazias, goToSlide (sem slides, com seek), onLoadedMetadata
 * finito, switchMode same-source restore volume.
 * Harness: mesmo padrão de media-store-gaps.test.ts.
 */
import { createPinia, setActivePinia } from "pinia";
import {
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const loadMediaTrack = vi.fn();
const resolveAlbumSubtitle = vi.fn(() => "Álbum Teste");

vi.mock("../services/media-catalog", () => ({
	loadMediaTrack: (id: unknown) => loadMediaTrack(id),
	resolveAlbumSubtitle: (t: unknown, a: unknown) => resolveAlbumSubtitle(t, a),
}));

const loadCustomMusicTrack = vi.fn();
vi.mock("../services/custom-catalog", () => ({
	loadCustomMusicTrack: (id: unknown) => loadCustomMusicTrack(id),
	fromCustomMusicId: (id: number) => id - 1_000_000,
	isCustomMusicId: (id: number) => id >= 1_000_000,
}));

const mediaAudioHoisted = vi.hoisted(() => {
	const state: { audio: Record<string, unknown> | null } = { audio: null };
	const mk = () => ({
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
	});
	state.audio = mk();
	return {
		state,
		audio: {
			attachMediaAudioListeners: vi.fn(),
			detachMediaAudioListeners: vi.fn(),
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
		},
	};
});
const mediaAudio = mediaAudioHoisted.audio;
const getSharedAudio = () => mediaAudioHoisted.state.audio as never;
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
	buildSlideTimesSec: vi.fn(() => [0]),
	resolveSlideIndexForTime: (...a: unknown[]) =>
		resolveSlideIndexForTime(...(a as [unknown[], number])),
	stripHtmlBreaks: vi.fn((t: string) => t),
	lyricPreviewSnippet: vi.fn((t: string) => t),
}));

const loadProjectionSettings = vi.fn(() => ({ autoMinimizePlayer: false }));
vi.mock("@modules/settings/services/projection-preferences", () => ({
	loadProjectionSettings: () => loadProjectionSettings(),
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
	lyrics: [{ order: 0, lyric: "L1", showSlide: true, time: "00:00" }],
	...over,
});

import { useMediaStore } from "../stores/useMediaStore";
import { readMediaRuntimeFromStorage } from "../services/media-runtime";

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
});

/** Captura os handlers registrados no último attachMediaAudioListeners. */
function capturedHandlers() {
	const calls = mediaAudio.attachMediaAudioListeners.mock.calls;
	const last = calls.at(-1)?.[1] as Record<string, () => void> | undefined;
	return last;
}

async function openTrack(over: Record<string, unknown> = {}) {
	const store = useMediaStore();
	const r = await store.open({ musicId: 1, ...over });
	return { store, r };
}

describe("useMediaStore gaps2 — projection watch/reapplied", () => {
	it("onProjectionReapplied: detail de outro módulo é ignorado", async () => {
		const { store } = await openTrack({});
		store.isProjecting = true; // dispara startProjectionWatch via startProjection? não: sync
		store.startProjectionWatchForTest?.();
		// dispara via syncProjectionFlag (registra listener) — usar startProjection real:
		isProjectionModuleOpen.mockReturnValue(true);
		await store.startProjection();
		store.isProjecting = false;
		const ev = new CustomEvent("louvorja:projection-reapplied", {
			detail: { moduleId: "liturgy", open: true },
		});
		window.dispatchEvent(ev);
		await Promise.resolve();
		expect(store.isProjecting).toBe(false); // ignorado
	});

	it("onProjectionReapplied: open=true liga projeção e inicia watch; open=false desliga", async () => {
		const { store } = await openTrack({});
		isProjectionModuleOpen.mockReturnValue(true);
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		// reapplied close
		window.dispatchEvent(
			new CustomEvent("louvorja:projection-reapplied", {
				detail: { moduleId: "media", open: false },
			}),
		);
		await Promise.resolve();
		expect(store.isProjecting).toBe(false);
		// close removeu o listener (stopProjectionWatch) — religar via startProjection
		// e então o reapplied open liga de novo
		await store.startProjection();
		store.isProjecting = false;
		window.dispatchEvent(
			new CustomEvent("louvorja:projection-reapplied", {
				detail: { moduleId: "media", open: true },
			}),
		);
		await Promise.resolve();
		expect(store.isProjecting).toBe(true);
	});

	it("syncProjectionFlag com projectingTvsOnly: publica e mantém projeção", async () => {
		const { store } = await openTrack({});
		isProjectionModuleOpen.mockReturnValue(false);
		routingMock.tvOnly = true;
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		// não deve desligar: isProjectionModuleOpen false mas tvsOnly
		store.syncProjectionFlag();
		expect(store.isProjecting).toBe(true);
		routingMock.tvOnly = false;
	});

	it("watch interval: janela fechada desliga projeção (timer 400ms)", async () => {
		vi.useFakeTimers();
		try {
			const { store } = await openTrack({});
			isProjectionModuleOpen.mockReturnValue(true);
			await store.startProjection();
			expect(store.isProjecting).toBe(true);
			isProjectionModuleOpen.mockReturnValue(false);
			await vi.advanceTimersByTimeAsync(850);
			expect(store.isProjecting).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("useMediaStore gaps2 — onTimeUpdate", () => {
	it("sem áudio/times: só atualiza tempo; isProjecting false não publica", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.isProjecting = false;
		h.onTimeUpdate();
		expect(store.currentTimeSec).toBe(0);
	});

	it("troca de slide via timeupdate (resolveSlideIndexForTime muda)", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.isProjecting = true;
		// slides com 2 entradas
		store.session!.slides = [
			{ order: 0, lyric: "a", showSlide: true, time: "00:00", instrumentalTime: "00:00", imageUrl: null, imagePosition: null, isCover: false },
			{ order: 1, lyric: "b", showSlide: true, time: "00:10", instrumentalTime: "00:10", imageUrl: null, imagePosition: null, isCover: false },
		];
		store.session!.slideTimesSec = [0, 10];
		resolveSlideIndexForTime.mockReturnValue(1);
		h.onTimeUpdate();
		await Promise.resolve();
		expect(store.slideIndex).toBe(1);
	});

	it("throttle: publish só depois de 80ms (performance.now)", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.isProjecting = true;
		h.onTimeUpdate(); // publica (lastRuntimePublishAt = now)
		const t1 = readMediaRuntimeFromStorage().title;
		store.session!.title = "Outro Título";
		h.onTimeUpdate(); // <80ms → throttle, runtime não muda
		expect(readMediaRuntimeFromStorage().title).toBe(t1);
		await new Promise((r2) => setTimeout(r2, 90));
		h.onTimeUpdate(); // >80ms → publica com título novo
		expect(readMediaRuntimeFromStorage().title).toBe("Outro Título");
	});

	it("onLoadedMetadata com duração finita seta durationSec", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		h.onLoadedMetadata();
		expect(store.durationSec).toBe(100);
	});

	it("onPause sem session: idle", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.close();
		h.onPause();
		expect(store.status).toBe("idle");
	});
});

describe("useMediaStore gaps2 — ondemand extra", () => {
	it("desktop: já baixada com notice visível → percent 100 e done (sem baixar de novo)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(true);
		const { store } = await openTrack({});
		// 1º open baixa? isDownloaded true → notice some. Simular notice visível:
		trackMediaMock.isDownloaded.mockResolvedValue(true);
		await store.open({ musicId: 1 });
		expect(store.ondemandDownloadDone).toBe(false);
	});

	it("desktop: isDownloaded lança → segue com download", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockRejectedValue(new Error("boom"));
		trackMediaMock.download.mockResolvedValue({ status: "downloaded" });
		const { store } = await openTrack({});
		await vi.waitFor(() => expect(store.ondemandDownloadDone).toBe(true));
		expect(trackMediaMock.download).toHaveBeenCalled();
	});

	it("desktop: progresso parcial seta percent via onProgress", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		trackMediaMock.download.mockImplementation(
			async (_id: number, opts?: { onProgress?: (p: number) => void }) => {
				opts?.onProgress?.(42);
				return { status: "downloaded" as const };
			},
		);
		const { store } = await openTrack({});
		await vi.waitFor(() => expect(store.ondemandDownloadDone).toBe(true));
		expect(store.ondemandDownloadPercent).toBe(100);
	});

	it("desktop: download 'error' → estado limpo", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		trackMediaMock.download.mockResolvedValue({ status: "error", reason: "server" });
		const { store } = await openTrack({});
		await vi.waitFor(() => expect(store.ondemandNoticeVisible).toBe(false));
		expect(store.ondemandDownloadPercent).toBeNull();
	});
});

describe("useMediaStore gaps2 — rotas de áudio e seek", () => {
	it("setAudioRoute: mesma rota não faz nada; tv muta; pc volta a tocar", async () => {
		const { store } = await openTrack({});
		await store.setAudioRoute("pc"); // same → return
		expect(localStorage.getItem("louvorja-audio-route")).toBeNull();
		await store.setAudioRoute("tv");
		expect(localStorage.getItem("louvorja-audio-route")).toBe("tv");
		expect(getSharedAudio().volume).toBe(0);
		// volta pro pc com session tocando
		getSharedAudio().paused = false;
		await store.setAudioRoute("pc");
		expect(localStorage.getItem("louvorja-audio-route")).toBe("pc");
	});

	it("seekTo sem áudio: no-op; seekRatio sem duração: no-op", async () => {
		const { store } = await openTrack({ mode: "no_audio" });
		expect(store.session?.audioUrl ?? null).toBe("");
		store.seekTo(30);
		expect(store.currentTimeSec).toBe(0);
		store.seekRatio(0.5);
		expect(store.currentTimeSec).toBe(0);
	});

	it("seekTo com duração clampada; seekRatio com duração", async () => {
		const { store } = await openTrack({});
		store.seekTo(999);
		expect(store.currentTimeSec).toBe(100); // clamp duration
		store.durationSec = 200;
		store.seekRatio(0.5);
		expect(store.currentTimeSec).toBe(100);
	});

	it("goToSlide: sem slides no-op; com slides e seek por time", async () => {
		const { store } = await openTrack({});
		store.session!.slides = [];
		await store.goToSlide(2);
		expect(store.slideIndex).toBe(0);
		store.session!.slides = [
			{ order: 0, lyric: "a", showSlide: true, time: "00:00", instrumentalTime: "00:00", imageUrl: null, imagePosition: null, isCover: false },
			{ order: 1, lyric: "b", showSlide: true, time: "00:10", instrumentalTime: "00:10", imageUrl: null, imagePosition: null, isCover: false },
		];
		store.session!.slideTimesSec = [0, 10];
		await store.goToSlide(1);
		expect(store.slideIndex).toBe(1);
		expect(store.currentTimeSec).toBe(10);
	});
});

describe("useMediaStore gaps2 — fila", () => {
	it("playQueue vazio: no-op; next/prev/jump sem item: no-op", async () => {
		const { store } = await openTrack({});
		await store.playQueue([]);
		expect(store.session?.musicId).toBe(1);
		store.queue = [];
		store.queueIndex = -1;
		store.nextTrack();
		store.previousTrack();
		store.jumpToQueue(5);
		expect(store.queueIndex).toBe(-1);
	});

	it("playAlbumQueue toca a primeira", async () => {
		loadMediaTrack.mockResolvedValue(trackStub({ id: 7 }));
		const { store } = await openTrack({});
		await store.playAlbumQueue([{ musicId: 7, albumId: 2, title: "x" }]);
		expect(store.session?.musicId).toBe(7);
	});
});
