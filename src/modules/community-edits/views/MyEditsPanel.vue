<script setup lang="ts">
/**
 * Minhas Edições (PLAN §1.2) — lista os edits locais do autor com status.
 * Status do servidor (approved/rejected + motivo) vence o local quando existe.
 * Publicar emite 'publish' (o parent chama publishEdit com a sessão real).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { listLocalEdits, type LocalEdit } from '../services/local-edits-store';

export type ServerEditStatus = { musicId: number; status: string; reason?: string | null };

const props = defineProps<{ serverStatuses: ServerEditStatus[] }>();
const emit = defineEmits<{ publish: [musicId: number] }>();
const { t } = useI18n();

const serverByMusic = computed(() => {
  const map = new Map<number, ServerEditStatus>();
  for (const s of props.serverStatuses) map.set(s.musicId, s);
  return map;
});

const edits = computed(() => listLocalEdits());

function effectiveStatus(edit: LocalEdit): { label: string; reason?: string | null } {
  const server = serverByMusic.value.get(edit.musicId);
  if (server) return { label: server.status, reason: server.reason ?? null };
  return { label: edit.status };
}
</script>

<template>
  <div class="my-edits" data-testid="my-edits">
    <p v-if="edits.length === 0" data-testid="edits-empty" class="my-edits__empty">
      {{ t('community.edits.empty', 'Nenhuma edição ainda') }}
    </p>
    <ul v-else class="my-edits__list">
      <li
        v-for="edit in edits"
        :key="edit.musicId"
        :data-testid="`edit-item-${edit.musicId}`"
        class="my-edits__item"
      >
        <span class="my-edits__music">#{{ edit.musicId }}</span>
        <span class="my-edits__status" :class="`my-edits__status--${effectiveStatus(edit).label}`">
          {{ effectiveStatus(edit).label }}
        </span>
        <span v-if="effectiveStatus(edit).reason" class="my-edits__reason">
          {{ effectiveStatus(edit).reason }}
        </span>
        <button
          v-if="effectiveStatus(edit).label === 'draft'"
          type="button"
          :data-testid="`edit-publish-${edit.musicId}`"
          class="my-edits__publish"
          @click="emit('publish', edit.musicId)"
        >
          {{ t('community.edits.publish', 'Publicar') }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.my-edits__empty { opacity: 0.7; }
.my-edits__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.my-edits__item { display: flex; align-items: center; gap: 0.75rem; }
.my-edits__status--rejected { color: var(--danger, #e5484d); }
.my-edits__status--approved { color: var(--success, #30a46c); }
.my-edits__reason { opacity: 0.8; font-size: 0.875rem; }
</style>
