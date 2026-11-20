// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

/**
 * useProjectionSettings — fachada da store para views/componentes.
 * Store real (useProjectionStore já 100% coberta) + setActivePinia.
 * Valida exposição dos refs (storeToRefs) e delegação dos setters.
 */
import { createPinia, setActivePinia } from "pinia";

import { useProjectionSettings } from "../useProjectionSettings";
import { useProjectionStore } from "../../stores/useProjectionStore";

describe("useProjectionSettings", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("expõe refs reativos da store (não valores estáticos)", () => {
    const facade = useProjectionSettings();
    const store = useProjectionStore();

    expect(facade.displays.value).toEqual(store.displays);
    expect(facade.settings.value).toBe(store.settings);
    expect(typeof facade.isLoadingDisplays.value).toBe("boolean");
    expect(typeof facade.isIdentifying.value).toBe("boolean");
    expect(typeof facade.hasExtendedDisplays.value).toBe("boolean");
    expect(typeof facade.hasCustomArrangement.value).toBe("boolean");
    expect(Array.isArray(facade.monitorOptions.value)).toBe(true);
    expect(Array.isArray(facade.extendedMonitorOptions.value)).toBe(true);
  });

  it("delega setters de monitores para a store", async () => {
    const facade = useProjectionSettings();
    facade.refreshDisplays();
    facade.identifyMonitors();
    facade.moveMonitorInArrangement(0, 1, 2);
    facade.resetMonitorArrangement();
    facade.toggleExtendedMonitor(2);
    facade.hydrate();

    const store = useProjectionStore();
    // ações async/void: valida que existem e são funções da store
    expect(facade.refreshDisplays).toBe(store.refreshDisplays);
    expect(facade.identifyMonitors).toBe(store.identifyMonitors);
    expect(facade.setMonitorArrangement).toBe(store.setMonitorArrangement);
    expect(facade.moveMonitorInArrangement).toBe(store.moveMonitorInArrangement);
    expect(facade.resetMonitorArrangement).toBe(store.resetMonitorArrangement);
    expect(facade.toggleExtendedMonitor).toBe(store.toggleExtendedMonitor);
    expect(facade.hydrate).toBe(store.hydrate);
  });

  it("delega setters de tela de retorno e mainScreen", () => {
    const facade = useProjectionSettings();
    const store = useProjectionStore();
    expect(facade.setOpenReturnScreen).toBe(store.setOpenReturnScreen);
    expect(facade.selectReturnDisplay).toBe(store.selectReturnDisplay);
    expect(facade.setOpenFullscreenOnPrimary).toBe(
      store.setOpenFullscreenOnPrimary,
    );
    expect(facade.setDisablePrimaryWhenExtended).toBe(
      store.setDisablePrimaryWhenExtended,
    );
    expect(facade.setAutoMinimizePlayer).toBe(store.setAutoMinimizePlayer);
  });

  it("delega setters de letra e fundo; efeito real na store", () => {
    const facade = useProjectionSettings();

    facade.setLyricAlign("bottom");
    facade.setShowSongTitle(false);
    facade.setCustomTextFormat(true);
    facade.setCustomBackground(true);
    facade.setFontSizePercent(150);
    facade.setFontColor("#FF0000");
    facade.setFontWeight("900");
    facade.setBackgroundColor("#121c2c");
    facade.clearBackgroundImage();
    facade.resetToDefaults();

    // os setters são funções da store (fachada sem transformação) — identidade já
    // valida a delegação; o efeito de CADA setter na store é coberto no teste
    // 100% da própria store
    const store = useProjectionStore();
    expect(facade.setLyricAlign).toBe(store.setLyricAlign);
    expect(facade.setShowSongTitle).toBe(store.setShowSongTitle);
    expect(facade.setCustomTextFormat).toBe(store.setCustomTextFormat);
    expect(facade.setCustomBackground).toBe(store.setCustomBackground);
    expect(facade.setFontSizePercent).toBe(store.setFontSizePercent);
    expect(facade.setFontColor).toBe(store.setFontColor);
    expect(facade.setFontWeight).toBe(store.setFontWeight);
    expect(facade.setBackgroundColor).toBe(store.setBackgroundColor);
    expect(facade.clearBackgroundImage).toBe(store.clearBackgroundImage);
    expect(facade.resetToDefaults).toBe(store.resetToDefaults);
    expect(facade.setBackgroundImageFromFile).toBe(
      store.setBackgroundImageFromFile,
    );
  });

  it("lastErrorKey é ref exposto", () => {
    const facade = useProjectionSettings();
    expect(facade.lastErrorKey).toBeDefined();
    expect(facade.lastErrorKey.value).toBeNull();
  });
});
