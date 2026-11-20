// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	OnlineVideoItemStatus,
	OnlineVideoStatus,
	OnlineVideoToolsStatus,
} from "@/shared/types/desktop-bridge";

vi.mock("vue-i18n", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, unknown>) =>
			params ? `${key} ${JSON.stringify(params)}` : key,
	}),
}));
vi.mock("@shared/composables/useAppConfirm", () => ({
	appConfirm: vi.fn(async () => true),
}));

import { appConfirm } from "@shared/composables/useAppConfirm";

import YoutubeOfflineCard from "../YoutubeOfflineCard.vue";

const GB = 1024 ** 3;
const originalLouvorja = window.louvorja;

function makeStatus(overrides: Partial<OnlineVideoStatus> = {}): OnlineVideoStatus {
	return {
		hidden: false,
		available: true,
		settings: { enabled: false, maxHeight: 720, limitGb: 6 },
		tools: { state: "missing" },
		usage: { bytes: 1.5 * GB, count: 3, limitBytes: 6 * GB },
		...overrides,
	};
}

function makeApi(initial = makeStatus()) {
	let toolsListener: ((status: OnlineVideoToolsStatus) => void) | null = null;
	let changedListener:
		| ((payload: { id: string; status: OnlineVideoItemStatus }) => void)
		| null = null;
	const stopTools = vi.fn();
	const stopChanged = vi.fn();
	const api = {
		status: vi.fn(async () => initial),
		setSettings: vi.fn(async (partial: Partial<OnlineVideoStatus["settings"]>) => ({
			...initial,
			settings: { ...initial.settings, ...partial },
		})),
		clear: vi.fn(async () => ({ ...initial, usage: { ...initial.usage, bytes: 0, count: 0 }, folders: null })),
		openFolder: vi.fn(async () => true),
		chooseFolder: vi.fn(async () => ({
			...initial,
			settings: { ...initial.settings, folder: "custom" as const, customDir: "/hd" },
			folders: {
				system: { dir: "/sys/video-cache", bytes: 0, count: 0, limitBytes: Infinity },
				custom: { dir: "/hd/LouvorJA-PIANO-videos", bytes: 0, count: 0, limitBytes: Infinity },
				active: "custom" as const,
			},
		})),
		retryTools: vi.fn(async () => ({ ...initial, tools: { state: "ready" as const, version: "1" } })),
		prefetch: vi.fn(),
		cancel: vi.fn(),
		keep: vi.fn(),
		videoStatus: vi.fn(),
		onTools: vi.fn((callback: (status: OnlineVideoToolsStatus) => void) => {
			toolsListener = callback;
			return stopTools;
		}),
		onChanged: vi.fn(
			(callback: (payload: { id: string; status: OnlineVideoItemStatus }) => void) => {
				changedListener = callback;
				return stopChanged;
			},
		),
	};
	return {
		api,
		stopTools,
		stopChanged,
		emitTools: (status: OnlineVideoToolsStatus) => toolsListener?.(status),
		emitChanged: (status: OnlineVideoItemStatus) =>
			changedListener?.({ id: "aaaaaaaaaaa", status }),
	};
}

function setBridge(bridge: unknown) {
	Object.defineProperty(window, "louvorja", {
		value: bridge,
		configurable: true,
		writable: true,
	});
}

async function mountWith(api: ReturnType<typeof makeApi>["api"] | undefined, isElectron = true) {
	setBridge({ isElectron, onlineVideo: api });
	const wrapper = mount(YoutubeOfflineCard);
	await flushPromises();
	return wrapper;
}

const card = '[data-test="youtube-offline-card"]';

