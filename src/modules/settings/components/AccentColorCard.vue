<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppIcon from '@design-system/components/AppIcon.vue'
import type { AccentKey } from '@design-system/themes'
import { useAppearanceSettings } from '../composables/useAppearanceSettings'
const { t } = useI18n()
const { accents, accentKey, setAccentColor } = useAppearanceSettings()
const accentEntries = Object.entries(accents) as Array<[AccentKey, (typeof accents)[AccentKey]]>
</script>
<template>
  <section class="accent-color" :aria-label="t('visualIdentity.palette')">
    <h2 class="accent-color__title"><AppIcon name="palette" />{{ t('visualIdentity.palette') }}</h2>
    <p>{{ t('visualIdentity.paletteHint') }}</p>
    <div class="accent-color__swatches" role="group" :aria-label="t('visualIdentity.palette')">
      <button v-for="[key, accent] in accentEntries" :key="key" type="button" class="accent-color__swatch" :class="{ 'accent-color__swatch--active': accentKey === key }" :style="{ '--swatch': accent.primary }" :aria-pressed="accentKey === key" :aria-label="t(`visualIdentity.palettes.${key}`)" @click="setAccentColor(key)">
        <span class="accent-color__dot"><AppIcon v-if="accentKey === key" name="check" size="18" /></span>
        <span>{{ t(`visualIdentity.palettes.${key}`) }}</span>
      </button>
    </div>
  </section>
</template>
<style scoped>
.accent-color h2 { display:flex; align-items:center; gap:.65rem; margin:0; font-size:1rem; }
.accent-color p { color:var(--ds-color-on-surface-variant); font-size:.82rem; line-height:1.6; margin:.6rem 0 1.2rem; }
.accent-color__swatches { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.7rem; }
.accent-color__swatch { display:flex; align-items:center; gap:.7rem; min-height:3.5rem; padding:.7rem; color:var(--ds-color-on-surface); background:var(--ds-color-surface-container); border:1px solid var(--ds-color-outline); border-radius:12px; text-align:left; font:inherit; font-size:.8rem; cursor:pointer; }
.accent-color__swatch:hover { background:var(--ds-color-surface-container-high); }
.accent-color__swatch--active { border-color:var(--ds-color-primary); box-shadow:inset 0 0 0 1px var(--ds-color-primary); }
.accent-color__dot { display:grid; place-items:center; flex-shrink:0; width:1.85rem; height:1.85rem; border-radius:50%; background:var(--swatch); color:#081522; }
@media(max-width:550px) { .accent-color__swatches { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
