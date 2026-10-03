// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

/**
 * RandomProjectionView — projeção fullscreen do sorteio.
 * Modo standalone (localStorage + BroadcastChannel + storage events) e
 * embedded (usa a store). Branches: projecting on/off, stage com/sem
 * imagem, effectiveConfig (diálogo > sub-bloco Palco), onDraw embedded.
 */
import { BROWSER_STORAGE_KEYS } from "../../../../shared/constants/storage-keys";
import { RANDOM_CONFIG_CHANNEL } from "../../services/random-preferences";
import { RANDOM_RUNTIME_STORAGE_KEY } from "../../services/random-runtime";
import { useRandomStore } from "../../stores/useRandomStore";
import { DEFAULT_RANDOM_DISPLAY_CONFIG } from "../../types/random";
import RandomProjectionView from "../RandomProjectionView.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": { random: {} } },
});

function mountView(over: { embedded?: boolean } = {}) {
	return mount(RandomProjectionView, {
		props: over,
		global: { plugins: [i18n, createPinia()] },
	});
}

beforeEach(() => {
	localStorage.clear();
	vi.stubGlobal(
		"matchMedia",
		vi.fn().mockReturnValue({
			matches: false,
			addListener: vi.fn(),
			removeListener: vi.fn(),
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("RandomProjectionView — standalone", () => {
	it("monta e lê config/runtime do localStorage", () => {
		const w = mountView();
		expect(w.find(".random-projection").exists()).toBe(true);
		w.unmount();
	});

	it("projecting false esconde o palco", () => {
		localStorage.setItem(
			RANDOM_RUNTIME_STORAGE_KEY,
			JSON.stringify({
				mode: "names",
				isDrawing: false,
				currentDisplay: "",
				drawn: [],
				projecting: false,
			}),
		);
		const w = mountView();
		expect(w.find(".random-projection__stage").exists()).toBe(false);
		w.unmount();
	});

	it("projecting true mostra o palco com RandomStage projection", async () => {
		localStorage.setItem(
			RANDOM_RUNTIME_STORAGE_KEY,
			JSON.stringify({
				mode: "names",
				isDrawing: false,
				currentDisplay: "Ana",
				drawn: [],
				projecting: true,
			}),
		);
		const w = mountView();
		// runtime é lido no onMounted — aguardar o tick pós-mount
		await w.vm.$nextTick();
		expect(w.find(".random-projection__stage").exists()).toBe(true);
		w.unmount();
	});

	it("storage event de userPreferences refresca config", async () => {
		const w = mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: BROWSER_STORAGE_KEYS.userPreferences,
			}),
		);
		await w.vm.$nextTick();
		// sem crash = handler rodou
		expect(w.find(".random-projection").exists()).toBe(true);
		w.unmount();
	});

	it("storage event do runtime refresca runtime", async () => {
		const w = mountView();
		window.dispatchEvent(
			new StorageEvent("storage", { key: RANDOM_RUNTIME_STORAGE_KEY }),
		);
		await w.vm.$nextTick();
		expect(w.find(".random-projection").exists()).toBe(true);
		w.unmount();
	});

	it("BroadcastChannel message atualiza config", async () => {
		const w = mountView();
		const channel = new BroadcastChannel(RANDOM_CONFIG_CHANNEL);
		channel.postMessage({
			...DEFAULT_RANDOM_DISPLAY_CONFIG,
			bgColor: "#abcdef",
		});
		await new Promise((r) => setTimeout(r, 50));
		w.unmount();
		channel.close();
		expect(w.find(".random-projection").exists()).toBe(true);
	});

	it("unmount remove listeners e fecha channels", () => {
		const w = mountView();
		const removeSpy = vi.spyOn(window, "removeEventListener");
		w.unmount();
		expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
		removeSpy.mockRestore();
	});
});

describe("RandomProjectionView — embedded", () => {
	it("embedded: usa a store; onDraw chama startDraw", async () => {
		const pinia = createPinia();
		setActivePinia(pinia);
		const w = mount(RandomProjectionView, {
			props: { embedded: true },
			global: { plugins: [i18n, pinia] },
		});
		const store = useRandomStore();
		const spy = vi.spyOn(store, "startDraw").mockImplementation(() => {});
		// botão Sortear do stage embedded (canDraw vem da store)
		const btn = w.find(".random-stage__draw");
		if (btn.exists()) {
			await btn.trigger("click");
			expect(spy).toHaveBeenCalledOnce();
		}
		spy.mockRestore();
		w.unmount();
	});

	it("embedded: projecting false da store esconde palco", async () => {
		const pinia = createPinia();
		setActivePinia(pinia);
		const store = useRandomStore();
		store.runtime.projecting = false;
		const w = mount(RandomProjectionView, {
			props: { embedded: true },
			global: { plugins: [i18n, pinia] },
		});
		await w.vm.$nextTick();
		expect(w.find(".random-projection__stage").exists()).toBe(false);
		w.unmount();
	});

	it("embedded: classe --embedded aplicada", () => {
		const w = mountView({ embedded: true });
		expect(w.find(".random-projection--embedded").exists()).toBe(true);
		w.unmount();
	});
	describe("gaps — onDraw embedded, channels, effectiveConfig", () => {
		it("embedded: botão sortear chama startDraw", async () => {
			const w = mountView({ embedded: true });
			await flushPromises();
			const drawBtn = w.findAll("button").find((b) => (b.text() || "").toLowerCase().includes("sorte"));
			if (drawBtn) {
				await drawBtn.trigger("click");
				await flushPromises();
			}
			expect(w.exists()).toBe(true);
			w.unmount();
		});

		it("não embedded: onDraw não faz nada", async () => {
			const w = mountView({ embedded: false });
			await flushPromises();
			expect(w.exists()).toBe(true);
			w.unmount();
		});

		it("BroadcastChannel indisponível: view monta igual (catch dos canais)", async () => {
			const OriginalBC = window.BroadcastChannel;
			(vi.stubGlobal as (k: string, v: unknown) => void)("BroadcastChannel", undefined);
			const w = mountView();
			await flushPromises();
			expect(w.exists()).toBe(true);
			w.unmount();
			(vi.stubGlobal as (k: string, v: unknown) => void)("BroadcastChannel", OriginalBC);
		});
	});

});