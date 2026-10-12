// @vitest-environment jsdom
/**
 * Gaps2 do useMediaStore — arms de branch restantes (b=85.3 → 100):
 * preview subtitle, slideProgress, projection watch (tvsOnly/queue guard),
 * ondemand desktop guards + gen races, ensureTrackDownloaded, handlers de
 * áudio (times vazio/performance), replay branches, custom id, seq guards
 * de play/pause, audio route tv↔pc, seek NaN, goToSlide vazio, previousTrack
 * sem fila, switchMode no_audio→catch/sem url/!wasPlaying/duração NaN,
 * close com queueAdvance, syncProjectionFlag com módulo aberto.
 * Reutiliza o padrão de mocks do media-store-core.test.ts.
 */
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const resolveSlideIndexForTimeMock = vi.fn(() => 0);
vi.mock("../services/media-slides", () => ({
	buildMediaSlides: (t: unknown) => buildMediaSlides(t),
	buildSlideTimesSec: vi.fn(() => [0]),
	resolveSlideIndexForTime: (...a: unknown[]) =>
		resolveSlideIndexForTimeMock(...(a as [[], number])),
	stripHtmlBreaks: vi.fn((t: string) => t),
	lyricPreviewSnippet: vi.fn((t: string) => t),
	hasDistinctSlideTimes: (times: number[]) =>
		times.length >= 2 && times.every((time, index) => index === 0 || time > (times[index - 1] ?? 0)),
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
	mediaAudio.resolveMusicAudioUrl.mockResolvedValue({
		ok: true,
		url: "audio://x",
		source: "remote",
	});
	mediaAudio.resolveSlideImageUrl.mockResolvedValue(null);
	isProjectionModuleOpen.mockReturnValue(false);
	openProjectionModule.mockResolvedValue(true);
	vi.mocked(palcoSessionSlots).mockResolvedValue([]);
	routingMock.route = "mirror";
	routingMock.tvOnly = false;
});

const openTrack = async (over: Record<string, unknown> = {}) => {
	const store = useMediaStore();
	const r = await store.open({ musicId: 1, project: false, ...over });
	return { store, r };
};

const capturedHandlers = () => {
	const calls = mediaAudio.attachMediaAudioListeners.mock.calls;
	return calls.at(-1)?.[1] as Record<string, () => void> | undefined;
};

describe("gaps2 — computed e preview", () => {
	it("previewReference sem subtitle cai no join só com título (L142)", async () => {
		resolveAlbumSubtitle.mockReturnValueOnce("");
		const { store } = await openTrack({});
		expect(store.previewReference).toBe("Faixa 1");
	});

	it("slideProgressRatio com marca ausente usa ?? 0 (L161)", async () => {
		const { store } = await openTrack({});
		const sparse = [0, undefined as unknown as number, 6];
		store.session!.slideTimesSec = sparse;
		store.slideIndex = 0;
		store.currentTimeSec = 1;
		store.durationSec = 20;
		// índice 1: undefined ?? 0 (L161), 0 > 0 false; índice 2: 6 > 0 → end=6
		expect(store.slideProgressRatio).toBeCloseTo(1 / 6, 5);
	});

	it("slideProgressRatio sem próxima marca maior usa duração (L162)", async () => {
		const { store } = await openTrack({});
		store.session!.slideTimesSec = [0, 0];
		store.slideIndex = 1;
		store.currentTimeSec = 2;
		store.durationSec = 10;
		expect(store.slideProgressRatio).toBeCloseTo(0.2, 5);
	});

	it("playbackMode default 'audio' sem sessão (L1209)", () => {
		const store = useMediaStore();
		expect(store.playbackMode).toBe("audio");
	});
});

describe("gaps2 — projection watch", () => {
	it("projection-reapplied open com watch já ativo não duplica timer (L197)", async () => {
		const { store } = await openTrack({});
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		window.dispatchEvent(
			new CustomEvent("louvorja:projection-reapplied", {
				detail: { moduleId: "media", open: true },
			}),
		);
		// segunda passada com timer já ativo → branch L197 false
		window.dispatchEvent(
			new CustomEvent("louvorja:projection-reapplied", {
				detail: { moduleId: "media", open: true },
			}),
		);
		store.clearProjection();
	});

	it("tick do watch com queueAdvance em curso não roda guardas (L212)", async () => {
		const { store } = await openTrack({});
		vi.useFakeTimers();
		await store.startProjection();
		// playQueueItem em curso incrementa queueAdvanceInProgress
		loadMediaTrack.mockImplementationOnce(
			() => new Promise((resolve) => setTimeout(() => resolve(trackStub()), 50)),
		);
		store.isProjecting = true;
		store.queue.push({ musicId: 2, title: "T2", albumId: null });
		const p = store.playQueueItem(store.queue[0]);
		await vi.advanceTimersByTimeAsync(400); // tick durante advance
		await vi.advanceTimersByTimeAsync(60);
		await p;
		await vi.advanceTimersByTimeAsync(400);
		vi.useRealTimers();
		store.clearProjection();
	});

	it("tick do watch com tvsOnly não desliga projeção (L214 via projectingTvsOnly)", async () => {
		const { store } = await openTrack({});
		vi.useFakeTimers();
		routingMock.tvOnly = true;
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		isProjectionModuleOpen.mockReturnValue(false);
		await vi.advanceTimersByTimeAsync(400);
		expect(store.isProjecting).toBe(true); // tvsOnly return antes
		vi.useRealTimers();
		routingMock.tvOnly = false;
		store.clearProjection();
	});
});

describe("gaps2 — ondemand desktop guards", () => {
	it("startOndemandDownload fora do desktop retorna cedo (L273)", async () => {
		bridgeMock.isDesktop = false;
		const store = useMediaStore();
		// indireto: open dispara maybeStartOndemandDownload
		await openTrack({});
		await new Promise((r) => setTimeout(r, 0));
		expect(trackMediaMock.download).not.toHaveBeenCalled();
	});

	it("ensureTrackDownloaded no desktop com id inválido pula via open custom (L274 via start)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(true);
		const { r } = await openTrack({ musicId: -3 });
		expect(r.ok).toBe(false);
	});

	it("ondemand: download já baixada sem notice anterior limpa estado (L289-293)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(true);
		const { store } = await openTrack({});
		await new Promise((r) => setTimeout(r, 0));
		expect(store.ondemandDownloadPercent).toBe(null);
		expect(store.ondemandNoticeVisible).toBe(false);
	});

	it("ondemand: 2º download troca gen — progresso do 1º ignorado (L307/L310)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		let progress1!: (p: number) => void;
		trackMediaMock.download.mockImplementationOnce(
			async (_id: number, opts?: { onProgress?: (p: number) => void }) => {
				progress1 = opts!.onProgress!;
				await new Promise((r) => setTimeout(r, 20));
				return { status: "downloaded" as const };
			},
		);
		const store = useMediaStore();
		void store.open({ musicId: 1, project: false });
		await new Promise((r) => setTimeout(r, 5));
		await store.open({ musicId: 2, project: false });
		await new Promise((r) => setTimeout(r, 30));
		progress1(55); // gen stale — branch L307 true, percent mantém
		expect(store.ondemandDownloadPercent).toBe(100);
	});

	it("ensureTrackDownloaded: download em curso com 2ª open aborta via shouldAbort (L360/L363)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		let abort1: (() => boolean) | undefined;
		trackMediaMock.download.mockImplementationOnce(
			async (_id: number, opts?: { shouldAbort?: () => boolean }) => {
				abort1 = opts!.shouldAbort!;
				expect(abort1!()).toBe(false); // L360 arm false
				await new Promise((r) => setTimeout(r, 20));
				return { status: "downloaded" as const };
			},
		);
		await openTrack({ musicId: 1 });
		await new Promise((r) => setTimeout(r, 30));
		expect(abort1).toBeTruthy();
	});
});

