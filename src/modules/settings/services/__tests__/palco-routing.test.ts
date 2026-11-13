// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	getPalcoRoute,
	getPalcoRoutes,
	isMirrorRoute,
	isPalcoTvOnlyRoute,
	PALCO_MODULES,
	setPalcoRoute,
} from "../palco-routing";

describe("palco-routing", () => {
	beforeEach(() => {
		localStorage.clear();
		// volta tudo para mirror (estado singleton do módulo)
		for (const module of PALCO_MODULES) setPalcoRoute(module, "mirror");
	});

	it("default é mirror para todos os módulos", () => {
		for (const module of PALCO_MODULES) {
			expect(getPalcoRoute(module)).toBe("mirror");
			expect(isMirrorRoute(module)).toBe(true);
			expect(isPalcoTvOnlyRoute(module)).toBe(false);
		}
	});

	it("setPalcoRoute persiste em localStorage", () => {
		setPalcoRoute("bible", "0");
		expect(getPalcoRoute("bible")).toBe("0");
		expect(localStorage.getItem("louvorja-palco-routing-v1")).toContain(
			'"bible":"0"',
		);
	});

	it("rota de slot é tv-only", () => {
		setPalcoRoute("random", "7082");
		expect(isPalcoTvOnlyRoute("random")).toBe(true);
		expect(isMirrorRoute("random")).toBe(false);
	});

	it("rota cable: não é tv-only", () => {
		setPalcoRoute("random", "cable:1");
		expect(isPalcoTvOnlyRoute("random")).toBe(false);
		expect(isMirrorRoute("random")).toBe(false);
	});

	it("getPalcoRoutes retorna cópia de todas as rotas", () => {
		setPalcoRoute("clock", "2");
		const all = getPalcoRoutes();
		expect(all.clock).toBe("2");
		expect(all.bible).toBe("mirror");
	});

	it("localStorage corrompido cai nos defaults", async () => {
		vi.resetModules();
		localStorage.setItem("louvorja-palco-routing-v1", "nao-json{");
		const fresh = await import("../palco-routing");
		expect(fresh.getPalcoRoute("bible")).toBe("mirror");
	});
});

describe("palco-routing — fallback interno", () => {
	it("getPalcoRoute com módulo fora do mapa retorna mirror", async () => {
		vi.resetModules();
		localStorage.setItem("louvorja-palco-routing-v1", "{}");
		const fresh = await import("../palco-routing");
		// cast para exercitar o ?? 'mirror' da linha 24
		const route = fresh.getPalcoRoute("unknown" as never);
		expect(route).toBe("mirror");
	});
});

it('destinos salvos por versões antigas não valem mais: tudo espelha', async () => {
  localStorage.setItem('louvorja-palco-routing-v1', JSON.stringify({ hymns: '7082', bible: '7084', clock: 'cable:1' }))
  vi.resetModules()
  const routing = await import('../palco-routing')
  for (const module of routing.PALCO_MODULES) {
    expect(routing.getPalcoRoute(module)).toBe('mirror')
    expect(routing.isPalcoTvOnlyRoute(module)).toBe(false)
  }
  expect(localStorage.getItem('louvorja-palco-routing-v1')).toBeNull()
  routing.setPalcoRoute('hymns', '7082')
  expect(routing.getPalcoRoutes().hymns).toBe('mirror')
})
