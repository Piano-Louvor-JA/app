/**
 * RF-04: editor/central listam APENAS coletâneas do próprio usuário.
 * Coletâneas remotas de outros owners (ex.: Luis) não podem vazar
 * no editor de letras — descoberta é papel exclusivo da Comunidade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { getAuthSession } = await import("../auth-client");
vi.mock("../auth-client", async (orig) => {
	const actual = await orig<typeof import("../auth-client")>();
	return {
		...actual,
		getAuthSession: vi.fn(),
		authHeadersAsync: async () => ({}),
	};
});

const { listCustomCollections } = await import("../custom-catalog");

const SESSION = { token: "tk", user: { id_user: 7, email: "me@test.com" } };

function apiRows() {
	return {
		data: [
			{ id_collection: 101, name: "Minha Coletânea", description: null, owner_id: 7, author_name: "me@test.com", musics_count: 3 },
			{ id_collection: 202, name: "Do Luis", description: null, owner_id: 42, author_name: "luis@test.com", musics_count: 5 },
			{ id_collection: 203, name: "Sem owner", description: null, owner_id: null, author_name: null, musics_count: 1 },
		],
	};
}

describe("listCustomCollections — só minhas remotas (RF-04)", () => {
	beforeEach(() => {
		vi.mocked(getAuthSession).mockReturnValue(SESSION as never);
	});
	afterEach(() => {
		fetchMock.mockReset();
	});

	it("exclui coletâneas de outros usuários e sem owner", async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: async () => apiRows(),
		});
		const list = await listCustomCollections();
		const ids = list.map((c) => c.id);
		expect(ids).toContain(101);
		expect(ids).not.toContain(202);
		expect(ids).not.toContain(203);
	});

	it("fallback por email quando id_user ausente", async () => {
		vi.mocked(getAuthSession).mockReturnValue({ token: "tk", user: { email: "me@test.com" } } as never);
		fetchMock.mockResolvedValueOnce({ ok: true, json: async () => apiRows() });
		const list = await listCustomCollections();
		expect(list.map((c) => c.id)).toEqual([101]);
	});
});
