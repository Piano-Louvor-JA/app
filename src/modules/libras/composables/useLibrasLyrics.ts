import { computed, ref, watch, type Ref } from 'vue'
import type { LibrasState } from '../types'
import { normalizeLyrics } from '../types'
import { isLibrasEnabled } from '../services/libras-preferences'
import { getLibrasGloss } from '../services/libras-translate'

/**
 * Observa somente a letra atual do player (SPEC fatia 2).
 * - desligado (default false): estado disabled, zero trabalho.
 * - letra null/vazia: disabled.
 * - cache→API→fallback; falha total → unavailable, nunca lança.
 * - troca de letra invalida render anterior via token monotônico.
 */
export function useLibrasLyrics(lyrics: Ref<string | null>) {
  const state = ref<LibrasState>('disabled')
  const gloss = ref<string | null>(null)

  const enabled = computed(() => isLibrasEnabled())

  let lastRequestedKey: string | null = null
  let token = 0

  async function run(rawLyrics: string, myToken: number): Promise<void> {
    const key = normalizeLyrics(rawLyrics)
    if (key === lastRequestedKey) return
    lastRequestedKey = key
    state.value = 'loading'
    try {
      const result = await getLibrasGloss(rawLyrics)
      if (myToken !== token) return // stale
      if (result.gloss) {
        gloss.value = result.gloss
        state.value = 'ready'
      } else {
        gloss.value = null
        state.value = 'unavailable'
      }
    } catch {
      if (myToken !== token) return
      gloss.value = null
      state.value = 'unavailable'
    }
  }

  watch(
    [lyrics, enabled],
    ([raw, on]) => {
      token += 1 // invalida qualquer resposta em voo
      if (!on || !raw || raw.trim().length === 0) {
        state.value = 'disabled'
        gloss.value = null
        lastRequestedKey = null
        return
      }
      const normalized = normalizeLyrics(raw)
      if (normalized === lastRequestedKey) return
      void run(raw, token)
    },
    { immediate: true },
  )

  return { state, gloss, enabled }
}