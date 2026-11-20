<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import { useAuth } from '../composables/useAuth'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const { t } = useI18n()
const { session, userName, userEmail, login, register, loginGoogle, logout, forgotPassword, resetPassword } = useAuth()

const mode = ref<'login' | 'register' | 'forgot' | 'reset'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const resetToken = ref('')
const busy = ref(false)

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const isValid = computed(() => {
  if (mode.value === 'forgot') return email.value.includes('@')
  if (mode.value === 'reset') return resetToken.value.trim().length >= 16 && password.value.length >= 8
  return email.value.includes('@') && password.value.length >= 6 && (mode.value !== 'register' || displayName.value.trim().length >= 2)
})

function close(): void {
  password.value = ''
  resetToken.value = ''
  mode.value = 'login'
  open.value = false
}

async function submit(): Promise<void> {
  if (!isValid.value || busy.value) return
  busy.value = true
  try {
    if (mode.value === 'forgot') {
      mode.value = await forgotPassword(email.value) ? 'reset' : 'login'
      return
    }
    if (mode.value === 'reset') {
      if (await resetPassword(resetToken.value, password.value)) {
        password.value = ''
        resetToken.value = ''
        mode.value = 'login'
      }
      return
    }
    const ok = mode.value === 'login'
      ? await login(email.value, password.value)
      : await register(email.value, password.value, displayName.value)
    if (ok) close()
  } finally {
    busy.value = false
  }
}

async function googleLogin(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    if (await loginGoogle()) close()
  } finally {
    busy.value = false
  }
}

