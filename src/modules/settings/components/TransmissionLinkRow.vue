<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ label: string; hint: string; url: string; primary?: boolean }>()
const emit = defineEmits<{ qr: [url: string] }>()
const { t } = useI18n()

const copied = ref(false)
let resetCopied: ReturnType<typeof setTimeout> | null = null

function copy() {
  void navigator.clipboard?.writeText(props.url)
  copied.value = true
  if (resetCopied) clearTimeout(resetCopied)
  resetCopied = setTimeout(() => { copied.value = false }, 2000)
}

function open() {
  window.open(props.url, '_blank', 'noopener')
}

onUnmounted(() => { if (resetCopied) clearTimeout(resetCopied) })
</script>

<template>
  <div class="transmission-link" :class="{ 'transmission-link--primary': primary }">
    <div class="transmission-link__head">
      <strong class="transmission-link__label">{{ label }}</strong>
      <small class="transmission-link__hint">{{ hint }}</small>
    </div>
    <div class="transmission-link__row">
      <code class="transmission-link__url">{{ url }}</code>
      <button type="button" class="transmission-link__action" data-test="copy"
        :aria-label="t('settings.transmission.copyLabel', { name: label })" @click="copy">
        <i class="ti" :class="copied ? 'ti-check' : 'ti-copy'" aria-hidden="true" />{{ copied ? t('settings.transmission.copied') : t('settings.transmission.copy') }}
      </button>
      <button type="button" class="transmission-link__action" data-test="qr"
        :aria-label="t('settings.transmission.qrLabel', { name: label })" @click="emit('qr', url)">
        <i class="ti ti-qrcode" aria-hidden="true" />{{ t('settings.transmission.qr') }}
      </button>
      <button type="button" class="transmission-link__action" data-test="open"
        :aria-label="t('settings.transmission.openLabel', { name: label })" @click="open">
        <i class="ti ti-external-link" aria-hidden="true" />{{ t('settings.transmission.open') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.transmission-link {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.65rem;

  &--primary {
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 7%, transparent);
  }

  &__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.6rem; }
  &__label { color: var(--ds-color-on-surface); font-size: 0.9rem; }
  &__hint { color: var(--ds-color-on-surface-variant); font-size: 0.78rem; }
  &__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; }

  &__url {
    flex: 1 1 16rem;
    min-width: 0;
    padding: 0.5rem 0.7rem;
    overflow-x: auto;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: color-mix(in srgb, #000 25%, transparent);
    font-size: 0.82rem;
    white-space: nowrap;
  }

  &__action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    font-size: 0.82rem;
    cursor: pointer;

    &:hover { background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent); }
  }
}
</style>
