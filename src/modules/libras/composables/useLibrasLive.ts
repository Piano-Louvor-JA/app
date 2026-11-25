// File: src/modules/libras/composables/useLibrasLive.ts
// SPDX-License-Identifier: MIT
// F-B.2 (SPEC v2.1): tradução ao vivo do slide projetado → gloss para o avatar.
// watch(lyric) → debounce 600ms → getLibrasGloss (cache+API+fallback) → gloss.
// latest-wins: resposta de slide antigo nunca sobrescreve slide novo.

import { ref, watch, onUnmounted, type Ref } from 'vue'
import { getLibrasGloss } from '../services/libras-translate'

const DEBOUNCE_MS = 600

export function useLibrasLive(lyric: Ref<string>, isActive: Ref<boolean> = ref(true)) {
  const gloss = ref('')
  const translating = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  async function translate(text: string) {
    const mySeq = ++seq
    if (!isActive.value || !text.trim()) {
      gloss.value = ''
      return
    }
    translating.value = true
    try {
      const r = await getLibrasGloss(text)
      if (mySeq === seq) gloss.value = r.gloss ?? ''
    } catch {
      if (mySeq === seq) gloss.value = ''
    } finally {
      if (mySeq === seq) translating.value = false
    }
  }

  watch(
    [lyric, isActive],
    ([text, active]) => {
      if (timer) clearTimeout(timer)
      if (!active || !text.trim()) {
        // capa/slide vazio: limpa na hora, sem debounce
        gloss.value = ''
        return
      }
      timer = setTimeout(() => void translate(text), DEBOUNCE_MS)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return { gloss, translating }
}
