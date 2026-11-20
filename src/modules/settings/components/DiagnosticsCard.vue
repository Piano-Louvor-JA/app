<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge } from '@shared/services/desktop-bridge'

const { t } = useI18n()

type RunResult = { report: unknown; jsonPath: string; txtPath: string }

const running = ref(false)
const result = ref<RunResult | null>(null)
const error = ref('')
const sendMessage = ref('')
const bridge = getDesktopBridge()
const available = computed(() => Boolean(bridge?.diagnostics))

async function run(): Promise<void> {
  if (!bridge?.diagnostics) return
  running.value = true
  result.value = null
  error.value = ''
  sendMessage.value = ''
  try {
    result.value = await bridge.diagnostics.run()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    running.value = false
  }
}

async function send(): Promise<void> {
  if (!bridge?.diagnostics || !result.value) return
  try {
    // report é Proxy do Vue — IPC estruturado não clona Proxy; JSON round-trip gera plain object
    const plain = JSON.parse(JSON.stringify(result.value.report))
    const response = await bridge.diagnostics.send(plain)
    sendMessage.value = response.ok
      ? t('settings.general.diagnosticsSendOk')
      : `${t('settings.general.diagnosticsSendFail')} ${response.reason ?? ''}`
  } catch (cause) {
    sendMessage.value = `${t('settings.general.diagnosticsSendFail')} ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
}

function openFolder(): void {
  if (result.value) void bridge?.diagnostics?.openFolder(result.value.jsonPath)
}
</script>

<template>
  <GlassCard class="general-settings__card" elevated>
    <div class="general-settings__accent" aria-hidden="true" />

    <div class="general-settings__header">
      <div class="general-settings__heading">
        <i class="ti ti-stethoscope general-settings__icon" aria-hidden="true" />
        <h3 class="general-settings__title">
          {{ t('settings.general.diagnosticsTitle') }}
        </h3>
      </div>
    </div>

    <p class="general-settings__hint">
      {{ t('settings.general.diagnosticsHint') }}
    </p>

    <button
      type="button"
      class="general-settings__btn general-settings__btn--primary"
      :disabled="!available || running"
      @click="run"
    >
      <i class="ti ti-playstation-square" aria-hidden="true" />
      {{ running ? t('settings.general.diagnosticsRunning') : t('settings.general.diagnosticsRun') }}
    </button>

    <p v-if="!available" class="general-settings__status general-settings__status--info">
      <i class="ti ti-info-circle" aria-hidden="true" />
      {{ t('settings.general.diagnosticsDesktopOnly') }}
    </p>
    <p v-if="running" class="general-settings__status general-settings__status--info">
      <i class="ti ti-loader" aria-hidden="true" />
      {{ t('settings.general.diagnosticsProgress') }}
    </p>
    <p v-if="error" class="general-settings__status general-settings__status--error">
      <i class="ti ti-alert-circle" aria-hidden="true" />
      {{ error }}
    </p>

    <template v-if="result">
      <p class="general-settings__status general-settings__status--success">
        <i class="ti ti-circle-check" aria-hidden="true" />
        {{ t('settings.general.diagnosticsDone') }}
      </p>
      <code class="general-settings__path">{{ result.jsonPath }}</code>

      <div class="general-settings__actions">
        <button type="button" class="general-settings__btn" @click="send">
          <i class="ti ti-send" aria-hidden="true" />
          {{ t('settings.general.diagnosticsSend') }}
        </button>
        <button type="button" class="general-settings__btn" @click="openFolder">
          <i class="ti ti-folder" aria-hidden="true" />
          {{ t('settings.general.diagnosticsOpenFolder') }}
        </button>
      </div>
      <p v-if="sendMessage" class="general-settings__status general-settings__status--info">
        {{ sendMessage }}
      </p>
    </template>
  </GlassCard>
</template>

<style scoped>
/* card de diagnóstico — espelha as classes general-settings do GeneralView */
.general-settings__card { position: relative; overflow: hidden; }
.general-settings__accent { position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--ds-color-primary); opacity: 0.8; }
.general-settings__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.general-settings__heading { display: flex; align-items: center; gap: 0.75rem; }
.general-settings__icon { font-size: 28px; line-height: 1; color: var(--ds-color-primary); }
.general-settings__title { margin: 0; color: var(--ds-color-on-surface); font-size: 1.25rem; font-weight: 700; }
.general-settings__hint { margin: 0 0 1rem; color: var(--ds-color-on-surface-variant); font-size: 0.875rem; line-height: 1.5; opacity: 0.85; }
.general-settings__btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.5rem; border: none; border-radius: var(--ds-radius-full); font-size: 14px; font-weight: 600; line-height: 20px; cursor: pointer; transition: background-color 200ms ease, transform 150ms ease, opacity 150ms ease; }
.general-settings__btn .ti { font-size: 20px; line-height: 1; }
.general-settings__btn:active:not(:disabled) { transform: scale(0.96); }
.general-settings__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.general-settings__btn--primary { border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent); background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent); color: var(--ds-color-primary); }
.general-settings__btn--primary:hover:not(:disabled) { background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent); }
.general-settings__status { display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0 0; font-size: 0.875rem; font-weight: 500; }
.general-settings__status .ti { font-size: 18px; line-height: 1; }
.general-settings__status--success { color: #4caf50; }
.general-settings__status--error { color: rgb(var(--v-theme-error)); }
.general-settings__status--info { color: var(--ds-color-on-surface-variant); opacity: 0.8; }
.general-settings__actions { display: flex; flex-wrap: wrap; gap: 0.625rem; margin-top: 0.75rem; }
.general-settings__path { display: block; margin-top: 0.5rem; overflow-wrap: anywhere; font-size: 0.75rem; color: var(--ds-color-on-surface-variant); }
</style>
