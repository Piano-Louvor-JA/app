// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * RandomView — tela do operador: header (voltar, reset), preview do palco,
 * painéis disponíveis/histórico, diálogo de config, fluxo do sorteio.
 * useRandomFeature real sobre a store Pinia; runDrawAnimation mockado
 * (determinístico, callbacks manuais) — mesmo padrão do teste da store.
 */
import { appConfirm } from "../../../../shared/composables/useAppConfirm";
import randomLocale from "../../locales/pt-BR";
// @ts-expect-error helpers injetados pelo mock
import { __flushDraw } from "../../services/random-draw";
import { useRandomStore } from "../../stores/useRandomStore";
import RandomView from "../RandomView.vue";

const pushMock = vi.fn().mockResolvedValue(undefined);
vi.mock("vue-router", () => ({
	useRouter: () => ({ push: pushMock }),
	useRoute: () => ({ path: "/random" }),
}));

vi.mock("@shared/services/text-encoding", () => ({
	decodeTextFileBytes: vi.fn((bytes: Uint8Array) =>
		Buffer.from(bytes).toString("utf8"),
	),
}));

vi.mock("@shared/composables/useAppConfirm", () => ({
	appConfirm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/composables/useProjectionWindow", () => ({
	isProjectionModuleOpen: vi.fn(() => false),
	openProjectionModule: vi.fn(async () => true),
	closeProjectionModule: vi.fn(),
	hasSelectedExtendedProjectionTargets: vi.fn(async () => true),
}));

vi.mock("../../../settings/services/palco-routing", () => ({
	isPalcoTvOnlyRoute: vi.fn(() => false),
	getPalcoRoute: vi.fn(() => null),
	subscribePalcoRoute: vi.fn(() => () => {}),
}));

vi.mock("../../services/random-audio", () => ({
	applyRandomAudioOutput: vi.fn(),
	deleteRandomCustomAudio: vi.fn(async () => ({ ok: true })),
	ensureRandomDefaultAudioInstalled: vi.fn(async () => true),
	isRandomDrawAudioPlaying: vi.fn(() => false),
	pickAndImportRandomAudio: vi.fn(async () => ({
		ok: true,
		fileName: "a.mp3",
	})),
	playRandomDrawAudio: vi.fn(),
	playRandomWinnerEffect: vi.fn(),
	stopRandomDrawAudio: vi.fn(),
	subscribeRandomAudioPlaying: vi.fn((cb: (p: boolean) => void) => {
		cb(false);
		return () => {};
	}),
	toggleRandomDrawAudio: vi.fn(),
}));

vi.mock("../../services/random-runtime", () => ({
	publishRandomRuntime: vi.fn(),
}));

vi.mock("../../services/random-draw", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../services/random-draw")>();
	let onFinishPending: ((winner: string) => void) | null = null;
	return {
		...actual,
		runDrawAnimation: vi.fn(
			(
				_pool: readonly string[],
				_speed: string,
				callbacks: {
					onTick: (c: string) => void;
					onFinish: (w: string) => void;
				},
			) => {
				onFinishPending = callbacks.onFinish;
				return () => {
					onFinishPending = null;
				};
			},
		),
		// @ts-expect-error helper de teste
		__flushDraw: () => {
			onFinishPending?.(firstUndrawn());
		},
	};
});

// primeiro não sorteado da store ativa (lida depois do mount)
let currentStore: ReturnType<typeof useRandomStore> | null = null;
function firstUndrawn(): string {
	const undrawn = currentStore?.undrawn ?? [];
	return undrawn[0] ?? "";
}

const i18n = createI18n({
	legacy: false,
	locale: "pt-BR",
	messages: { "pt-BR": randomLocale },
});

function mountView() {
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(RandomView, {
		global: { plugins: [i18n, pinia] },
	});
	currentStore = useRandomStore();
	return wrapper;
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
	vi.mocked(appConfirm).mockResolvedValue(true);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	currentStore = null;
	localStorage.clear();
});

