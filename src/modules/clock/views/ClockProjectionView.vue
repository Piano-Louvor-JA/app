<script setup lang="ts">
import { useProjectionFont } from '@modules/settings/composables/useProjectionFont'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { ProjectionBackground } from '@design-system/index'
import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'

import type { StageSettings } from '../../settings/types/stage-settings'
import {
  readEffectiveStageSettings,
  subscribeStageSettings,
} from '../../settings/services/stage-settings-runtime'
import { resolveBackgroundImage, stageFlexAlign } from '../../settings/types/stage-settings'

import ClockPreview from '../components/ClockPreview.vue'
import {
  CLOCK_CONFIG_CHANNEL,
  loadClockConfig,
  normalizeClockConfig,
} from '../services/clock-preferences'
import type { ClockConfig } from '../types/clock'
import { DEFAULT_CLOCK_CONFIG } from '../types/clock'

withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false },
)

const config = ref<ClockConfig>({ ...DEFAULT_CLOCK_CONFIG })
const stage = ref<StageSettings>(readEffectiveStageSettings('clock'))

let unsubStage: (() => void) | null = null

let channel: BroadcastChannel | null = null

function refreshConfig() {
  config.value = loadClockConfig()
}

function onStorage(event: StorageEvent) {
  if (event.key && event.key !== BROWSER_STORAGE_KEYS.userPreferences) return
  refreshConfig()
}

function onChannelMessage(event: MessageEvent<unknown>) {
  config.value = normalizeClockConfig(event.data)
}

onMounted(() => {
  refreshConfig()
  window.addEventListener('storage', onStorage)

unsubStage = subscribeStageSettings(() => {
  stage.value = readEffectiveStageSettings('clock')
})

  try {
    channel = new BroadcastChannel(CLOCK_CONFIG_CHANNEL)
    channel.addEventListener('message', onChannelMessage)
  } catch {
    channel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
unsubStage?.()
unsubStage = null
  channel?.removeEventListener('message', onChannelMessage)
  channel?.close()
  channel = null
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
  const mod = stage.value.clock
  return mod ? { ...config.value, ...mod } : { ...config.value }
})

const projectionFontStyle = useProjectionFont('clock')
</script>

<template>
  <ProjectionBackground
    class="clock-projection"
    :class="{ 'clock-projection--embedded': embedded }"
    :style="[stageStyle, projectionFontStyle]"
  >
    <div
      class="clock-projection__stage"
      :style="stageAlign"
    >
      <ClockPreview
        :config="effectiveConfig"
        :stage="stage"
      />
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.clock-projection {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  container-type: size;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.clock-projection__stage {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
</style>