describe("gaps2 — handlers de áudio", () => {
	it("onTimeUpdate sem sessão não quebra (L406 ?? [])", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.session = null;
		expect(() => h.onTimeUpdate()).not.toThrow();
	});

	it("onTimeUpdate sem marcas pula resolução de slide (L407)", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.session!.slideTimesSec = [];
		store.isProjecting = true;
		getSharedAudio().currentTime = 3;
		h.onTimeUpdate();
		expect(store.currentTimeSec).toBe(3);
	});

	it("onTimeUpdate publica runtime com performance ausente (L417)", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.session!.slideTimesSec = [];
		store.isProjecting = true;
		const perf = window.performance;
		// @ts-expect-error stub
		window.performance = undefined;
		getSharedAudio().currentTime = 4;
		h.onTimeUpdate();
		// @ts-expect-error restore
		window.performance = perf;
		expect(store.currentTimeSec).toBe(4);
	});
});

describe("gaps2 — open replay branches", () => {
	it("replay mesmo modo com volume 0 restaura antes de tocar (L487)", async () => {
		const { store } = await openTrack({});
		getSharedAudio().volume = 0;
		getSharedAudio().paused = true;
		const r = await store.open({ musicId: 1, project: false });
		expect(r.ok).toBe(true);
		expect(getSharedAudio().volume).toBe(store.volume);
	});

	it("replay mesmo modo com playMediaAudio false → paused (L492)", async () => {
		const { store } = await openTrack({});
		getSharedAudio().paused = true;
		mediaAudio.playMediaAudio.mockResolvedValueOnce(false);
		await store.open({ musicId: 1, project: false });
		expect(store.status).toBe("paused");
	});

	it("open custom id ≥1M usa loadCustomMusicTrack (L519)", async () => {
		loadCustomMusicTrack.mockResolvedValue(
			trackStub({ id: 7, name: "Custom 7" }),
		);
		const { r, store } = await openTrack({ musicId: 1_000_007 });
		expect(r.ok).toBe(true);
		expect(store.session!.title).toBe("Custom 7");
	});
});

