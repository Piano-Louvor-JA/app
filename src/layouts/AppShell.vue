<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { usePageTransition } from '@design-system/composables'
import { DockFooter, GradientBackground } from '@design-system/index'
import type { DockNavItem } from '@design-system/types/navigation'
import AuthAccountDialog from '@modules/auth/components/AuthAccountDialog.vue'
import { useAuth, setNotify } from '@modules/auth/composables/useAuth'
import { useBibleStore } from '@modules/bible/stores/useBibleStore'
import BibleInAppProjection from '@modules/bible/components/BibleInAppProjection.vue'
import ClockProjectionView from '@modules/clock/views/ClockProjectionView.vue'
import { useClockStore } from '@modules/clock/stores/useClockStore'
import CountdownProjectionView from '@modules/countdown/views/CountdownProjectionView.vue'
import RandomProjectionView from '@modules/random/views/RandomProjectionView.vue'
import TimerProjectionView from '@modules/timer/views/TimerProjectionView.vue'
import InAppProjectionOverlay from '@shared/components/InAppProjectionOverlay.vue'
import { useCountdownStore } from '@modules/countdown/stores/useCountdownStore'
import { useLiturgyStore } from '@modules/liturgy/stores/useLiturgyStore'
import MediaChrome from '@modules/media/components/MediaChrome.vue'
import { useMediaPlayer } from '@modules/media/composables/useMediaPlayer'
import { useRandomStore } from '@modules/random/stores/useRandomStore'
import { useTimerStore } from '@modules/timer/stores/useTimerStore'
import MonitorTargetSelect from '@shared/components/MonitorTargetSelect.vue'
import UiZoomControls from '@shared/components/UiZoomControls.vue'
import {
  closeProjectionModule,
  isProjectionModuleOpen,
  syncProjectionAfterDisplayChange,
} from '@shared/composables/useProjectionWindow'
import { subscribeDisplaysChanged } from '@modules/settings/services/display-service'
import { useProjectionStore } from '@modules/settings/stores/useProjectionStore'
import { mainNavRoutes } from '@shared/constants/navigation'
import logoUrl from '@assets/brand/logo-louvor-ja.svg'
import CodenameLogo from '@assets/brand/CodenameLogo.vue'
import { APP_VERSION } from '@shared/constants/app'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { transitionName } = usePageTransition()

const {
  hasSession: hasMediaSession,
  isProjecting: isMediaProjecting,
  toggleProjection: toggleMediaProjection,
  clearProjection: clearMediaProjection,
} = useMediaPlayer()

const bibleStore = useBibleStore()
const {
  isProjecting: isBibleProjecting,
  projection: bibleProjection,
  inAppPreview: bibleInAppPreview,
} = storeToRefs(bibleStore)

const randomStore = useRandomStore()
const {
  isProjecting: isRandomProjecting,
  inAppPreview: randomInAppPreview,
} = storeToRefs(randomStore)

const timerStore = useTimerStore()
const {
  isProjecting: isTimerProjecting,
  inAppPreview: timerInAppPreview,
} = storeToRefs(timerStore)

const countdownStore = useCountdownStore()
const {
  isProjecting: isCountdownProjecting,
  inAppPreview: countdownInAppPreview,
} = storeToRefs(countdownStore)

const clockStore = useClockStore()
const {
  isProjecting: isClockProjecting,
  inAppPreview: clockInAppPreview,
} = storeToRefs(clockStore)

const liturgyStore = useLiturgyStore()
const {
  siteProjectionItemId,
  videoProjectionItemId,
  selectedItemIndex,
  selectedItem,
} = storeToRefs(liturgyStore)

/** Tipos da liturgia que o header Projetar consegue abrir nas telas. */
const LITURGY_PROJECTABLE = new Set([
  'music',
  'site',
  'online_video',
  'video',
  'images',
  'pdf',
  'presentation',
])

/** web#174: conta LouvorJA no header — mesmo padrão do web (AuthAccountDialog). */
const showAccountButton = true
const authDialogOpen = ref(false)
const { isLoggedIn } = useAuth()
setNotify((message: string, isError?: boolean) => {
  // snackbar do app — usa o mesmo canal de avisos das janelas de projeção
  window.dispatchEvent(new CustomEvent('app-notify', { detail: { message, isError } }))
})

const hasBibleContent = computed(
  () =>
    bibleProjection.value.verses.length > 0 &&
    Boolean(bibleProjection.value.text),
)

