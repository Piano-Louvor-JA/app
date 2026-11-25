<script setup lang="ts">
import { computed } from 'vue'
import { signPackStore } from '../sign-pack-store'

/**
 * SignPlayer — F1.3 (SPEC-libras-v2.0.0): reproduz sequência de sinais do
 * Sign Pack ativo (vídeos) com fallback fingerspelling transparente.
 * v1 (esta): terms → fila visual termo-a-termo (vídeo quando existir);
 * reprodução contínua automática fica para F1.3b (queue <video> real).
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
      Sinal não encontrado no dicionário — datilologia
    </p>
  </section>
</template>
