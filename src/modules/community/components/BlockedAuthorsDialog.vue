<script setup lang="ts">
/**
 * Lista de autores bloqueados, com desbloqueio (App Store 1.2).
 * Abre a partir da barra da Comunidade; recarrega a lista ao fechar.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { authTokenAsync } from '@modules/media/services/auth-client'

import { type BlockedAuthor, listBlockedAuthors, unblockAuthor } from '../services/blocks'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [changed: boolean] }>()
const { t } = useI18n()

const authors = ref<BlockedAuthor[] | null>(null)
const failed = ref(false)
const busyId = ref<number | null>(null)
const changed = ref(false)

async function load(): Promise<void> {
  authors.value = null
  failed.value = false
  const list = await listBlockedAuthors(await authTokenAsync())
  if (list === null) failed.value = true
  else authors.value = list
}

watch(
  () => props.open,
  open => {
    if (open) {
      changed.value = false
      void load()
    }
  },
  { immediate: true },
)

async function unblock(author: BlockedAuthor): Promise<void> {
  if (busyId.value !== null) return
  busyId.value = author.id
  try {
    if (await unblockAuthor(author.id, await authTokenAsync())) {
      authors.value = (authors.value ?? []).filter(a => a.id !== author.id)
      changed.value = true
    } else {
      failed.value = true
    }
  } finally {
    busyId.value = null
  }
}

function close(): void {
  emit('close', changed.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="blocked-dialog" role="dialog" aria-modal="true" :aria-label="t('community.blockedUsers')">
      <div class="blocked-dialog__backdrop" aria-hidden="true" @click="close" />
      <div class="blocked-dialog__panel">
        <h2 class="blocked-dialog__title">
          <i class="ti ti-user-off" aria-hidden="true" />
          {{ t('community.blockedUsers') }}
        </h2>
        <p v-if="failed" class="blocked-dialog__error" data-test="blocked-error">{{ t('community.blockedLoadError') }}</p>
        <p v-else-if="authors === null" class="blocked-dialog__hint">…</p>
        <p v-else-if="authors.length === 0" class="blocked-dialog__hint" data-test="blocked-empty">{{ t('community.blockedEmpty') }}</p>
        <ul v-else class="blocked-dialog__list">
          <li v-for="author in authors" :key="author.id" class="blocked-dialog__item">
            <span>{{ author.name || t('community.blockedNoName') }}</span>
            <button
              type="button"
              class="blocked-dialog__unblock"
              :data-test="`unblock-${author.id}`"
              :disabled="busyId !== null"
              @click="unblock(author)"
            >
              {{ t('community.unblock') }}
            </button>
          </li>
        </ul>
        <div class="blocked-dialog__actions">
          <button type="button" class="blocked-dialog__close" @click="close">{{ t('community.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.blocked-dialog { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
.blocked-dialog__backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 45%); }
.blocked-dialog__panel { position: relative; z-index: 1; width: 100%; max-width: 26rem; padding: 1.5rem; border-radius: var(--ds-radius-lg, 0.75rem 0 0.75rem 0); border: 1px solid var(--ds-color-outline-strong, rgb(255 255 255 / 8%)); background: var(--ds-color-surface-elevated, #1e1e1e); box-shadow: 0 24px 48px rgb(0 0 0 / 40%); }
.blocked-dialog__title { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.75rem; color: var(--ds-color-on-surface); font-size: 18px; font-weight: 600; }
.blocked-dialog__hint { margin: 0; color: var(--ds-color-on-surface-variant); font-size: 14px; }
.blocked-dialog__error { margin: 0; color: var(--ds-color-error); font-size: 14px; }
.blocked-dialog__list { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.blocked-dialog__item { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; color: var(--ds-color-on-surface); }
.blocked-dialog__unblock, .blocked-dialog__close { padding: 0.4rem 0.8rem; border-radius: 0.5rem; border: 1px solid var(--ds-color-outline-strong, rgb(255 255 255 / 20%)); background: transparent; color: var(--ds-color-on-surface); font: inherit; cursor: pointer; }
.blocked-dialog__unblock:disabled { opacity: 0.55; cursor: not-allowed; }
.blocked-dialog__actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
</style>
