// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Complemento api-fallback — fetchWithApiFallback completo: sucesso na
 * primária, cascata por host, 429 retry na mesma base, 5xx migrando,
 * network error, token no header e exaustão.
 */
import { apiCandidateBases, fetchWithApiFallback } from "../api-fallback";

function setEnv(key: string, value: string | undefined) {
	const env = import.meta.env as unknown as Record<string, string | undefined>;
	if (value === undefined) {
		delete env[key];
	} else {
		env[key] = value;
	}
}

const fetchMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);
	vi.useFakeTimers({ shouldAdvanceTime: true });
	setEnv("VITE_URL_DATABASE", "https://primaria.teste/json_db");
	setEnv("VITE_URL_FILES", "https://primaria.teste/file");
	setEnv("VITE_API_FALLBACK_URLS", "https://fb1.teste,https://fb2.teste");
	setEnv("VITE_API_TOKEN", undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function response(status: number, body: unknown = { ok: true }) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

describe("fetchWithApiFallback — cascata", () => {
	it("primária ok -> nem tenta fallback", async () => {
		fetchMock.mockResolvedValue(response(200, { v: 1 }));
		const { data, base } = await fetchWithApiFallback("database", "arquivo");
		expect(data).toEqual({ v: 1 });
		expect(base).toContain("primaria.teste");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("primária 500 esgotada -> migra pro fallback (93/105)", async () => {
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes("primaria")) return response(500);
			return response(200, { via: "fb1" });
		});
		const { data, base } = await fetchWithApiFallback("database", "arquivo", {
			retries: 1,
			delayMs: 1,
		});
		expect(data).toEqual({ via: "fb1" });
		expect(base).toContain("fb1");
	});

	it("429 retry na mesma base antes de migrar (116-122)", async () => {
		let calls = 0;
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes("primaria")) {
				calls += 1;
				if (calls < 3) return response(429);
				return response(200, { depois: "rate" });
			}
			return response(200, { via: "fb" });
		});
		const { data } = await fetchWithApiFallback("database", "x", {
			retries: 5,
			delayMs: 1,
		});
		expect(data).toEqual({ depois: "rate" });
		expect(calls).toBe(3);
	});

	it("429 esgotado -> migra pro fallback", async () => {
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes("primaria")) return response(429);
			return response(200, { via: "fb-rate" });
		});
		const { data } = await fetchWithApiFallback("database", "x", {
			retries: 1,
			delayMs: 1,
		});
		expect(data).toEqual({ via: "fb-rate" });
	});

	it("network error com retries -> tenta de novo na mesma base (125-127)", async () => {
		let calls = 0;
		fetchMock.mockImplementation(async (url: string) => {
			if (url.includes("primaria")) {
				calls += 1;
				if (calls < 2) throw new TypeError("Failed to fetch");
				return response(200, { recovered: true });
			}
			return response(200, {});
		});
		const { data } = await fetchWithApiFallback("database", "x", {
			retries: 3,
			delayMs: 1,
		});
		expect(data).toEqual({ recovered: true });
	});

	it("todos os hosts falham -> throw do último erro (api-exhausted)", async () => {
		fetchMock.mockResolvedValue(response(500));
		await expect(
			fetchWithApiFallback("database", "x", { retries: 0, delayMs: 1 }),
		).rejects.toThrow();
	});

	it("token presente -> header Api-Token (133-136)", async () => {
		setEnv("VITE_API_TOKEN", "segredo");
		fetchMock.mockResolvedValue(response(200, {}));
		await fetchWithApiFallback("database", "x");
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["Api-Token"]).toBe(
			"segredo",
		);
	});

	it("files kind usa /file e fallbacks próprios (90)", async () => {
		setEnv("VITE_URL_FILES", undefined);
		fetchMock.mockResolvedValue(response(200, { f: true }));
		const { data } = await fetchWithApiFallback("files", "img.png");
		expect(data).toEqual({ f: true });
		const [url] = fetchMock.mock.calls[0] as [string];
		expect(url).toContain("/file");
	});
});

describe("apiCandidateBases — ramos residuais (53)", () => {
	it("base primária inválida (não-URL) -> host cai no próprio texto", () => {
		setEnv("VITE_URL_DATABASE", "nao-e-url");
		const bases = apiCandidateBases("database");
		expect(bases[0]).toBe("nao-e-url");
	});
});
