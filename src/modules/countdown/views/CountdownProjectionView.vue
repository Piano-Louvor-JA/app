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

import CountdownPreview from '../components/CountdownPreview.vue'
import {
  COUNTDOWN_CONFIG_CHANNEL,
  loadCountdownDisplayConfig,
  normalizeCountdownDisplayConfig,
} from '../services/countdown-preferences'
import {
  COUNTDOWN_RUNTIME_CHANNEL,
  COUNTDOWN_RUNTIME_STORAGE_KEY,
  normalizeCountdownRuntime,
  readCountdownRuntimeFromStorage,
} from '../services/countdown-runtime'
import type {
  CountdownDisplayConfig,
  CountdownRuntimeState,
} from '../types/countdown'
import {
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_COUNTDOWN_DURATION_MS,
  DEFAULT_COUNTDOWN_RUNTIME,
} from '../types/countdown'
import { isIndependentProjectionLocation } from '@shared/services/projection-window-location'

/** Projeção independente ignora o takeover da principal (projecting:false). */
const independent = isIndependentProjectionLocation()

withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false },
)

const config = ref<CountdownDisplayConfig>({ ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG })
const runtime = ref<CountdownRuntimeState>({
  ...DEFAULT_COUNTDOWN_RUNTIME,
  savedTimesMs: [],
  durationMs: DEFAULT_COUNTDOWN_DURATION_MS,
})

const stage = ref<StageSettings>(readEffectiveStageSettings('countdown'))

let unsubStage: (() => void) | null = null

let configChannel: BroadcastChannel | null = null
let runtimeChannel: BroadcastChannel | null = null

function refreshConfig() {
  config.value = loadCountdownDisplayConfig()
}

function refreshRuntime() {
  runtime.value = readCountdownRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === BROWSER_STORAGE_KEYS.userPreferences) {
    refreshConfig()
    return
  }
  if (event.key === COUNTDOWN_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onConfigMessage(event: MessageEvent<unknown>) {
  config.value = normalizeCountdownDisplayConfig(event.data)
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeCountdownRuntime(event.data)
}

onMounted(() => {
  refreshConfig()
  refreshRuntime()
  window.addEventListener('storage', onStorage)

unsubStage = subscribeStageSettings(() => {
  stage.value = readEffectiveStageSettings('countdown')
})

  try {
    configChannel = new BroadcastChannel(COUNTDOWN_CONFIG_CHANNEL)
    configChannel.addEventListener('message', onConfigMessage)
  } catch {
    configChannel = null
  }

  try {
    runtimeChannel = new BroadcastChannel(COUNTDOWN_RUNTIME_CHANNEL)
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
  const mod = stage.value.countdown
  return mod ? { ...config.value, ...mod } : { ...config.value }
})
</script>

<template>
  <ProjectionBackground
    class="countdown-projection"
    :class="{ 'countdown-projection--embedded': embedded }"
    :style="stageStyle"
  >
    <div
      v-if="independent || runtime.projecting !== false"
      class="countdown-projection__stage"
      :style="stageAlign"
    >
      <CountdownPreview
        :config="effectiveConfig"
        :runtime="runtime"
        :stage="stage"
      />
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.countdown-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  container-type: size;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.countdown-projection__stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
</style>