describe("gaps2 — play/pause seq guards", () => {
	it("play em TV com seq stale não muda status (L625)", async () => {
		const { store } = await openTrack({});
		store.isProjecting = true;
		// força audioOnTv via route tv
		await store.setAudioRoute("tv");
		let release!: (v: boolean) => void;
		mediaAudio.playMediaAudio.mockImplementationOnce(
			() => new Promise<boolean>((r) => (release = r)),
		);
		const p = store.play();
		await store.pause(); // muda seq
		release(true);
		await p;
	});

	it("play no_audio com seq stale não muda status (L634)", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		let release!: (v: boolean) => void;
		mediaAudio.playMediaAudio.mockImplementationOnce(
			() => new Promise<boolean>((r) => (release = r)),
		);
		const p = store.play();
		await store.pause(); // muda seq
		release(true);
		await p;
	});

	it("play no_audio com playMediaAudio false → paused (L635)", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		mediaAudio.playMediaAudio.mockResolvedValueOnce(false);
		await store.play();
		expect(store.status).toBe("paused");
	});
});

describe("gaps2 — áudio route, seek, slides", () => {
	it("setAudioRoute tv com áudio tocando mantém playing (L702)", async () => {
		const { store } = await openTrack({});
		getSharedAudio().paused = false;
		await store.setAudioRoute("tv");
		expect(store.status).toBe("playing");
	});

	it("setAudioRoute pc vindo de tv retoma play (L703)", async () => {
		const { store } = await openTrack({});
		await store.setAudioRoute("tv");
		mediaAudio.fadeInMediaAudio.mockClear();
		getSharedAudio().paused = true;
		await store.setAudioRoute("pc");
		expect(mediaAudio.fadeInMediaAudio).toHaveBeenCalled();
	});

	it("setAudioOnTv(false) volta pra pc (L710)", async () => {
		const { store } = await openTrack({});
		await store.setAudioOnTv(true);
		await store.setAudioOnTv(false);
		expect(store.audioRoute).toBe("pc");
	});

	it("seekTo com duration NaN usa o próprio seconds (L718)", async () => {
		const { store } = await openTrack({});
		Object.defineProperty(getSharedAudio(), "duration", {
			value: NaN,
			configurable: true,
		});
		store.seekTo(42);
		expect(store.currentTimeSec).toBe(42);
	});

	it("goToSlide sem sessão/slides retorna cedo (L730)", async () => {
		const store = useMediaStore();
		await store.goToSlide(2); // sem sessão
		const { store: s2 } = await openTrack({});
		s2.session!.slides = [];
		await s2.goToSlide(0);
	});

	it("goToSlide com times ausentes usa ?? 0 (L736/738)", async () => {
		const { store } = await openTrack({});
		store.session!.slides = [{ order: 0 }] as never;
		store.session!.slideTimesSec = [];
		await store.goToSlide(0);
		expect(store.currentTimeSec).toBe(0);
	});
});

