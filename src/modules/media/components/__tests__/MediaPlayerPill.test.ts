// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * MediaPlayerPill — pill compacta do player: transport, timeline (v-if hasAudio),
 * popovers de volume/modo, áudio na TV, projetar (gated), fullscreen, playlist.
 * Store de projeção real (Pinia); MonitorTargetSelect stubado.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaPlayerPill from "../MediaPlayerPill.vue";

vi.mock("@shared/components/MonitorTargetSelect.vue", () => ({
	default: { template: '<div class="monitor-target-select-stub" />' },
}));



const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

function baseProps(over: Record<string, unknown> = {}) {
	return {
		title: "Santíssimo",
		subtitle: "Athus Santos",
		isPlaying: false,
		hasAudio: true,
		hasInstrumental: true,
		mode: "audio" as const,
		currentTimeLabel: "0:12",
		durationLabel: "3:45",
		progressRatio: 0.25,
		volume: 0.8,
		projecting: false,
		playlistOpen: false,
		audioOnTv: false,
		...over,
	};
}

function mountPill(props = baseProps()) {
	const pinia = createPinia();
	setActivePinia(pinia);
	return mount(MediaPlayerPill, { props, global: { plugins: [i18n, pinia] } });
}

beforeEach(() => {
	localStorage.clear();
});

describe("MediaPlayerPill — render", () => {
	it("mostra título, subtítulo e tempos", () => {
		const w = mountPill();
		expect(w.find(".media-player-pill__title").text()).toBe("Santíssimo");
		expect(w.find(".media-player-pill__subtitle").text()).toBe("Athus Santos");
		expect(w.text()).toContain("0:12");
		expect(w.text()).toContain("3:45");
	});

	it("sem subtítulo: esconde a linha", () => {
		const w = mountPill(baseProps({ subtitle: "" }));
		expect(w.find(".media-player-pill__subtitle").exists()).toBe(false);
	});

	it("sem áudio: sem timeline e sem popover de volume", () => {
		const w = mountPill(baseProps({ hasAudio: false }));
		expect(w.find(".media-player-pill__timeline").exists()).toBe(false);
	});
});

describe("MediaPlayerPill — transport", () => {
	it("prev e next emitem", async () => {
		const w = mountPill();
		const btns = w.findAll(".media-player-pill__icon-btn");
		await btns[0].trigger("click");
		await btns[1].trigger("click");
		expect(w.emitted("previousSlide")).toHaveLength(1);
		expect(w.emitted("nextSlide")).toHaveLength(1);
	});

	it("play desabilitado sem áudio; com áudio emite togglePlay", async () => {
		const noAudio = mountPill(baseProps({ hasAudio: false }));
		expect(
			noAudio.find(".media-player-pill__play").attributes("disabled"),
		).toBeDefined();
		noAudio.unmount();

		const w = mountPill();
		await w.find(".media-player-pill__play").trigger("click");
		expect(w.emitted("togglePlay")).toHaveLength(1);
	});
});

describe("MediaPlayerPill — seek e volume", () => {
	it("seek emite ratio normalizado", async () => {
		const w = mountPill();
		await w.find(".media-player-pill__seek").setValue("25");
		expect(w.emitted("seekRatio")?.[0]).toEqual([0.25]);
	});

	it("popover de volume abre e emite update:volume", async () => {
		const w = mountPill();
		expect(w.find(".media-player-pill__volume-pop").exists()).toBe(false);
		const volBtn = w
			.findAll(".media-player-pill__icon-btn")
			.find((b) => b.attributes("aria-label") === mediaLocale.media.volume);
		await volBtn?.trigger("click");
		expect(w.find(".media-player-pill__volume-pop").exists()).toBe(true);
		await w.find(".media-player-pill__volume-pop input").setValue("80");
		expect(w.emitted("update:volume")?.[0]).toEqual([0.8]);
	});
});

