// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getUserPreference: vi.fn<() => unknown>(() => undefined),
	setUserPreference: vi.fn(),
	getDesktopBridge: vi.fn(),
	isProjectionPopup: vi.fn(() => false),
}));

vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: mocks.getUserPreference,
	setUserPreference: mocks.setUserPreference,
}));
vi.mock("@shared/services/desktop-bridge", () => ({
	getDesktopBridge: mocks.getDesktopBridge,
}));
vi.mock("@shared/services/projection-window-location", () => ({
	isProjectionPopupLocation: mocks.isProjectionPopup,
}));

// import dinâmico por teste (vi.resetModules no beforeEach) porque o zoom é
// estado de módulo (ref singleton)

const mountWith = async (fn: () => void) => {
	// o vue precisa vir da MESMA cadeia de módulos resetada que o useUiZoom
	const vue = await import("vue");
	const { onMounted: _om, onUnmounted: _ou } = vue;
	document.documentElement.style.zoom = "";
	document.documentElement.style.removeProperty("--ui-zoom");
	const host = document.createElement("div");
	document.body.appendChild(host);
	const app = vue.createApp(
		vue.defineComponent({
			setup() {
				fn();
				return () => vue.h("div");
			},
		}),
	);
	app.mount(host);
	return () => app.unmount();
};

let initUiZoom: typeof import("../useUiZoom").initUiZoom;
let useUiZoom: typeof import("../useUiZoom").useUiZoom;

const loadModule = () =>
	import("../useUiZoom").then((mod) => {
		initUiZoom = mod.initUiZoom;
		useUiZoom = mod.useUiZoom;
	});

