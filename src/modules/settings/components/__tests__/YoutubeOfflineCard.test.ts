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
		clear: vi.fn(async () => ({ ...initial, usage: { ...initial.usage, bytes: 0, count: 0 } })),
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

	it("qualidade e espaço máximo", async () => {
		const { api } = makeApi();
		const wrapper = await mountWith(api);
		expect(wrapper.find('[data-test="youtube-offline-quality-720"]').attributes("aria-checked")).toBe("true");

		await wrapper.find('[data-test="youtube-offline-quality-1080"]').trigger("click");
		await flushPromises();
		expect(api.setSettings).toHaveBeenCalledWith({ maxHeight: 1080 });
		expect(wrapper.find('[data-test="youtube-offline-quality-1080"]').classes()).toContain("selected");

		const limit = wrapper.find<HTMLSelectElement>('[data-test="youtube-offline-limit"]');
		expect(limit.findAll("option").map((option) => option.text())).toEqual(["2 GB", "4 GB", "6 GB", "10 GB", "20 GB"]);
		await limit.setValue("10");
		await flushPromises();
		expect(api.setSettings).toHaveBeenLastCalledWith({ limitGb: 10 });
	});

	it("mostra o espaço usado", async () => {
		const { api } = makeApi();
		const wrapper = await mountWith(api);
		expect(wrapper.find('[data-test="youtube-offline-usage"]').text()).toBe(
			'settings.youtubeOffline.usage {"used":"1.5","limit":6,"count":3}',
		);
	});

	it("apagar pede confirmação; cancelado não apaga", async () => {
		const { api } = makeApi();
		const wrapper = await mountWith(api);
		vi.mocked(appConfirm).mockResolvedValueOnce(false);
		await wrapper.find('[data-test="youtube-offline-clear"]').trigger("click");
		await flushPromises();
		expect(appConfirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true, title: "settings.youtubeOffline.clearTitle" }));
		expect(api.clear).not.toHaveBeenCalled();

		await wrapper.find('[data-test="youtube-offline-clear"]').trigger("click");
		await flushPromises();
		expect(api.clear).toHaveBeenCalled();
		expect(wrapper.find('[data-test="youtube-offline-clear"]').attributes("disabled")).toBeDefined();
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