describe("gaps2 — fila", () => {
	it("previousTrack sem fila não faz nada (L802)", async () => {
		const { store } = await openTrack({});
		expect(() => store.previousTrack()).not.toThrow();
	});

	it("close durante avanço de fila retorna cedo (L1152)", async () => {
		const { store } = await openTrack({});
		vi.useFakeTimers();
		store.isProjecting = true;
		loadMediaTrack.mockImplementationOnce(
			() => new Promise((resolve) => setTimeout(() => resolve(trackStub()), 50)),
		);
		store.queue.push({ musicId: 2, title: "T2", albumId: null });
		const p = store.playQueueItem(store.queue[0]);
		await vi.advanceTimersByTimeAsync(10);
		store.close(); // queueAdvanceInProgress>0 → return
		await vi.advanceTimersByTimeAsync(60);
		await p;
		vi.useRealTimers();
	});
});

describe("gaps2 — switchMode ramais", () => {
	it("replay com audioUrl null salva tempo do slide (L877)", async () => {
		loadMediaTrack.mockResolvedValue(
			trackStub({ audioUrl: null, instrumentalUrl: null }),
		);
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const { store } = await openTrack({});
		store.session!.slideTimesSec = [0, 8];
		store.slideIndex = 1;
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.currentTimeSec).toBe(8);
	});

	it("switchMode no_audio com getMediaAudioElement lançando usa wasPlaying (L915)", async () => {
		const { store } = await openTrack({});
		store.status = "playing";
		let calls = 0;
		const original = mediaAudio.getMediaAudioElement.getMockImplementation();
		mediaAudio.getMediaAudioElement.mockImplementation(() => {
			calls += 1;
			if (calls === 2) throw new Error("boom"); // 1ª: savedTime (L872); 2ª: no_audio (L907)
			return original ? original() : (getSharedAudio() as never);
		});
		try {
			const r = await store.switchMode("no_audio");
			expect(r.ok).toBe(true);
			expect(store.status).toBe("playing");
		} finally {
			mediaAudio.getMediaAudioElement.mockImplementation(
				original ?? (() => getSharedAudio() as never),
			);
		}
	});

	it("switchMode no_audio sem audioUrl atual: estado ready + slide/tempo (L917-921)", async () => {
		loadMediaTrack.mockResolvedValue(
			trackStub({ audioUrl: null, instrumentalUrl: null }),
		);
		const { store } = await openTrack({});
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const r = await store.switchMode("instrumental");
		expect(r.ok).toBe(true);
		expect(store.status).toBe("ready");
	});

	it("switchMode falha de resolução degrada pra no_audio (L938)", async () => {
		const { store } = await openTrack({});
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const r = await store.switchMode("instrumental");
		expect(r.ok).toBe(true);
		expect(store.playbackMode).toBe("no_audio");
	});

	it("switchMode audio→audio mesma fonte restaura volume sem fade (L945-975)", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		sharedPlaying2();
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.playbackMode).toBe("audio");
	});
	const sharedPlaying2 = () => {
		Object.defineProperty(getSharedAudio(), "paused", {
			value: false,
			configurable: true,
		});
		getSharedAudio().volume = 0;
	};

	it("switchMode shouldPlay com paused e fadeIn falho → warning (L962-967)", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		getSharedAudio().paused = true;
		mediaAudio.fadeInMediaAudio.mockResolvedValueOnce(false);
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.status).toBe("paused");
	});

	it("switchMode crossfade caminhos: volume>0 fade-out; muted pausa (L998-1006)", async () => {
		const { store } = await openTrack({});
		store.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: false,
			configurable: true,
		});
		getSharedAudio().volume = 0.5;
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://y",
			source: "remote",
		});
		await store.switchMode("instrumental");
		expect(mediaAudio.fadeOutMediaAudio).toHaveBeenCalled();
		// ramal muted:
		const { store: s2 } = await openTrack({});
		s2.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: false,
			configurable: true,
		});
		s2.session!.audioUrl = "audio://x";
		getSharedAudio().volume = 0;
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://z",
			source: "remote",
		});
		await s2.switchMode("instrumental");
		expect(mediaAudio.pauseMediaAudio).toHaveBeenCalled();
	});

	it("switchMode !wasPlaying: volume direto e status paused (L1015/1045)", async () => {
		const { store } = await openTrack({});
		store.status = "paused";
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://w",
			source: "remote",
		});
		const r = await store.switchMode("instrumental");
		expect(r.ok).toBe(true);
		expect(store.status).toBe("paused");
	});

	it("switchMode com duration NaN: durationSec 0 e clamp savedTime (L1029/1032)", async () => {
		const { store } = await openTrack({});
		getSharedAudio().currentTime = 30;
		store.currentTimeSec = 30;
		store.status = "paused";
		Object.defineProperty(getSharedAudio(), "duration", {
			value: NaN,
			configurable: true,
		});
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://v",
			source: "remote",
		});
		await store.switchMode("instrumental");
		expect(store.durationSec).toBe(0);
		expect(store.currentTimeSec).toBe(30);
	});

	it("switchMode degrau no_audio com áudio tocando: fade out (L1053)", async () => {
		const { store } = await openTrack({});
		store.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: false,
			configurable: true,
		});
		getSharedAudio().volume = 0.5;
		mediaAudio.fadeVolumeMediaAudio.mockClear();
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: false,
			url: "",
		});
		const r = await store.switchMode("instrumental"); // degrau → no_audio
		expect(r.ok).toBe(true);
		expect(mediaAudio.fadeVolumeMediaAudio).toHaveBeenCalled();
	});

	it("switchMode degrau no_audio sem tocar: sem fade (L1053 arm false)", async () => {
		const { store } = await openTrack({});
		store.status = "paused";
		mediaAudio.fadeVolumeMediaAudio.mockClear();
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: false,
			url: "",
		});
		const r = await store.switchMode("instrumental");
		expect(r.ok).toBe(true);
		expect(mediaAudio.fadeVolumeMediaAudio).not.toHaveBeenCalled();
	});
});

