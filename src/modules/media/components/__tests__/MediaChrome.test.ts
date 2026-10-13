// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createI18n } from "vue-i18n";

/**
 * MediaChrome — barra flutuante do player minimizado (preview + play/pause +
 * maximizar + FAB projetar). Store Pinia mockada — estado controlável por teste.
 */
import mediaLocale from "../../locales/pt-BR";
import MediaChrome from "../MediaChrome.vue";

const pushMock = vi.fn().mockResolvedValue(undefined);
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: pushMock }),
}));

const storeState = {
	hasSession: ref(false),
	minimized: ref(false),
	isProjecting: ref(false),
	isPlaying: ref(false),
	previewSnippet: ref("Porque tal amou"),
	previewReference: ref("João 3:16"),
	toggleProjection: vi.fn().mockResolvedValue(undefined),
	clearProjection: vi.fn(),
	togglePlay: vi.fn().mockResolvedValue(undefined),
	maximize: vi.fn(),
};

vi.mock("../../composables/useMediaPlayer", () => ({
	useMediaPlayer: () => storeState,
}));

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

function mountChrome() {
	const pinia = createPinia();
	setActivePinia(pinia);
	return mount(MediaChrome, { global: { plugins: [i18n, pinia] } });
}

beforeEach(() => {
	vi.clearAllMocks();
	storeState.hasSession.value = true;
	storeState.minimized.value = true;
	storeState.isProjecting.value = false;
	storeState.isPlaying.value = false;
});

describe("MediaChrome — visibilidade", () => {
	it("sem sessão: não renderiza", () => {
		storeState.hasSession.value = false;
		const w = mountChrome();
		expect(w.find(".media-chrome").exists()).toBe(false);
		w.unmount();
	});

	it("sessão não minimizada: não renderiza (player em tela cheia)", () => {
		storeState.minimized.value = false;
		const w = mountChrome();
		expect(w.find(".media-chrome").exists()).toBe(false);
		w.unmount();
	});

	it("sessão minimizada: renderiza preview + ações", () => {
		const w = mountChrome();
		expect(w.find(".media-status-preview").exists()).toBe(true);
		expect(w.find(".media-chrome__actions").exists()).toBe(true);
		w.unmount();
	});
});

describe("MediaChrome — ações", () => {
	it("preview mostra snippet e referência da store", () => {
		const w = mountChrome();
		expect(w.text()).toContain("Porque tal amou");
		expect(w.text()).toContain("João 3:16");
		w.unmount();
	});

	it("botão play idle mostra play e chama togglePlay", async () => {
		const w = mountChrome();
		const button = w.findAll(".media-chrome__icon-btn")[0];
		expect(button.attributes("aria-label")).toBe("Reproduzir");
		expect(button.find(".ti-player-play").exists()).toBe(true);
		await button.trigger("click");
		expect(storeState.togglePlay).toHaveBeenCalledOnce();
		w.unmount();
	});

	it("botão play ativo mostra pause", () => {
		storeState.isPlaying.value = true;
		const w = mountChrome();
		const button = w.findAll(".media-chrome__icon-btn")[0];
		expect(button.attributes("aria-label")).toBe("Pausar");
		expect(button.find(".ti-player-pause").exists()).toBe(true);
		w.unmount();
	});

	it("botão maximizar chama maximize e navega pra media", async () => {
		const w = mountChrome();
		await w.findAll(".media-chrome__icon-btn")[1].trigger("click");
		expect(storeState.maximize).toHaveBeenCalledOnce();
		expect(pushMock).toHaveBeenCalledWith({ name: "media" });
		w.unmount();
	});

	it("FAB idle: clique chama toggleProjection", async () => {
		const w = mountChrome();
		await w.find(".media-project-fab").trigger("click");
		expect(storeState.toggleProjection).toHaveBeenCalledOnce();
		expect(storeState.clearProjection).not.toHaveBeenCalled();
		w.unmount();
	});

	it("FAB projecting: clique chama clearProjection", async () => {
		storeState.isProjecting.value = true;
		const w = mountChrome();
		await w.find(".media-project-fab").trigger("click");
		expect(storeState.clearProjection).toHaveBeenCalledOnce();
		expect(storeState.toggleProjection).not.toHaveBeenCalled();
		w.unmount();
	});
});
