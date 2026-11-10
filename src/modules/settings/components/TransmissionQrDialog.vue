<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'

const props = defineProps<{ url: string | null; title: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const image = ref('')
let generation = 0

watch(() => props.url, async (url) => {
  const current = ++generation
  image.value = ''
  if (!url) return
  try {
    const data = await QRCode.toDataURL(url, { margin: 1, width: 280 })
    if (current === generation) image.value = data
  } catch {
    /* link longo demais para QR: o texto do link continua visível */
  }
}, { immediate: true })

function onKey(event: KeyboardEvent) {
  if (props.url && event.key === 'Escape') emit('close')
}
window.addEventListener('keydown', onKey)
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="url" class="transmission-qr" role="dialog" aria-modal="true" :aria-label="title">
      <div class="transmission-qr__backdrop" aria-hidden="true" @click="emit('close')" />
      <div class="transmission-qr__panel">
        <p class="transmission-qr__title">{{ title }}</p>
        <img v-if="image" class="transmission-qr__image" :src="image" alt="" width="280" height="280">
        <p class="transmission-qr__hint">{{ t('settings.transmission.qrHint') }}</p>
        <code class="transmission-qr__url">{{ url }}</code>
        <button type="button" class="transmission-qr__close" data-test="qr-close" @click="emit('close')">
          {{ t('settings.transmission.close') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.transmission-qr {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;

  &__backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.6); }

  &__panel {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: min(22rem, 100%);
    padding: 1.25rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 1rem;
    background: var(--ds-color-surface, #171717);
    color: var(--ds-color-on-surface);
  }

  &__title { margin: 0; font-weight: 600; text-align: center; }
  &__image { width: 280px; max-width: 100%; height: auto; border-radius: 0.5rem; background: #fff; }
  &__hint { margin: 0; color: var(--ds-color-on-surface-variant); font-size: 0.82rem; text-align: center; }
  &__url { max-width: 100%; font-size: 0.75rem; word-break: break-all; text-align: center; }

  &__close {
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
}
</style>