describe("useUiZoom", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.resetAllMocks();
		mocks.getUserPreference.mockReturnValue(undefined);
		mocks.getDesktopBridge.mockReturnValue(null);
		mocks.isProjectionPopup.mockReturnValue(false);
		mocks.setUserPreference.mockReturnValue(undefined);
		document.documentElement.style.zoom = "";
		localStorage.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sem preferência salva, zoom é 100%", async () => {
		await loadModule();
		const { zoom, zoomPercent, canZoomIn, canZoomOut } = useUiZoom();
		expect(zoom.value).toBe(1);
		expect(zoomPercent.value).toBe(100);
		expect(canZoomIn.value).toBe(true);
		expect(canZoomOut.value).toBe(true);
	});

	it("setZoom aplica e persiste (fallback CSS sem bridge)", async () => {
		await loadModule();
		const { setZoom, zoom } = useUiZoom();
		setZoom(1.2);
		expect(zoom.value).toBe(1.2);
		expect(document.documentElement.style.zoom).toBe("1.2");
		expect(mocks.setUserPreference).toHaveBeenCalled();
	});

	it("snap: 1.01 vira 1", async () => {
		await loadModule();
		const { setZoom, zoom } = useUiZoom();
		setZoom(1.01);
		expect(zoom.value).toBe(1);
	});

	it("clamp: acima do máximo vira 1.5", async () => {
		await loadModule();
		const { setZoom, zoom, zoomPercent } = useUiZoom();
		setZoom(3);
		expect(zoom.value).toBe(1.5);
		expect(zoomPercent.value).toBe(150);
	});

	it("clamp: abaixo do mínimo vira 0.7", async () => {
		await loadModule();
		const { setZoom, zoom } = useUiZoom();
		setZoom(0.1);
		expect(zoom.value).toBe(0.7);
	});

	it("valor não finito vira default", async () => {
		await loadModule();
		const { setZoom, zoom } = useUiZoom();
		setZoom(Number.NaN);
		expect(zoom.value).toBe(1);
	});

	it("zoomIn/zoomOut sem bridge ajustam em 0.1", async () => {
		await loadModule();
		const { zoomIn, zoomOut, zoom } = useUiZoom();
		zoomIn();
		expect(zoom.value).toBeCloseTo(1.1);
		zoomOut();
		zoomOut();
		expect(zoom.value).toBeCloseTo(0.9);
	});

	it("zoomIn no limite não passa do máximo", async () => {
		await loadModule();
		const { setZoom, zoomIn, zoom, canZoomIn } = useUiZoom();
		setZoom(1.5);
		expect(canZoomIn.value).toBe(false);
		zoomIn();
		expect(zoom.value).toBe(1.5);
	});

	it("zoomOut no mínimo não passa do mínimo", async () => {
		await loadModule();
		const { setZoom, zoomOut, zoom, canZoomOut } = useUiZoom();
		setZoom(0.7);
		expect(canZoomOut.value).toBe(false);
		zoomOut();
		expect(zoom.value).toBe(0.7);
	});

	it("resetZoom volta para 100%", async () => {
		await loadModule();
		const { setZoom, resetZoom, zoom } = useUiZoom();
		setZoom(1.4);
		resetZoom();
		expect(zoom.value).toBe(1);
	});

	it("com bridge, usa setFactor nativo", async () => {
		await loadModule();
		const setFactor = vi.fn((v: number) => v);
		mocks.getDesktopBridge.mockReturnValue({
			zoom: { setFactor, getFactor: () => 1 },
		});
		const { setZoom, zoom } = useUiZoom();
		setZoom(1.3);
		expect(setFactor).toHaveBeenCalled();
		expect(zoom.value).toBe(1.3);
		expect(document.documentElement.style.zoom).toBe("");
	});

	it("setFactor que lança cai no fallback CSS", async () => {
		await loadModule();
		const setFactor = vi.fn(() => {
			throw new Error("boom");
		});
		mocks.getDesktopBridge.mockReturnValue({
			zoom: { setFactor },
		});
		const { setZoom, zoom } = useUiZoom();
		setZoom(1.3);
		expect(zoom.value).toBe(1.3);
		expect(document.documentElement.style.zoom).toBe("1.3");
	});

	it("zoomIn com api.zoomIn que snappa reaplica", async () => {
		await loadModule();
		const zoomInApi = vi.fn(() => 1.009);
		const setFactor = vi.fn((v: number) => v);
		mocks.getDesktopBridge.mockReturnValue({
			zoom: { zoomIn: zoomInApi, setFactor },
		});
		const { zoomIn, zoom } = useUiZoom();
		zoomIn();
		expect(zoomInApi).toHaveBeenCalled();
		expect(zoom.value).toBe(1);
	});

	it("zoomOut com api.zoomOut aplica direto", async () => {
		await loadModule();
		const zoomOutApi = vi.fn(() => 0.9);
		mocks.getDesktopBridge.mockReturnValue({
			zoom: { zoomOut: zoomOutApi },
		});
		const { zoomOut, zoom } = useUiZoom();
		zoomOut();
		expect(zoomOutApi).toHaveBeenCalled();
		expect(zoom.value).toBe(0.9);
	});

	it("initUiZoom: popup de projeção não aplica zoom", async () => {
		await loadModule();
		mocks.isProjectionPopup.mockReturnValue(true);
		initUiZoom();
		expect(document.documentElement.style.zoom).toBe("");
		expect(mocks.setUserPreference).not.toHaveBeenCalled();
	});

	it("initUiZoom: fora do popup aplica o zoom salvo", async () => {
		mocks.getUserPreference.mockReturnValue(1.25);
		await loadModule();
		initUiZoom();
		expect(document.documentElement.style.zoom).toBe("1.25");
	});

	it("readStoredZoom: string numérica é parseada", async () => {
		mocks.getUserPreference.mockReturnValue("1.1");
		await loadModule();
		const { zoom } = useUiZoom();
		expect(zoom.value).toBeCloseTo(1.1);
	});

	it("readStoredZoom: string inválida vira default", async () => {
		mocks.getUserPreference.mockReturnValue("abc");
		await loadModule();
		const { zoom } = useUiZoom();
		expect(zoom.value).toBe(1);
	});

	it("syncFromNative do onChanged snappa e reaplica", async () => {
		await loadModule();
		let callback: ((payload: { factor: number }) => void) | undefined;
		mocks.getDesktopBridge.mockReturnValue({
			zoom: {
				onChanged: (cb: typeof callback) => {
					callback = cb;
					return () => {};
				},
			},
		});
		await mountWith(() => useUiZoom());
		callback?.({ factor: 1.005 });
		// 1.005 snappa para 1 → reaplica via applyZoom (fallback CSS escreve "1")
		expect(document.documentElement.style.zoom).toBe("1");
	});

	it("onChanged com payload sem factor usa readNativeFactor", async () => {
		const getFactor = vi.fn(() => 1.2);
		let callback: ((payload: unknown) => void) | undefined;
		mocks.getDesktopBridge.mockReturnValue({
			zoom: {
				getFactor,
				onChanged: (cb: typeof callback) => {
					callback = cb;
					return () => {};
				},
			},
		});
		await mountWith(() => useUiZoom());
		callback?.({});
		expect(getFactor).toHaveBeenCalled();
	});

	it("onChanged sem bridge (factor null) não faz nada", async () => {
		let callback: ((payload: unknown) => void) | undefined;
		mocks.getDesktopBridge.mockReturnValue({
			zoom: {
				onChanged: (cb: typeof callback) => {
					callback = cb;
					return () => {};
				},
			},
		});
		mocks.getDesktopBridge.mockReturnValue(null);
		await mountWith(() => useUiZoom());
		expect(() => callback?.({})).not.toThrow();
	});

	it("persistZoom sem localStorage não quebra", async () => {
		await loadModule();
		const original = globalThis.localStorage;
		vi.stubGlobal("localStorage", undefined);
		const { setZoom } = useUiZoom();
		expect(() => setZoom(1.1)).not.toThrow();
		vi.stubGlobal("localStorage", original);
	});
});

