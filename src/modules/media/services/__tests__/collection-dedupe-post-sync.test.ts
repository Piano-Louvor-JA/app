import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Review R1 (SPEC v1.2.0 RF-07): pós-sync, coletânea local pendente não pode
 * aparecer duplicada — se existe remota do usuário com o mesmo nome, a cópia
 * local é oculta da listagem.
 */
const mocks = vi.hoisted(() => ({
  session: null as null | { token: string; user: { email: string } },
  fetchMock: vi.fn(),
}));

vi.mock("@modules/media/services/auth-client", () => ({
  getAuthSession: () => mocks.session,
  authHeaders: () => (mocks.session ? { authorization: "Bearer t" } : {}),
}));

vi.mock("@modules/media/services/outbox", () => ({
  enqueue: vi.fn(),
  newClientUuid: () => "u1",
}));
vi.mock("@modules/media/services/media-catalog", () => ({
  loadMediaTrack: vi.fn(),
}));
vi.mock("@modules/media/services/media-audio", () => ({
  resolveRemoteFileUrl: vi.fn((p: string) => p),
}));

import { listCustomCollections } from "@modules/media/services/custom-catalog";
import { createLocalCollection } from "@modules/media/services/local-custom-store";

describe("R1: dedupe local↔remota por nome pós-sync", () => {
  beforeEach(() => {
    localStorage.removeItem("louvorja.local-custom.v1");
    mocks.session = { token: "t", user: { email: "r@test.local" } };
    vi.unstubAllGlobals();
  });

  it("local 'Velha' oculta quando remota do usuário tem o mesmo nome", async () => {
    createLocalCollection("Velha", null);
    mocks.fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            id_collection: 12,
            name: "Velha",
            description: null,
            owner_id: 47,
            musics_count: 3,
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", mocks.fetchMock);

    const all = await listCustomCollections();
    const velhas = all.filter((c) => c.name.toLowerCase() === "velha");
    expect(velhas).toHaveLength(1);
    expect(velhas[0]!.id).toBe(12); // a remota
  });

  it("deslogado: local NÃO é ocultada (dedupe só com sessão)", async () => {
    localStorage.removeItem("louvorja.local-custom.v1");
    createLocalCollection("Velha", null);
    mocks.session = null;
    mocks.fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id_collection: 12, name: "Velha", owner_id: 47 }],
      }),
    }));
    vi.stubGlobal("fetch", mocks.fetchMock);

    const all = await listCustomCollections();
    expect(all.filter((c) => c.name === "Velha").length).toBe(2);
  });
});
