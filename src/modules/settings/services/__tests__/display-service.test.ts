// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SystemDisplay } from "../../types/projection";
import {
	formatDisplayResolution,
	identifySystemDisplays,
	listExtendedDisplays,
	listSystemDisplays,
	subscribeDisplaysChanged,
} from "../display-service";

const mocks = vi.hoisted(() => ({
	isDesktopApp: vi.fn<() => boolean>(() => false),
	getDesktopBridge: vi.fn<() => unknown>(() => null),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
	isDesktopApp: mocks.isDesktopApp,
	getDesktopBridge: mocks.getDesktopBridge,
}));

const display = (overrides: Partial<SystemDisplay> = {}): SystemDisplay => ({
	id: 1,
	bounds: { x: 0, y: 0, width: 1920, height: 1080 },
	workArea: { x: 0, y: 0, width: 1920, height: 1040 },
	scaleFactor: 1,
	isPrimary: true,
	...overrides,
});

afterEach(() => {
	vi.resetAllMocks();
	mocks.isDesktopApp.mockReturnValue(false);
	mocks.getDesktopBridge.mockReturnValue(null);
});

describe("listSystemDisplays", () => {
	it("fora do desktop → preview estático", async () => {
		const displays = await listSystemDisplays();
		expect(displays).toHaveLength(3);
		expect(displays[0]?.isPrimary).toBe(true);
	});

	it("desktop sem bridge.displays.list → []", async () => {
		mocks.isDesktopApp.mockReturnValue(true);
		expect(await listSystemDisplays()).toEqual([]);
	});

	it("desktop com bridge lista e converte", async () => {
		mocks.isDesktopApp.mockReturnValue(true);
		mocks.getDesktopBridge.mockReturnValue({
			displays: {
				list: async () => [
					{
						id: 7,
						bounds: { x: 0, y: 0, width: 800, height: 600 },
						workArea: { x: 0, y: 0, width: 800, height: 580 },
						scaleFactor: 2,
						isPrimary: true,
					},
				],
			},
		});
		const displays = await listSystemDisplays();
		expect(displays).toHaveLength(1);
		expect(displays[0]?.id).toBe(7);
		expect(displays[0]?.scaleFactor).toBe(2);
	});

	it("bridge retorna null → []", async () => {
		mocks.isDesktopApp.mockReturnValue(true);
		mocks.getDesktopBridge.mockReturnValue({
			displays: { list: async () => null },
		});
		expect(await listSystemDisplays()).toEqual([]);
	});

	it("bridge rejeita → [] com log", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.isDesktopApp.mockReturnValue(true);
		mocks.getDesktopBridge.mockReturnValue({
			displays: {
				list: async () => {
					throw new Error("ipc down");
				},
			},
		});
		expect(await listSystemDisplays()).toEqual([]);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe("subscribeDisplaysChanged", () => {
	it("fora do desktop → no-op", () => {
		const unsub = subscribeDisplaysChanged(() => {});
		expect(typeof unsub).toBe("function");
		expect(() => unsub()).not.toThrow();
	});

	it("desktop sem onChanged → no-op", () => {
		mocks.isDesktopApp.mockReturnValue(true);
		const unsub = subscribeDisplaysChanged(() => {});
		expect(() => unsub()).not.toThrow();
	});

	it("desktop inscreve e converte payload", () => {
		mocks.isDesktopApp.mockReturnValue(true);
		let listener: ((payload: unknown) => void) | null = null;
		const unsubscribe = vi.fn();
		mocks.getDesktopBridge.mockReturnValue({
			displays: {
				onChanged: (cb: (payload: unknown) => void) => {
					listener = cb;
					return unsubscribe;
				},
			},
		});
		const callback = vi.fn();
		const unsub = subscribeDisplaysChanged(callback);
		expect(unsub).toBe(unsubscribe);

		listener!([
			{
				id: 2,
				bounds: { x: 0, y: 0, width: 800, height: 600 },
				workArea: { x: 0, y: 0, width: 800, height: 600 },
				scaleFactor: 1,
				isPrimary: false,
			},
		]);
		expect(callback).toHaveBeenCalledWith([
			expect.objectContaining({ id: 2, isPrimary: false }),
		]);
	});

	it("payload não-array → lista vazia", () => {
		mocks.isDesktopApp.mockReturnValue(true);
		let listener: ((payload: unknown) => void) | null = null;
		mocks.getDesktopBridge.mockReturnValue({
			displays: {
				onChanged: (cb: (payload: unknown) => void) => {
					listener = cb;
					return () => {};
				},
			},
		});
		const callback = vi.fn();
		subscribeDisplaysChanged(callback);
		listener!("lixo");
		expect(callback).toHaveBeenCalledWith([]);
	});
});

describe("identifySystemDisplays", () => {
	it("fora do desktop → false", async () => {
		expect(await identifySystemDisplays()).toBe(false);
	});

	it("sem bridge.identify → false", async () => {
		mocks.isDesktopApp.mockReturnValue(true);
		expect(await identifySystemDisplays()).toBe(false);
	});

	it("identify ok → boolean do bridge", async () => {
		mocks.isDesktopApp.mockReturnValue(true);
		mocks.getDesktopBridge.mockReturnValue({
			displays: { identify: async () => 1 },
		});
		expect(await identifySystemDisplays()).toBe(true);
	});

	it("identify rejeita → false com log", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.isDesktopApp.mockReturnValue(true);
		mocks.getDesktopBridge.mockReturnValue({
			displays: {
				identify: async () => {
					throw new Error("x");
				},
			},
		});
		expect(await identifySystemDisplays()).toBe(false);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe("helpers", () => {
	it("formatDisplayResolution", () => {
		expect(formatDisplayResolution(display())).toBe("1920 × 1080");
	});

	it("listExtendedDisplays filtra primários", () => {
		const list = listExtendedDisplays([
			display(),
			display({ id: 2, isPrimary: false }),
		]);
		expect(list).toHaveLength(1);
		expect(list[0]?.id).toBe(2);
	});
});
