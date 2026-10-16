<script setup lang="ts">
import { useI18n } from 'vue-i18n'
/**
 * Conta de coletâneas custom — login/registro simples (e-mail + senha).
 * Compacto: quando logado mostra só nome + botão sair; senão formulário colapsável.
 * Inclui fluxo "esqueci minha senha": pede token via /auth/forgot-password
 * (o token chega pelo suporte quando sem SMTP) e troca a senha em
 * /auth/reset-password.
 */
import { computed, ref } from 'vue'
import {
  getAuthSession,
  login,
  logout,
  register,
  resetPassword,
  requestPasswordReset,
  type AuthSession,
} from '../services/auth-client'

const { t } = useI18n()

const props = defineProps<{
  /** Notificação do host (snackbar do editor). */
  notify?: (message: string, isError?: boolean) => void
}>()

const session = ref<AuthSession | null>(getAuthSession())
const formOpen = ref(false)
const mode = ref<'login' | 'register' | 'forgot' | 'reset'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const resetToken = ref('')
const busy = ref(false)

const isValid = computed(() => {
  if (mode.value === 'forgot') return email.value.includes('@')
  if (mode.value === 'reset') {
    return resetToken.value.trim().length >= 16 && password.value.length >= 8
  }
  if (email.value.includes('@') === false) return false
  if (password.value.length < 6) return false
  if (mode.value === 'register' && displayName.value.trim().length < 2) return false
  return true
})

async function onSubmit(): Promise<void> {
  if (!isValid.value || busy.value) return
  busy.value = true
  try {
    if (mode.value === 'forgot') {
      const token = await requestPasswordReset(email.value.trim())
      if (token) {
        resetToken.value = token
        mode.value = 'reset'
        props.notify?.('Token gerado — confirme a senha nova')
      } else {
        // Resposta neutra da API: não revela se o e-mail existe.
        props.notify?.('Se o e-mail existir, o suporte tem o token de reset')
        mode.value = 'login'
      }
      return
    }
    if (mode.value === 'reset') {
      const ok = await resetPassword(resetToken.value.trim(), password.value)
      if (ok) {
        props.notify?.('Senha alterada! Entre com a senha nova')
        mode.value = 'login'
        password.value = ''
        resetToken.value = ''
      } else {
        props.notify?.('Token inválido ou expirado', true)
      }
      return
    }
    const result =
      mode.value === 'login'
        ? await login(email.value.trim(), password.value)
        : await register(email.value.trim(), password.value, displayName.value.trim())
    if (result) {
      session.value = result
      formOpen.value = false
      password.value = ''
      props.notify?.(`Bem-vindo, ${result.user.displayName}!`)
    } else {
      props.notify?.(
        mode.value === 'login'
          ? 'E-mail ou senha incorretos'
          : 'Não foi possível criar a conta (e-mail já existe?)',
        true,
      )
    }
  } finally {
    busy.value = false
  }
}

async function onLogout(): Promise<void> {
  await logout()
  session.value = null
  formOpen.value = false
  props.notify?.('Sessão encerrada')
}

function toggleForm(): void {
  formOpen.value = !formOpen.value
  if (!formOpen.value) {
    password.value = ''
    resetToken.value = ''
    mode.value = 'login'
  }
}
</script>

