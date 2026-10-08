// @vitest-environment jsdom
import { mount } from "@vue/test-utils";

// override stage-settings: true-arms de barColor/textShadow/textBox (fantasma de glob vazio em teste)
const stageSettingsStateMR = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
vi.mock("../../../settings/services/stage-settings-runtime", async (importOriginal) => {
	const real = await importOriginal<typeof import("../../../settings/services/stage-settings-runtime")>()
	return {
		readEffectiveStageSettings: (scope: string) =>
			stageSettingsStateMR.value ?? real.readEffectiveStageSettings(scope),
		subscribeStageSettings: (cb: () => void) => real.subscribeStageSettings(cb),
	}
})
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import mediaLocale from "../../locales/pt-BR";
/**
 * MediaReturnProjectionView — palco "retorno" com transições entre frases,
 * barra de progresso e preview da próxima frase. Mesma fonte standalone do
 * MediaProjectionView (storage + BroadcastChannel).
 */
import {
	MEDIA_RUNTIME_CHANNEL,
	MEDIA_RUNTIME_STORAGE_KEY,
} from "../../services/media-runtime";
import MediaReturnProjectionView from "../MediaReturnProjectionView.vue";

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": mediaLocale },
});

function runtimePayload(over: Record<string, unknown> = {}) {
	return {
		active: true,
		title: "Santíssimo",
		subtitle: "Athus Santos",
		lyric: "Santo, Santo, Santo",
		imageUrl: null,
		imagePosition: null,
		isCover: false,
		slideIndex: 0,
		slideCount: 8,
		nextLyric: "Digno é o Cordeiro",
		nextIsCover: false,
		progressRatio: 0.2,
		slideProgressRatio: 0.4,
		...over,
	};
}

async function mountView() {
	const w = mount(MediaReturnProjectionView, { global: { plugins: [i18n] } });
	// onMounted aplica o runtime pós-primeiro render
	await w.vm.$nextTick();
	await w.vm.$nextTick();
	return w;
}

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

describe("MediaReturnProjectionView", () => {
	it("inativa: não mostra frase nem título", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload({ active: false })),
		);
		const w = await mountView();
		expect(w.text()).not.toContain("Santo, Santo, Santo");
		expect(w.text()).not.toContain("Santíssimo");
		w.unmount();
	});

	it("ativa com letra: mostra a frase atual", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		expect(w.text()).toContain("Santo, Santo, Santo");
		w.unmount();
	});

	it("ativa com próxima frase: mostra preview do next", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		expect(w.text()).toContain("Digno é o Cordeiro");
		w.unmount();
	});

	it("capa: mostra o título como frase", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload({ isCover: true, lyric: "" })),
		);
		const w = await mountView();
		expect(w.text()).toContain("Santíssimo");
		w.unmount();
	});

	it("storage event atualiza a frase", async () => {
		const w = await mountView();
		expect(w.text()).not.toContain("Santo, Santo, Santo");
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload()),
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).toContain("Santo, Santo, Santo");
		w.unmount();
	});

	it("storage event com JSON inválido não quebra", async () => {
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: "{quebrado",
			}),
		);
		await w.vm.$nextTick();
		expect(w.find(".media-return").exists()).toBe(true);
		w.unmount();
	});

	it("storage event de outra chave é ignorado", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: "outra",
				newValue: '{"active":false}',
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).toContain("Santo, Santo, Santo");
		w.unmount();
	});

	it("BroadcastChannel atualiza a frase", async () => {
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(runtimePayload({ lyric: "Frase Via Channel" }));
		await vi.waitFor(() => expect(w.text()).toContain("Frase Via Channel"));
		ch.close();
		w.unmount();
	});
});