async function signOut(): Promise<void> {
  await logout()
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="auth-account-fade">
      <div
        v-if="open"
        class="auth-account"
        role="dialog"
        aria-modal="true"
        :aria-label="t('auth.title')"
        @click.self="close"
      >
        <GlassCard class="auth-account__panel" elevated :padding="false">
          <header class="auth-account__header">
            <div>
              <h2>{{ t('auth.title') }}</h2>
              <p v-if="!session">Acesse sua conta da Comunidade.</p>
            </div>
            <button type="button" class="auth-account__icon" :aria-label="t('random.close')" @click="close">
              <i class="ti ti-x" aria-hidden="true" />
            </button>
          </header>

          <section v-if="session" class="auth-account__body">
            <div class="auth-account__identity">
              <i class="ti ti-user-check" aria-hidden="true" />
              <div>
                <strong>{{ userName }}</strong>
                <span v-if="userEmail">{{ userEmail }}</span>
              </div>
            </div>
            <button type="button" class="auth-account__button auth-account__button--secondary" @click="signOut">
              {{ t('auth.logout') }}
            </button>
          </section>

          <form v-else class="auth-account__body" @submit.prevent="submit">
            <template v-if="mode === 'login'">
              <label>
                <span>{{ t('auth.email') }}</span>
                <input v-model="email" type="email" autocomplete="email" :disabled="busy">
              </label>
              <label>
                <span>{{ t('auth.password') }}</span>
                <input v-model="password" type="password" autocomplete="current-password" :disabled="busy">
              </label>
              <button type="submit" class="auth-account__button auth-account__button--primary" :disabled="!isValid || busy">
                {{ t('auth.login') }}
              </button>
              <button type="button" class="auth-account__button auth-account__button--google" :disabled="busy" @click="googleLogin">
                <i class="ti ti-brand-google" aria-hidden="true" />
                Entrar com Google
              </button>
              <footer class="auth-account__links">
                <button type="button" @click="mode = 'register'">{{ t('auth.createAccount') }}</button>
                <button type="button" @click="mode = 'forgot'">{{ t('auth.forgotPassword') }}</button>
              </footer>
            </template>

            <template v-else-if="mode === 'register'">
              <label>
                <span>{{ t('auth.displayName') }}</span>
                <input v-model="displayName" autocomplete="name" :disabled="busy">
              </label>
              <label>
                <span>{{ t('auth.email') }}</span>
                <input v-model="email" type="email" autocomplete="email" :disabled="busy">
              </label>
              <label>
                <span>{{ t('auth.password') }}</span>
                <input v-model="password" type="password" autocomplete="new-password" :disabled="busy">
              </label>
              <button type="submit" class="auth-account__button auth-account__button--primary" :disabled="!isValid || busy">
                {{ t('auth.register') }}
              </button>
              <footer class="auth-account__links">
                <button type="button" @click="mode = 'login'">{{ t('auth.alreadyHaveAccount') }}</button>
              </footer>
            </template>

            <template v-else-if="mode === 'forgot'">
              <p>{{ t('auth.forgotHint') }}</p>
              <label>
                <span>{{ t('auth.email') }}</span>
                <input v-model="email" type="email" autocomplete="email" :disabled="busy">
              </label>
              <button type="submit" class="auth-account__button auth-account__button--primary" :disabled="!isValid || busy">
                {{ t('auth.sendResetToken') }}
              </button>
              <footer class="auth-account__links">
                <button type="button" @click="mode = 'login'">{{ t('auth.back') }}</button>
              </footer>
            </template>

            <template v-else>
              <p>{{ t('auth.resetHint') }}</p>
              <label>
                <span>{{ t('auth.resetToken') }}</span>
                <input v-model="resetToken" autocomplete="one-time-code" :disabled="busy">
              </label>
              <label>
                <span>{{ t('auth.newPassword') }}</span>
                <input v-model="password" type="password" autocomplete="new-password" :disabled="busy">
              </label>
              <button type="submit" class="auth-account__button auth-account__button--primary" :disabled="!isValid || busy">
                {{ t('auth.changePassword') }}
              </button>
              <footer class="auth-account__links">
                <button type="button" @click="mode = 'login'">{{ t('auth.back') }}</button>
              </footer>
            </template>
          </form>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.auth-account { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: rgb(0 0 0 / 55%); backdrop-filter: blur(2px); }
.auth-account__panel { width: min(100%, 26rem); overflow: hidden; }
.auth-account__header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent); }
.auth-account__header h2, .auth-account__header p { margin: 0; }
.auth-account__header h2 { color: var(--ds-color-on-surface); font-size: 1.125rem; }
.auth-account__header p, .auth-account__body p { color: var(--ds-color-on-surface-variant); font-size: .875rem; }
.auth-account__icon { display: inline-flex; width: 2.25rem; height: 2.25rem; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: transparent; color: var(--ds-color-on-surface); cursor: pointer; }
.auth-account__body { display: grid; gap: .875rem; padding: 1.5rem; }
.auth-account__body label { display: grid; gap: .35rem; color: var(--ds-color-on-surface); font-size: .875rem; font-weight: 600; }
.auth-account__body input { width: 100%; box-sizing: border-box; padding: .7rem .8rem; border: 1px solid var(--ds-color-outline); border-radius: .6rem; background: color-mix(in srgb, var(--ds-color-surface) 90%, black); color: var(--ds-color-on-surface); }
.auth-account__button { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; gap: .5rem; border: 0; border-radius: .65rem; font: inherit; font-weight: 700; cursor: pointer; }
.auth-account__button:disabled { cursor: not-allowed; opacity: .55; }
.auth-account__button--primary { background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
.auth-account__button--google, .auth-account__button--secondary { border: 1px solid var(--ds-color-outline); background: transparent; color: var(--ds-color-on-surface); }
.auth-account__links { display: flex; justify-content: space-between; gap: .5rem; }
.auth-account__links button { padding: .25rem 0; border: 0; background: transparent; color: var(--ds-color-primary); font: inherit; cursor: pointer; }
.auth-account__identity { display: flex; align-items: center; gap: .75rem; color: var(--ds-color-on-surface); }
.auth-account__identity > i { font-size: 2rem; color: var(--ds-color-primary); }
.auth-account__identity div { display: grid; gap: .15rem; }
.auth-account__identity span { color: var(--ds-color-on-surface-variant); font-size: .875rem; }
.auth-account-fade-enter-active, .auth-account-fade-leave-active { transition: opacity .15s ease; }
.auth-account-fade-enter-from, .auth-account-fade-leave-to { opacity: 0; }
</style>
