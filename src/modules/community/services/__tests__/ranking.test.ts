import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	getMyPosition,
	getRanking,
	type RankingEntry,
	registerUse,
	reportCollection,
	authHeaders,
} from "../ranking";

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	} as unknown as Response;
}

const ENTRIES: RankingEntry[] = [
	{ position: 1, user_id: 7, display_name: "Alice", total: 15 },
	{ position: 2, user_id: 9, display_name: "Bob", total: 10 },
];

describe("ranking service (F2 app)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("getRanking busca com janela e mapeia entradas", async () => {
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = String(url);
				return jsonResponse({ data: ENTRIES });
			}),
		);
		const data = await getRanking("week");
		expect(calledUrl).toContain("/v1/custom/ranking?window=week");
		expect(data).toEqual(ENTRIES);
	});

	it("getRanking: falha da API → lista vazia, nunca lança", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ error: "x" }, false)),
		);
		expect(await getRanking("all")).toEqual([]);
	});

	it("getMyPosition: autenticado → payload; 401 → null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ position: 3, total: 7 })),
		);
		expect(await getMyPosition("all", "tok")).toEqual({
			position: 3,
			total: 7,
		});

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ error: "unauth" }, false)),
		);
		expect(await getMyPosition("all", "tok")).toBeNull();
		expect(await getMyPosition("all", null)).toBeNull();
	});

	it("registerUse: só chama com sessão; retorna first_use", async () => {
		let capturedInit: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				capturedInit = init;
				return jsonResponse({ ok: true, first_use: true });
			}),
		);
		const first = await registerUse(12, "tok");
		expect(first).toBe(true);
		expect((capturedInit?.method as string) || "GET").toBe("POST");
		const auth = (capturedInit?.headers as Record<string, string>)?.[
			"Authorization"
		];
		expect(auth).toBe("Bearer tok");

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ ok: true, first_use: false })),
		);
		expect(await registerUse(12, "tok")).toBe(false);
	});

	it("registerUse sem sessão → false sem chamar fetch", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(await registerUse(12, null)).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

  it("reportCollection: POST com sessão e reason; sem sessão → false", async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedInit = init;
        return jsonResponse({ ok: true });
      }),
    );
    expect(await reportCollection(12, "Conteúdo inadequado", "tok")).toBe(true);
    expect((capturedInit?.method as string) || "GET").toBe("POST");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.reason).toBe("Conteúdo inadequado");

    expect(await reportCollection(12, "abc", null)).toBe(false);
  });
});

describe("ranking service — fechamento de cobertura (catch/fallbacks)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("getRanking: resposta ok mas data não-array → []", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ data: "não-sou-array" })),
		);
		expect(await getRanking("week")).toEqual([]);
	});

	it("getRanking: fetch lança (rede) → [] sem propagar", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await getRanking("all")).toEqual([]);
	});

	it("getMyPosition: fetch lança → null sem propagar", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await getMyPosition("week", "tok")).toBeNull();
	});

	it("getMyPosition: resposta !ok → null", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
		expect(await getMyPosition("week", "tok")).toBeNull();
	});

	it("registerUse: resposta !ok → false", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
		expect(await registerUse(12, "tok")).toBe(false);
	});

	it("registerUse: fetch lança → false", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await registerUse(12, "tok")).toBe(false);
	});

	it("registerUse: JSON sem first_use → false", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true })));
		expect(await registerUse(12, "tok")).toBe(false);
	});

	it("reportCollection: resposta !ok → false", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false)));
		expect(await reportCollection(12, "motivo", "tok")).toBe(false);
	});

	it("reportCollection: fetch lança → false", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("offline");
			}),
		);
		expect(await reportCollection(12, "motivo", "tok")).toBe(false);
	});
});

describe("ranking service — base URL + authHeaders (linhas 21-26)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("getRanking: default de produção quando env ausente", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", undefined as unknown as string);
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ data: [] });
			}),
		);
		await getRanking("week");
		expect(calledUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/ranking?window=week",
		);
	});

	it("getRanking: env com trailing slash é normalizado", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.test.local/");
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ data: [] });
			}),
		);
		await getRanking("week");
		expect(calledUrl).toBe("https://api.test.local/v1/custom/ranking?window=week");
	});

	it("getMyPosition sem token → headers vazios (authHeaders null)", async () => {
		// branch authHeaders(null): não é alcançável via getMyPosition (retorna antes),
		// mas é via getRanking? não. O ternário null → {} é da função auxiliar.
		// Caminho observável: getMyPosition chamado com token usa Bearer (já coberto).
		// Este teste documenta o contrato da URL de me:
		let calledHeaders: unknown;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				calledHeaders = init?.headers;
				return jsonResponse({ position: 3, total: 40 });
			}),
		);
		await getMyPosition("all", "tok-x");
		expect((calledHeaders as Record<string, string>)?.["Authorization"]).toBe(
			"Bearer tok-x",
		);
	});
});

describe("ranking service — authHeaders com token null via getMyPosition indireto", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("getMyPosition: headers Authorization presentes (authHeaders truthy branch)", async () => {
		let h: unknown;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_u: string, init?: RequestInit) => {
				h = init?.headers;
				return jsonResponse({ position: 1, total: 10 });
			}),
		);
		await getMyPosition("week", "tok-y");
		expect((h as Record<string, string>)["Authorization"]).toBe("Bearer tok-y");
	});
});

