<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { stripHtmlBreaks } from '../services/media-slides'

const props = defineProps<{
  lyric: string
  title: string
  imageUrl: string | null
  isCover?: boolean
}>()

const { t } = useI18n()

const plainLyric = computed(() => stripHtmlBreaks(props.lyric))
const showTitleAsLyric = computed(
  () => Boolean(props.isCover) || (!plainLyric.value && Boolean(props.title)),
)
const displayText = computed(() => {
  if (showTitleAsLyric.value) return props.title || t('media.title')
  return plainLyric.value
})
</script>

<template>
  <div class="media-slide-stage">
    <div
      v-if="imageUrl"
      class="media-slide-stage__bg"
      :style="{ backgroundImage: `url(${imageUrl})` }"
      aria-hidden="true"
    />
    <div
      class="media-slide-stage__content"
      :class="{ 'media-slide-stage__content--cover': isCover }"
    >
      <p
        class="media-slide-stage__lyric"
        :class="{ 'media-slide-stage__lyric--cover': isCover }"
      >
        {{ displayText }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-slide-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.media-slide-stage__bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: brightness(0.42);
}

.media-slide-stage__content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8vh 6vw;
  text-align: center;

  &--cover {
    padding: 8vh 6vw;
  }
}

.media-slide-stage__lyric {
  margin: 0;
  max-width: 86%;
  padding: 2.5vmin 4vmin;
  border: clamp(2px, 0.2vmin, 4px) solid rgb(255 255 255 / 0.85);
  border-radius: clamp(14px, 2.4vmin, 32px) 0
    clamp(14px, 2.4vmin, 32px) 0;
  background: rgb(24 24 24 / 0.55);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: #fff;
  font-size: clamp(1.5rem, 4.8vw, 3.4rem);
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.03em;
  text-align: center;
  text-transform: uppercase;
  white-space: pre-line;

  &--cover {
    border: none;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    color: #f6c32a;
    font-size: clamp(1.8rem, 5.2vw, 3.8rem);
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.01em;
    text-shadow: 0 10px 30px rgb(0 0 0 / 0.9), 0 2px 6px rgb(0 0 0 / 0.7);
  }
}
</style>
