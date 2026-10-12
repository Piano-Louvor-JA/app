// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { getUserPreferenceMock, setUserPreferenceMock } = vi.hoisted(() => ({
  getUserPreferenceMock: vi.fn(),
  setUserPreferenceMock: vi.fn(),
}));

vi.mock("@shared/services/user-preferences", () => ({
  getUserPreference: getUserPreferenceMock,
  setUserPreference: setUserPreferenceMock,
}));

const MUSIC_LIST = [
  {
    id: 2000,
    name: "Mãos",
    displayLabel: "Mãos",
    albumNames: "Hinário",
    durationMs: 264_000,
    hasInstrumental: false,
  },
] as never[];

vi.mock("@modules/liturgy/services/liturgy-catalog", () => ({
  loadLiturgyMusicOptions: vi.fn(async () => MUSIC_LIST),
  loadLiturgyBibleBooks: vi.fn(async () => []),
}));

import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";
import {
  SYNC_MODIFIED_PREFIX,
  importLouvorjaIntoBrowser,
} from "@modules/sync/services/louvorja-adapter";
import { useLiturgyStore } from "@modules/liturgy/stores/useLiturgyStore";
import { normalizeLiturgyState } from "@modules/liturgy/services/liturgy-preferences";

function sabadoPackage() {
  return {
    schema: 1,
    appVersion: "test",
    platform: "desktop",
    exportedAt: "2099-01-01T00:00:00.000Z",
    entities: {
      liturgy: {
        type: "liturgy",
        modified: "2099-01-01T00:00:00.000Z",
        data: {
          saturday: {
            items: [
              {
                id: "cat-a",
                type: "category",
                name: "Escola Sabatina",
                subtitle: "",
                done: false,
                durationMs: 0,
                accentColor: "#FFD600",
                startTime: "09:00",
                endTime: "10:15",
              },
              {
                id: "m-1",
                type: "music",
                name: "Missão",
                subtitle: "",
                done: false,
                durationMs: 0,
                accentColor: "#00E676",
                categoryId: "cat-a",
                musicId: 2000,
                musicMode: "audio",
              },
              {
                id: "cat-b",
                type: "category",
                name: "Culto Divino",
                subtitle: "",
                done: false,
                durationMs: 0,
                accentColor: "#FFD600",
                startTime: "10:30",
                endTime: "12:00",
              },
            ],
            notes: "",
          },
        },
      },
    },
  } as unknown as Parameters<typeof importLouvorjaIntoBrowser>[0];
}

let stored: unknown;

describe("import .louvorja: enriquecimentos pós-import (t_14d066ea + t_b1a9deae)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.setItem(`${SYNC_MODIFIED_PREFIX}.liturgy`, "2000-01-01T00:00:00.000Z");
    stored = normalizeLiturgyState(null);
    stored.weekdays.saturday = [];
    getUserPreferenceMock.mockImplementation((key: string) =>
      key === USER_PREFERENCE_KEYS.liturgyState ? stored : null,
    );
    setUserPreferenceMock.mockImplementation((_key: string, value: unknown) => {
      // structuredClone do adapter falha em Proxy Vue — grava JSON puro.
      stored = JSON.parse(JSON.stringify(value));
    });
  });

  it("música com musicId do catálogo ganha durationMs da API (não 0)", async () => {
    // Store criado ANTES do import, como no app real (listener ativo).
    const store = useLiturgyStore();
    await store.hydrate();

    importLouvorjaIntoBrowser(sabadoPackage());
    window.dispatchEvent(new CustomEvent("liturgy:imported"));

    await vi.waitFor(() => {
      const item = store.weekdays.saturday.find((i) => i.type === "music");
      expect(item?.durationMs).toBe(264_000);
    });
  });

  it("resumo do evento do DIA importado pré-preenchido com 1ª/última categoria", async () => {
    const store = useLiturgyStore();
    await store.hydrate();

    importLouvorjaIntoBrowser(sabadoPackage());
    window.dispatchEvent(new CustomEvent("liturgy:imported"));

    await vi.waitFor(() => {
      expect(store.daySessionTimes.saturday.startTime).toBe("09:00");
      expect(store.daySessionTimes.saturday.endTime).toBe("12:00");
    });
    // Dias sem categorias horadas no pacote permanecem intocados.
    expect(store.daySessionTimes.tuesday.startTime).toBeNull();
  });

  it("sessão do dia já definida NÃO é sobrescrita pelo pré-preenchimento", async () => {
    stored = normalizeLiturgyState(null);
    stored.weekdays.saturday = [];
    stored.daySessionTimes.saturday = { startTime: "09:15", endTime: "11:45" };

    const store = useLiturgyStore();
    await store.hydrate();

    importLouvorjaIntoBrowser(sabadoPackage());
    window.dispatchEvent(new CustomEvent("liturgy:imported"));

    await vi.waitFor(() => {
      expect(store.weekdays.saturday.length).toBe(3);
    });
    expect(store.daySessionTimes.saturday.startTime).toBe("09:15");
    expect(store.daySessionTimes.saturday.endTime).toBe("11:45");
  });

  it("customLiturgies também enriquecem duração", async () => {
    stored = JSON.parse(JSON.stringify(normalizeLiturgyState(null)));
    stored.customLiturgies = [
      {
        id: "custom-1",
        name: "Culto avulso",
        items: [
          {
            id: "cx-1",
            type: "music",
            name: "Música avulsa",
            subtitle: "",
            done: false,
            durationMs: 0,
            accentColor: "#00E676",
            musicId: 2000,
            musicMode: "audio",
          },
        ] as never,
        notes: "",
        startTime: null,
        endTime: null,
      },
    ];

    const store = useLiturgyStore();
    await store.hydrate();

    importLouvorjaIntoBrowser(sabadoPackage());
    window.dispatchEvent(new CustomEvent("liturgy:imported"));

    await vi.waitFor(() => {
      const item = store.customLiturgies[0]?.items[0];
      expect(item?.durationMs).toBe(264_000);
    });
  });
});
