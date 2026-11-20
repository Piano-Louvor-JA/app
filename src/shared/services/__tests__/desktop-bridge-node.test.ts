// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * desktop-bridge — guards `typeof window === 'undefined'` (L4/10/24).
 * Ambiente NODE de verdade: window genuinamente não existe, exercitando
 * os guards de SSR/boot sem stub.
 */

describe("desktop-bridge sem window (node/SSR)", () => {
	it("getDesktopBridge -> null", async () => {
		vi.resetModules();
		const mod = await import("../desktop-bridge");
		expect(mod.getDesktopBridge()).toBeNull();
	});

	it("isElectronShell -> false", async () => {
		vi.resetModules();
		const mod = await import("../desktop-bridge");
		expect(mod.isElectronShell()).toBe(false);
	});

	it("isDesktopApp -> false", async () => {
		vi.resetModules();
		const mod = await import("../desktop-bridge");
		expect(mod.isDesktopApp()).toBe(false);
	});

	it("isWindowsDesktop -> false", async () => {
		vi.resetModules();
		const mod = await import("../desktop-bridge");
		expect(mod.isWindowsDesktop()).toBe(false);
	});
});
