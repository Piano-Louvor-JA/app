<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ObsKind } from '../services/obs-connections'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ confirm: [name: string, kind: ObsKind]; cancel: [] }>()
const { t } = useI18n()

const name = ref('')
const kind = ref<ObsKind | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const valid = computed(() => Boolean(name.value.trim()) && kind.value !== null)

const kinds = computed(() => [
  { id: 'mirror' as const, label: t('settings.transmission.replica'), hint: t('settings.transmission.replicaHint') },
  { id: 'return' as const, label: t('settings.transmission.stageReturn'), hint: t('settings.transmission.stageReturnHint') },
])

watch(() => props.open, async (open) => {
  if (!open) return
  name.value = ''
  kind.value = null
  await nextTick()
  nameInput.value?.focus()
}, { immediate: true })

function submit() {
  if (valid.value && kind.value) emit('confirm', name.value.trim(), kind.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="transmission-add" role="dialog" aria-modal="true" aria-labelledby="transmission-add-title"
      @keydown.esc="emit('cancel')">
      <div class="transmission-add__backdrop" aria-hidden="true" @click="emit('cancel')" />
      <form class="transmission-add__panel" @submit.prevent="submit">
        <p id="transmission-add-title" class="transmission-add__title">{{ t('settings.transmission.addDialog.title') }}</p>
        <label class="transmission-add__field">
          <span class="transmission-add__label">{{ t('settings.transmission.addDialog.name') }}</span>
          <input ref="nameInput" v-model="name" type="text" maxlength="60" data-test="add-name"
            :placeholder="t('settings.transmission.addDialog.namePlaceholder')" @keydown.enter.prevent="submit">
        </label>
        <div class="transmission-add__field">
          <span id="transmission-add-kind" class="transmission-add__label">{{ t('settings.transmission.addDialog.kind') }}</span>
          <div class="transmission-add__kinds" role="radiogroup" aria-labelledby="transmission-add-kind">
            <button v-for="option in kinds" :key="option.id" type="button" role="radio" class="transmission-add__kind"
              :class="{ 'transmission-add__kind--on': kind === option.id }" :aria-checked="kind === option.id"
              :data-test="`add-kind-${option.id}`" @click="kind = option.id">
              <strong>{{ option.label }}</strong>
              <small>{{ option.hint }}</small>
            </button>
          </div>
        </div>
        <div class="transmission-add__actions">
          <button type="button" class="transmission-add__btn" data-test="add-cancel" @click="emit('cancel')">
            {{ t('settings.transmission.addDialog.cancel') }}
          </button>
          <button type="submit" class="transmission-add__btn transmission-add__btn--primary" data-test="add-confirm" :disabled="!valid">
            {{ t('settings.transmission.addDialog.confirm') }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.transmission-add {
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
    width: min(32rem, calc(100% - 2rem));
    padding: 1.25rem;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 1rem 0 1rem 0;
    background: #2a2a2a;
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.5);
  }

  &__title { margin: 0; color: #fff; font-size: 1rem; font-weight: 500; }
  &__field { display: flex; flex-direction: column; gap: 0.4rem; }
  &__label { color: rgb(255 255 255 / 0.78); font-size: 0.85rem; font-weight: 600; }

  &__field input {
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: var(--ds-color-surface, #171717);
    color: #fff;
    font: inherit;

    &:focus { outline: 1px solid var(--ds-color-primary); }
  }

  &__kinds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }

  &__kind {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.6rem;
    background: transparent;
    color: #fff;
    text-align: left;
    cursor: pointer;

    small { color: rgb(255 255 255 / 0.65); font-size: 0.75rem; line-height: 1.35; }
    &:hover { background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent); }

    &--on {
      border-color: var(--ds-color-primary);
      background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    }
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

@media (max-width: 600px) {
  .transmission-add__kinds { grid-template-columns: 1fr; }
}
</style>
