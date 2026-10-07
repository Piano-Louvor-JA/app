// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * remote-catalog — fetch com retry 429/5xx e cascata api-fallback.
 */

const mocks = vi.hoisted(() => {
	const state = {
		dbUrl: "http://db.local",
		token: "tok" as string | undefined,
		fetch: vi.fn(),
		fallback: vi.fn(async () => ({ data: { via: "fallback" } })),
	};
	return { state };
});

vi.mock("@shared/services/workspace-api", () => ({
	resolveDatabaseUrl: vi.fn((path: string) => `${mocks.state.dbUrl}${path}`),
}));

vi.mock("@shared/services/api-fallback", () => ({
	fetchWithApiFallback: vi.fn((...args: [string, string, object]) =>
		mocks.state.fallback(...args),
	),
}));

import { fetchRemoteCatalogJson } from "../remote-catalog";

function mockFetchResponse(status: number, body: unknown = { ok: true }) {
	return {
		status,
		ok: status >= 200 && status < 300,
		json: async () => body,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.fallback.mockResolvedValue({ data: { via: "fallback" } });
	vi.stubGlobal("fetch", mocks.state.fetch);
	vi.stubEnv("VITE_API_TOKEN", "tok");
	vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("fetchRemoteCatalogJson", () => {
	it("sucesso direto com token no header", async () => {
		vi.stubEnv("VITE_API_TOKEN", "tok");
		mocks.state.fetch.mockResolvedValue(mockFetchResponse(200, { items: [1] }));
		const data = await fetchRemoteCatalogJson<{ items: number[] }>("catalog");
		expect(data).toEqual({ items: [1] });
		const [, init] = mocks.state.fetch.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["Api-Token"]).toBe("tok");
	});

	it("sem token → header ausente", async () => {
		vi.stubEnv("VITE_API_TOKEN", "");
		mocks.state.fetch.mockResolvedValue(mockFetchResponse(200, {}));
		await fetchRemoteCatalogJson("catalog");
		const [, init] = mocks.state.fetch.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toBeUndefined();
	});

	it("429 → retry com backoff e depois sucesso", async () => {
		vi.stubEnv("VITE_API_TOKEN", "");
		mocks.state.fetch
			.mockResolvedValueOnce(mockFetchResponse(429))
			.mockResolvedValueOnce(mockFetchResponse(200, { retry: true }));
		const data = await fetchRemoteCatalogJson("catalog", 5, 10);
		expect(data).toEqual({ retry: true });
		expect(mocks.state.fetch).toHaveBeenCalledTimes(2);
	});

	it("500 com retries → tenta de novo; esgotado → fallback (catch engloba throw)", async () => {
		mocks.state.fetch.mockResolvedValue(mockFetchResponse(503));
		const data = await fetchRemoteCatalogJson("catalog", 1, 5);
		expect(data).toEqual({ via: "fallback" });
		expect(mocks.state.fetch).toHaveBeenCalledTimes(2);
	});

	it("404 sem retry → erro imediato e vai pro fallback", async () => {
		mocks.state.fetch.mockResolvedValue(mockFetchResponse(404));
		const data = await fetchRemoteCatalogJson("catalog");
		expect(data).toEqual({ via: "fallback" });
		expect(mocks.state.fallback).toHaveBeenCalledWith(
			"database",
			"catalog",
			expect.objectContaining({ retries: 5 }),
		);
	});

	it("network error com retries → retry; esgotado → fallback", async () => {
		mocks.state.fetch.mockRejectedValue(new Error("Failed to fetch"));
		const data = await fetchRemoteCatalogJson("catalog", 1, 5);
		expect(data).toEqual({ via: "fallback" });
		// 1 original + 1 retry
		expect(mocks.state.fetch).toHaveBeenCalledTimes(2);
	});

	it("erro não-retratável no json() → fallback direto", async () => {
		mocks.state.fetch.mockResolvedValue({
			status: 200,
			ok: true,
			json: async () => {
				throw new Error("bad json");
			},
		});
		const data = await fetchRemoteCatalogJson("catalog");
		expect(data).toEqual({ via: "fallback" });
	});
	it("NetworkError (Safari) também é retriable", async () => {
		mocks.state.fetch.mockRejectedValueOnce(new Error("NetworkError when attempting to fetch resource."));
		mocks.state.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
		const data = await fetchRemoteCatalogJson("catalog", 1, 5);
		expect(data).toEqual({ ok: 1 });
		expect(mocks.state.fetch).toHaveBeenCalledTimes(2);
	});

  it("erro não-Error (string) cai no String(error) e não retenta", async () => {
    mocks.state.fetch.mockRejectedValueOnce("boom string");
    const res = await fetchRemoteCatalogJson("catalog", 1, 5);
    expect(res).toEqual({ via: "fallback" });
  });

});