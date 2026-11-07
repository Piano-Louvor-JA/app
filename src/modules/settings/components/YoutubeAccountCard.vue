<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { YoutubeAuthStatus } from '@/shared/types/desktop-bridge'

const { t } = useI18n()

const bridge = window.louvorja
const isDesktop = Boolean(bridge?.isElectron && bridge.ytAuth)

const status = ref<YoutubeAuthStatus | null>(null)
const busy = ref(false)

onMounted(async () => {
  if (!bridge?.ytAuth) return
  try {
    status.value = await bridge.ytAuth.status()
  } catch {
    status.value = { signedIn: false, premium: null }
  }
})

async function login() {
  if (!bridge?.ytAuth || busy.value) return
  busy.value = true
  try {
    const r = await bridge.ytAuth.login()
    status.value = await bridge.ytAuth.status()
    if (!r.signedIn) {
      // usuário fechou sem logar — status já reflete
    }
  } catch (err) {
    console.error('[yt-auth] login falhou', err)
  } finally {
    busy.value = false
  }
}

async function logout() {
  if (!bridge?.ytAuth || busy.value) return
  busy.value = true
  try {
    await bridge.ytAuth.logout()
    status.value = await bridge.ytAuth.status()
  } catch (err) {
    console.error('[yt-auth] logout falhou', err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="yt-card" data-test="youtube-account-card">
    <h3>{{ t('settings.youtube.title') }}</h3>
    <p class="hint">{{ t('settings.youtube.description') }}</p>

    <template v-if="isDesktop">
      <div class="status" data-test="youtube-auth-status">
        <span
          class="dot"
          :class="{ on: status?.signedIn }"
          aria-hidden="true"
        />
        <span v-if="status == null">{{ t('settings.youtube.checking') }}</span>
        <span v-else-if="status.signedIn && status.premium">
          {{ t('settings.youtube.premiumActive') }}
        </span>
        <span v-else-if="status.signedIn">
          {{ t('settings.youtube.signedIn') }}
        </span>
        <span v-else>{{ t('settings.youtube.signedOut') }}</span>
      </div>

      <div class="actions">
        <button
          v-if="!status?.signedIn"
          :disabled="busy"
          data-test="youtube-login-button"
          @click="login"
        >
          {{ busy ? t('settings.youtube.loggingIn') : t('settings.youtube.login') }}
        </button>
        <button
          v-else
          :disabled="busy"
          class="secondary"
          data-test="youtube-logout-button"
          @click="logout"
        >
          {{ t('settings.youtube.logout') }}
        </button>
      </div>

      <p v-if="status?.signedIn && status.premium === false" class="hint">
        {{ t('settings.youtube.notPremiumHint') }}
      </p>
    </template>
    <p v-else class="hint">{{ t('settings.youtube.desktopOnly') }}</p>
  </section>
</template>

<style scoped>
.yt-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.hint {
  opacity: 0.7;
  font-size: 0.85rem;
}
.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #78808d;
}
.dot.on {
  background: #24d36b;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
button {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: var(--ds-color-primary, #04549b);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.05s ease;
}
button:hover:not(:disabled) {
  filter: brightness(1.12);
}
button:active:not(:disabled) {
  transform: translateY(1px);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
button.secondary {
  background: transparent;
  border-color: currentColor;
}
</style>
