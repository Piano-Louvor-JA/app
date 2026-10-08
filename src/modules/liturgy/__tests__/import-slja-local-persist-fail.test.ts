// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
// eslint-disable-next-line import/order
import { buildSlja, type SljaArchive } from "@shared/services/slja";

const { createLocalLyricMock } = vi.hoisted(() => ({
  createLocalLyricMock: vi.fn(),
}));

vi.mock("@modules/media/services/auth-client", () => ({
  getAuthSession: vi.fn(() => null),
}));

vi.mock("@modules/media/services/local-custom-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modules/media/services/local-custom-store")>();
  return { ...actual, createLocalLyric: createLocalLyricMock };
});

import { importSljaAsLiturgyMusic } from "../services/import-slja-to-liturgy";

async function makeBuffer(): Promise<ArrayBuffer> {
  const archive: SljaArchive = {
    title: "Persist Fail",
    audio: { name: "a.mp3", bytes: new Uint8Array([1, 2]) },
    assets: [],
    slides: [{ lyric: "Verso", type: "LETRA", timeMs: 0, order: 1 }],
  };
  return buildSlja(archive);
}

describe("import .slja deslogado — persistência da lyric falha", () => {
  beforeEach(() => {
    localStorage.clear();
    createLocalLyricMock.mockReset();
  });

  it("lyric que não persiste → SLJA_LOCAL_LYRIC_PERSIST_FAILED", async () => {
    createLocalLyricMock.mockReturnValue({ id: -9999, lyric: "Verso" });

    await expect(
      importSljaAsLiturgyMusic({ bytes: await makeBuffer(), name: "persistfail.slja" }),
    ).rejects.toThrow("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
  });

  it("erro local-persist-failed → SLJA_LOCAL_LYRIC_PERSIST_FAILED", async () => {
    createLocalLyricMock.mockImplementation(() => {
      throw new Error("local-persist-failed");
    });

    await expect(
      importSljaAsLiturgyMusic({ bytes: await makeBuffer(), name: "persistfail.slja" }),
    ).rejects.toThrow("SLJA_LOCAL_LYRIC_PERSIST_FAILED");
  });
});