describe("gaps2 — projeção", () => {
	it("startProjection com tvsOnly e sem janelas mantém tvsOnly (L1091)", async () => {
		const { store } = await openTrack({});
		routingMock.tvOnly = true;
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		routingMock.tvOnly = false;
		store.clearProjection();
	});

	it("syncProjectionFlag com módulo aberto liga watch (L1202)", async () => {
		const { store } = await openTrack({});
		isProjectionModuleOpen.mockReturnValue(true);
		store.syncProjectionFlag();
		expect(store.isProjecting).toBe(true);
		store.clearProjection();
	});
});


describe("gaps2b — arms restantes", () => {
	it("reapplied open=true com módulo aberto mantém watch no tick (L214[1])", async () => {
		const { store } = await openTrack({});
		vi.useFakeTimers();
		isProjectionModuleOpen.mockReturnValue(true);
		await store.startProjection();
		await vi.advanceTimersByTimeAsync(400);
		expect(store.isProjecting).toBe(true);
		vi.useRealTimers();
		store.clearProjection();
	});

	it("open keepQueue com projetando e watch parado reinicia watch (L606)", async () => {
		const { store } = await openTrack({});
		store.isProjecting = true; // simulate retain sem timer
		const r = await store.open({ musicId: 1, keepQueue: true });
		expect(r.ok).toBe(true);
		store.clearProjection();
	});

	it("tick do watch desliga com módulo fechado via isProjectionModuleOpen true→false", async () => {
		const { store } = await openTrack({});
		vi.useFakeTimers();
		isProjectionModuleOpen.mockReturnValue(true);
		await store.startProjection();
		isProjectionModuleOpen.mockReturnValue(false);
		await vi.advanceTimersByTimeAsync(400);
		expect(store.isProjecting).toBe(false);
		vi.useRealTimers();
	});

	it("onPause sem sessão → idle (L430[1])", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.session = null;
		store.status = "paused";
		h.onPause();
		expect(store.status).toBe("idle");
	});

	it("onTimeUpdate troca de slide via resolveSlideIndexForTime (L409)", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.session!.slideTimesSec = [0, 10];
		store.isProjecting = false;
		getSharedAudio().currentTime = 12;
		resolveSlideIndexForTimeMock.mockReturnValueOnce(1);
		h.onTimeUpdate();
		expect(store.slideIndex).toBe(1);
	});

	it("onTimeUpdate throttle: 2ª chamada em <80ms não publica (L418)", async () => {
		const { store } = await openTrack({});
		const h = capturedHandlers()!;
		store.session!.slideTimesSec = [];
		store.isProjecting = true;
		getSharedAudio().currentTime = 5;
		h.onTimeUpdate();
		h.onTimeUpdate(); // < 80ms → return no throttle
		expect(store.currentTimeSec).toBe(5);
	});

	it("startOndemandDownload: 2ª open torna isDownloaded do 1º stale (L282)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockImplementation(
			() => new Promise((r) => setTimeout(() => r(true), 15)),
		);
		const store = useMediaStore();
		const p1 = store.open({ musicId: 1, project: false });
		const p2 = store.open({ musicId: 1, project: false });
		await Promise.all([p1, p2]);
		await new Promise((r) => setTimeout(r, 30));
		expect(trackMediaMock.download).not.toHaveBeenCalled();
	});

	it("startOndemand: download 1º stale chama shouldAbort true e onProgress ignorado (L299/L307/L310/fn310)", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		const aborts: boolean[] = [];
		let opts1: { onProgress?: (p: number) => void; shouldAbort?: () => boolean } | undefined;
		trackMediaMock.download.mockImplementationOnce(
			async (
				_id: number,
				opts?: { onProgress?: (p: number) => void; shouldAbort?: () => boolean },
			) => {
				opts1 = opts;
				await new Promise((r) => setTimeout(r, 40));
				return { status: "downloaded" as const };
			},
		);
		const store = useMediaStore();
		const p1 = store.open({ musicId: 1, project: false });
		await new Promise((r) => setTimeout(r, 10));
		const p2 = store.open({ musicId: 2, project: false });
		await p2;
		// gen stale: shouldAbort true (fn310 + binary[0]) e progress ignorado (L307)
		aborts.push(opts1!.shouldAbort!());
		opts1!.onProgress!(50);
		await p1;
		expect(aborts).toEqual([true]);
		// corrente: shouldAbort false (binary[1])
		await new Promise((r) => setTimeout(r, 60));
	});

	it("shouldAbort do download corrente retorna false (L310 binary[1])", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockResolvedValue(false);
		let seen: boolean | undefined;
		trackMediaMock.download.mockImplementationOnce(
			async (
				_id: number,
				opts?: { shouldAbort?: () => boolean },
			) => {
				seen = opts!.shouldAbort!();
				return { status: "downloaded" as const };
			},
		);
		await openTrack({});
		await new Promise((r) => setTimeout(r, 20));
		expect(seen).toBe(false);
	});

	it("setAudioRoute both→pc sem wasTv não repete play (L703[1])", async () => {
		const { store } = await openTrack({});
		mediaAudio.fadeInMediaAudio.mockClear();
		await store.setAudioRoute("both");
		await store.setAudioRoute("pc");
		expect(mediaAudio.fadeInMediaAudio).not.toHaveBeenCalled();
	});

	it("goToSlide com marca ausente usa ?? 0 (L738)", async () => {
		const { store } = await openTrack({});
		store.session!.slides = [{ order: 0 }, { order: 1 }] as never;
		const sparse = [0, undefined as unknown as number];
		store.session!.slideTimesSec = sparse;
		await store.goToSlide(1);
		expect(store.currentTimeSec).toBe(0);
	});

	it("jumpToQueue índice inexistente não faz nada (L797[1])", async () => {
		const { store } = await openTrack({});
		expect(() => store.jumpToQueue(9)).not.toThrow();
	});

	it("previousTrack com fila volta p/ anterior (L802)", async () => {
		const { store } = await openTrack({});
		store.queue.push(
			{ musicId: 11, title: "A", albumId: null },
			{ musicId: 12, title: "B", albumId: null },
		);
		store.queueIndex = 1;
		store.previousTrack();
		await new Promise((r) => setTimeout(r, 0));
		expect(store.queueIndex).toBe(0);
	});

	it("switchMode com currentTime NaN mantém savedTime (L872[1])", async () => {
		const { store } = await openTrack({});
		store.currentTimeSec = 20;
		getSharedAudio().currentTime = Number.NaN;
		await store.switchMode("no_audio");
		expect(store.currentTimeSec).toBe(20);
	});

	it("switchMode com savedSlide fora das marcas salva 0 (L877[1])", async () => {
		loadMediaTrack.mockResolvedValue(
			trackStub({ audioUrl: null, instrumentalUrl: null }),
		);
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const { store } = await openTrack({});
		store.session!.slideTimesSec = [0, 8];
		store.slideIndex = 9;
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.currentTimeSec).toBe(0);
	});

	it("switchMode recarrega faixa custom (L884[0])", async () => {
		loadCustomMusicTrack.mockResolvedValue(
			trackStub({ id: 7, name: "Custom 7", audioUrl: null }),
		);
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const { store } = await openTrack({ musicId: 1_000_007 });
		loadCustomMusicTrack.mockClear();
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		await store.switchMode("instrumental");
		expect(loadCustomMusicTrack).toHaveBeenCalled();
	});

	it("switchMode no_audio throw 2ª chamada com wasPlaying false (L915[1])", async () => {
		const { store } = await openTrack({});
		store.status = "paused";
		const original = mediaAudio.getMediaAudioElement.getMockImplementation();
		let calls = 0;
		mediaAudio.getMediaAudioElement.mockImplementation(() => {
			calls += 1;
			if (calls === 2) throw new Error("boom");
			return original ? original() : (getSharedAudio() as never);
		});
		try {
			const r = await store.switchMode("no_audio");
			expect(r.ok).toBe(true);
			expect(store.status).toBe("paused");
		} finally {
			mediaAudio.getMediaAudioElement.mockImplementation(
				original ?? (() => getSharedAudio() as never),
			);
		}
	});

	it("switchMode audio pós no_audio com URL nova e paused: fadeIn ok (L962/964[0]/965[1])", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		store.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: true,
			configurable: true,
		});
		mediaAudio.fadeInMediaAudio.mockResolvedValueOnce(true);
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://nova",
			source: "remote",
		});
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.status).toBe("playing");
	});

	it("switchMode audio pós no_audio URL nova fadeIn falho → warning (L964[1]/965[0]/966[0])", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		store.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: true,
			configurable: true,
		});
		mediaAudio.fadeInMediaAudio.mockResolvedValueOnce(false);
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://nova2",
			source: "remote",
		});
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.status).toBe("paused");
	});

	it("switchMode mesma fonte + throw no bloco restaura com wasPlaying true (L977[0])", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio"); // mantém audio://x
		store.status = "playing";
		const original = mediaAudio.getMediaAudioElement.getMockImplementation();
		let calls = 0;
		mediaAudio.getMediaAudioElement.mockImplementation(() => {
			calls += 1;
			if (calls === 2) throw new Error("boom"); // 1ª: L872 savedTime; 2ª: L959
			return original ? original() : (getSharedAudio() as never);
		});
		try {
			const r = await store.switchMode("audio"); // mesma fonte audio://x
			expect(r.ok).toBe(true);
			expect(store.status).toBe("playing");
		} finally {
			mediaAudio.getMediaAudioElement.mockImplementation(
				original ?? (() => getSharedAudio() as never),
			);
		}
	});

	it("switchMode mesma fonte + throw no bloco restaura com wasPlaying false (L977[1])", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		store.status = "paused";
		const original = mediaAudio.getMediaAudioElement.getMockImplementation();
		let calls = 0;
		mediaAudio.getMediaAudioElement.mockImplementation(() => {
			calls += 1;
			if (calls === 2) throw new Error("boom");
			return original ? original() : (getSharedAudio() as never);
		});
		try {
			const r = await store.switchMode("audio");
			expect(r.ok).toBe(true);
			expect(store.status).toBe("paused");
		} finally {
			mediaAudio.getMediaAudioElement.mockImplementation(
				original ?? (() => getSharedAudio() as never),
			);
		}
	});

	it("switchMode p/ áudio sem url prévia pula crossfade (L994[1])", async () => {
		loadMediaTrack.mockResolvedValue(
			trackStub({ audioUrl: null, instrumentalUrl: null }),
		);
		mediaAudio.resolveMusicAudioUrl.mockResolvedValue({ ok: false, url: "" });
		const { store } = await openTrack({});
		store.status = "paused";
		mediaAudio.fadeOutMediaAudio.mockClear();
		mediaAudio.pauseMediaAudio.mockClear();
		mediaAudio.resolveMusicAudioUrl.mockResolvedValueOnce({
			ok: true,
			url: "audio://nova5",
			source: "remote",
		});
		const r = await store.switchMode("instrumental");
		expect(r.ok).toBe(true);
		// crossfade pulado: nenhum fadeOut/pause no outgoing
		expect(mediaAudio.fadeOutMediaAudio).not.toHaveBeenCalled();
		expect(mediaAudio.pauseMediaAudio).not.toHaveBeenCalled();
	});

	it("startProjection sem janela mas com TVs vivas mantém tvsOnly (L1091[1])", async () => {
		const { store } = await openTrack({});
		vi.mocked(palcoSessionSlots).mockResolvedValue([
			{ running: true, clients: 1 },
		] as never);
		openProjectionModule.mockResolvedValueOnce(false);
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		// 2ª startProjection: windowsOpen false + tvsOnly true → L1091 false-arm
		isProjectionModuleOpen.mockReturnValue(false);
		await store.startProjection();
		expect(store.isProjecting).toBe(true);
		store.clearProjection();
		vi.mocked(palcoSessionSlots).mockResolvedValue([]);
	});
});


