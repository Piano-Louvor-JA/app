import { computed, onMounted, onUnmounted, ref, toValue, type MaybeRefOrGetter } from 'vue'

import {
  readEffectiveStageSettings,
  subscribeStageSettings,
} from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { DEFAULT_COUNTDOWN_DISPLAY_CONFIG, type CountdownDisplayConfig } from '../types/countdown'

/** Palco do escopo countdown (reativo) + config efetiva (características do módulo vindas do Palco). */
export function useCountdownStage(config: MaybeRefOrGetter<CountdownDisplayConfig>) {
  const stage = ref<StageSettings>(readEffectiveStageSettings('countdown'))
  let unsubStage: (() => void) | null = null

  onMounted(() => {
    unsubStage = subscribeStageSettings(() => {
      stage.value = readEffectiveStageSettings('countdown')
    })
  })
  onUnmounted(() => unsubStage?.())

  const effectiveConfig = computed(() => {
    const mod = stage.value.countdown
    const merged = mod ? { ...toValue(config), ...mod } : { ...toValue(config) }
    return {
      ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
      ...merged,
      allowNegative: merged.allowNegative ?? false,
    }
  })

  return { stage, effectiveConfig }
}