describe("MediaPlayerPill — menu de modo", () => {
	it("menu abre, mostra 3 opções; instrumental desabilitado sem pista", async () => {
		const w = mountPill();
		const modeBtn = w
			.findAll(".media-player-pill__icon-btn")
			.find((b) => b.attributes("aria-label") === mediaLocale.media.audioType);
		await modeBtn?.trigger("click");
		const pop = w.find(".media-player-pill__mode-pop");
		expect(pop.exists()).toBe(true);
		expect(pop.findAll("button").length).toBe(3);
		const instrumental = pop
			.findAll("button")
			.find((b) => b.text().includes(mediaLocale.media.modes.instrumental));
		expect(instrumental?.attributes("disabled")).toBeUndefined();

		const semPista = mountPill(baseProps({ hasInstrumental: false }));
		const modeBtn2 = semPista
			.findAll(".media-player-pill__icon-btn")
			.find((b) => b.attributes("aria-label") === mediaLocale.media.audioType);
		await modeBtn2?.trigger("click");
		const pop2 = semPista.find(".media-player-pill__mode-pop");
		const instrumental2 = pop2
			.findAll("button")
			.find((b) => b.text().includes(mediaLocale.media.modes.instrumental));
		expect(instrumental2?.attributes("disabled")).toBeDefined();
	});

	it("selecionar modo fecha menu e emite update:mode", async () => {
		const w = mountPill();
		const modeBtn = w
			.findAll(".media-player-pill__icon-btn")
			.find((b) => b.attributes("aria-label") === mediaLocale.media.audioType);
		await modeBtn?.trigger("click");
		const pop = w.find(".media-player-pill__mode-pop");
		const noAudio = pop
			.findAll("button")
			.find((b) => (b.html() as string).includes("ti-device-desktop"));
		await noAudio?.trigger("click");
		expect(w.emitted("update:mode")?.[0]).toEqual(["no_audio"]);
		expect(w.find(".media-player-pill__mode-pop").exists()).toBe(false);
	});
});