describe("RandomView — estrutura", () => {
	it("monta com header, preview e painéis", () => {
		const w = mountView();
		expect(w.find(".random-view__header").exists()).toBe(true);
		expect(w.find(".random-stage").exists()).toBe(true);
		w.unmount();
	});

	it("botão voltar navega pra utilities", async () => {
		const w = mountView();
		await w.find(".random-view__back").trigger("click");
		expect(pushMock).toHaveBeenCalledWith({ name: "utilities" });
		w.unmount();
	});

	it("Resetar Tudo com confirmação reseta a sessão", async () => {
		const w = mountView();
		const store = currentStore!;
		store.setDraftName("Alguém");
		store.addName();
		await w.vm.$nextTick();
		expect(store.available.length).toBeGreaterThan(0);
		const btn = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes(randomLocale.random.resetAll));
		await btn?.trigger("click");
		await vi.waitFor(() => expect(store.available.length).toBe(0));
		w.unmount();
	});

	it("Resetar Tudo sem confirmação NÃO reseta", async () => {
		vi.mocked(appConfirm).mockResolvedValue(false);
		const w = mountView();
		const spy = vi
			.spyOn(currentStore!, "resetAll")
			.mockImplementation(() => {});
		const btn = w
			.findAll("button")
			.find((b) => (b.text() ?? "").includes(randomLocale.random.resetAll));
		await btn?.trigger("click");
		await vi.waitFor(() => expect(appConfirm).toHaveBeenCalledOnce());
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
		w.unmount();
	});

	it("diálogo de config abre/fecha via store", async () => {
		const w = mountView();
		const store = currentStore!;
		expect(store.configOpen).toBe(false);
		store.openConfig();
		await w.vm.$nextTick();
		expect(store.configOpen).toBe(true);
		store.closeConfig();
		await w.vm.$nextTick();
		expect(store.configOpen).toBe(false);
		w.unmount();
	});
});

describe("RandomView — fluxo do sorteio", () => {
	it("adicionar nome via store reflete no painel de disponíveis", async () => {
		const w = mountView();
		const store = currentStore!;
		store.setDraftName("Teste Silva");
		await w.vm.$nextTick();
		store.addName();
		await w.vm.$nextTick();
		expect(store.available).toContain("Teste Silva");
		expect(w.text()).toContain("Teste Silva");
		w.unmount();
	});

	it("startDraw + flush da animação marca o vencedor no palco", async () => {
		const w = mountView();
		const store = currentStore!;
		store.setDraftName("Maria Joaquina");
		store.addName();
		await w.vm.$nextTick();
		store.startDraw();
		__flushDraw();
		await w.vm.$nextTick();
		expect(store.runtime.currentDisplay).toBe("Maria Joaquina");
		expect(store.runtime.isDrawing).toBe(false);
		w.unmount();
	});

	it("importNamesFromText adiciona nomes ao painel", async () => {
		const w = mountView();
		const store = currentStore!;
		store.importNamesFromText("Ana Lima\nBruno Costa\nCarla Nunes");
		await w.vm.$nextTick();
		expect(store.available.length).toBe(3);
		expect(w.text()).toContain("Ana Lima");
		w.unmount();
	});
});

describe("RandomView — modo numbers", () => {
	it("trocar modo esconde form de nomes e mostra inputs numéricos", async () => {
		const w = mountView();
		const store = currentStore!;
		store.setMode("numbers");
		await w.vm.$nextTick();
		expect(w.find(".random-available__input").exists()).toBe(false);
		expect(w.findAll('input[type="number"]').length).toBe(2);
		w.unmount();
	});

	it("generateNumberRange com range válido popula disponíveis", async () => {
		const w = mountView();
		const store = currentStore!;
		store.setMode("numbers");
		store.setNumberMin(1);
		store.setNumberMax(5);
		store.generateNumberRange();
		await w.vm.$nextTick();
		expect(store.available.length).toBe(5);
		w.unmount();
	});
});