describe("gaps2c — fn310 e mesma fonte shouldPlay", () => {
	it("startOndemand download com catálogo falho chama shouldAbort false (fn310/L310[1])", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockRejectedValue(new Error("boom"));
		let seen: boolean | undefined;
		let progressed: number | undefined;
		trackMediaMock.download.mockImplementationOnce(
			async (
				_id: number,
				opts?: { onProgress?: (p: number) => void; shouldAbort?: () => boolean },
			) => {
				seen = opts!.shouldAbort!();
				opts!.onProgress!(40);
				progressed = store3().ondemandDownloadPercent;
				return { status: "downloaded" as const };
			},
		);
		const store3 = () => useMediaStore();
		const { store } = await openTrack({});
		await new Promise((r) => setTimeout(r, 20));
		expect(seen).toBe(false);
		expect(progressed).toBe(40);
	});

	it("mesma fonte pós no_audio com wasPlaying e paused: fadeIn (L962[0]/964[0]/965[1])", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		store.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: true,
			configurable: true,
		});
		mediaAudio.fadeInMediaAudio.mockResolvedValueOnce(true);
		const r = await store.switchMode("audio"); // mesma fonte audio://x
		expect(r.ok).toBe(true);
		expect(store.status).toBe("playing");
	});

	it("mesma fonte pós no_audio com wasPlaying e paused: fadeIn falho → warning (L964[1]/965[0]/966[0])", async () => {
		const { store } = await openTrack({});
		await store.switchMode("no_audio");
		store.status = "playing";
		Object.defineProperty(getSharedAudio(), "paused", {
			value: true,
			configurable: true,
		});
		mediaAudio.fadeInMediaAudio.mockResolvedValueOnce(false);
		const r = await store.switchMode("audio");
		expect(r.ok).toBe(true);
		expect(store.status).toBe("paused");
	});
});