const isOnRandomRoute = computed(() => route.name === 'utilities-random')
const isOnTimerRoute = computed(() => route.name === 'utilities-timer')
const isOnCountdownRoute = computed(() => route.name === 'utilities-countdown')
const isOnClockRoute = computed(() => route.name === 'utilities-clock')
const isOnLiturgyRoute = computed(() => route.meta.navKey === 'liturgy')


const isLiturgyProjecting = computed(
  () =>
    siteProjectionItemId.value != null || videoProjectionItemId.value != null,
)

const hasLiturgyProjectableSelection = computed(() => {
  const item = selectedItem.value
  return (
    item != null &&
    !item.done &&
    LITURGY_PROJECTABLE.has(item.type)
  )
})

const isProjecting = computed(
  () =>
    isMediaProjecting.value ||
    isBibleProjecting.value ||
    isRandomProjecting.value ||
    isTimerProjecting.value ||
    isCountdownProjecting.value ||
    isClockProjecting.value ||
    isLiturgyProjecting.value,
)

/** Janelas de módulo abertas (não reativo — poll no mount). */
const hasModuleScreens = ref(false)
let screensPollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeDisplaysChanged: (() => void) | undefined = undefined

const hasOpenScreens = computed(
  () => isProjecting.value || hasModuleScreens.value,
)

const projectionStore = useProjectionStore()
const { hasSelectedAudienceTargets } = storeToRefs(projectionStore)

function refreshOpenScreens() {
  hasModuleScreens.value = isProjectionModuleOpen()
}

async function onCloseAllScreens() {
  if (isMediaProjecting.value) clearMediaProjection()
  if (isBibleProjecting.value) bibleStore.clearProjectionWindow()
  if (isRandomProjecting.value) randomStore.clearProjection()
  if (isTimerProjecting.value) timerStore.clearProjection()
  if (isCountdownProjecting.value) countdownStore.clearProjection()
  if (isClockProjecting.value) clockStore.clearProjection()
  if (isLiturgyProjecting.value) await liturgyStore.clearWebProjection()
  closeProjectionModule()
  refreshOpenScreens()
}

onMounted(() => {
  refreshOpenScreens()
  screensPollTimer = setInterval(refreshOpenScreens, 400)

  // Hotplug de monitores (legado onDisplaysChanged)
  void projectionStore.hydrate()
  unsubscribeDisplaysChanged = subscribeDisplaysChanged(() => {
    void (async () => {
      await projectionStore.refreshDisplays()
      await syncProjectionAfterDisplayChange()
      refreshOpenScreens()
    })()
  })
})

onUnmounted(() => {
  if (screensPollTimer) clearInterval(screensPollTimer)
  unsubscribeDisplaysChanged?.()
})

/** Conteúdo projetável (mídia, bíblia, utilitários, liturgia…). */
const hasProjectableContent = computed(
  () =>
    hasMediaSession.value ||
    isMediaProjecting.value ||
    hasBibleContent.value ||
    isBibleProjecting.value ||
    isOnRandomRoute.value ||
    isRandomProjecting.value ||
    isOnTimerRoute.value ||
    isTimerProjecting.value ||
    isOnCountdownRoute.value ||
    isCountdownProjecting.value ||
    isOnClockRoute.value ||
    isClockProjecting.value ||
    isLiturgyProjecting.value ||
    (isOnLiturgyRoute.value && hasLiturgyProjectableSelection.value),
)

/**
 * Pode alternar projeção: com conteúdo + telas estendidas selecionadas.
 * Se já estiver projetando, permanece habilitado para poder parar.
 */
const canToggleProjection = computed(
  () =>
    isProjecting.value ||
    (hasProjectableContent.value && hasSelectedAudienceTargets.value),
)

const projectAriaLabel = computed(() => {
  if (
    !isProjecting.value &&
    hasProjectableContent.value &&
    !hasSelectedAudienceTargets.value
  ) {
    return t('monitors.projectNeedsScreens')
  }
  if (isLiturgyProjecting.value) return t('liturgy.actions.stopSiteProjection')
  if (isClockProjecting.value) return t('clock.clearProjection')
  if (isCountdownProjecting.value) return t('countdown.clearProjection')
  if (isTimerProjecting.value) return t('timer.clearProjection')
  if (isRandomProjecting.value) return t('random.clearProjection')
  if (isBibleProjecting.value) return t('bible.clearProjection')
  if (isMediaProjecting.value) return t('media.clearProjection')
  if (isOnLiturgyRoute.value) return t('liturgy.actions.project')
  if (isOnClockRoute.value) return t('clock.project')
  if (isOnCountdownRoute.value) return t('countdown.project')
  if (isOnTimerRoute.value) return t('timer.project')
  if (isOnRandomRoute.value) return t('random.project')
  if (route.meta.navKey === 'bible') return t('bible.project')
  return t('media.project')
})

