// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const zipState = vi.hoisted(() => ({ boom: null as Error | null }));
vi.mock("fflate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fflate")>();
  return {
    ...actual,
    zip: vi.fn((data: unknown, cb: (err: Error | null, data?: unknown) => void) => {
      if (zipState.boom) {
        cb(zipState.boom, undefined as never);
        return;
      }
      return actual.zip(data as never, cb as never);
    }),
  };
});

import type { SljaArchive, SljaSlide } from "../slja";
import { buildSlja } from "../slja";

function makeSlide(): SljaSlide {
  return { lyric: "l1", type: "LETRA", timeMs: 0 };
}

describe("buildSlja — zip falho (105)", () => {
  it("rejeita quando o callback do zip recebe erro", async () => {
    zipState.boom = new Error("zip boom");
    const archive: SljaArchive = {
      title: "T",
      version: "2.1",
      audio: null,
      slides: [makeSlide()],
    };
    await expect(buildSlja(archive)).rejects.toThrow("zip boom");
    zipState.boom = null;
  });

  it("sem erro: resolve normal", async () => {
    const archive: SljaArchive = {
      title: "T",
      version: "2.1",
      audio: null,
      slides: [makeSlide()],
    };
    const buf = await buildSlja(archive);
    expect(buf).toBeInstanceOf(ArrayBuffer);
  });
});
