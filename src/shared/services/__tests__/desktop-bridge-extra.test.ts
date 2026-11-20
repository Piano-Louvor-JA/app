// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * desktop-bridge — deteção de ambiente: bridge do preload, userAgent
 * Electron, Windows via UA/Client Hints/platform.
 *
 * NUNCA substituir o global `window` inteiro (vi.stubGlobal("window", ...)):
 * o Vitest usa o window real internamente e quebra com
 * "process is not defined". Mutar as propriedades direto no window real.
 */
import {
	getDesktopBridge,
	isDesktopApp,
	isElectronShell,
	isWindowsDesktop,
} from "../desktop-bridge";

type Win = Record<string, unknown>;

function setUA(ua: string) {
	Object.defineProperty(window.navigator, "userAgent", {
		value: ua,
		configurable: true,
	});
}

function setBridge(bridge: unknown) {
	if (bridge == null) {
		delete (window as unknown as Win).louvorja;
	} else {
		(window as unknown as Win).louvorja = bridge;
	}
}

beforeEach(() => {
	setUA("Mozilla/5.0 (X11; Linux x86_64) Chrome/120");
	setBridge(null);
	Reflect.deleteProperty(window.navigator, "userAgentData");
});

afterEach(() => {
	setUA("Mozilla/5.0 (X11; Linux x86_64) Chrome/120");
	setBridge(null);
	Reflect.deleteProperty(window.navigator, "userAgentData");
});

describe("getDesktopBridge", () => {
	it("window.louvorja presente -> bridge", () => {
		const bridge = { isElectron: true };
		setBridge(bridge);
		expect(getDesktopBridge()).toBe(bridge);
	});

	it("sem bridge -> null", () => {
		expect(getDesktopBridge()).toBeNull();
	});
});

describe("isElectronShell", () => {
	it("bridge com isElectron -> true", () => {
		setBridge({ isElectron: true });
		expect(isElectronShell()).toBe(true);
	});

	it("UA Electron sem bridge -> true (preload ainda não subiu)", () => {
		setUA("Mozilla/5.0 Electron/25.0");
		expect(isElectronShell()).toBe(true);
	});

	it("browser comum -> false", () => {
		expect(isElectronShell()).toBe(false);
	});
});

describe("isDesktopApp", () => {
	it("bridge isElectron -> true; sem -> false", () => {
		expect(isDesktopApp()).toBe(false);
		setBridge({ isElectron: true });
		expect(isDesktopApp()).toBe(true);
	});
});

describe("isWindowsDesktop", () => {
	it("bridge platform win32 -> true", () => {
		setBridge({ platform: "win32" });
		expect(isWindowsDesktop()).toBe(true);
	});

	it("UA Windows sem bridge -> true (fallback clássico)", () => {
		setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
		expect(isWindowsDesktop()).toBe(true);
	});

	it("Client Hints platform Win -> true", () => {
		setUA("Mozilla/5.0 Chrome/120");
		Object.defineProperty(window.navigator, "userAgentData", {
			value: { platform: "Windows" },
			configurable: true,
		});
		expect(isWindowsDesktop()).toBe(true);
	});

	it("Client Hints platform macOS -> false", () => {
		setUA("Mozilla/5.0 Chrome/120");
		Object.defineProperty(window.navigator, "userAgentData", {
			value: { platform: "macOS" },
			configurable: true,
		});
		expect(isWindowsDesktop()).toBe(false);
	});

	it("Linux sem nada -> false", () => {
		setUA("Mozilla/5.0 (X11; Linux x86_64)");
		expect(isWindowsDesktop()).toBe(false);
	});
});
