// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	getNotifications,
	markAllRead,
} from "../notifications";

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 500,
		json: async () => body,
	} as unknown as Response;
}

const SESSION = {
	token: "tok",
	user: { id_user: 1, email: "t@t.local", displayName: "T" },
};

function login() {
	localStorage.setItem("louvorja.custom.auth", JSON.stringify(SESSION));
}

function logout() {
	localStorage.removeItem("louvorja.custom.auth");
}

// Mata mutantes de URL/headers: qualquer mutação em communityBaseUrl(),
// no path (`/notifications`, `/read-all`) ou no header Authorization
// quebra a chamada esperada e o teste falha.
describe("notifications service (F6 app) — contrato de rede", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		login();
	});

	it("getNotifications: GET {base}/v1/custom/notifications com Authorization", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.pianolouvorja.com.br");
		const NOTIFS = [
			{
				id: 1,
				type: "music_promoted",
				title: "Promovida!",
				body: "Sua música foi promovida",
				created_at: "2026-09-16 12:00:00",
			},
		];
		const fetchMock = vi.fn(async () => jsonResponse({ data: NOTIFS }));
		vi.stubGlobal("fetch", fetchMock);

		expect(await getNotifications()).toEqual(NOTIFS);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toMatch(/^https:\/\/api\.pianolouvorja\.com\.br\/v1\/custom\/notifications$/);
		expect(init?.method ?? "GET").toBe("GET");
		expect((init?.headers as Record<string, string>).Authorization).toBe(
			"Bearer tok",
		);
	});

	it("getNotifications: VITE_PALCO_API_URL sobrescreve a base (trailing / removido)", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.test.local/");
		const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await getNotifications();

		const [url] = fetchMock.mock.calls[0] as unknown as [string];
		expect(url).toBe("https://api.test.local/v1/custom/notifications");
	});

	it("getNotifications: sem env → usa base default", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", undefined as unknown as string);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ data: [] })),
		);
		await getNotifications();
		const [url] = (vi.mocked(fetch).mock.calls[0] ?? []) as unknown as [
			string,
		];
		expect(url).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/notifications",
		);
	});

	it("getNotifications: json.data não-array → []", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.test.local");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse({ data: { bad: true } })),
		);
		expect(await getNotifications()).toEqual([]);
	});

	it("getNotifications: resposta !ok → [] mesmo com data no body (não parseia)", async () => {
		// Mata mutante if(!response.ok)→if(false): body de erro com data[] NÃO pode vazar
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				jsonResponse({ data: [{ id: 666, type: "x", title: "erro", body: "b", created_at: "" }] }, false),
			),
		);
		expect(await getNotifications()).toEqual([]);
	});

	it("getNotifications: JSON inválido → [] (sem lançar)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				({
					ok: true,
					status: 200,
					json: async () => {
						throw new Error("bad json");
					},
				}) as unknown as Response,
			),
		);
		expect(await getNotifications()).toEqual([]);
	});

	it("markAllRead: POST {base}/v1/custom/notifications/read-all com Authorization", async () => {
		vi.stubEnv("VITE_PALCO_API_URL", "https://api.pianolouvorja.com.br");
		const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);

		await markAllRead();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(
			"https://api.pianolouvorja.com.br/v1/custom/notifications/read-all",
		);
		expect(init?.method).toBe("POST");
		expect((init?.headers as Record<string, string>).Authorization).toBe(
			"Bearer tok",
		);
	});

	it("sem sessão: nenhuma chamada de rede nos dois services", async () => {
		logout();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		expect(await getNotifications()).toEqual([]);
		await markAllRead();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