async function onToggleProjection() {
  if (!canToggleProjection.value) return

  if (isMediaProjecting.value) {
    await toggleMediaProjection()
    return
  }
  if (isBibleProjecting.value) {
    await bibleStore.clearProjectionWindow()
    return
  }
  if (isRandomProjecting.value) {
    await randomStore.clearProjection()
    return
  }
  if (isTimerProjecting.value) {
    await timerStore.clearProjection()
    return
  }
  if (isCountdownProjecting.value) {
    await countdownStore.clearProjection()
    return
  }
  if (isClockProjecting.value) {
    await clockStore.clearProjection()
    return
  }
  if (isLiturgyProjecting.value) {
    await liturgyStore.clearWebProjection()
    return
  }

  // Preferência: módulo atual; senão o que tiver conteúdo.
  if (isOnLiturgyRoute.value && hasLiturgyProjectableSelection.value) {
    const index = selectedItemIndex.value
    if (index != null) await liturgyStore.playItemOnScreens(index)
    return
  }
  if (isOnClockRoute.value) {
    await clockStore.toggleProjection()
    return
  }
  if (isOnCountdownRoute.value) {
    await countdownStore.toggleProjection()
    return
  }
  if (isOnTimerRoute.value) {
    await timerStore.toggleProjection()
    return
  }
  if (isOnRandomRoute.value) {
    await randomStore.toggleProjection()
    return
  }
  if (route.meta.navKey === 'bible' && hasBibleContent.value) {
    await bibleStore.toggleProjection()
    return
  }
  if (hasMediaSession.value) {
    await toggleMediaProjection()
    return
  }
  if (hasBibleContent.value) {
    await bibleStore.toggleProjection()
  }
}

const activeKey = computed(() => {
  const navKey = route.meta.navKey
  return typeof navKey === 'string' ? navKey : 'home'
})

const showHeaderLogo = computed(() => activeKey.value !== 'home')

const navItems = computed<DockNavItem[]>(() =>
  mainNavRoutes.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: t(item.labelKey),
    to: item.to,
  })),
)

function onNavigate(key: string) {
  const item = mainNavRoutes.find((nav) => nav.key === key)
  if (item) {
    void router.push(item.to)
  }
}

function viewKey(viewRoute: typeof route) {
  const navKey = viewRoute.meta.navKey
  return typeof navKey === 'string' ? navKey : String(viewRoute.name ?? viewRoute.path)
}
</script>

