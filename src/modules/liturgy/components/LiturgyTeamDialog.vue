<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LiturgyItem } from '../types/liturgy'

const props = defineProps<{ open: boolean; items: LiturgyItem[] }>()
const emit = defineEmits<{ close: []; save: [assignments: Record<string, string>] }>()
const { t } = useI18n()
const titleId = useId()
const dialog = ref<HTMLDialogElement | null>(null)
const assignments = ref<Record<string, string>>({})
const moments = computed(() => props.items.filter(item => item.type !== 'category'))

watch(() => props.open, async (open) => {
  if (open) {
    assignments.value = Object.fromEntries(moments.value.map(item => [item.id, item.responsible ?? '']))
    await nextTick()
    if (props.open && !dialog.value?.open) dialog.value?.showModal()
  } else if (dialog.value?.open) {
    dialog.value.close()
  }
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="team-dialog" :aria-labelledby="titleId" @cancel.prevent="emit('close')" @close="emit('close')">
      <form @submit.prevent="emit('save', { ...assignments })">
        <header>
          <div>
            <h2 :id="titleId">{{ t('liturgy.team.title') }}</h2>
            <p>{{ t('liturgy.team.description') }}</p>
          </div>
          <button type="button" class="team-dialog__close" :aria-label="t('liturgy.actions.cancel')" @click="emit('close')">×</button>
        </header>
        <div class="team-dialog__moments">
          <p v-if="!moments.length" role="status">{{ t('liturgy.team.noMoments') }}</p>
          <label v-for="(item, index) in moments" :key="item.id" class="team-dialog__moment">
            <span><small>{{ index + 1 }} · {{ t(`liturgy.types.${item.type}`) }}</small><strong>{{ item.name }}</strong></span>
            <span class="team-dialog__field">
              <span>{{ t('liturgy.team.responsible') }}</span>
              <input v-model="assignments[item.id]" type="text" maxlength="120" :placeholder="t('liturgy.team.placeholder')">
            </span>
          </label>
        </div>
        <footer>
          <button type="button" @click="emit('close')">{{ t('liturgy.actions.cancel') }}</button>
          <button type="submit" class="team-dialog__save" :disabled="!moments.length">{{ t('liturgy.actions.save') }}</button>
        </footer>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.team-dialog { width: min(44rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); margin: auto; padding: 0; color: var(--ds-color-on-surface); background: var(--ds-color-surface); border: 1px solid var(--ds-color-outline); border-radius: 1.25rem; box-shadow: 0 1.5rem 5rem #0006; }
.team-dialog::backdrop { background: #0009; backdrop-filter: blur(4px); }
form { display: flex; flex-direction: column; max-height: calc(100dvh - 2rem); }
header, footer { flex-shrink: 0; display: flex; justify-content: space-between; gap: 1rem; padding: 1.25rem 1.5rem; }
header { border-bottom: 1px solid var(--ds-color-outline); align-items: flex-start; }
h2 { margin: 0; font-size: 1.25rem; }
p { margin: .5rem 0 0; font-size: .85rem; color: var(--ds-color-on-surface-variant); line-height: 1.5; }
.team-dialog__moments { overflow-y: auto; padding: .5rem 1.5rem; }
.team-dialog__moment { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 1rem; padding: 1rem 0; }
.team-dialog__moment + .team-dialog__moment { border-top: 1px solid var(--ds-color-outline); }
.team-dialog__moment > span { min-width: 0; display: grid; gap: .35rem; overflow-wrap: anywhere; }
small, .team-dialog__field > span { font-size: .75rem; color: var(--ds-color-on-surface-variant); }
input { width: 100%; min-width: 0; min-height: 2.75rem; border: 1px solid var(--ds-color-outline); border-radius: .6rem; padding: .65rem .8rem; background: transparent; color: inherit; font: inherit; font-size: .85rem; }
footer { border-top: 1px solid var(--ds-color-outline); justify-content: flex-end; }
button { min-height: 2.5rem; padding: .5rem 1rem; border: 1px solid var(--ds-color-outline); border-radius: .6rem; background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: .85rem; }
.team-dialog__close { font-size: 1.5rem; padding: .1rem .75rem; }
.team-dialog__save { background: var(--ds-color-primary); color: var(--ds-color-on-primary); border-color: transparent; }
button:disabled { opacity: .5; cursor: not-allowed; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--ds-color-primary); outline-offset: 2px; }
@media (max-width: 560px) { .team-dialog__moment { grid-template-columns: 1fr; gap: .6rem; } }
</style>
