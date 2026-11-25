import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  DEFAULT_LITURGY_APPEARANCE,
  loadLiturgyAppearance,
  saveLiturgyAppearance,
  type LiturgyAppearance,
  type LiturgyCategoryAppearance,
} from '../services/liturgy-appearance'
import type { LiturgyItemType } from '../types/liturgy'

/** Aparência da lista da liturgia (painel de personalização → preferências). */
export const useLiturgyAppearanceStore = defineStore('liturgy-appearance', () => {
  const appearance = ref<LiturgyAppearance>(loadLiturgyAppearance())

  function save(next: LiturgyAppearance) {
    appearance.value = saveLiturgyAppearance(next)
  }

  function updateCategory(patch: Partial<LiturgyCategoryAppearance>) {
    save({ ...appearance.value, category: { ...appearance.value.category, ...patch } })
  }

  /** Cor vazia: o tipo volta à cor do próprio item. */
  function setTypeColor(type: LiturgyItemType, color: string) {
    const typeColors = { ...appearance.value.typeColors }
    if (color) typeColors[type] = color
    else delete typeColors[type]
    save({ ...appearance.value, typeColors })
  }

  function reset() {
    save(DEFAULT_LITURGY_APPEARANCE)
  }

  return { appearance, updateCategory, setTypeColor, reset }
})