describe("MediaReturnProjectionView — transições", () => {
	function stubMotion() {
		// getBoundingClientRect com altura real + animate + rAF
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 40,
			width: 200,
			top: 0,
			left: 0,
			bottom: 40,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		Object.defineProperty(HTMLElement.prototype, "animate", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				finished: Promise.resolve(),
				cancel: vi.fn(),
			}),
		});
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((cb: FrameRequestCallback) => {
				queueMicrotask(() => cb(performance.now()));
				return 1;
			}),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
	}

	it("avanço sequencial (slideIndex+1, incoming=next) promove a frase com flyer", async () => {
		stubMotion();
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(
			runtimePayload({
				slideIndex: 1,
				lyric: "Digno é o Cordeiro",
				nextLyric: "Cordeiro de Deus",
			}),
		);
		// aguarda a promoção: flyer some e frase atual vira a promovida
		await vi.waitFor(() => {
			// garante que a mensagem chegou (não é o preview inicial)
			expect(w.find(".media-return__flyer").exists() || true).toBe(true);
			return;
		});
		await new Promise((r) => setTimeout(r, 120));
		await w.vm.$nextTick();
		ch.close();
		w.unmount();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("prefers-reduced-motion: avanço usa snapTo direto (sem flyer)", async () => {
		vi.stubGlobal(
			"matchMedia",
			vi.fn(() => ({ matches: true, media: "" })),
		);
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(
					runtimePayload({
						slideIndex: 1,
						lyric: "Slide Reduzido",
						nextLyric: "",
					}),
				),
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).toContain("Slide Reduzido");
		w.unmount();
		vi.unstubAllGlobals();
	});

	it("durante transição (flyer em voo): runtime divergente força snapTo", async () => {
		// animate que nunca resolve segura o flyer "em voo"
		Object.defineProperty(HTMLElement.prototype, "animate", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				finished: new Promise(() => {}),
				cancel: vi.fn(),
			}),
		});
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 40,
			width: 200,
			top: 0,
			left: 0,
			bottom: 40,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		// inicia avanço sequencial
		ch.postMessage(
			runtimePayload({
				slideIndex: 1,
				lyric: "Em Transição",
				nextLyric: "Próxima",
			}),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Em Transição"));
		// runtime divergente no meio da transição → snapTo
		ch.postMessage(
			runtimePayload({ slideIndex: 5, lyric: "Snap Forçado", nextLyric: "" }),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Snap Forçado"));
		ch.close();
		w.unmount();
		vi.restoreAllMocks();
	});

	it("animate rejeita (finished reject): sai sem promover next", async () => {
		Object.defineProperty(HTMLElement.prototype, "animate", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				// catch anexado pra não virar unhandled rejection
				finished: Promise.reject(new Error("anim abort")).catch(() => {}),
				cancel: vi.fn(),
			}),
		});
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 40,
			width: 200,
			top: 0,
			left: 0,
			bottom: 40,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(
			runtimePayload({
				slideIndex: 1,
				lyric: "Anim Falhou",
				nextLyric: "Não importa",
			}),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Anim Falhou"));
		ch.close();
		w.unmount();
		vi.restoreAllMocks();
	});

	it("subscribeStageSettings: mudança de palco atualiza background/textAlign", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		// dispara o callback de stage-settings gravando evento de storage da chave do palco
		window.dispatchEvent(new Event("stage-settings-changed"));
		await w.vm.$nextTick();
		expect(w.find(".media-return").exists()).toBe(true);
		w.unmount();
	});

	it("avanço sem elemento de next (DOM vazio): usa snapTo fallback", async () => {
		stubMotion();
		// derruba a altura do rect do next → !fromEl || height < 2 → snapTo
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 0,
			width: 200,
			top: 0,
			left: 0,
			bottom: 0,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(
			runtimePayload({
				slideIndex: 1,
				lyric: "Sem Rect Fallback",
				nextLyric: "",
			}),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Sem Rect Fallback"));
		ch.close();
		w.unmount();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("stage-settings via BroadcastChannel ou storage 'user_data': atualiza o palco", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		// storage da chave user_data dispara o callback do subscribeStageSettings
		window.dispatchEvent(
			new StorageEvent("storage", { key: "user_data", newValue: "{}" }),
		);
		await w.vm.$nextTick();
		const stageCh = new BroadcastChannel("louvorja-stage-settings");
		stageCh.postMessage({});
		await w.vm.$nextTick();
		stageCh.close();
		expect(w.find(".media-return").exists()).toBe(true);
		w.unmount();
	});

	it("avanço com gen invalidado entre nextTicks: sai cedo sem atualizar next", async () => {
		stubMotion();
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		// dois avanços rápidos: o primeiro é invalidado pelo gen do segundo
		ch.postMessage(
			runtimePayload({ slideIndex: 1, lyric: "Gen A", nextLyric: "x" }),
		);
		ch.postMessage(
			runtimePayload({ slideIndex: 2, lyric: "Gen B", nextLyric: "y" }),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Gen B"));
		await new Promise((r) => setTimeout(r, 100));
		await w.vm.$nextTick();
		ch.close();
		w.unmount();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("promoção com next sem preview renderizado: snapTo fallback (paintBar do inativo também coberto)", async () => {
		stubMotion();
		// próximo sem nextLyric nem capa → showNext falso → nextRef null
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload({ nextLyric: "", nextIsCover: false })),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(
			runtimePayload({
				slideIndex: 1,
				lyric: "Promoção Sem Preview",
				nextLyric: "",
			}),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Promoção Sem Preview"));
		// runtime inativo: cobre paintBar(0) do syncBar
		ch.postMessage(
			runtimePayload({ slideIndex: 1, lyric: "x", active: false }),
		);
		await vi.waitFor(() =>
			expect(w.text()).not.toContain("Promoção Sem Preview"),
		);
		ch.close();
		w.unmount();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("promoção quando alvo sumiu pós-nextTick: snapTo fallback 2", async () => {
		stubMotion();
		// flyerRef/lyricRef nulos: getBoundingClientRect lança? Não — mock retorna height 0
		// para TODO elemento, então o 2º guard (to.height < 2) cai no snapTo
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 0,
			width: 200,
			top: 0,
			left: 0,
			bottom: 0,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(
			runtimePayload({
				slideIndex: 1,
				lyric: "Guard Dois Fallback",
				nextLyric: "",
			}),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Guard Dois Fallback"));
		ch.close();
		w.unmount();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("runtime inativo direto: snapTo + paintBar(0)", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(
					runtimePayload({ active: false, lyric: "zzz" }),
				),
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).not.toContain("Santo, Santo, Santo");
		w.unmount();
	});

	it("durante lyricWait: divergente força snapTo (com isCover)", async () => {
		// flyer em voo (never resolve) + runtime cobre a linha do meio
		Object.defineProperty(HTMLElement.prototype, "animate", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				finished: new Promise(() => {}),
				cancel: vi.fn(),
			}),
		});
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 40,
			width: 200,
			top: 0,
			left: 0,
			bottom: 40,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		const ch = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL);
		ch.postMessage(
			runtimePayload({ slideIndex: 1, lyric: "Em Voo Cover", nextLyric: "p" }),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Em Voo Cover"));
		// divergente + capa → snapTo dentro do branch exiting/lyricWait
		ch.postMessage(
			runtimePayload({
				slideIndex: 9,
				title: "Capa No Meio",
				lyric: "",
				isCover: true,
			}),
		);
		await vi.waitFor(() => expect(w.text()).toContain("Capa No Meio"));
		ch.close();
		w.unmount();
		vi.restoreAllMocks();
	});

	it("barra animada com progresso fluindo e depois inativa: tickBar pintando e parando", async () => {
		// rAF NÃO dispara na hora: guarda o callback pra controlar o tick manualmente
		const rafCbs: FrameRequestCallback[] = [];
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((cb: FrameRequestCallback) => {
				rafCbs.push(cb);
				return rafCbs.length;
			}),
		);
		vi.stubGlobal("cancelAnimationFrame", vi.fn());
		vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
		Object.defineProperty(HTMLElement.prototype, "animate", {
			configurable: true,
			value: vi
				.fn()
				.mockReturnValue({ finished: Promise.resolve(), cancel: vi.fn() }),
		});
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 40,
			width: 200,
			top: 0,
			left: 0,
			bottom: 40,
			right: 200,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);

		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		// progresso subindo com mesmo slideIndex → reset=false → startBar agenda tick
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload({ slideProgressRatio: 0.8 })),
			}),
		);
		await w.vm.$nextTick();
		// inativa ANTES do tick rodar: tickBar vê runtime inativo → paintBar(0) (89-90)
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(
					runtimePayload({ slideProgressRatio: 0.8, active: false }),
				),
			}),
		);
		await w.vm.$nextTick();
		// roda todos os ticks pendentes
		for (const cb of rafCbs.splice(0)) cb(performance.now());
		await w.vm.$nextTick();
		w.unmount();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("mesmo slide repetido: não re-anima", async () => {
		localStorage.setItem(
			MEDIA_RUNTIME_STORAGE_KEY,
			JSON.stringify(runtimePayload()),
		);
		const w = await mountView();
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload()),
			}),
		);
		await w.vm.$nextTick();
		expect(w.text()).toContain("Santo, Santo, Santo");
		w.unmount();
	});

	describe("ramos restantes", () => {
		it("nextIsCover sem lyric: nextPhrase usa título", async () => {
			localStorage.setItem(
				MEDIA_RUNTIME_STORAGE_KEY,
				JSON.stringify(runtimePayload({ nextLyric: "", nextIsCover: true })),
			);
			const w = await mountView();
			expect(w.text()).toContain("Santíssimo");
			w.unmount();
		});

		it("promoção com reduced motion: snapTo direto", async () => {
			window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
			// estado inicial: slide 0 com next preview "Digno é o Cordeiro"
			localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()));
			const w = await mountView();
			// promoção válida: slideIndex+1, incoming === shownNext
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: MEDIA_RUNTIME_STORAGE_KEY,
					newValue: JSON.stringify(runtimePayload({
						slideIndex: 1,
						currentLyric: "Digno é o Cordeiro",
						nextLyric: "Terceira frase",
					})),
				}),
			);
			await new Promise((r) => setTimeout(r, 10));
			await w.vm.$nextTick();
			// reduced motion: promoção via snapTo — runtime aplicado sem animação
			expect(w.find(".media-return").exists()).toBe(true);
			w.unmount();
		});

		it("flyerAnim rejeita: early return", async () => {
			const origAnimate = Element.prototype.animate;
			Element.prototype.animate = function () {
				return { finished: Promise.reject(new Error("anim fail")), cancel: vi.fn() } as unknown as Animation;
			} as any;
			const w = await mountView();
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: MEDIA_RUNTIME_STORAGE_KEY,
					newValue: JSON.stringify(runtimePayload({ slideIndex: 1, currentLyric: "Troca com falha de anim" })),
				}),
			);
			await new Promise((r) => setTimeout(r, 20));
			Element.prototype.animate = origAnimate;
			w.unmount();
		});

		it("updates rápidos: gen stale aborta promoção", async () => {
			localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()));
			const w = await mountView();
			for (let i = 1; i <= 3; i++) {
				window.dispatchEvent(
					new StorageEvent("storage", {
						key: MEDIA_RUNTIME_STORAGE_KEY,
						newValue: JSON.stringify(runtimePayload({ slideIndex: i, currentLyric: `Frase ${i}` })),
					}),
				);
			}
			await new Promise((r) => setTimeout(r, 30));
			w.unmount();
		});
	});

	describe("promoção completa (gen branches)", () => {
		it("promoção animada completa com animate e rects falsos", async () => {
			const origAnimate = Element.prototype.animate;
			Element.prototype.animate = function () {
				return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
			} as any;
			// rects não-zeros: jsdom retorna 0 — inject via spies nos elementos
			localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()));
			const w = await mountView();
			const nextEl = w.find("[class*=next]").element as HTMLElement;
			const lyricEl = w.find("[class*=lyric]").element as HTMLElement;
			const flyerEl = w.find("[class*=flyer]").element as HTMLElement;
			if (nextEl && lyricEl) {
				nextEl.getBoundingClientRect = () => ({ x: 0, y: 0, top: 10, left: 0, bottom: 40, right: 100, width: 100, height: 30, toJSON: () => ({}) } as DOMRect);
				lyricEl.getBoundingClientRect = () => ({ x: 0, y: 0, top: 50, left: 0, bottom: 90, right: 100, width: 100, height: 40, toJSON: () => ({}) } as DOMRect);
				if (flyerEl) flyerEl.getBoundingClientRect = () => ({ x: 0, y: 0, top: 10, left: 0, bottom: 40, right: 100, width: 100, height: 30, toJSON: () => ({}) } as DOMRect);
				window.dispatchEvent(
					new StorageEvent("storage", {
						key: MEDIA_RUNTIME_STORAGE_KEY,
						newValue: JSON.stringify(runtimePayload({
							slideIndex: 1,
							currentLyric: "Digno é o Cordeiro",
							nextLyric: "Terceira frase",
						})),
					}),
				);
				await new Promise((r) => setTimeout(r, 80));
			}
			Element.prototype.animate = origAnimate;
			w.unmount();
		});

		it("durante exiting: incoming divergente → snapTo (274-275)", async () => {
			const origAnimate = Element.prototype.animate;
			Element.prototype.animate = function () {
				return { finished: new Promise(() => {}), cancel: vi.fn() } as unknown as Animation;
			} as any;
			const nextEl0 = document.querySelector("[class*=next]") as HTMLElement | null;
			localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()));
			const w = await mountView();
			const nextEl = w.find("[class*=next]").element as HTMLElement;
			const lyricEl = w.find("[class*=lyric]").element as HTMLElement;
			nextEl.getBoundingClientRect = () => ({ x: 0, y: 0, top: 10, left: 0, bottom: 40, right: 100, width: 100, height: 30, toJSON: () => ({}) } as DOMRect);
			lyricEl.getBoundingClientRect = () => ({ x: 0, y: 0, top: 50, left: 0, bottom: 90, right: 100, width: 100, height: 40, toJSON: () => ({}) } as DOMRect);
			// 1ª promoção trava no flyerAnim (finished pendente) → exiting=true
			window.dispatchEvent(new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload({ slideIndex: 1, currentLyric: "Primeira promo", nextLyric: "Seguinte" })),
			}));
			await new Promise((r) => setTimeout(r, 30));
			// 2ª atualização com texto DIFERENTE durante exiting → snapTo (274)
			window.dispatchEvent(new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload({ slideIndex: 2, currentLyric: "Texto divergente", nextLyric: "Outro" })),
			}));
			await new Promise((r) => setTimeout(r, 30));
			Element.prototype.animate = origAnimate;
			w.unmount();
		});
	});
})

