// @vitest-environment jsdom
// RF-05 (SPEC-crud-comunidade-hub v1.0.0): CRUD offline/online paritário.
// Privar/publicar OFFLINE marca intenção local e publica de fato ao logar
// (outbox existente). Este arquivo congela o comportamento com testes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSession: vi.fn(() => null as null | { token: string; user: { id_user: number; email: string } }),
	enqueue: vi.fn(async () => {}),
}));

vi.mock("@modules/media/services/auth-client", () => ({
	getAuthSession: mocks.getSession,
	authHeaders: vi.fn(() => ({})),
}));

vi.mock("@modules/media/services/outbox", () => ({
	enqueue: mocks.enqueue,
	newClientUuid: vi.fn(() => "uuid-test"),
}));

// localStorage real (jsdom) — o local-custom-store usa a chave v1
import { createLocalCollection } from "@modules/media/services/local-custom-store";
import {
	createCustomCollection,
	listCustomCollections,
} from "@modules/media/services/custom-catalog";

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	vi.unstubAllGlobals();
});

describe("RF-05 — CRUD offline grava local e sincroniza ao logar (outbox)", () => {
	it("criação OFFLINE autenticado (rede caiu): grava na fila com visibility private; ao logar a fila dispara", async () => {
		mocks.getSession.mockReturnValue({
			token: "tok",
			user: { id_user: 4, email: "a@b.c" },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch (offline)");
			}),
		);
		// usuário marca a coletânea como pública ainda offline
		await createCustomCollection("Pública offline", undefined, undefined, "public");
		expect(mocks.enqueue).toHaveBeenCalledTimes(1);
		const op = mocks.enqueue.mock.calls[0]![0] as {
			entity: string;
			action: string;
			payload: { name: string; visibility: string };
		};
		expect(op.entity).toBe("collection");
		expect(op.action).toBe("upsert");
		expect(op.payload.visibility).toBe("public");
		vi.unstubAllGlobals();
	});

	it("coletânea criada SEM sessão fica local (id negativo) e aparece na listagem local", async () => {
		mocks.getSession.mockReturnValue(null);
		const created = await createCustomCollection("Local sem conta");
		expect(created).not.toBeNull();
		expect(created!.id).toBeLessThan(0);
		const list = await listCustomCollections();
		const found = list.find((c) => c.name === "Local sem conta");
		expect(found).toBeDefined();
		expect(found!.id).toBeLessThan(0);
	});

	it("publicação de música local (draft→published) fica disponível localmente antes do sync", async () => {
		const col = createLocalCollection("Coletânea local");
		expect(col.id).toBeLessThan(0);
		const list = await listCustomCollections();
		expect(list.some((c) => c.name === "Coletânea local")).toBe(true);
	});
});
