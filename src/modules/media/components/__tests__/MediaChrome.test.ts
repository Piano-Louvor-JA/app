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
	session: ref<{ subtitle: string } | null>(null),
	queueLabel: ref<string | null>(null),
	toggleProjection: vi.fn().mockResolvedValue(undefined),
	clearProjection: vi.fn(),
	stopProjection: vi.fn(),
	togglePlay: vi.fn().mockResolvedValue(undefined),
	maximize: vi.fn(),
	close: vi.fn(),
	closeConfirmOpen: ref(false),
	requestClose: vi.fn(() => { storeState.closeConfirmOpen.value = true; }),
	cancelClose: vi.fn(() => { storeState.closeConfirmOpen.value = false; }),
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
	storeState.session.value = null;
	storeState.queueLabel.value = null;
	storeState.closeConfirmOpen.value = false;
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
	it("botão fechar pede confirmação e cancelar mantém a reprodução", async () => {
		const w = mountChrome();
		await w.find('.media-chrome__close').trigger('click');
		expect(storeState.requestClose).toHaveBeenCalledOnce();
		expect(storeState.close).not.toHaveBeenCalled();
		w.findComponent({ name: 'MediaCloseDialog' }).vm.$emit('cancel');
		await w.vm.$nextTick();
		expect(storeState.cancelClose).toHaveBeenCalledOnce();
		expect(storeState.close).not.toHaveBeenCalled();
		expect(pushMock).not.toHaveBeenCalled();
		w.unmount();
	});

	it("confirmar o fechamento encerra a reprodução", async () => {
		const w = mountChrome();
		await w.find('.media-chrome__close').trigger('click');
		w.findComponent({ name: 'MediaCloseDialog' }).vm.$emit('confirm');
		expect(storeState.close).toHaveBeenCalledOnce();
		w.unmount();
	});

	it("preview mostra snippet e referência da store", () => {
		const w = mountChrome();
		expect(w.text()).toContain("Porque tal amou");
		expect(w.text()).toContain("João 3:16");
		w.unmount();
	});

	it("botão play idle mostra play e chama togglePlay", async () => {
		const w = mountChrome();
		const button = w.findAll(".media-chrome__actions .media-chrome__icon-btn")[0];
		expect(button.attributes("aria-label")).toBe("Reproduzir");
		expect(button.find(".ti-player-play").exists()).toBe(true);
		await button.trigger("click");
		expect(storeState.togglePlay).toHaveBeenCalledOnce();
		w.unmount();
	});

	it("botão play ativo mostra pause", () => {
		storeState.isPlaying.value = true;
		const w = mountChrome();
		const button = w.findAll(".media-chrome__actions .media-chrome__icon-btn")[0];
		expect(button.attributes("aria-label")).toBe("Pausar");
		expect(button.find(".ti-player-pause").exists()).toBe(true);
		w.unmount();
	});

	it("botão maximizar chama maximize e navega pra media", async () => {
		const w = mountChrome();
		await w.findAll(".media-chrome__actions .media-chrome__icon-btn")[1].trigger("click");
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

	it("FAB projecting: clique encerra a projeção em vez de ocultar a letra", async () => {
		storeState.isProjecting.value = true;
		const w = mountChrome();
		await w.find(".media-project-fab").trigger("click");
		expect(storeState.stopProjection).toHaveBeenCalledOnce();
		expect(storeState.clearProjection).not.toHaveBeenCalled();
		expect(storeState.toggleProjection).not.toHaveBeenCalled();
		w.unmount();
	});
});

describe("MediaChrome — título da prévia", () => {
	it('mostra "Player" acima da prévia flutuante', () => {
		const w = mountChrome();
		const title = w.find(".floating-preview-title");
		expect(title.exists()).toBe(true);
		expect(title.text()).toBe("Player");
		w.unmount();
	});
});

describe("MediaChrome — nome da coletânea/playlist no título", () => {
	it("com playlist tocando: Player · nome da playlist", () => {
		storeState.queueLabel.value = "Culto de Sábado";
		storeState.session.value = { subtitle: "Maranata" };
		const w = mountChrome();
		expect(w.find(".floating-preview-title").text()).toBe("Player · Culto de Sábado");
		expect(w.find(".floating-preview-title__detail").text()).toBe("Culto de Sábado");
		w.unmount();
	});

	it("sem playlist: Player · coletânea/hinário do hino", () => {
		storeState.queueLabel.value = null;
		storeState.session.value = { subtitle: "Hinário Adventista" };
		const w = mountChrome();
		expect(w.find(".floating-preview-title").text()).toBe("Player · Hinário Adventista");
		expect(w.find(".floating-preview-title__detail").text()).toBe("Hinário Adventista");
		w.unmount();
	});
});