<template>
  <GradientBackground class="app-shell">
    <header class="app-shell__header">
      <div class="app-shell__brand-group" :aria-label="t('app.name')">
        <img
          v-if="showHeaderLogo"
          class="app-shell__logo"
          :src="logoUrl"
          :alt="t('app.name')"
          width="36"
          height="36"
        >
        <span class="app-shell__brand">
          <span class="app-shell__brand-louvor">{{ t('app.nameLouvor') }}</span>
          <span class="app-shell__brand-ja">{{ t('app.nameJa') }}</span>
        </span>
      </div>
      <div class="app-shell__header-end">
        <UiZoomControls />
        <div class="app-shell__projection">
          <MonitorTargetSelect
            class="app-shell__screens"
            show-label
            persist
          />
          <button
            type="button"
            class="app-shell__project-btn"
            :class="{ 'app-shell__project-btn--on': isProjecting }"
            :disabled="!canToggleProjection"
            :aria-label="projectAriaLabel"
            :title="projectAriaLabel"
            @click="onToggleProjection"
          >
            <i
              class="ti"
              :class="isProjecting ? 'ti-player-stop' : 'ti-presentation'"
              aria-hidden="true"
            />
          </button>
          <button
            v-if="hasOpenScreens"
            type="button"
            class="app-shell__project-btn"
            :aria-label="t('popupControls.closeAll')"
            :title="t('popupControls.closeAll')"
            @click="onCloseAllScreens"
          >
            <i
              class="ti ti-square-x"
              aria-hidden="true"
            />
          </button>
        </div>
        <div class="app-shell__codename-block">
          <CodenameLogo class="app-shell__codename" />
          <span class="app-shell__version" aria-hidden="true">{{ APP_VERSION }}</span>
        </div>
        <button
          v-if="showAccountButton"
          type="button"
          class="app-shell__account"
          :aria-label="t('auth.title')"
          :title="t('auth.title')"
          @click="authDialogOpen = true"
        >
          <i
            class="ti"
            :class="isLoggedIn ? 'ti-user-check' : 'ti-user-circle'"
            aria-hidden="true"
          />
        </button>
        <AuthAccountDialog v-model="authDialogOpen" />
      </div>
    </header>

    <main class="app-shell__main">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition :name="transitionName" mode="out-in">
          <component
            :is="Component"
            :key="viewKey(viewRoute)"
          />
        </Transition>
      </RouterView>
    </main>

    <MediaChrome />

    <BibleInAppProjection
      v-if="bibleInAppPreview"
      @close="bibleStore.clearProjectionWindow"
    />

    <InAppProjectionOverlay
      v-if="randomInAppPreview"
      scope="random"
      :label="t('random.inAppProjection')"
      :close-label="t('random.close')"
      :hint="t('random.projectionHotkeyHint')"
      @close="randomStore.clearProjection"
    >
      <RandomProjectionView embedded />
    </InAppProjectionOverlay>

    <InAppProjectionOverlay
      v-if="timerInAppPreview"
      scope="timer"
      :label="t('timer.inAppProjection')"
      :close-label="t('timer.close')"
      :hint="t('timer.projectionHotkeyHint')"
      @close="timerStore.clearProjection"
    >
      <TimerProjectionView embedded />
    </InAppProjectionOverlay>

    <InAppProjectionOverlay
      v-if="countdownInAppPreview"
      scope="countdown"
      :label="t('countdown.inAppProjection')"
      :close-label="t('countdown.close')"
      :hint="t('countdown.projectionHotkeyHint')"
      @close="countdownStore.clearProjection"
    >
      <CountdownProjectionView embedded />
    </InAppProjectionOverlay>

    <InAppProjectionOverlay
      v-if="clockInAppPreview"
      scope="clock"
      :label="t('clock.inAppProjection')"
      :close-label="t('clock.close')"
      :hint="t('clock.projectionHotkeyHint')"
      @close="clockStore.clearProjection"
    >
      <ClockProjectionView embedded />
    </InAppProjectionOverlay>

    <DockFooter
      :items="navItems"
      :active-key="activeKey"
      @select="onNavigate"
    />
  </GradientBackground>
</template>

<style scoped lang="scss">
.app-shell {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.app-shell :deep(.ds-gradient-bg__content) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.app-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: var(--ds-header-height, 5rem);
  padding: 0 var(--ds-spacing-page);
  border-bottom: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface, #10131a);
  z-index: 40;
}

.app-shell__brand-group {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}

.app-shell__logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}

.app-shell__brand {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.app-shell__brand-louvor {
  color: var(--ds-color-on-surface);
}

.app-shell__brand-ja {
  color: var(--ds-color-brand-yellow);
}

.app-shell__header-end {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.app-shell__projection {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.app-shell__screens {
  flex-shrink: 0;
}

.app-shell__project-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    opacity 160ms ease;

  .ti {
    font-size: 1.1rem;
    line-height: 1;
  }

  &:hover:not(:disabled) {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  &--on {
    background: color-mix(in srgb, var(--ds-color-primary) 32%, transparent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.app-shell__codename-block {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}

.app-shell__codename {
  display: block;
  height: 2.2rem;
  width: auto;
  flex-shrink: 0;
  opacity: 0.4;
}

:global(html[data-mode='light'] .app-shell__codename) {
  opacity: 1 !important;
}

.app-shell__version {
  color: var(--ds-color-on-surface-variant);
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
}

.app-shell__account {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  transition: color 200ms ease, transform 150ms ease;

  .ti {
    font-size: 32px;
    line-height: 1;
  }

  &:hover {
    color: var(--ds-color-primary-soft);
  }

  &:active {
    transform: scale(0.95);
  }
}

.app-shell__main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding-bottom: var(--ds-dock-height);

  /* View ativa (RouterView não cria wrapper) preenche a área útil. */
  > * {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
  }
}

/* Desktop médio / 1024×768: chrome mais compacto */
@media (max-width: 1280px) {
  .app-shell__header {
    gap: 0.75rem;
  }

  .app-shell__brand-group {
    gap: 0.5rem;
  }

  .app-shell__logo {
    width: 32px;
    height: 32px;
  }

  .app-shell__brand {
    font-size: 20px;
  }

  .app-shell__codename {
    height: 1.5rem;
  }

  .app-shell__version {
    font-size: 12px;
  }

  .app-shell__account .ti {
    font-size: 26px;
  }

  .app-shell__codename-block {
    gap: 0.35rem;
  }

  .app-shell__header-end {
    gap: 0.5rem;
  }
}
</style>