describe("MediaPlayerPill — áudio na TV, projeção, fullscreen, playlist", () => {
	it("toggleAudioOnTv emite e ícone reflete estado", async () => {
		const w = mountPill(baseProps({ audioOnTv: true }));
		const tvBtn = w
			.findAll("button")
			.find(
				(b) => b.attributes("aria-label") === mediaLocale.media.audioOnTvOff,
			);
		expect(tvBtn).toBeDefined();
		await tvBtn?.trigger("click");
		expect(w.emitted("toggleAudioOnTv")).toHaveLength(1);
	});

	it("toggleFullscreen emite", async () => {
		const w = mountPill();
		const fsBtn = w
			.findAll("button")
			.find((b) => b.attributes("aria-label") === mediaLocale.media.fullscreen);
		await fsBtn?.trigger("click");
		expect(w.emitted("toggleFullscreen")).toHaveLength(1);
	});

	it("projetar sem targets: desabilitado com aria de aviso; projetando: liberado", () => {
		const idle = mountPill();
		const projBtn = idle
			.findAll("button")
			.find((b) =>
				(b.attributes("aria-label") ?? "").includes("projectNeedsScreens"),
			);
		expect(projBtn?.attributes("disabled")).toBeDefined();
		idle.unmount();

		const proj = mountPill(baseProps({ projecting: true }));
		const projBtn2 = proj
			.findAll("button")
			.find(
				(b) => b.attributes("aria-label") === mediaLocale.media.clearProjection,
			);
		expect(projBtn2?.attributes("disabled")).toBeUndefined();
	});

	it("playlist: botão emite togglePlaylist", async () => {
		const w = mountPill();
		const plBtn = w
			.findAll("button")
			.find((b) => (b.html() as string).includes("ti-list"));
		await plBtn?.trigger("click");
		expect(w.emitted("togglePlaylist")).toHaveLength(1);
	});
	describe("gaps — selectMode sung/instrumental", () => {
		it("selecionar sung emite update:mode audio", async () => {
			const w = mountPill();
			const modeBtn = w
				.findAll(".media-player-pill__icon-btn")
				.find((b) => b.attributes("aria-label") === mediaLocale.media.audioType);
			await modeBtn?.trigger("click");
			const sung = w
				.findAll("button")
				.find((b) => b.text().includes(mediaLocale.media.modes.sung));
			await sung?.trigger("click");
			expect(w.emitted("update:mode")?.[0]).toEqual(["audio"]);
			w.unmount();
		});

		it("selecionar instrumental emite update:mode instrumental", async () => {
			const w = mountPill(baseProps({ hasInstrumental: true }));
			const modeBtn = w
				.findAll(".media-player-pill__icon-btn")
				.find((b) => b.attributes("aria-label") === mediaLocale.media.audioType);
			await modeBtn?.trigger("click");
			const inst = w
				.findAll("button")
				.find((b) => b.text().includes(mediaLocale.media.modes.instrumental));
			await inst?.trigger("click");
			expect(w.emitted("update:mode")?.[0]).toEqual(["instrumental"]);
			w.unmount();
		});
	});

	describe("gaps — modeIcon e aria projetar", () => {
		it("modeIcon reflete modo: instrumental/no_audio/audio", () => {
			const inst = mountPill(baseProps({ mode: "instrumental" }));
			expect(inst.find(".media-player-pill__icon-btn .ti-piano").exists()).toBe(true);
			inst.unmount();
			const noAudio = mountPill(baseProps({ mode: "no_audio" }));
			expect(noAudio.find(".ti-device-desktop").exists()).toBe(true);
			noAudio.unmount();
			const audio = mountPill(baseProps({ mode: "audio" }));
			expect(audio.find(".ti-microphone").exists()).toBe(true);
			audio.unmount();
		});

		it("aria do projetar: pode projetar (targets selecionados) e não projetando → media.project", async () => {
			const { useProjectionStore } = await import("@modules/settings/stores/useProjectionStore");
			const { DEFAULT_PROJECTION_SETTINGS } = await import("@modules/settings/types/projection");
			// pinia PRÓPRIA compartilhada entre store e mount
			const pinia = createPinia();
			setActivePinia(pinia);
			const store = useProjectionStore();
			await store.refreshDisplays();
			store.applySettings({ ...DEFAULT_PROJECTION_SETTINGS, targetDisplayIds: [2] });
			const w = mount(MediaPlayerPill, {
				props: baseProps({ projecting: false }),
				global: { plugins: [i18n, pinia] },
			});
			const btn = w.findAll("button").find((b) => b.attributes("aria-label") === mediaLocale.media.project);
			expect(btn).toBeTruthy();
			store.applySettings({ ...DEFAULT_PROJECTION_SETTINGS, targetDisplayIds: [] });
			w.unmount();
		});
	})

	it("gaps: isPlaying troca aria/icone do play; botão projetar emite toggleProjection", async () => {
		const w = mountPill(baseProps({ isPlaying: true }));
		const play = w.find(".media-player-pill__play");
		expect(play.attributes("aria-label")).toBe("Pausar");
		expect(play.attributes("title")).toBe("Pausar");
		expect(play.find("i").classes()).toContain("ti-player-pause");
		w.unmount();

		const { useProjectionStore } = await import("@modules/settings/stores/useProjectionStore");
		const { DEFAULT_PROJECTION_SETTINGS } = await import("@modules/settings/types/projection");
		const pinia = createPinia();
		setActivePinia(pinia);
		const store = useProjectionStore();
		await store.refreshDisplays();
		store.applySettings({ ...DEFAULT_PROJECTION_SETTINGS, targetDisplayIds: [2] });
		const w2 = mount(MediaPlayerPill, { props: baseProps({ projecting: false }), global: { plugins: [i18n, pinia] } });
		const proj = w2.findAll("button").find((b) => b.attributes("aria-label") === mediaLocale.media.project)!;
		expect(proj).toBeTruthy();
		await proj.trigger("click");
		expect(w2.emitted("toggleProjection")).toBeTruthy();
		w2.unmount();
	});

});