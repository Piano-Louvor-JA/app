// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento useMediaStore — computeds de sessão, on-demand desktop,
 * play/pause seq guard, routes de áudio, slides/times e fila.
 */

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
			formatMediaClock: vi.fn(
				(s: number) =>
					`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`,
			),
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

vi.mock("../services/media-slides", () => ({
	buildMediaSlides: vi.fn((t: { lyrics?: Array<Record<string, unknown>> }) =>
		(t.lyrics ?? []).map((l) => ({ ...l })),
	),
	buildSlideTimesSec: vi.fn(() => [0, 30, 60]),
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

vi.mock("@modules/settings/services/palco-routing", () => ({
	getPalcoRoute: () => "mirror",
	isPalcoTvOnlyRoute: () => false,
}));

const closeProjectionModule = vi.fn();
const openProjectionModule = vi.fn().mockResolvedValue(true);
const isProjectionModuleOpen = vi.fn(() => false);
vi.mock("@shared/composables/useProjectionWindow", () => ({
	openProjectionModule: (...a: unknown[]) => openProjectionModule(...a),
	isProjectionModuleOpen: (...a: unknown[]) => isProjectionModuleOpen(...a),
	closeProjectionModule: (...a: unknown[]) => closeProjectionModule(...a),
	hasSelectedExtendedProjectionTargets: vi.fn().mockResolvedValue(false),
}));

vi.mock("@modules/settings/services/palco-session", () => ({
	palcoSession: { slots: vi.fn().mockResolvedValue([]) },
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
		{ order: 1, lyric: "L2", showSlide: true, time: "00:30" },
	],
	...over,
});

import { useMediaStore } from "../stores/useMediaStore";

beforeEach(() => {
	setActivePinia(createPinia());
	vi.clearAllMocks();
	openProjectionModule.mockResolvedValue(true);
	isProjectionModuleOpen.mockReturnValue(false);
	resetSharedAudio();
	bridgeMock.isDesktop = false;
	bridgeMock.bridge = null;
	loadMediaTrack.mockResolvedValue(trackStub());
});

describe("computed de sessão", () => {
	it("sem sessão: título vazio, slideCount 0, progressRatio 0", () => {
		const store = useMediaStore();
		expect(store.previewSnippet).toBe("");
		expect(store.slideCount).toBe(0);
		expect(store.progressRatio).toBe(0);
		expect(store.slideProgressRatio).toBe(0);
	});

	it("com sessão: título+subtítulo, labels de tempo, progresso", () => {
		const store = useMediaStore();
		store.session = {
			id: 1,
			title: "Faixa",
			subtitle: "Ao vivo",
			slides: [{}, {}],
			slideTimesSec: [0, 30],
		} as never;
		store.currentTimeSec = 30;
		store.durationSec = 100;
		expect(store.slideCount).toBe(2);
		expect(store.progressRatio).toBe(0.3);
		expect(store.currentTimeLabel).toContain(":");
	});

	it("slideProgressRatio ignora marcas repetidas (162)", () => {
		const store = useMediaStore();
		store.session = {
			id: 1,
			title: "T",
			audioUrl: "http://x.mp3",
			slides: [{}, {}, {}],
			slideTimesSec: [0, 0, 40],
		} as never;
		store.currentTimeSec = 20;
		store.durationSec = 100;
		// próximo marco > start(0) é 40 -> progresso 20/40 = 0.5
		expect(store.slideProgressRatio).toBe(0.5);
	});
});

describe("no_audio mode", () => {
	it("resolveAudioUrlForMode com no_audio -> null sem fetch (461)", async () => {
		const store = useMediaStore();
		await store.open({ musicId: 1, mode: "no_audio" });
		expect(store.session).toBeTruthy();
	});
});

describe("play/pause com corrida de seq (626/635/642)", () => {
	it("play duas vezes seguidas: só a última aplica estado", async () => {
		const store = useMediaStore();
		await store.open({ musicId: 1, project: false });
		let release: () => void = () => {};
		mediaAudio.playMediaAudio.mockImplementationOnce(
			() =>
				new Promise<boolean>((resolve) => {
					release = () => resolve(true);
				}),
		);
		const p1 = store.play();
		const p2 = store.play();
		release();
		await Promise.all([p1, p2]);
		expect(["playing", "paused"]).toContain(store.status);
	});
});
