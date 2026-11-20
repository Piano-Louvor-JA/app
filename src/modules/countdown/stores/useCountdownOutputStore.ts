import { defineStore } from 'pinia'
import { ref } from 'vue'

import { publishCountdownRuntime } from '../services/countdown-runtime'
import type { CountdownRuntimeState } from '../types/countdown'

/** Módulos que projetam pela tela de contagem (janela, prévia, TVs e OBS). */
export type CountdownOutputSource = 'timer' | 'sabbath-school'

/**
 * Cada módulo conta sozinho; só o último que mandou projetar publica no
 * canal da tela de contagem. Os outros seguem contando sem aparecer.
 */
export const useCountdownOutputStore = defineStore('countdownOutput', () => {
  const owner = ref<CountdownOutputSource>('timer')

  function claim(source: CountdownOutputSource) {
    owner.value = source
  }

  function publish(source: CountdownOutputSource, state: CountdownRuntimeState): boolean {
    if (owner.value !== source) return false
    publishCountdownRuntime(state)
    return true
  }

  return { owner, claim, publish }
})
