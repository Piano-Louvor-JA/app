<script setup lang="ts">
import { toRef } from 'vue'
import { useLibrasLyrics } from '../composables/useLibrasLyrics'

/**
 * Player Libras (SPEC fatia 3, fallback (c)): gloss textual + datilologia.
 * - Renderiza SOMENTE em `ready`. disabled/loading/unavailable = nada (degradação silenciosa, SPEC §7).
 * - Não carrega scripts/Widgets/assets remotos — fallback textual do spike.
 * - Aviso de tradução automática; original permanece no player principal.
 */
const props = defineProps<{ lyrics: string | null }>()

const lyricsRef = toRef(props, 'lyrics')
const { state, gloss } = useLibrasLyrics(lyricsRef)
</script>

<template>
  <section
    v-if="state === 'ready' && gloss"
    data-testid="libras-player"
    role="region"
    aria-label="Libras — tradução automática da letra"
  >
    <p data-testid="libras-auto-notice">Tradução automática — Libras</p>
    <p data-testid="libras-gloss" aria-live="polite">{{ gloss }}</p>
  </section>
</template>