describe("YoutubeOfflineCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		setBridge(originalLouvorja);
	});

	it("fora do desktop, sem a API ou na Microsoft Store: não aparece", async () => {
		const { api } = makeApi();
		expect((await mountWith(api, false)).find(card).exists()).toBe(false);
		expect(api.status).not.toHaveBeenCalled();
		expect((await mountWith(undefined)).find(card).exists()).toBe(false);
		setBridge(undefined);
		expect(mount(YoutubeOfflineCard).find(card).exists()).toBe(false);
		const store = makeApi(makeStatus({ hidden: true }));
		expect((await mountWith(store.api)).find(card).exists()).toBe(false);
	});

	it("status falhando: registra o erro e não aparece", async () => {
		const { api, emitTools } = makeApi();
		api.status.mockRejectedValueOnce(new Error("ipc"));
		const wrapper = await mountWith(api);
		emitTools({ state: "ready" });
		await flushPromises();
		expect(wrapper.find(card).exists()).toBe(false);
		expect(console.error).toHaveBeenCalled();
	});

	it("sistema sem as ferramentas: explica que toca pela internet e esconde os controles", async () => {
		const { api } = makeApi(makeStatus({ available: false }));
		const wrapper = await mountWith(api);
		expect(wrapper.find('[data-test="youtube-offline-unavailable"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="youtube-offline-enabled"]').exists()).toBe(false);
	});

	it("chave desligada por padrão; ligar e desligar salva e troca a explicação", async () => {
		const { api } = makeApi();
		const wrapper = await mountWith(api);
		const toggle = wrapper.find<HTMLInputElement>('[data-test="youtube-offline-enabled"]');
		expect(toggle.element.checked).toBe(false);
		expect(wrapper.text()).toContain("settings.youtubeOffline.disabledHint");

		await toggle.setValue(true);
		await flushPromises();
		expect(api.setSettings).toHaveBeenCalledWith({ enabled: true });
		expect(wrapper.text()).toContain("settings.youtubeOffline.enabledHint");

		await toggle.setValue(false);
		await flushPromises();
		expect(api.setSettings).toHaveBeenLastCalledWith({ enabled: false });
	});

	it("qualidade máxima", async () => {
		const { api } = makeApi();
		const wrapper = await mountWith(api);
		expect(wrapper.find('[data-test="youtube-offline-quality-720"]').attributes("aria-checked")).toBe("true");

		await wrapper.find('[data-test="youtube-offline-quality-1080"]').trigger("click");
		await flushPromises();
		expect(api.setSettings).toHaveBeenCalledWith({ maxHeight: 1080 });
		expect(wrapper.find('[data-test="youtube-offline-quality-1080"]').classes()).toContain("selected");
		// Sem limite de espaço: quem configura e limpa é o operador.
		expect(wrapper.find('[data-test="youtube-offline-limit"]').exists()).toBe(false);
	});

	it("main antigo sem pastas: mostra só a do sistema com o tamanho", async () => {
		const { api } = makeApi(makeStatus({ cacheDir: "/sys/video-cache" }));
		const wrapper = await mountWith(api);
		const system = wrapper.find('[data-test="youtube-offline-folder-system"]');
		expect(system.text()).toContain("/sys/video-cache");
		expect(wrapper.find('[data-test="youtube-offline-size-system"]').text()).toBe(
			'settings.youtubeOffline.folderSize {"size":"1.5 GB","count":3}',
		);
		expect(wrapper.find('[data-test="youtube-offline-use-system"]').attributes("aria-checked")).toBe("true");
		expect(wrapper.find('[data-test="youtube-offline-choose-folder"]').exists()).toBe(true);
	});

	it("duas pastas: tamanho de cada uma, escolher onde baixar, abrir, trocar e apagar só uma", async () => {
		const folders = {
			system: { dir: "/sys/video-cache", bytes: 300 * 1024 ** 2, count: 2, limitBytes: Infinity },
			custom: { dir: "/hd/LouvorJA-PIANO-videos", bytes: 2 * GB, count: 5, limitBytes: Infinity },
			active: "custom" as const,
		};
		const { api } = makeApi(makeStatus({ folders, settings: { enabled: true, maxHeight: 720, limitGb: 6, folder: "custom", customDir: "/hd" } }));
		const wrapper = await mountWith(api);
		expect(wrapper.find('[data-test="youtube-offline-size-system"]').text()).toBe('settings.youtubeOffline.folderSize {"size":"300 MB","count":2}');
		expect(wrapper.find('[data-test="youtube-offline-size-custom"]').text()).toBe('settings.youtubeOffline.folderSize {"size":"2.0 GB","count":5}');
		expect(wrapper.find('[data-test="youtube-offline-folder-custom"]').classes()).toContain("active");
		expect(wrapper.find('[data-test="youtube-offline-folder-custom"]').text()).toContain("settings.youtubeOffline.folderActive");

		// Clicar na ativa não muda nada; na outra, passa a baixar nela.
		await wrapper.find('[data-test="youtube-offline-use-custom"]').trigger("click");
		expect(api.setSettings).not.toHaveBeenCalled();
		await wrapper.find('[data-test="youtube-offline-use-system"]').trigger("click");
		await flushPromises();
		expect(api.setSettings).toHaveBeenCalledWith({ folder: "system" });

		await wrapper.find('[data-test="youtube-offline-open-custom"]').trigger("click");
		await flushPromises();
		expect(api.openFolder).toHaveBeenCalledWith("custom");
		api.openFolder.mockRejectedValueOnce(new Error("sem gerenciador"));
		await wrapper.find('[data-test="youtube-offline-open-system"]').trigger("click");
		await flushPromises();

		await wrapper.find('[data-test="youtube-offline-change-folder"]').trigger("click");
		await flushPromises();
		expect(api.chooseFolder).toHaveBeenCalled();
	});

	it("sem pasta personalizada: clicar nela abre o seletor", async () => {
		const { api } = makeApi(makeStatus({ cacheDir: "/sys/video-cache" }));
		const wrapper = await mountWith(api);
		await wrapper.find('[data-test="youtube-offline-use-custom"]').trigger("click");
		await flushPromises();
		expect(api.chooseFolder).toHaveBeenCalledTimes(1);
		// Já escolhida: o botão "Escolher" dá lugar ao caminho e ao "Trocar pasta".
		expect(wrapper.find('[data-test="youtube-offline-choose-folder"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="youtube-offline-change-folder"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="youtube-offline-folder-custom"]').text()).toContain("/hd/LouvorJA-PIANO-videos");
	});

	it("apagar pede confirmação, só da pasta clicada; cancelado não apaga", async () => {
		const { api } = makeApi(makeStatus({ cacheDir: "/sys/video-cache" }));
		const wrapper = await mountWith(api);
		vi.mocked(appConfirm).mockResolvedValueOnce(false);
		await wrapper.find('[data-test="youtube-offline-clear-system"]').trigger("click");
		await flushPromises();
		expect(appConfirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, title: "settings.youtubeOffline.clearTitle", message: "settings.youtubeOffline.clearMessageSystem" }));
		expect(api.clear).not.toHaveBeenCalled();

		await wrapper.find('[data-test="youtube-offline-clear-system"]').trigger("click");
		await flushPromises();
		expect(api.clear).toHaveBeenCalledWith("system");
		expect(wrapper.find('[data-test="youtube-offline-clear-system"]').attributes("disabled")).toBeDefined();
	});

	it("apagar a pasta personalizada usa a mensagem dela", async () => {
		const folders = {
			system: { dir: "/s", bytes: 0, count: 0, limitBytes: Infinity },
			custom: { dir: "/c", bytes: GB, count: 1, limitBytes: Infinity },
			active: "system" as const,
		};
		const { api } = makeApi(makeStatus({ folders }));
		const wrapper = await mountWith(api);
		await wrapper.find('[data-test="youtube-offline-clear-custom"]').trigger("click");
		await flushPromises();
		expect(appConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: "settings.youtubeOffline.clearMessageCustom" }));
		expect(api.clear).toHaveBeenCalledWith("custom");
	});

	it("situação das ferramentas: a instalar, instalando, prontas e com erro", async () => {
		const { api, emitTools } = makeApi();
		const wrapper = await mountWith(api);
		const tools = () => wrapper.find('[data-test="youtube-offline-tools"]').text();
		expect(tools()).toBe("settings.youtubeOffline.toolsMissing");

		emitTools({ state: "installing", tool: "ytdlp", progress: 0.456 });
		await flushPromises();
		expect(tools()).toBe('settings.youtubeOffline.toolsInstalling {"progress":46}');
		emitTools({ state: "installing" });
		await flushPromises();
		expect(tools()).toBe('settings.youtubeOffline.toolsInstalling {"progress":0}');

		emitTools({ state: "ready", version: "2026.11.01" });
		await flushPromises();
		expect(tools()).toBe('settings.youtubeOffline.toolsReady {"version":"2026.11.01"}');
		emitTools({ state: "ready" });
		await flushPromises();
		expect(tools()).toBe('settings.youtubeOffline.toolsReady {"version":""}');

		emitTools({ state: "error", error: "rede" });
		await flushPromises();
		expect(tools()).toContain("settings.youtubeOffline.toolsError");
		await wrapper.find('[data-test="youtube-offline-retry"]').trigger("click");
		await flushPromises();
		expect(api.retryTools).toHaveBeenCalled();
		expect(tools()).toBe('settings.youtubeOffline.toolsReady {"version":"1"}');
	});

	it("vídeo terminou de baixar: atualiza o espaço usado", async () => {
		const { api, emitChanged } = makeApi();
		await mountWith(api);
		emitChanged({ state: "downloading", progress: 0.5 });
		await flushPromises();
		expect(api.status).toHaveBeenCalledTimes(1);
		emitChanged({ state: "ready" });
		await flushPromises();
		expect(api.status).toHaveBeenCalledTimes(2);
	});

	it("ação falhando registra o erro e libera os controles; cliques repetidos esperam", async () => {
		const { api } = makeApi();
		const wrapper = await mountWith(api);
		let finish: (value: OnlineVideoStatus) => void = () => {};
		api.setSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
		const button = wrapper.find('[data-test="youtube-offline-quality-480"]');
		await button.trigger("click");
		(wrapper.vm as unknown as { update: (partial: object) => Promise<void> }).update({ maxHeight: 1080 });
		finish(makeStatus());
		await flushPromises();
		expect(api.setSettings).toHaveBeenCalledTimes(1);

		api.setSettings.mockRejectedValueOnce(new Error("disco"));
		await button.trigger("click");
		await flushPromises();
		expect(console.error).toHaveBeenCalled();
		expect(button.attributes("disabled")).toBeUndefined();
	});

	it("desmontar cancela as inscrições", async () => {
		const { api, stopTools, stopChanged } = makeApi();
		const wrapper = await mountWith(api);
		wrapper.unmount();
		expect(stopTools).toHaveBeenCalled();
		expect(stopChanged).toHaveBeenCalled();
	});
});