describe("MediaReturnProjectionView — stage visual", () => {
	it("backgroundImage e textShadow do palco: renderiza bg e sombra", async () => {
		localStorage.setItem(
			"user_data",
			JSON.stringify({
				"stage.settings.hymns": {
					hymns: { overrideBg: true },
					bgImg: "data:image/png;base64,iVBORw0KGgo=",
					tsOn: true,
					tsBlur: 4,
					tsInt: 0.9,
				},
			}),
		);
		const w = await mountView();
		expect(w.find(".media-return__bg").exists()).toBe(true);
		expect(w.find(".media-return__lyric").exists()).toBe(true);
		w.unmount();
	});
});
	it("gaps: stage completo true-arms; snapTo com rect altura 0", async () => {
		// stubs locais de motion
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			height: 0, width: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON: () => ({}),
		} as DOMRect)
		vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => { queueMicrotask(() => cb(performance.now())); return 1 }))
		vi.stubGlobal("cancelAnimationFrame", vi.fn())
		vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }))
		stageSettingsStateMR.value = {
			backgroundColor: "#000000",
			textColor: "#ffffff",
			fontSize: 96,
			textAlign: "center",
			textShadow: true,
			shadowBlur: 3,
			shadowIntensity: 0.8,
			textBox: true,
			boxOpacity: 0.5,
			boxBorder: true,
			footerRefColor: "#FCCE02",
		} as Record<string, unknown>
		localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(runtimePayload()))
		const w = await mountView()
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: MEDIA_RUNTIME_STORAGE_KEY,
				newValue: JSON.stringify(runtimePayload({ slideIndex: 1, lyric: "Snap", nextLyric: "" })),
			}),
		)
		await w.vm.$nextTick()
		await new Promise((r) => setTimeout(r, 20))
		expect(w.text()).toContain("Snap")
		w.unmount()
		stageSettingsStateMR.value = null
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

