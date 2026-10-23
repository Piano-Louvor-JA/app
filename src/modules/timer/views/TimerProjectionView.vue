<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { ProjectionBackground } from '@design-system/index'
import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import type { StageSettings } from '../../settings/types/stage-settings'
import {
  readEffectiveStageSettings,
  subscribeStageSettings,
} from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'

import TimerPreview from '../components/TimerPreview.vue'
import {
  TIMER_CONFIG_CHANNEL,
  loadTimerDisplayConfig,
  normalizeTimerDisplayConfig,
} from '../services/timer-preferences'
import {
  TIMER_RUNTIME_CHANNEL,
  TIMER_RUNTIME_STORAGE_KEY,
  normalizeTimerRuntime,
  readTimerRuntimeFromStorage,
} from '../services/timer-runtime'
import type { TimerDisplayConfig, TimerRuntimeState } from '../types/timer'
import {
  DEFAULT_TIMER_DISPLAY_CONFIG,
  DEFAULT_TIMER_RUNTIME,
} from '../types/timer'
import { isIndependentProjectionLocation } from '@shared/services/projection-window-location'

/** Projeção independente ignora o takeover da principal (projecting:false). */
const independent = isIndependentProjectionLocation()

withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false },
)

const config = ref<TimerDisplayConfig>({ ...DEFAULT_TIMER_DISPLAY_CONFIG })
const runtime = ref<TimerRuntimeState>({
  ...DEFAULT_TIMER_RUNTIME,
  savedTimesMs: [],
})

const stage = ref<StageSettings>(readEffectiveStageSettings('timer'))

let unsubStage: (() => void) | null = null

let configChannel: BroadcastChannel | null = null
let runtimeChannel: BroadcastChannel | null = null

function refreshConfig() {
  config.value = loadTimerDisplayConfig()
}

function refreshRuntime() {
  runtime.value = readTimerRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === BROWSER_STORAGE_KEYS.userPreferences) {
    refreshConfig()
    return
  }
  if (event.key === TIMER_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onConfigMessage(event: MessageEvent<unknown>) {
  config.value = normalizeTimerDisplayConfig(event.data)
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeTimerRuntime(event.data)
}

onMounted(() => {
  refreshConfig()
  refreshRuntime()
  window.addEventListener('storage', onStorage)

  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('timer')
  })

  try {
    configChannel = new BroadcastChannel(TIMER_CONFIG_CHANNEL)
    configChannel.addEventListener('message', onConfigMessage)
  } catch {
    configChannel = null
  }

  try {
    runtimeChannel = new BroadcastChannel(TIMER_RUNTIME_CHANNEL)
    runtimeChannel.addEventListener('message', onRuntimeMessage)
  } catch {
    runtimeChannel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  unsubStage = null
  configChannel?.removeEventListener('message', onConfigMessage)
  configChannel?.close()
  configChannel = null
  runtimeChannel?.removeEventListener('message', onRuntimeMessage)
  runtimeChannel?.close()
  runtimeChannel = null
})

const stageStyle = computed(() => ({
  backgroundColor: stage.value.backgroundColor,
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}))

const stageAlign = computed(() => stageFlexAlign(stage.value))

// Características do módulo vindas do StageSettings (fonte única).
const effectiveConfig = computed(() => {
  const mod = stage.value.timer
  return mod ? { ...config.value, ...mod } : { ...config.value }
})
</script>

<template>
  <ProjectionBackground
    class="timer-projection"
    :class="{ 'timer-projection--embedded': embedded }"
    :style="stageStyle"
  >
    <div
      v-if="independent || runtime.projecting !== false"
      class="timer-projection__stage"
      :style="stageAlign"
    >
      <TimerPreview
        :config="effectiveConfig"
        :runtime="runtime"
        :stage="stage"
      />
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.timer-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  container-type: size;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.timer-projection__stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
</style>
