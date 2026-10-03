<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, watch, onMounted, ref } from 'vue'
import { startOutboxTriggers } from '@modules/sync/services/sync-outbox-service'
import { useRoute, RouterView } from 'vue-router'
import { useTheme } from 'vuetify'

import StartingOverlay from '@modules/starting/components/StartingOverlay.vue'
import { useStartingStore } from '@modules/starting/stores/useStartingStore'
import { useThemeManager } from '@design-system/composables'
import AppTitlebar from '@layouts/AppTitlebar.vue'
import { isProjectionPopupLocation } from '@shared/services/projection-window-location'
import { useOperatorEscapeToCloseProjection } from '@shared/composables/useOperatorEscapeToCloseProjection'
import { useMediaPlayerHotkeys } from '@modules/media/composables/useMediaPlayerHotkeys'
import UpdateBanner from '@shared/components/UpdateBanner.vue'
import UpdateDialog from '@shared/components/UpdateDialog.vue'
import { useUpdateChecker } from '@shared/composables/useUpdateChecker'

const route = useRoute()
const vuetifyTheme = useTheme()
const { currentTheme } = useThemeManager()
const startingStore = useStartingStore()
const { isAppReady } = storeToRefs(startingStore)

const isProjectionWindow = computed(
  () =>
    route.meta.projection === true ||
    route.name === 'projection-popup' ||
    isProjectionPopupLocation(),
)

// Popup: libera conteúdo na hora (legado). Sem splash / sem esperar bootstrap.
if (isProjectionPopupLocation()) {
  startingStore.hide()
}

const updateChecker = useUpdateChecker()
const showUpdateDialog = ref(false)

// ESC no operador com projeção ativa → confirma encerrar (spec 30/08,
// monitor único: sem isso o operador não saía da projeção sem fechar o app).
useOperatorEscapeToCloseProjection(() => isProjectionWindow.value)
// ←/→ do player assim que a sessão maximiza (não depende do foco da MediaView).
useMediaPlayerHotkeys(() => isProjectionWindow.value)

watch(
  () => currentTheme.value.mode,
  (mode) => {
    void vuetifyTheme.change(mode === 'dark' ? 'dark' : 'light')
  },
  { immediate: true },
)

watch(
  () => updateChecker.hasUpdate.value,
  (hasUpdate) => {
    if (!hasUpdate) {
      showUpdateDialog.value = false
    }
  },
)

onMounted(() => {
  // sync v2 fase 2 (app#336): flush on-online + pull no boot
  startOutboxTriggers()
  updateChecker.init()
  // Palco (cast TV): a bridge sobe no BOOT da janela principal — não só
  // quando o PalcoCard monta. Sem isso, hino/bíblia/timer só espelhavam
  // se o operador tivesse visitado Configurações → Projeção antes.
  if (!isProjectionWindow.value) {
    import('@modules/settings/services/palco-bridge')
      .then((m) => {
        m.startPalcoBridge()
        console.info('[palco-bridge] subiu no boot')
      })
      .catch((e) => console.error('[palco-bridge] FALHOU ao subir no boot:', e))
  }
})

function handleViewNotes() {
  showUpdateDialog.value = true
}
</script>

<template>
  <div
    class="app-frame"
    :class="{ 'app-frame--projection': isProjectionWindow }"
  >
    <UpdateBanner @view-notes="handleViewNotes" />
    <AppTitlebar />
    <div class="app-frame__body">
      <StartingOverlay v-if="!isProjectionWindow" />
      <RouterView v-if="isAppReady || isProjectionWindow" />
    </div>
    <UpdateDialog v-model="showUpdateDialog" />
  </div>
</template>

<style scoped lang="scss">
.app-frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.app-frame--projection {
  background: #000;
}

.app-frame__body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.app-frame--projection .app-frame__body {
  overflow: hidden;
}
</style>
