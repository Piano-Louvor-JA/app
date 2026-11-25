<script setup lang="ts">
import { computed } from 'vue'
import { signPackStore } from '../sign-pack-store'

/**
 * SignPlayer — F1.3: reproduz sinais do pack ativo.
 * v1 (vídeos) mantém compat; avatar 3D é papel do AvatarRenderer (v2.1).
 */
const props = defineProps<{ terms: string[] }>()

const entries = computed(() =>
  props.terms
    .map((term) => ({ term, entry: signPackStore.resolve(term) }))
    .filter((t): t is { term: string; entry: NonNullable<ReturnType<typeof signPackStore.resolve>> } => t.entry !== null),
)

const current = computed(() => entries.value[0] ?? null)
</script>

<template>
  <section
    v-if="entries.length"
    data-testid="sign-player"
    role="region"
    aria-label="Intérprete de sinais — tradução automática"
  >
    <p data-testid="sign-auto-notice">Tradução automática — dicionário comunitário</p>

    <video
      v-if="current?.entry.video?.url"
      :src="current.entry.video.url"
      data-testid="sign-video"
      controls
      playsinline
    />
    <p v-else data-testid="sign-fingerspelling" aria-live="polite">
      {{ current?.term }}
    </p>

    <p v-if="current?.entry.fingerspelling" data-testid="sign-fingerspelling-hint">
      Sinal não encontrado no dicionário — datitologia
    </p>
  </section>
</template>