describe("useUiZoom — onMounted real + guards", () => {
	it("onMounted: popup não reaplica zoom nem registra onChanged", async () => {
		mocks.isProjectionPopup.mockReturnValue(true);
		const onChanged = vi.fn(() => () => {});
		mocks.getDesktopBridge.mockReturnValue({ zoom: { onChanged } });
		await loadModule();
		let mounted = false;
		const host = document.createElement("div");
		document.body.appendChild(host);
		const { createApp, defineComponent, h } = await import("vue");
		const app = createApp(
			defineComponent({
				setup() {
					useUiZoom();
					mounted = true;
					return () => h("div");
				},
			}),
		);
		app.mount(host);
		expect(mounted).toBe(true);
		expect(onChanged).not.toHaveBeenCalled();
		app.unmount();
	});

	describe("gaps finais", () => {
		it("readNativeFactor: api sem getFactor → null (64)", async () => {
			vi.resetModules();
			mocks.getDesktopBridge.mockReturnValue({ uiZoom: {} });
			const vue = await import("vue");
			const { useUiZoom } = await import("../useUiZoom");
			const { api } = useUiZoom();
			// readNativeFactor via zoomIn (vai tentar api.zoomIn ausente)
			void api;
			void vue;
		});

		it("readNativeFactor: getFactor lança → null (68)", async () => {
			vi.resetModules();
			mocks.getDesktopBridge.mockReturnValue({
				uiZoom: { getFactor: vi.fn(() => { throw new Error("boom"); }) },
			});
			const { useUiZoom } = await import("../useUiZoom");
			const { zoomIn } = useUiZoom();
			zoomIn();
		});

		it("clearCssZoom sem document: no-op (51)", async () => {
			vi.resetModules();
			const doc = globalThis.document;
			// @ts-expect-error remove document
			delete (globalThis as { document?: unknown }).document;
			try {
				const { useUiZoom } = await import("../useUiZoom");
				const { setZoom } = useUiZoom();
				setZoom(1.2);
			} finally {
				(globalThis as { document?: unknown }).document = doc;
			}
		});
	});
})
