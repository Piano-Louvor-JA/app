import { createApp } from 'vue'
import { installClientPlatformHeader } from '@shared/lib/client-platform'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@styles/tailwind.css'
import vuetify from '@plugins/vuetify'
import i18n from '@plugins/i18n'
import router from '@/router'
import { useThemeManager } from '@design-system/composables'
import { initUiZoom } from '@shared/composables/useUiZoom'
import { isProjectionPopupLocation } from '@shared/services/projection-window-location'
import { installRemoteLiturgyBridge } from '@modules/remote/renderer/liturgy-bridge'

installClientPlatformHeader()
useThemeManager()
initUiZoom()

// Remove splash HTML antes do mount na janela de projeção (evita tela de boot).
if (isProjectionPopupLocation()) {
  const staticSplash = document.getElementById('boot-splash')
  if (staticSplash) staticSplash.hidden = true
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)
app.use(i18n)

// Controle remoto (APK → desktop): só na janela principal.
if (!isProjectionPopupLocation()) {
  installRemoteLiturgyBridge({ router })
}

app.mount('#app')
