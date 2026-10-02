import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	getSeasonalEvent,
	type SeasonalEventBanner,
} from "../seasonal-event";

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	} as unknown as Response;
}

describe("seasonal-event service (F6 banner)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("evento ativo → retorna dados", async () => {
		const payload: SeasonalEventBanner = {
			active: true,
			name: "Temporada SDA Hymnal",
			description: "Crie músicas e ganhe pontos em dobro!",
			multiplier: 2,
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(payload)),
		);
		expect(await getSeasonalEvent()).toEqual(payload);
	});

	it("active:false → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ active: false })),
		);
		expect(await getSeasonalEvent()).toBeNull();
	});

	it("falha de rede → null (nunca lança)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		expect(await getSeasonalEvent()).toBeNull();
	});
});

describe("seasonal-event — fechamento de cobertura (URL + mapeamento)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("URL: default de produção quando env ausente", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", undefined as unknown as string);
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ active: false });
			}),
		);
		await getSeasonalEvent();
		expect(calledUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/seasonal-event",
		);
	});

	it("URL: env com trailing slash é normalizado", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.test.local/");
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ active: false });
			}),
		);
		await getSeasonalEvent();
		expect(calledUrl).toBe("https://api.test.local/v1/custom/seasonal-event");
	});

	it("evento ativo: payload mapeado campo a campo (name/description/multiplier)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					jsonResponse({
						active: true,
						name: "Natal PIANO",
						description: "Pontos em dobro",
						multiplier: 3,
					}) as unknown,
			),
		);
		const ev = await getSeasonalEvent();
		expect(ev).toEqual({
			active: true,
			name: "Natal PIANO",
			description: "Pontos em dobro",
			multiplier: 3,
		});
	});
});

describe("seasonal-event — branch !ok e rede", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("resposta !ok → null", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
		expect(await getSeasonalEvent()).toBeNull();
	});

	it("fetch lança (rede) → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await getSeasonalEvent()).toBeNull();
	});
});

describe("seasonal-event — mutante if(!ok)→if(false)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("resposta !ok com body válido NÃO vira banner (dado não pode vazar de erro)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse(
					{ active: true, name: "X", description: "Y", multiplier: 2 },
					false,
				),
			),
		);
		expect(await getSeasonalEvent()).toBeNull();
	});
});