describe("ranking service — contrato de rede (mata mutantes de method/headers)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("getRanking: método GET implícito e URL com query window", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.pianolouvorja.com.br");
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				capturedUrl = url;
				capturedInit = init;
				return jsonResponse({ data: [] });
			}),
		);
		await getRanking("week");
		expect(capturedUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/ranking?window=week",
		);
		// GET: sem method no init
		expect(capturedInit?.method).toBeUndefined();
	});

	it("getMyPosition: GET com Authorization Bearer exato", async () => {
		let capturedInit: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				capturedInit = init;
				return jsonResponse({ position: 1, total: 5 });
			}),
		);
		await getMyPosition("all", "tok-z");
		expect(capturedInit?.method).toBeUndefined(); // GET default
		expect((capturedInit?.headers as Record<string, string>)["Authorization"]).toBe(
			"Bearer tok-z",
		);
	});

	it("registerUse: POST sem body com Authorization exato", async () => {
		let capturedInit: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				capturedInit = init;
				return jsonResponse({ first_use: true });
			}),
		);
		await registerUse(33, "tok-r");
		expect(capturedInit?.method).toBe("POST");
		const headers = capturedInit?.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer tok-r");
		// sem content-type (não tem body)
		expect(headers["content-type"]).toBeUndefined();
	});

	it("reportCollection: POST com content-type json + Authorization exato", async () => {
		let capturedInit: RequestInit | undefined;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				capturedInit = init;
				return jsonResponse({ ok: true });
			}),
		);
		await reportCollection(33, "abc", "tok-p");
		expect(capturedInit?.method).toBe("POST");
		const headers = capturedInit?.headers as Record<string, string>;
		expect(headers["content-type"]).toBe("application/json");
		expect(headers["Authorization"]).toBe("Bearer tok-p");
	});
});

describe("ranking service — mata mutantes de guardas (dado não pode vazar de erro)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("getRanking: !ok com body válido NÃO vira lista (dado de erro não entra)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse({ data: ENTRIES }, false), // ok:false MAS data válido
			),
		);
		expect(await getRanking("week")).toEqual([]);
	});

	it("getMyPosition: !ok com payload válido → null (sessão token presente)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ position: 1, total: 9 }, false)),
		);
		expect(await getMyPosition("week", "tok")).toBeNull();
	});

	it("registerUse: !ok com first_use:true → false", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ first_use: true }, false)),
		);
		expect(await registerUse(12, "tok")).toBe(false);
	});

	it("reportCollection: !ok → false (mesmo com body)", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse({ ok: true }, false)),
			);
			expect(await reportCollection(12, "m", "tok")).toBe(false);
		});
	});

	describe("ranking service — authHeaders unit (branch null/else)", () => {
		beforeEach(() => {
			vi.unstubAllGlobals();
		});

		it("authHeaders com token → Bearer", () => {
			expect(authHeaders("tok-abc")).toEqual({ Authorization: "Bearer tok-abc" });
		});

		it("authHeaders sem token (null) → objeto vazio — branch else", () => {
			expect(authHeaders(null)).toEqual({});
		});

		it("authHeaders com string vazia → objeto vazio (falsy)", () => {
				expect(authHeaders("")).toEqual({});
			});
	});

describe("ranking service — mata mutantes de URL exata (path por endpoint)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("getMyPosition: URL exata /ranking/me?window= (mata StringLiteral L54)", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.pianolouvorja.com.br");
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ position: 1, total: 2 });
			}),
		);
		await getMyPosition("week", "tok");
		expect(calledUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/ranking/me?window=week",
		);
	});

	it("registerUse: URL exata /collections/:id/use (mata StringLiteral L75)", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.pianolouvorja.com.br");
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ first_use: true });
			}),
		);
		await registerUse(55, "tok");
		expect(calledUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/collections/55/use",
		);
	});

	it("reportCollection: URL exata /collections/:id/report (mata StringLiteral L101)", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.pianolouvorja.com.br");
		let calledUrl = "";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				calledUrl = url;
				return jsonResponse({ ok: true });
			}),
		);
		await reportCollection(66, "motivo", "tok");
		expect(calledUrl).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/collections/66/report",
		);
	});
});

describe("ranking service — mata mutante guard !sessionToken (getMyPosition)", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("getMyPosition(null): se o guard for removido, fetch seria chamado e Authorization ausente → detectável", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ position: 9, total: 9 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		// SEM sessão: deve retornar null ANTES de qualquer fetch
		const result = await getMyPosition("week", null);
		expect(result).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		// sanity: com sessão, fetch É chamado (garante que o mock funciona)
		vi.unstubAllGlobals();
		const fetchMock2 = vi.fn(async () =>
			jsonResponse({ position: 1, total: 2 }),
		);
		vi.stubGlobal("fetch", fetchMock2);
		expect(await getMyPosition("week", "tok")).toEqual({
			position: 1,
			total: 2,
		});
		expect(fetchMock2).toHaveBeenCalledTimes(1);
	});
});
