<script setup lang="ts">
import { nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import { fitFontPreview } from '../services/font-preview-fit'
import { useI18n } from 'vue-i18n'
import { ProjectionBackground } from '@design-system/index'
import { DEFAULT_FONT_FAMILY } from '../data/font-catalog'

const props = withDefaults(defineProps<{
  familyName: string
  fontFamily?: string
  loading?: boolean
  unavailable?: boolean
}>(), { fontFamily: DEFAULT_FONT_FAMILY, loading: false, unavailable: false })
const { t } = useI18n()
const screen = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const verse = ref<HTMLElement | null>(null)
const refit = () => fitFontPreview(screen.value, content.value, verse.value)
let observer: ResizeObserver | undefined
onMounted(() => {
  refit()
  if (typeof ResizeObserver !== 'undefined' && screen.value) {
    observer = new ResizeObserver(refit)
    observer.observe(screen.value)
  }
})
watch([() => props.fontFamily, () => t('settings.fonts.previewVerse')], async () => {
  await nextTick()
  refit()
}, { flush: 'post' })
onScopeDispose(() => observer?.disconnect())
</script>

<template>
  <section class="font-preview" data-font-preview :aria-label="t('settings.fonts.previewTitle')" :aria-busy="loading">
    <header class="font-preview__header">
      <span class="font-preview__eyebrow">{{ t('settings.fonts.previewTitle') }}</span>
      <span class="font-preview__module"><i class="ti ti-bible" aria-hidden="true" /> {{ t('settings.fonts.previewModule') }}</span>
    </header>
    <div ref="screen" class="font-preview__screen">
      <ProjectionBackground class="font-preview__stage">
        <div ref="content" class="font-preview__content">
          <p ref="verse" class="font-preview__verse" :style="{ fontFamily, fontSynthesis: 'none' }">{{ t('settings.fonts.previewVerse') }}</p>
          <p class="font-preview__reference" :style="{ fontFamily, fontSynthesis: 'none' }">{{ t('settings.fonts.previewReference') }}</p>
        </div>
      </ProjectionBackground>
    </div>
    <footer class="font-preview__footer">
      <div class="font-preview__family">
        <i class="ti ti-typography" aria-hidden="true" />
        <strong>{{ familyName }}</strong>
      </div>
      <p v-if="loading" class="font-preview__notice" role="status"><i class="ti ti-loader-2 font-preview__spinner" aria-hidden="true" /> {{ t('settings.fonts.previewLoading') }}</p>
      <p v-else-if="unavailable" class="font-preview__notice" role="status">{{ t('settings.fonts.previewFallback') }}</p>
      <p v-else class="font-preview__notice">{{ t('settings.fonts.previewHint') }}</p>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.font-preview { min-width: 0; }
.font-preview__header { display: flex; justify-content: space-between; align-items: center; gap: .75rem; margin-bottom: .85rem; }
.font-preview__eyebrow { color: var(--ds-color-on-surface-variant); font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.font-preview__module { display: inline-flex; align-items: center; gap: .4rem; padding: .25rem .6rem; border-radius: var(--ds-radius-full); background: var(--ds-color-surface-variant); color: var(--ds-color-on-surface-variant); font-size: 11px; }
.font-preview__screen { container-type: inline-size; aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--ds-radius-lg); border: 1px solid var(--ds-color-outline-strong); box-shadow: 0 8px 28px rgb(0 0 0 / .18); }
.font-preview__stage { display: flex; align-items: center; height: 100%; min-height: 100%; background: radial-gradient(ellipse at top, #1e293b, #080c14 85%); }
.font-preview__content { width: 100%; padding: 6cqw 7cqw; }
.font-preview__verse { margin: 0; color: #fff; font-size: clamp(14px, 4.5cqw, 32px); font-weight: 500; line-height: 1.5; text-align: center; text-shadow: 0 1px 4px rgb(0 0 0 / .7); }
.font-preview__reference { margin: 4cqw 0 0; color: var(--ds-color-primary-soft); font-size: clamp(10px, 2.7cqw, 18px); font-weight: 600; letter-spacing: .03em; text-align: right; }
.font-preview__footer { display: grid; gap: .5rem; padding-top: 1rem; }
.font-preview__family { display: flex; align-items: center; gap: .5rem; color: var(--ds-color-on-surface); font-size: 14px; }
.font-preview__family i { color: var(--ds-color-primary); font-size: 18px; }
.font-preview__notice { display: flex; gap: .4rem; align-items: center; min-height: 2.5em; margin: 0; color: var(--ds-color-on-surface-variant); font-size: 11px; line-height: 1.6; }
.font-preview__spinner { animation: font-preview-spin 1s linear infinite; }
@keyframes font-preview-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .font-preview__spinner { animation: none; } }
</style>
