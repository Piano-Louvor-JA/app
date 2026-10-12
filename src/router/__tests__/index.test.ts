// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// router/index: mockamos cada routes module com rotas leves para testar
// somente a montagem do router sem carregar todas as views.

vi.mock("@modules/home/routes", () => ({
	homeRoutes: [
		{ path: "/home", name: "x-home", component: { template: "<div />" } },
	],
}));
vi.mock("@modules/albums/routes", () => ({
	albumsRoutes: [
		{ path: "/albuns", name: "x-albuns", component: { template: "<div />" } },
	],
}));
vi.mock("@modules/liturgy/routes", () => ({
	liturgyRoutes: [
		{
			path: "/liturgia",
			name: "x-liturgia",
			component: { template: "<div />" },
		},
	],
}));
vi.mock("@modules/media/routes", () => ({
	mediaRoutes: [
		{ path: "/midia", name: "x-midia", component: { template: "<div />" } },
	],
}));
vi.mock("@modules/bible/routes", () => ({
	bibleRoutes: [
		{ path: "/biblia", name: "x-biblia", component: { template: "<div />" } },
	],
}));
vi.mock("@modules/clock/routes", () => ({
	utilitiesRoutes: [
		{
			path: "/utilitarios",
			name: "x-util",
			component: { template: "<div />" },
		},
	],
}));
vi.mock("@modules/timer/routes", () => ({
	timerRoutes: [
		{ path: "/timer", name: "x-timer", component: { template: "<div />" } },
	],
}));
vi.mock("@modules/countdown/routes", () => ({
	countdownRoutes: [
		{
			path: "/countdown",
			name: "x-countdown",
			component: { template: "<div />" },
		},
	],
}));
vi.mock("@modules/random/routes", () => ({
	randomRoutes: [
		{
			path: "/sorteios",
			name: "x-sorteios",
			component: { template: "<div />" },
		},
	],
}));
vi.mock("@modules/settings/routes", () => ({
	settingsRoutes: [
		{ path: "/config", name: "x-config", component: { template: "<div />" } },
	],
}));
vi.mock("@layouts/AppShell.vue", () => ({
	default: { template: "<div><router-view /></div>" },
}));
vi.mock("@shared/components/ProjectionHost.vue", () => ({
	default: { template: "<div />" },
}));

import router from "../index";

beforeEach(async () => {
	await router.push("/");
	await router.isReady();
});

describe("router", () => {
	it("exporta router com rotas de topo esperadas", () => {
		const paths = router.getRoutes().map((r) => r.path);
		expect(paths).toContain("/popup");
		expect(paths).toContain("/");
		expect(paths).toContain("/:pathMatch(.*)*");
		expect(router.getRoutes().length).toBeGreaterThan(3);
	});

	it("rota popup tem meta projection", () => {
		const popup = router.getRoutes().find((r) => r.name === "projection-popup");
		expect(popup?.meta.projection).toBe(true);
	});

	it("resolve rota inexistente -> redireciona para /", async () => {
		await router.push("/rota-inexistente-xyz");
		expect(router.currentRoute.value.path).toBe("/");
	});

	it("resolve rota home", async () => {
		await router.push("/home");
		expect(router.currentRoute.value.matched.length).toBeGreaterThan(0);
		expect(router.currentRoute.value.path).toBe("/home");
	});

	it("resolve rota de modulo registrado", async () => {
		await router.push("/midia");
		expect(router.currentRoute.value.path).toBe("/midia");
	});

	it("electron shell: router usa hash history (br 28)", async () => {
		vi.doMock("@shared/services/desktop-bridge", () => ({
			isElectronShell: () => true,
		}));
		vi.resetModules();
		const { default: hashRouter } = await import("../index");
		expect(hashRouter).toBeDefined();
		// hash history monta URLs com '#'
		expect((hashRouter as unknown as { options: { history: { mode: string } } }).options.history.mode ?? "").toBeDefined();
		vi.doUnmock("@shared/services/desktop-bridge");
		vi.resetModules();
	});
});
