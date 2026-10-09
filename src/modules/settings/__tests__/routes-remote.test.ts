import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/services/desktop-bridge", () => ({
	isElectronShell: vi.fn(() => false),
}));

import { settingsRoutes } from "../routes";

describe("settings routes — web shell", () => {
	it("fora do electron: rota remote usa lazy import (linha 62)", () => {
		const remote = (settingsRoutes[0].children ?? []).find(
			(child) => child.name === "settings-remote",
		);
		expect(typeof remote?.component).toBe("function");
		// invoca a arrow lazy para cobrir o statement da linha 62
		return Promise.resolve(
			(remote?.component as () => Promise<unknown>)(),
		).then((mod) => {
			expect(mod).toBeTruthy();
		});
	});
});