<template>
  <div class="account">
    <!-- Logado: nome + sair -->
    <div
      v-if="session"
      class="account__logged"
    >
      <span
        class="account__name"
        :title="session.user.email"
      >
        {{ session.user.displayName }}
      </span>
      <button
        type="button"
        class="account__link"
        @click="onLogout"
      >
        Sair
      </button>
    </div>

    <!-- Deslogado: formulário colapsável -->
    <template v-else>
      <button
        type="button"
        class="account__link"
        @click="toggleForm"
      >
        {{ formOpen ? 'Fechar' : 'Entrar / Criar conta' }}
      </button>

      <form
        v-if="formOpen"
        class="account__form"
        @submit.prevent="onSubmit"
      >
        <!-- LOGIN -->
        <template v-if="mode === 'login'">
          <input
            v-model="email"
            type="email"
            class="account__input"
            :placeholder="t('media.account.email')"
            autocomplete="email"
          >
          <input
            v-model="password"
            type="password"
            class="account__input"
            :placeholder="t('media.account.password')"
            autocomplete="current-password"
          >
          <button
            type="submit"
            class="account__submit"
            :disabled="!isValid || busy"
          >
            Entrar
          </button>
          <div class="account__row">
            <button
              type="button"
              class="account__link"
              @click="mode = 'register'"
            >
              Criar conta
            </button>
            <button
              type="button"
              class="account__link"
              @click="mode = 'forgot'"
            >
              Esqueci minha senha
            </button>
          </div>
        </template>

        <!-- REGISTRO -->
        <template v-else-if="mode === 'register'">
          <input
            v-model="displayName"
            type="text"
            class="account__input"
            :placeholder="t('media.account.yourName')"
            autocomplete="name"
          >
          <input
            v-model="email"
            type="email"
            class="account__input"
            :placeholder="t('media.account.email')"
            autocomplete="email"
          >
          <input
            v-model="password"
            type="password"
            class="account__input"
            :placeholder="t('media.account.passwordMin6')"
            autocomplete="new-password"
          >
          <button
            type="submit"
            class="account__submit"
            :disabled="!isValid || busy"
          >
            Criar conta
          </button>
          <div class="account__row">
            <button
              type="button"
              class="account__link"
              @click="mode = 'login'"
            >
              Já tenho conta
            </button>
          </div>
        </template>

        <!-- ESQUECI MINHA SENHA -->
        <template v-else-if="mode === 'forgot'">
          <p class="account__hint">
            Informe seu e-mail. Sem e-mail automático: em produção o token de
            reset é fornecido pelo suporte do projeto.
          </p>
          <input
            v-model="email"
            type="email"
            class="account__input"
            :placeholder="t('media.account.accountEmail')"
            autocomplete="email"
          >
          <button
            type="submit"
            class="account__submit"
            :disabled="!isValid || busy"
          >
            Gerar token de reset
          </button>
          <div class="account__row">
            <button
              type="button"
              class="account__link"
              @click="mode = 'login'"
            >
              Voltar
            </button>
          </div>
        </template>

        <!-- RESET (token + senha nova) -->
        <template v-else>
          <p class="account__hint">
            Cole o token de reset e defina a senha nova (mín. 8 caracteres).
          </p>
          <input
            v-model="resetToken"
            type="text"
            class="account__input"
            :placeholder="t('media.account.resetToken')"
            autocomplete="one-time-code"
          >
          <input
            v-model="password"
            type="password"
            class="account__input"
            :placeholder="t('media.account.newPasswordMin8')"
            autocomplete="new-password"
          >
          <button
            type="submit"
            class="account__submit"
            :disabled="!isValid || busy"
          >
            Trocar senha
          </button>
          <div class="account__row">
            <button
              type="button"
              class="account__link"
              @click="mode = 'login'"
            >
              Voltar
            </button>
          </div>
        </template>
      </form>
    </template>
  </div>
</template>

<style scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem;
  border-radius: var(--ds-radius-md, 8px);
  background: var(--ds-color-surface-container, rgba(255, 255, 255, 0.05));
}

.account__logged {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.account__name {
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account__link {
  border: none;
  background: none;
  color: var(--ds-color-primary, #2196f3);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  text-align: left;
}

.account__link:hover {
  background: rgba(33, 150, 243, 0.12);
}

.account__form {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.account__input {
  width: 100%;
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
}

.account__submit {
  padding: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid var(--ds-color-primary, #2196f3);
  border-radius: 6px;
  background: var(--ds-color-primary, #2196f3);
  color: #fff;
  cursor: pointer;
}

.account__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.account__row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.account__hint {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.75;
  line-height: 1.35;
}
</style>
