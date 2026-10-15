import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  createHistoryState,
  moveTo as moveToIndex,
  recordPush,
  recordReplace,
  visibleWindow,
  type HistoryEntry,
  type HistoryState,
} from '@shared/services/navigation-history'

/**
 * Histórico de navegação da sessão (só memória, não persiste).
 * Sem lógica própria: delega para `@shared/services/navigation-history`.
 * Quem liga ao router é `installNavigationHistory`.
 */
export const useNavigationHistoryStore = defineStore('navigation-history', () => {
  const state = ref<HistoryState>(createHistoryState())

  const entries = computed(() => state.value.entries)
  const index = computed(() => state.value.index)
  const current = computed(() => state.value.entries[state.value.index] ?? null)
  const canGoBack = computed(() => state.value.index > 0)
  const canGoForward = computed(() => state.value.index < state.value.entries.length - 1)
  const dots = computed(() => visibleWindow(state.value).items)

  function push(entry: HistoryEntry) {
    state.value = recordPush(state.value, entry)
  }

  function replace(entry: HistoryEntry) {
    state.value = recordReplace(state.value, entry)
  }

  function moveTo(target: number) {
    state.value = moveToIndex(state.value, target)
  }

  function reset() {
    state.value = createHistoryState()
  }

  return { entries, index, current, canGoBack, canGoForward, dots, push, replace, moveTo, reset }
})
