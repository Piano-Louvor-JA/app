<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppConfirm from '@shared/components/AppConfirm.vue'
import SettingsToggle from './SettingsToggle.vue'
import { palcoSession } from '../services/palco-session'
import type { TransmissionBind, TransmissionInfo } from '../types/transmission'

defineProps<{ locked: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()

const info = ref<TransmissionInfo | null>(null)
const busy = ref(false)
const error = ref('')
const confirmingToken = ref(false)

const selectedBind = computed(() => (info.value?.missing ? 'all' : info.value?.bind))

async function load() {
  try { info.value = await palcoSession.transmission() } catch { /* mantém o último estado lido */ }
}

async function save(changes: { bind?: TransmissionBind; requireToken?: boolean }) {
  busy.value = true
  error.value = ''
  try {
    const result = await palcoSession.setTransmission(changes)
    if (!result) error.value = t('settings.transmission.network.failed')
    else if (!result.ok) error.value = t('settings.transmission.network.locked')
    else emit('changed')
  } catch {
    error.value = t('settings.transmission.network.failed')
  } finally {
    await load()
    busy.value = false
  }
}

async function renewToken() {
  confirmingToken.value = false
  busy.value = true
  error.value = ''
  try {
    if (await palcoSession.resetToken()) emit('changed')
    else error.value = t('settings.transmission.network.failed')
  } catch {
    error.value = t('settings.transmission.network.failed')
  } finally {
    await load()
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section v-if="info" class="transmission-network" aria-labelledby="transmission-network-title">
    <h2 id="transmission-network-title" class="transmission-network__title">{{ t('settings.transmission.network.title') }}</h2>

    <label class="transmission-network__row">
      <span class="transmission-network__label">{{ t('settings.transmission.network.bind') }}</span>
      <select data-test="bind" :value="selectedBind" :disabled="locked || busy"
        @change="save({ bind: ($event.target as HTMLSelectElement).value })">
        <option value="all">{{ t('settings.transmission.network.all') }}</option>
        <option value="local">{{ t('settings.transmission.network.local') }}</option>
        <option v-for="option in info.interfaces" :key="option.address" :value="option.address">
          {{ option.name }} · {{ option.address }}
        </option>
      </select>
    </label>
    <small v-if="locked" class="transmission-network__hint">{{ t('settings.transmission.network.locked') }}</small>
    <small v-if="info.missing" class="transmission-network__warning">{{ t('settings.transmission.network.missing') }}</small>
    <small v-if="info.bind === 'local'" class="transmission-network__warning">{{ t('settings.transmission.network.localWarning') }}</small>

    <div class="transmission-network__row">
      <span class="transmission-network__label">
        {{ t('settings.transmission.network.requireToken') }}
        <small class="transmission-network__hint">{{ t('settings.transmission.network.requireTokenHint') }}</small>
      </span>
      <SettingsToggle :model-value="info.requireToken" :label="t('settings.transmission.network.requireToken')"
        @update:model-value="save({ requireToken: $event })" />
    </div>

    <div v-if="info.requireToken" class="transmission-network__row">
      <span class="transmission-network__label">
        {{ t('settings.transmission.network.token') }}
        <code class="transmission-network__token" data-test="token">{{ info.token }}</code>
      </span>
      <button type="button" class="transmission-network__button" data-test="new-token" :disabled="busy" @click="confirmingToken = true">
        <i class="ti ti-refresh" aria-hidden="true" /> {{ t('settings.transmission.network.newToken') }}
      </button>
    </div>

    <p v-if="error" class="transmission-network__error" role="alert">{{ error }}</p>

    <AppConfirm :open="confirmingToken" :z-index="120"
      :title="t('settings.transmission.network.newTokenTitle')"
      :message="t('settings.transmission.network.newTokenMessage')"
      :confirm-label="t('settings.transmission.network.newTokenConfirm')"
      :cancel-label="t('common.cancel')" @cancel="confirmingToken = false" @confirm="renewToken" />
  </section>
</template>

<style scoped lang="scss">
.transmission-network {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;

  &__title { margin: 0; color: var(--ds-color-on-surface); font-size: 1.1rem; font-weight: 600; }
  &__row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.6rem 1rem; padding: 0.4rem 0; }
  &__label { display: flex; flex-direction: column; gap: 0.2rem; color: var(--ds-color-on-surface); }
  &__hint { color: var(--ds-color-on-surface-variant); font-size: 0.78rem; }
  &__warning { color: #ffcc80; font-size: 0.8rem; }
  &__error { margin: 0; color: #ffb4ab; font-size: 0.85rem; }
  &__token { align-self: flex-start; padding: 0.2rem 0.5rem; border-radius: 0.35rem; background: color-mix(in srgb, #000 25%, transparent); letter-spacing: 0.15em; }

  select {
    min-width: 14rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: var(--ds-color-surface, #171717);
    color: inherit;

    &:disabled { opacity: 0.6; }
  }

  &__button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    cursor: pointer;

    &:hover:not(:disabled) { background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent); }
    &:disabled { opacity: 0.55; cursor: not-allowed; }
  }
}
</style>
