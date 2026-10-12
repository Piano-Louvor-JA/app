<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { ProjectionBackground } from '@design-system/index'
import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import RandomStage from '../components/RandomStage.vue'
import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'
import {
  RANDOM_CONFIG_CHANNEL,
  loadRandomDisplayConfig,
  normalizeRandomDisplayConfig,
} from '../services/random-preferences'
import {
  RANDOM_RUNTIME_CHANNEL,
  RANDOM_RUNTIME_STORAGE_KEY,
  normalizeRandomRuntime,
  readRandomRuntimeFromStorage,
} from '../services/random-runtime'
import { useRandomStore } from '../stores/useRandomStore'
import {
  DEFAULT_RANDOM_DISPLAY_CONFIG,
  DEFAULT_RANDOM_RUNTIME,
  type RandomDisplayConfig,
  type RandomRuntimeState,
} from '../types/random'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false },
)

const randomStore = useRandomStore()
const {
  canDraw,
  runtime: storeRuntime,
  config: storeConfig,
} = storeToRefs(randomStore)

function onDraw() {
  if (!props.embedded) return
  randomStore.startDraw()
}

const config = ref<RandomDisplayConfig>({ ...DEFAULT_RANDOM_DISPLAY_CONFIG })
const runtime = ref<RandomRuntimeState>({ ...DEFAULT_RANDOM_RUNTIME })

// Personalização do Palco (escopo random)
const stage = ref<StageSettings>(readEffectiveStageSettings('random'))
let unsubStage: (() => void) | null = null

let configChannel: BroadcastChannel | null = null
let runtimeChannel: BroadcastChannel | null = null

function refreshConfig() {
  config.value = loadRandomDisplayConfig()
}

function refreshRuntime() {
  runtime.value = readRandomRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === BROWSER_STORAGE_KEYS.userPreferences) {
    refreshConfig()
    return
  }
  if (event.key === RANDOM_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onConfigMessage(event: MessageEvent<unknown>) {
  config.value = normalizeRandomDisplayConfig(event.data)
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeRandomRuntime(event.data)
}

onMounted(() => {
  refreshConfig()
  refreshRuntime()
  window.addEventListener('storage', onStorage)

  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('random')
  })

  try {
    configChannel = new BroadcastChannel(RANDOM_CONFIG_CHANNEL)
    configChannel.addEventListener('message', onConfigMessage)
  } catch {
    configChannel = null
  }

  try {
    runtimeChannel = new BroadcastChannel(RANDOM_RUNTIME_CHANNEL)
    runtimeChannel.addEventListener('message', onRuntimeMessage)
  } catch {
    runtimeChannel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  unsubStage?.()
  configChannel?.removeEventListener('message', onConfigMessage)
  configChannel?.close()
  configChannel = null
  runtimeChannel?.removeEventListener('message', onRuntimeMessage)
  runtimeChannel?.close()
  runtimeChannel = null
})

const liveRuntime = computed(() =>
  props.embedded ? storeRuntime.value : runtime.value,
)

const liveConfig = computed(() =>
  props.embedded ? storeConfig.value : config.value,
)

const stageStyle = computed(() => {
  const bgImage = resolveBackgroundImage(stage.value.backgroundImage)
  return {
    // Sem imagem do Palco, usa a cor do diálogo "Personalização da Projeção".
    backgroundColor: bgImage ? stage.value.backgroundColor : liveConfig.value.bgColor,
    backgroundImage: bgImage ? `url(${bgImage})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
})

const stageAlign = computed(() => stageFlexAlign(stage.value))

// Fora do modo embarcado o palco de projeção nunca pode sortear por conta própria.
/* v8 ignore start -- embedded true exercitado pelo teste de draw embarcado */
const canDrawEmbedded = computed(() => (props.embedded ? canDraw.value : false))
/* v8 ignore stop */

// Personalização do diálogo do sorteio tem prioridade sobre o sub-bloco do Palco.
const effectiveConfig = computed(() => {
  const mod = stage.value.random
  return mod ? { ...mod, ...liveConfig.value } : { ...liveConfig.value }
})
</script>

<template>
  <ProjectionBackground
    class="random-projection"
    :class="{ 'random-projection--embedded': embedded }"
    :style="stageStyle"
  >
    <div
      v-if="liveRuntime.projecting !== false"
      class="random-projection__stage"
      :style="stageAlign"
    >
      <RandomStage
        projection
        :show-draw="embedded"
        :can-draw="canDrawEmbedded"
        :config="effectiveConfig"
        :runtime="liveRuntime"
        :stage="stage"
        @draw="onDraw"
      />
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.random-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  /* container p/ unidades cqw do stage-settings */
  container-type: size;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.random-projection__stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
