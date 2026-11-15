import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPEC-audio-removal v1.2.0 (RF-07): coletânea criada AUTENTICADO com API
 * indisponível = local-first real (id negativo) + fila no outbox. Nunca id 0.
 * Excluir/renomear da coletânea pendente funcionam localmente.
 */

const mocks = vi.hoisted(() => {
  return {
    session: null as null | { token: string; user: { email: string } },
    enqueued: [] as Array<Record<string, unknown>>,
    fetchMock: vi.fn(),
  };
});

vi.mock("@modules/media/services/auth-client", () => ({
  getAuthSession: () => mocks.session,
  authHeaders: () =>
    mocks.session ? { authorization: `Bearer ${mocks.session.token}` } : {},
  authBaseUrl: () => "http://api.test",
  authRequestHeaders: (h?: HeadersInit) => new Headers(h),
}));

vi.mock("@modules/media/services/outbox", () => ({
  enqueue: vi.fn(async (item: Record<string, unknown>) => {
    mocks.enqueued.push(item);
  }),
  newClientUuid: () => "uuid-test-1",
}));

vi.mock("@modules/media/services/media-catalog", () => ({
  loadMediaTrack: vi.fn(),
}));
vi.mock("@modules/media/services/media-audio", () => ({
  resolveRemoteFileUrl: vi.fn((p: string) => p),
}));

import { createCustomCollection } from "@modules/media/services/custom-catalog";
import {
  deleteLocalCollection,
  listLocalCollections,
  updateLocalCollection,
} from "@modules/media/services/local-custom-store";

describe("RF-07: coletânea enfileirada offline é local-first real", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.session = { token: "tok", user: { email: "r@test.local" } };
    mocks.enqueued = [];
    mocks.fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", mocks.fetchMock);
    // limpa store local (mesma chave do import de testes existentes)
    localStorage.removeItem("louvorja-custom-local-v1");
  });

  it("cria com API fora: id NEGATIVO, outbox tem item, excluir e renomear funcionam", async () => {
    const created = await createCustomCollection("Minha coletânea", undefined, undefined, "private");
    expect(created).not.toBeNull();
    const id = created!.id;
    expect(id).toBeLessThan(0); // nunca mais id 0
    expect(mocks.enqueued).toHaveLength(1);

    // renomear offline funciona
    expect(updateLocalCollection(id, { name: "Novo nome" })).toBe(true);
    const renamed = listLocalCollections().find((c) => c.id === id);
    expect(renamed?.name).toBe("Novo nome");

    // excluir offline funciona
    expect(deleteLocalCollection(id)).toBe(true);
    expect(listLocalCollections().some((c) => c.id === id)).toBe(false);
  });
});
