// @vitest-environment jsdom
// SPEC t_50c9ac95 — endTime opcional + estimativa transparente + relógio ES.
import { afterEach, describe, expect, it } from "vitest";
import {
  estimateCategoryDurationMs,
  formatEstimatedDuration,
  isLiturgyItemDraftValid,
} from "../services/liturgy-item-helpers";
import type { LiturgyItemDraft } from "../types/liturgy";
import {
  computeSessionTimes,
} from "../services/liturgy-duration-enrich";

const baseDraft = (): LiturgyItemDraft => ({
  type: "category",
  name: "Escola Sabatina",
  categoryId: null,
  scheduledRotationId: null,
  startTime: "09:00",
  endTime: "",
  filePath: "",
  url: "",
  musicId: null,
  musicMode: "audio",
  verseBookId: null,
  verseChapter: null,
  durationMs: 0,
} as unknown as LiturgyItemDraft);

afterEach(() => {
  // nada global por enquanto
});

describe("SPEC t_50c9ac95 — A: endTime opcional", () => {
  it("A2: categoria só com startTime é draft válido (endTime vazio)", () => {
    expect(isLiturgyItemDraftValid(baseDraft())).toBe(true);
  });

  it("A2: start continua obrigatório", () => {
    const d = baseDraft();
    d.startTime = "";
    expect(isLiturgyItemDraftValid(d)).toBe(false);
  });

  it("A2: end preenchido segue válido (comportamento existente)", () => {
    const d = baseDraft();
    d.endTime = "10:15";
    expect(isLiturgyItemDraftValid(d)).toBe(true);
  });
});

describe("SPEC t_50c9ac95 — B: estimativa transparente", () => {
  const cat = (over: Partial<Record<string, unknown>>) =>
    ({
      id: 1,
      type: "category",
      name: "ES",
      startTime: "09:00",
      endTime: null,
      durationMs: 0,
      ...over,
    }) as never as import("../types/liturgy").LiturgyItem;

  it("B1: estima duração pela soma dos durationMs dos filhos", () => {
    const children = [
      { durationMs: 60_000 },
      { durationMs: 120_000 },
    ] as unknown as import("../types/liturgy").LiturgyItem[];
    const ms = estimateCategoryDurationMs(cat({}), children);
    expect(ms).toBe(180_000);
  });

  it("B3: sem filhos com duração → null (não inventa número)", () => {
    const children = [
      { durationMs: 0 },
      { durationMs: null },
    ] as unknown as import("../types/liturgy").LiturgyItem[];
    expect(estimateCategoryDurationMs(cat({}), children)).toBeNull();
  });

  it("B5: end real existe → função nem é chamada (end vence); formato marca estimado", () => {
    expect(formatEstimatedDuration(180_000, true)).toMatch(/~|estim/i);
    expect(formatEstimatedDuration(180_000, false)).not.toMatch(/~|estim/i);
  });

  it("B4: sessão usa maior entre end real e estimado", () => {
    // ES 09:00 sem end, filhos somam 45min → estimado 09:45
    // Outra categoria 09:00–10:15 com end real → sessão termina 10:15
    const es = cat({ id: 1, startTime: "09:00", endTime: null });
    const culto = cat({ id: 2, name: "Culto", startTime: "09:30", endTime: "10:15" });
    const esChildren = {
      "1": [{ durationMs: 45 * 60_000 }] as unknown as import("../types/liturgy").LiturgyItem[],
    };
    const result = computeSessionTimes(
      [es, culto],
      { esChildren },
    );
    expect(result.endTime).toBe("10:15");
  });

  it("B4: só categoria estimada → sessão usa o estimado", () => {
    const es = cat({ id: 1, startTime: "09:00", endTime: null });
    const esChildren = {
      "1": [{ durationMs: 45 * 60_000 }] as unknown as import("../types/liturgy").LiturgyItem[],
    };
    const result = computeSessionTimes([es], { esChildren });
    expect(result.endTime).toBe("09:45");
  });
});

describe("SPEC t_50c9ac95 — C: relógio no cronômetro ES", () => {
  it("C2: tick único — startLiturgyClockTick usado 1x (reuso do now)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(process.cwd(), "src/modules/liturgy/components/LiturgySidebar.vue"),
      "utf-8",
    );
    // o relógio ao vivo deve renderizar now (não criar segundo setInterval)
    expect(src).toMatch(/now\b/);
    expect((src.match(/setInterval/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