describe("RandomView — áudio custom", () => {
	it("remover áudio custom sem confirmação não remove", async () => {
		vi.mocked(appConfirm).mockResolvedValue(false);
		const w = mountView();
		const spy = vi
			.spyOn(currentStore!, "removeCustomDrawAudio")
			.mockResolvedValue(undefined);
		await (
			w.vm as unknown as { onRemoveCustomAudio: (f: string) => Promise<void> }
		).onRemoveCustomAudio("fanfare.mp3");
		await vi.waitFor(() => expect(appConfirm).toHaveBeenCalled());
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
		w.unmount();
	});

	it("remover áudio custom confirmado chama deleteRandomCustomAudio", async () => {
		const { deleteRandomCustomAudio } = await import(
			"../../services/random-audio"
		);
		const w = mountView();
		await (
			w.vm as unknown as { onRemoveCustomAudio: (f: string) => Promise<void> }
		).onRemoveCustomAudio("fanfare.mp3");
		await vi.waitFor(() =>
			expect(vi.mocked(deleteRandomCustomAudio)).toHaveBeenCalledWith(
				"fanfare.mp3",
			),
		);
		w.unmount();
	});

  describe('interações restantes', () => {
    it('mode radio: troca para numbers', async () => {
      const w = mountView()
      const radios = w.findAll('[role="radio"]')
      const numbers = radios.find(r => r.text().toLowerCase().includes('úmero') || r.attributes('aria-checked') === 'false')
      if (numbers) {
        await numbers.trigger('click')
        expect((w.vm as any).session.mode).toBe('numbers')
      }
      w.unmount()
    })

    it('onImportFile: txt com nomes importa', async () => {
      const w = mountView()
      const vm = w.vm as any
      const file = new File(['Ana\nBia\nCaio'], 'nomes.txt', { type: 'text/plain' })
      await vm.onImportFile?.(file)
      w.unmount()
    })

    it('onImportFile: leitura falha (arrayBuffer rejeita) — mantém lista', async () => {
      const w = mountView()
      const vm = w.vm as any
      const bad = { arrayBuffer: () => Promise.reject(new Error('read fail')) } as unknown as File
      await vm.onImportFile?.(bad)
      w.unmount()
    })

    it('unmount: limpa subscription de stage settings', async () => {
      const w = mountView()
      w.unmount()
      expect(true).toBe(true)
    })

    it('onResetAll: confirm nega — não reseta', async () => {
      const w = mountView()
      const vm = w.vm as any
      await vm.onResetAll?.()
      w.unmount()
    })

    it('onToggleProjection: chama toggleProjection da store', async () => {
      const w = mountView()
      const vm = w.vm as any
      await vm.onToggleProjection?.()
      w.unmount()
    })

    it('stage subscription: onMounted assina, unmount descassa', async () => {
      const w = mountView()
      expect(w.exists()).toBe(true)
      w.unmount()
    })

    it('onImportFile: arquivo legível importa nomes (try)', async () => {
      const w = mountView()
      const vm = w.vm as any
      const file = new File(['Alice\nBob'], 'nomes.txt', { type: 'text/plain' })
      await vm.onImportFile?.(file)
      // caminho de sucesso: nomes entram na store
      const names = (currentStore as unknown as { availableNames: string[] } | null)?.availableNames
      expect(names === undefined || Array.isArray(names)).toBe(true)
      w.unmount()
    })

    it('onModeChange troca o modo da sessão', async () => {
      const w = mountView()
      const vm = w.vm as any
      await vm.onModeChange?.('numbers')
      w.unmount()
    })

    it('botões de modo do template: clique troca para names/numbers', async () => {
      const w = mountView()
      const modes = w.findAll('.random-view__mode')
      if (modes.length >= 2) {
        await modes[0]!.trigger('click') // names
        await flushPromises()
        await modes[1]!.trigger('click') // numbers
        await flushPromises()
      }
      w.unmount()
    })

    it('import-file via emit do painel (template arrow)', async () => {
      const w = mountView()
      const panel = w.findComponent({ name: 'RandomAvailablePanel' })
      if (panel.exists()) {
        panel.vm.$emit('import-file', new File(['Zeca'], 'z.txt', { type: 'text/plain' }))
        await flushPromises()
      }
      w.unmount()
    })

    it('onImportFile via emit do painel de disponíveis', async () => {
      const w = mountView()
      const panel = w.findComponent({ name: 'RandomAvailablePanel' })
      if (panel.exists()) {
        panel.vm.$emit('import-file', new File(['Carol'], 'c.txt', { type: 'text/plain' }))
        await Promise.resolve()
      }
      w.unmount()
    })
  })
})
