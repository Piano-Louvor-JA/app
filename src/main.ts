import { installSystemFontRuntime } from "@shared/services/system-font-runtime";
import { createApp } from "vue";
import { installClientPlatformHeader } from "@shared/lib/client-platform";
import { createPinia } from "pinia";
import App from "./App.vue";
import "@styles/tailwind.css";
import vuetify from "@plugins/vuetify";
import i18n from "@plugins/i18n";
import router from "@/router";
import { useThemeManager } from "@design-system/composables";
import { initUiZoom } from "@shared/composables/useUiZoom";
import { isProjectionPopupLocation } from "@shared/services/projection-window-location";
import { installRemoteLiturgyBridge } from "@modules/remote/renderer/liturgy-bridge";
import { installNavigationHistory } from "@shared/composables/useNavigationHistory";
import { startRendererTelemetry } from "@shared/services/telemetry";
import { installScreenContextBridge } from "@shared/services/screen-context";
import {
  getUserPreference,
  registerPrefsChangedHook,
} from "@shared/services/user-preferences";
import { writeCatalogRecord } from "@shared/services/workspace-api";
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";

/**
 * t_5582d47e: espelha o idioma da UI num record do workspace (disco) para o
 * processo main ler no splash. localStorage (user_data) é ilha do renderer.
 * Melhor esforço: falha de disco não afeta a preferência em si.
 */
function persistUiLanguageForSplash(): void {
  const lang = getUserPreference<string>(
    USER_PREFERENCE_KEYS.language,
    "pt-BR",
  );
  if (typeof lang !== "string") return;
  void writeCatalogRecord("ui_language", lang).catch(() => {});
}

persistUiLanguageForSplash();
registerPrefsChangedHook((key) => {
  if (key === USER_PREFERENCE_KEYS.language) persistUiLanguageForSplash();
});

installClientPlatformHeader();
useThemeManager();
initUiZoom();
const stopSystemFont = installSystemFontRuntime();
if (import.meta.hot) import.meta.hot.dispose(stopSystemFont);

// telemetria de erros (Glitchtip) — no-op sem VITE_TELEMETRIA_DSN
void startRendererTelemetry();

// Remove splash HTML antes do mount na janela de projeção (evita tela de boot).
if (isProjectionPopupLocation()) {
  const staticSplash = document.getElementById("boot-splash");
  if (staticSplash) staticSplash.hidden = true;
}

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(vuetify);
app.use(i18n);

// Só na janela principal: controle remoto (APK → desktop) e histórico de
// navegação (antes do mount, para registrar a navegação inicial).
if (!isProjectionPopupLocation()) {
  installRemoteLiturgyBridge({ router });
  installNavigationHistory({ router });
  // Players (janelas à parte) mostram o seletor de telas igual ao do app.
  installScreenContextBridge();
}

app.mount("#app");
