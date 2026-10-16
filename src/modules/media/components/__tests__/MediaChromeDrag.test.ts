// @vitest-environment jsdom

import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { createI18n } from "vue-i18n";

/**
 * MediaChrome solto: arrastar o player minimizado, persistir a posição,
 * manter dentro da janela e voltar ao canto com duplo clique.
 */
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import {
	type FloatingPosition,
	loadFloatingPosition,
	saveFloatingPosition,
} from "@shared/services/floating-position";

import mediaLocale from "../../locales/pt-BR";
import MediaChrome from "../MediaChrome.vue";

const loadMediaChromePosition = () =>
	loadFloatingPosition(USER_PREFERENCE_KEYS.mediaChromePosition);
const saveMediaChromePosition = (position: FloatingPosition | null) =>
	saveFloatingPosition(USER_PREFERENCE_KEYS.mediaChromePosition, position);

vi.mock("vue-router", () => ({
	useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}));

const storeState = {
	hasSession: ref(true),
	minimized: ref(true),
	isProjecting: ref(false),
	isPlaying: ref(false),
	previewSnippet: ref("Santo, santo, santo"),
	previewReference: ref("Hinário Adventista"),
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

const RECT = { left: 600, top: 500, width: 400, height: 150 };

function pointer(
	type: string,
	init: { x?: number; y?: number; button?: number; pointerId?: number } = {},
) {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: init.x ?? 0,
		clientY: init.y ?? 0,
		button: init.button ?? 0,
	});
	Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 1 });
	return event;
}

let wrapper: VueWrapper | null = null;

function mountChrome() {
	const pinia = createPinia();
	setActivePinia(pinia);
	wrapper = mount(MediaChrome, { global: { plugins: [i18n, pinia] } });
	return wrapper;
}

function handle(w: VueWrapper) {
	return w.find(".media-chrome__handle").element;
}

function rootStyle(w: VueWrapper) {
	return (w.find(".media-chrome").element as HTMLElement).style;
}

beforeEach(() => {
	localStorage.clear();
	storeState.hasSession.value = true;
	storeState.minimized.value = true;
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		...RECT,
		x: RECT.left,
		y: RECT.top,
		right: RECT.left + RECT.width,
		bottom: RECT.top + RECT.height,
		toJSON: () => ({}),
	} as DOMRect);
});

afterEach(() => {
	wrapper?.unmount();
	wrapper = null;
	vi.restoreAllMocks();
});

