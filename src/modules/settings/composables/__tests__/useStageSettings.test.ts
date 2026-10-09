// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useStageSettings — fachada sobre a store de palco (storeToRefs).
 * Store REAL (já 100% coberta pelo próprio teste); só os serviços de
 * persistência são mockados, seguindo o padrão de
 * stores/__tests__/use-stage-settings-store.test.ts.
 */
vi.mock("../../services/stage-settings-preferences", () => ({
  loadStageSettingsOptional: vi.fn(),
  saveStageSettings: vi.fn(),
  clearStageSettings: vi.fn(),
  resolveStageSettings: vi.fn(),
}));

vi.mock("../../services/stage-settings-runtime", () => ({
  notifyStageSettingsChanged: vi.fn(),
}));

vi.mock("../../types/stage-settings", () => ({
  DEFAULT_STAGE_SETTINGS: {
    backgroundColor: "#0A0E1A",
    backgroundImage: null,
    fontSize: 16,
  },
  STAGE_MODULE_SCOPES: ["lyrics", "bible"],
}));

import { useStageSettings } from "../useStageSettings";
import { useStageSettingsStore } from "../../stores/useStageSettingsStore";
import { loadStageSettingsOptional } from "../../services/stage-settings-preferences";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(loadStageSettingsOptional).mockReturnValue(null);
});

describe("useStageSettings — fachada da Personalização do Palco", () => {
  it("expõe settings/activeScope/isInheritingGlobal como refs da store", () => {
    const facade = useStageSettings();
    const store = useStageSettingsStore();

    expect(facade.settings.value).toEqual({
      backgroundColor: "#0A0E1A",
      backgroundImage: null,
      fontSize: 16,
    });
    expect(facade.activeScope.value).toBe("global");
    // no escopo global não existe "herança" (ela é sobre módulos sem override)
    expect(store.isInheritingGlobal).toBe(false);
    expect(facade.isInheritingGlobal.value).toBe(false);
  });

  it("escopo de módulo sem override herda o global; patch cria override", () => {
    const facade = useStageSettings();

    facade.setActiveScope("lyrics");
    const store = useStageSettingsStore();
    expect(store.isInheritingGlobal).toBe(true);
    expect(facade.isInheritingGlobal.value).toBe(true);
    // settings efetivas = global (herdadas)
    expect(facade.settings.value.fontSize).toBe(16);

    facade.patch({ fontSize: 42 });
    expect(store.settings.fontSize).toBe(42);
    expect(store.isInheritingGlobal).toBe(false);
  });

  it("setActiveScope e patch delegam para a store", () => {
    const facade = useStageSettings();
    const store = useStageSettingsStore();

    facade.setActiveScope("lyrics");
    expect(store.activeScope).toBe("lyrics");

    facade.patch({ fontSize: 42 });
    expect(store.settings.fontSize).toBe(42);
  });

  it("setBackgroundImage persiste via store.patch", () => {
    const facade = useStageSettings();

    facade.setBackgroundImage("img://fundo");

    const store = useStageSettingsStore();
    expect(store.settings.backgroundImage).toBe("img://fundo");
  });

  it("resetScope remove o override do escopo ativo", () => {
    const facade = useStageSettings();
    facade.setActiveScope("lyrics");
    facade.patch({ fontSize: 33 });
    expect(
      useStageSettingsStore().isInheritingGlobal,
    ).toBe(false);

    facade.resetScope();

    expect(useStageSettingsStore().isInheritingGlobal).toBe(true);
  });

  it("effective(scope) devolve as settings efetivas do escopo", () => {
    const facade = useStageSettings();

    const effective = facade.effective("bible");

    expect(effective.backgroundColor).toBe("#0A0E1A");
    expect(effective.fontSize).toBe(16);
  });
});
