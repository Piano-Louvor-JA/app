<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { palcoSession } from '../services/palco-session'
import SettingsToggle from './SettingsToggle.vue'
import TransmissionAudioOptions from './TransmissionAudioOptions.vue'

/**
 * "Áudio e comportamento" das conexões: onde o áudio toca e se as conexões
 * voltam ao reabrir o app. Mesmo bloco na Transmissão e no Palco.
 */
const emit = defineEmits<{ error: [message: string] }>()
const { t } = useI18n()

const preserve = ref(false)
async function changePreserve(enabled: boolean) {
  emit('error', '')
  try { preserve.value = await palcoSession.setConnectionPersistence(enabled) }
  catch { emit('error', t('settings.transmission.behavior.preserveFailed')) }
}

onMounted(() => {
  void palcoSession.getConnectionPersistence().then((enabled) => { preserve.value = enabled }).catch(() => {})
})
</script>

<template>
  <section class="transmission-behavior" aria-labelledby="transmission-behavior-title">
    <h2 id="transmission-behavior-title" class="transmission-behavior__title">{{ t('settings.transmission.behavior.title') }}</h2>
    <TransmissionAudioOptions />
    <div class="transmission-behavior__row">
      <span class="transmission-behavior__label">
        {{ t('settings.transmission.behavior.preserve') }}
        <small class="transmission-behavior__hint">{{ t('settings.transmission.behavior.preserveHint') }}</small>
      </span>
      <SettingsToggle data-test="preserve-connections" :model-value="preserve"
        :label="t('settings.transmission.behavior.preserve')" @update:model-value="changePreserve" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.transmission-behavior {
  padding-top: 1rem;
  border-top: 1px solid var(--ds-color-outline);

  &__title { margin: 0; color: var(--ds-color-on-surface); font-size: 1.1rem; font-weight: 600; }
  &__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; }
  &__label { display: flex; flex-direction: column; gap: 0.2rem; color: var(--ds-color-on-surface); }
  &__hint { color: var(--ds-color-on-surface-variant); font-size: 0.78rem; }
}
</style>
