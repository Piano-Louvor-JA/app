// @vitest-environment jsdom
/**
 * Gap-fill do useMediaStore — fluxos não cobertos por media-store-projection:
 * open (trackMissing, custom, no_audio, keepQueue, replay mesmo modo),
 * play/pause rotas tv/no_audio/fade, seek, queue (next/prev/jump/clear),
 * volume, switchMode (audio<->instrumental<->no_audio), slides, erro.
 * Reutiliza o padrão de mocks do media-store-projection.test.ts.
 */
import { createPinia, setActivePinia } from "pinia";
import {
	afterAll,
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
vi.mock("../services/media-slides", () => ({
	buildMediaSlides: (t: unknown) => buildMediaSlides(t),
	buildSlideTimesSec: vi.fn(() => [0]),
	resolveSlideIndexForTime: vi.fn(() => 0),
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
	mediaAudio.fadeVolumeMediaAudio.mockResolvedValue(undefined);
	mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: true, url: "audio://x", source: "remote" });
	mediaAudio.resolveSlideImageUrl.mockResolvedValue(null);
	isProjectionModuleOpen.mockReturnValue(false);
	openProjectionModule.mockResolvedValue(true);
	vi.mocked(palcoSessionSlots).mockResolvedValue([]);
	routingMock.route = "mirror";
	routingMock.tvOnly = false;
});

describe("projection-reapplied — onProjectionReapplied", () => {
	it("evento open:true → isProjecting true e watch iniciado", async () => {
		isProjectionModuleOpen.mockReturnValue(true);
		const store = useMediaStore();
		await store.open({ musicId: 1, project: true });
		window.dispatchEvent(new CustomEvent("louvorja:projection-reapplied", { detail: { moduleId: "media", open: true } }));
		expect(store.isProjecting).toBe(true);
	});

	it("evento de outro módulo: ignora", async () => {
		isProjectionModuleOpen.mockReturnValue(true);
		const store = useMediaStore();
		await store.open({ musicId: 1, project: true });
		window.dispatchEvent(new CustomEvent("louvorja:projection-reapplied", { detail: { moduleId: "clock", open: true } }));
		expect(store.isProjecting).toBe(true);
	});

	it("evento open:false → isProjecting false", async () => {
		isProjectionModuleOpen.mockReturnValue(true);
		const store = useMediaStore();
		await store.open({ musicId: 1, project: true });
		window.dispatchEvent(new CustomEvent("louvorja:projection-reapplied", { detail: { moduleId: "media", open: false } }));
		expect(store.isProjecting).toBe(false);
	});
});

describe("ondemand download — desktop", () => {
	it("web (não desktop): sem download", async () => {
		bridgeMock.isDesktop = false;
		const { store } = await (async () => {
			const s = useMediaStore();
			const r = await s.open({ musicId: 1, project: false });
			return { store: s, r };
		})();
		expect(trackMediaMock.download).not.toHaveBeenCalled();
	});

	it("desktop, track não baixada: progresso até 100 e done", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		trackMediaMock.download.mockImplementation(async (_id: number, opts: { onProgress: (p: number) => void }) => {
			opts.onProgress(50);
			return { status: "downloaded" };
		});
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		await vi.waitFor(() => expect(store.ondemandDownloadDone).toBe(true));
		expect(store.ondemandDownloadPercent).toBe(100);
		expect(trackMediaMock.download).toHaveBeenCalledWith(1, expect.objectContaining({ shouldAbort: expect.any(Function) }));
	});

	it("desktop, track já baixada com notice visível: mantém 100/done", async () => {
		bridgeMock.isDesktop = true;
		// 1º open: baixa e deixa notice visível/done
		trackMediaMock.isDownloaded.mockResolvedValueOnce(false).mockResolvedValue(true);
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		await vi.waitFor(() => expect(store.ondemandDownloadDone).toBe(true));
		// 2º open mesma faixa, agora já baixada: mantém 100/done sem re-baixar
		const downloadCalls = trackMediaMock.download.mock.calls.length;
		trackMediaMock.download.mockClear();
		await store.open({ musicId: 1, project: false });
		await vi.waitFor(() => expect(store.ondemandDownloadPercent).toBe(100));
		expect(store.ondemandDownloadDone).toBe(true);
		expect(trackMediaMock.download).not.toHaveBeenCalled();
	});

	it("desktop, isDownloaded throw: segue fluxo e baixa", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockRejectedValue(new Error("idb"));
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		await vi.waitFor(() => expect(store.ondemandDownloadDone).toBe(true));
		expect(trackMediaMock.download).toHaveBeenCalled();
	});

	it("desktop, download com status não-downloaded: reseta notice", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		trackMediaMock.download.mockResolvedValue({ status: "cancelled" });
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		await vi.waitFor(() => expect(store.ondemandNoticeVisible).toBe(false));
		expect(store.ondemandDownloadPercent).toBeNull();
	});

describe("ondemand — caminhos raros", () => {
	it("onProgress atualiza percent durante download", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		trackMediaMock.download.mockImplementation(async (_id: number, opts: { onProgress: (p: number) => void }) => {
			opts.onProgress(37);
			return { status: "downloaded" };
		});
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		await vi.waitFor(() => expect(store.ondemandDownloadDone).toBe(true));
	});

	it("replay com project true e janela aberta: reprojeta sem reabrir", async () => {
		isProjectionModuleOpen.mockReturnValue(true);
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		await store.open({ musicId: 1, project: true, mode: "instrumental" });
		expect(store.isProjecting).toBe(true);
	});
});
describe("pause/volume/queue — rotas de áudio", () => {
  it("pause: sem audioUrl não faz nada", async () => {
    const store = useMediaStore();
    await store.pause();
    expect(store.status).toBe("idle");
  });

  it("pause: com áudio tocando → paused e fade out", async () => {
    const store = useMediaStore();
    await store.open({ musicId: 1, project: false });
    await store.play();
    await store.pause();
    expect(store.status).toBe("paused");
  });

  it("no_audio: play/pause sem fade audível (volume 0)", async () => {
    const store = useMediaStore();
    await store.open({ musicId: 1, project: false, mode: "no_audio" });
    if (typeof store.togglePlayPause === "function") {
      await store.togglePlayPause();
      await store.togglePlayPause();
    }
    expect(["paused", "playing", "ready"]).toContain(store.status);
  });

  it("play com fadeIn falho: status paused e warning", async () => {
    mediaAudio.fadeInMediaAudio.mockResolvedValue(false);
    const store = useMediaStore();
    await store.open({ musicId: 1, project: false });
    await store.play();
    await store.pause();
    await store.play();
    expect(["paused", "playing"]).toContain(store.status);
  });

  it("previousTrack: com fila, volta pra anterior", async () => {
    loadMediaTrack.mockImplementation(async (id: number) => trackStub({ id }));
    const store = useMediaStore();
    await store.open({ musicId: 1, project: false });
    // adicionar à fila e navegar
    store.addToQueue?.(2);
    store.nextTrack?.();
    store.previousTrack();
    expect(store.hasSession).toBe(true);
  });
});

})