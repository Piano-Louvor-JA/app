import { describe, expect, it, vi } from "vitest";

const { isElectronShellMock } = vi.hoisted(() => ({
	isElectronShellMock: vi.fn(() => true),
}));

vi.mock("@shared/services/desktop-bridge", () => ({
	isElectronShell: isElectronShellMock,
}));

import { settingsRoutes } from "../routes";

describe("settings routes", () => {
	it("exporta rota raiz de configurações com redirect", () => {
		expect(settingsRoutes).toHaveLength(1);
		const route = settingsRoutes[0];
		expect(route.path).toBe("settings");
		expect(route.meta).toEqual({ navKey: "settings" });
		expect(route.redirect).toEqual({ name: "settings-appearance" });
	});

	it("define as sub-rotas esperadas", () => {
		const children = (settingsRoutes[0].children ?? []).map(
			(child) => child.name,
		);
		expect(children).toContain("settings-appearance");
		expect(children).toContain("settings-general");
		expect(children).toContain("settings-media");
		expect(children).toContain("settings-projection");
	});
});

describe("settings routes — branch remote", () => {
	it("todas as sub-rotas existem (inclui remote)", () => {
		const children = settingsRoutes[0].children ?? [];
		const names = children.map((child) => child.name);
		expect(names).toContain("settings-remote");
		const remote = children.find((child) => child.name === "settings-remote");
		expect(remote?.component).toBeTruthy();
	});
});
