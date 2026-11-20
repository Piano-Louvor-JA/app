<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/** Nome da TV no Palco: a TV guarda e repete ao reconectar. */
const props = defineProps<{ open: boolean; current: string }>()
const emit = defineEmits<{ confirm: [name: string]; cancel: [] }>()
const { t } = useI18n()

const name = ref('')
const input = ref<HTMLInputElement | null>(null)
const valid = computed(() => Boolean(name.value.trim()) && name.value.trim() !== props.current)

watch(() => props.open, async (open) => {
  if (!open) return
  name.value = props.current
  await nextTick()
  input.value?.select()
}, { immediate: true })

function submit() {
  if (valid.value) emit('confirm', name.value.trim())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="palco-rename" role="dialog" aria-modal="true" aria-labelledby="palco-rename-title"
      @keydown.esc="emit('cancel')">
      <div class="palco-rename__backdrop" aria-hidden="true" @click="emit('cancel')" />
      <form class="palco-rename__panel" @submit.prevent="submit">
        <p id="palco-rename-title" class="palco-rename__title">{{ t('settings.palcoTvs.rename.title') }}</p>
        <input ref="input" v-model="name" type="text" maxlength="40" data-test="palco-rename-input"
          :placeholder="t('settings.palcoTvs.rename.placeholder')">
        <div class="palco-rename__actions">
          <button type="button" class="palco-rename__btn" data-test="palco-rename-cancel" @click="emit('cancel')">
            {{ t('common.cancel') }}
          </button>
          <button type="submit" class="palco-rename__btn palco-rename__btn--primary" data-test="palco-rename-confirm"
            :disabled="!valid">
            {{ t('settings.palcoTvs.rename.save') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.palco-rename {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;

  &__backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.45); }

  &__panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(26rem, calc(100% - 2rem));
    padding: 1.25rem;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 1rem 0 1rem 0;
    background: #2a2a2a;
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.5);
  }

  &__title { margin: 0; color: #fff; font-size: 1rem; font-weight: 500; }

  input {
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: var(--ds-color-surface, #171717);
    color: #fff;
    font: inherit;

    &:focus { outline: 1px solid var(--ds-color-primary); }
  }

  &__actions { display: flex; justify-content: flex-end; gap: 10px; }

  &__btn {
    padding: 0.45rem 1.1rem;
    border: none;
    border-radius: 999px;
    background: color-mix(in srgb, #a0a0a0 55%, #2a2a2a);
    color: #1a1a1a;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;

    &--primary { background: var(--ds-color-primary, #2196f3); color: #fff; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
}
</style>