describe("gaps2d — últimos arms", () => {
	it("startOndemand: catálogo rejeitando + 2ª open torna gen 1 stale (L303[0])", async () => {
		bridgeMock.isDesktop = true;
		trackMediaMock.isDownloaded.mockImplementation(
			() =>
				new Promise((_, rej) =>
					setTimeout(() => rej(new Error("boom")), 25),
				),
		);
		trackMediaMock.download.mockResolvedValue({ status: "downloaded" });
		const store = useMediaStore();
		const p1 = store.open({ musicId: 1, project: false });
		await new Promise((r) => setTimeout(r, 10));
		const p2 = store.open({ musicId: 2, project: false }); // gen2
		await p2;
		await p1; // startOndemand1: L303 gen1 !== gen2 → return
		await new Promise((r) => setTimeout(r, 60));
	});

	it("hasLivePalcoTvs com slots rejeitando → false (L1079)", async () => {
		const { store } = await openTrack({});
		vi.mocked(palcoSessionSlots).mockRejectedValueOnce(new Error("boom"));
		openProjectionModule.mockResolvedValueOnce(false);
		const ok = await store.startProjection();
		expect(ok).toBe(false);
		expect(store.isProjecting).toBe(false);
		vi.mocked(palcoSessionSlots).mockResolvedValue([]);
	});
});

it('seeks to zero for a missing initial marker when later timing is distinct', async () => {
  const { store } = await openTrack({});
  store.session!.slides = [{ order: 0 }, { order: 1 }] as never;
  store.session!.slideTimesSec = [undefined as unknown as number, 10];
  await store.goToSlide(0);
  expect(store.currentTimeSec).toBe(0);
});
