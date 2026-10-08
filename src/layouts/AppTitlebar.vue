<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import logoUrl from '@assets/brand/logo-louvor-ja.svg'
import { APP_PRODUCT_NAME } from '@shared/constants/app'
import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'
import { isProjectionPopupLocation } from '@shared/services/projection-window-location'

import DownloadQueueIndicator from '@modules/sync/components/DownloadQueueIndicator.vue'

const route = useRoute()
const isMaximized = ref(false)
const isFocused = ref(true)
const isMac = computed(() => getDesktopBridge()?.platform === 'darwin')
/** Titlebar só na janela principal — projeção fica sem chrome (como o legado). */
const isProjectionWindow = computed(
  () =>
    route.meta.projection === true ||
    route.name === 'projection-popup' ||
    isProjectionPopupLocation(),
)
const visible = computed(() => isDesktopApp() && !isProjectionWindow.value)

let unsubscribeMaximized: (() => void) | null = null

function onFocus() {
  isFocused.value = true
}

function onBlur() {
  isFocused.value = false
}

async function minimize() {
  await getDesktopBridge()?.window?.control('minimize')
}

async function maximize() {
  await getDesktopBridge()?.window?.control('maximize')
}

async function close() {
  await getDesktopBridge()?.window?.control('close')
}

function syncTitlebarHeight(show: boolean) {
  if (typeof document === 'undefined') return
  if (show) {
    document.documentElement.classList.add('electron-shell')
    document.documentElement.style.setProperty('--app-titlebar-height', '32px')
    return
  }
  document.documentElement.classList.remove('electron-shell')
  document.documentElement.style.setProperty('--app-titlebar-height', '0px')
}

onMounted(async () => {
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)

  syncTitlebarHeight(visible.value)

  const bridge = getDesktopBridge()
  if (!bridge?.window) return

  const maximized = await bridge.window.control('is-maximized')
  isMaximized.value = maximized === true
  unsubscribeMaximized = bridge.window.onMaximizedState((state) => {
    isMaximized.value = state
  })
})

watch(visible, (show) => {
  syncTitlebarHeight(show)
})

onUnmounted(() => {
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('blur', onBlur)
  unsubscribeMaximized?.()
  syncTitlebarHeight(false)
})
</script>

<template>
  <div
    v-if="visible"
    class="app-titlebar"
    :class="{ 'app-titlebar--mac': isMac }"
  >
    <template v-if="isMac">
      <div
        class="app-titlebar__mac-controls"
        :class="{ 'app-titlebar__mac-controls--unfocused': !isFocused }"
      >
        <button
          type="button"
          class="app-titlebar__mac-btn app-titlebar__mac-btn--close"
          aria-label="Fechar"
          @click="close"
        >
          <i class="ti ti-x" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="app-titlebar__mac-btn app-titlebar__mac-btn--minimize"
          aria-label="Minimizar"
          @click="minimize"
        >
          <i class="ti ti-minus" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="app-titlebar__mac-btn app-titlebar__mac-btn--maximize"
          aria-label="Maximizar"
          @click="maximize"
        >
          <i class="ti ti-plus" aria-hidden="true" />
        </button>
      </div>
      <div class="app-titlebar__mac-title">
        <span>{{ APP_PRODUCT_NAME }}</span>
      </div>
    </template>

    <template v-else>
      <div class="app-titlebar__drag">
        <img
          class="app-titlebar__logo"
          :src="logoUrl"
          width="16"
          height="16"
          alt=""
        >
        <span class="app-titlebar__title">{{ APP_PRODUCT_NAME }}</span>
      </div>
      <DownloadQueueIndicator class="app-titlebar__queue" />

      <div class="app-titlebar__controls">
        <button
          type="button"
          class="app-titlebar__btn"
          aria-label="Minimizar"
          @click="minimize"
        >
          <i class="ti ti-minus" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="app-titlebar__btn"
          aria-label="Maximizar"
          @click="maximize"
        >
          <i
            class="ti"
            :class="isMaximized ? 'ti-copy' : 'ti-square'"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="app-titlebar__btn app-titlebar__btn--close"
          aria-label="Fechar"
          @click="close"
        >
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.app-titlebar {
  display: flex;
  align-items: center;
  height: var(--app-titlebar-height, 32px);
  width: 100%;
  position: relative;
  z-index: 100001;
  flex-shrink: 0;
  user-select: none;
  border-bottom: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface, #131313);
  color: var(--ds-color-on-surface);
  -webkit-app-region: drag;
}

.app-titlebar__drag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  height: 100%;
  padding-left: 0.75rem;
  min-width: 0;
  -webkit-app-region: drag;
}

.app-titlebar__logo {
  display: block;
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
  opacity: 0.9;
}

.app-titlebar__title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-titlebar__queue {
  margin-right: 6px;
  align-items: center;
  display: inline-flex;
  -webkit-app-region: no-drag;
}

.app-titlebar__controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.app-titlebar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.8;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;

  .ti {
    font-size: 14px;
    line-height: 1;
  }

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
    opacity: 1;
  }

  &--close:hover {
    background: #e81123;
    color: #fff;
    opacity: 1;
  }
}

.app-titlebar__mac-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 100%;
  padding-left: 1rem;
  z-index: 2;
  -webkit-app-region: no-drag;
}

.app-titlebar__mac-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  cursor: pointer;
  -webkit-app-region: no-drag;

  .ti {
    font-size: 8px;
    line-height: 1;
    color: rgba(0, 0, 0, 0.6);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &--close {
    background: #ff5f56;
  }

  &--minimize {
    background: #ffbd2e;
  }

  &--maximize {
    background: #27c93f;
  }
}

.app-titlebar__mac-controls:hover .app-titlebar__mac-btn .ti {
  opacity: 1;
}

.app-titlebar__mac-controls--unfocused .app-titlebar__mac-btn {
  background: rgba(128, 128, 128, 0.35);
}

.app-titlebar__mac-controls--unfocused .app-titlebar__mac-btn .ti {
  opacity: 0;
}

.app-titlebar__mac-title {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0.9;
}
</style>