describe("MediaChrome — arrastar", () => {
	it("sem posição salva: fica no canto padrão (sem left/top inline)", () => {
		const w = mountChrome();
		expect(rootStyle(w).left).toBe("");
		expect(w.find(".media-chrome__handle").attributes("title")).toBe(
			mediaLocale.media.chromeDragHint,
		);
	});

	it("arrasta pelo preview, move junto com o ponteiro e salva ao soltar", async () => {
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520 }));
		window.dispatchEvent(pointer("pointermove", { x: 300, y: 200 }));
		window.dispatchEvent(pointer("pointermove", { x: 450, y: 320 }));
		await nextTick();

		expect(w.find(".media-chrome").classes()).toContain("media-chrome--dragging");
		expect(rootStyle(w).left).toBe("400px");
		expect(rootStyle(w).top).toBe("300px");
		expect(rootStyle(w).right).toBe("auto");
		expect(loadMediaChromePosition()).toBeNull();

		window.dispatchEvent(pointer("pointerup", { x: 450, y: 320 }));
		await nextTick();

		expect(w.find(".media-chrome").classes()).not.toContain("media-chrome--dragging");
		expect(loadMediaChromePosition()).toEqual({ x: 400, y: 300 });
	});

	it("não deixa arrastar para fora da janela", async () => {
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520 }));
		window.dispatchEvent(pointer("pointermove", { x: -500, y: -500 }));
		window.dispatchEvent(pointer("pointerup"));
		await nextTick();
		expect(loadMediaChromePosition()).toEqual({ x: 8, y: 8 });
	});

	it("movimento abaixo do limiar conta como clique: não move nem salva", async () => {
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520 }));
		window.dispatchEvent(pointer("pointermove", { x: 652, y: 521 }));
		window.dispatchEvent(pointer("pointerup", { x: 652, y: 521 }));
		await nextTick();
		expect(rootStyle(w).left).toBe("");
		expect(localStorage.getItem("user_data")).toBeNull();
	});

	it("pointerdown em botão não inicia arraste (play continua clicável)", async () => {
		const w = mountChrome();
		w.find(".media-chrome__icon-btn").element.dispatchEvent(
			pointer("pointerdown", { x: 650, y: 520 }),
		);
		window.dispatchEvent(pointer("pointermove", { x: 100, y: 100 }));
		window.dispatchEvent(pointer("pointerup"));
		await nextTick();
		expect(rootStyle(w).left).toBe("");
	});

	it("botão secundário do mouse é ignorado", async () => {
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520, button: 2 }));
		window.dispatchEvent(pointer("pointermove", { x: 100, y: 100 }));
		await nextTick();
		expect(rootStyle(w).left).toBe("");
	});

	it("ignora outro ponteiro e um segundo pointerdown durante o arraste", async () => {
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520 }));
		handle(w).dispatchEvent(pointer("pointerdown", { x: 10, y: 10, pointerId: 2 }));
		window.dispatchEvent(pointer("pointermove", { x: 100, y: 100, pointerId: 2 }));
		window.dispatchEvent(pointer("pointerup", { pointerId: 2 }));
		window.dispatchEvent(pointer("pointercancel", { pointerId: 2 }));
		await nextTick();
		expect(rootStyle(w).left).toBe("");

		window.dispatchEvent(pointer("pointermove", { x: 450, y: 320 }));
		window.dispatchEvent(pointer("pointerup"));
		await nextTick();
		expect(loadMediaChromePosition()).toEqual({ x: 400, y: 300 });
	});

	it("pointercancel desfaz o arraste em andamento sem salvar", async () => {
		saveMediaChromePosition({ x: 100, y: 100 });
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520 }));
		window.dispatchEvent(pointer("pointermove", { x: 450, y: 320 }));
		await nextTick();
		expect(rootStyle(w).left).toBe("400px");

		window.dispatchEvent(pointer("pointercancel"));
		await nextTick();
		expect(rootStyle(w).left).toBe("100px");
		expect(w.find(".media-chrome").classes()).not.toContain("media-chrome--dragging");
		expect(loadMediaChromePosition()).toEqual({ x: 100, y: 100 });

		window.dispatchEvent(pointer("pointermove", { x: 10, y: 10 }));
		await nextTick();
		expect(rootStyle(w).left).toBe("100px");
	});

	it("duplo clique no preview volta ao canto padrão", async () => {
		saveMediaChromePosition({ x: 100, y: 100 });
		const w = mountChrome();
		expect(rootStyle(w).left).toBe("100px");

		await w.find(".media-chrome__handle").trigger("dblclick");
		expect(rootStyle(w).left).toBe("");
		expect(loadMediaChromePosition()).toBeNull();
	});
});

describe("MediaChrome — posição salva e redimensionamento", () => {
	it("posição salva fora da janela é trazida de volta ao montar", async () => {
		saveMediaChromePosition({ x: 5000, y: 5000 });
		const w = mountChrome();
		await nextTick();
		expect(rootStyle(w).left).toBe(`${window.innerWidth - RECT.width - 8}px`);
		expect(rootStyle(w).top).toBe(`${window.innerHeight - RECT.height - 8}px`);
	});

	it("ao reaparecer (minimizar de novo) reajusta à janela atual", async () => {
		storeState.minimized.value = false;
		saveMediaChromePosition({ x: 5000, y: 10 });
		const w = mountChrome();
		expect(w.find(".media-chrome").exists()).toBe(false);

		storeState.minimized.value = true;
		await nextTick();
		await nextTick();
		expect(rootStyle(w).left).toBe(`${window.innerWidth - RECT.width - 8}px`);

		storeState.minimized.value = false;
		await nextTick();
		expect(w.find(".media-chrome").exists()).toBe(false);
	});

	it("redimensionar a janela mantém o player visível", async () => {
		saveMediaChromePosition({ x: 600, y: 500 });
		const w = mountChrome();
		const originalWidth = window.innerWidth;
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 700 });
		window.dispatchEvent(new Event("resize"));
		await nextTick();
		expect(rootStyle(w).left).toBe(`${700 - RECT.width - 8}px`);
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: originalWidth,
		});
	});

	it("redimensionar sem posição salva não faz nada", async () => {
		const w = mountChrome();
		window.dispatchEvent(new Event("resize"));
		await nextTick();
		expect(rootStyle(w).left).toBe("");
	});

	it("desmontar durante o arraste remove os listeners da janela", async () => {
		const w = mountChrome();
		handle(w).dispatchEvent(pointer("pointerdown", { x: 650, y: 520 }));
		const removeSpy = vi.spyOn(window, "removeEventListener");
		w.unmount();
		wrapper = null;
		expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
		expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
	});
});
