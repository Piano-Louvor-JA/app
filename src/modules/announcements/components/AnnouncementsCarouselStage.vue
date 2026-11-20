<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import LiturgyAnnotationStage from '@modules/liturgy/components/LiturgyAnnotationStage.vue'
import { resolveMediaUrl } from '@shared/services/workspace-api'
import '@styles/screen-transitions.css'

import {
  CAROUSEL_RUNTIME_CHANNEL,
  CAROUSEL_RUNTIME_STORAGE_KEY,
  normalizeCarouselRuntime,
  readCarouselRuntime,
  type CarouselRuntime,
} from '../services/carousel-runtime'

/**
 * Tela do carrossel: texto usa a mesma tela de anotação da Liturgia (mesma
 * aparência do Palco); imagem ocupa a tela inteira sem cortar.
 */
withDefaults(
  defineProps<{
    /** Prévia dentro do app (sem 100vw/100vh). */
    embedded?: boolean
  }>(),
  { embedded: false },
)

const runtime = ref<CarouselRuntime>(readCarouselRuntime())
let channel: BroadcastChannel | null = null

/** Animação escolhida no carrossel (vale para imagem e texto). */
const transitionName = computed(() => `scr-${runtime.value.transition}`)
const stageStyle = computed(() => ({ '--scr-transition-ms': `${runtime.value.transitionMs}ms` }))

function onStorage(event: StorageEvent) {
  if (event.key === CAROUSEL_RUNTIME_STORAGE_KEY) runtime.value = readCarouselRuntime()
}

function onMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeCarouselRuntime(event.data)
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  try {
    channel = new BroadcastChannel(CAROUSEL_RUNTIME_CHANNEL)
    channel.addEventListener('message', onMessage)
  } catch {
    channel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  channel?.removeEventListener('message', onMessage)
  channel?.close()
  channel = null
})
</script>

<template>
  <div
    class="carousel-stage"
    :class="{ 'carousel-stage--embedded': embedded }"
    data-test="carousel-stage"
    :style="stageStyle"
  >
    <LiturgyAnnotationStage
      v-if="runtime.active && runtime.kind === 'text'"
      :embedded="embedded"
      :transition="runtime.transition"
      :transition-ms="runtime.transitionMs"
    />
    <Transition
      v-else-if="runtime.active && runtime.kind === 'image'"
      :name="transitionName"
      mode="out-in"
    >
      <img
        :key="runtime.relativePath"
        class="carousel-stage__image"
        :src="resolveMediaUrl(runtime.relativePath)"
        alt=""
        data-test="carousel-image"
      >
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.carousel-stage {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;

  &--embedded {
    width: 100%;
    height: 100%;
  }
}

.carousel-stage__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

</style>
