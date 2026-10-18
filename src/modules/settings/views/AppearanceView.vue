<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@design-system/components/AppIcon.vue'
import AccentColorCard from '../components/AccentColorCard.vue'
import InteractionModeCard from '../components/InteractionModeCard.vue'
import LyricCustomizationCard from '../components/LyricCustomizationCard.vue'
import { useProjectionSettings } from '../composables/useProjectionSettings'
import { useAppearanceSettings } from '../composables/useAppearanceSettings'
const { t } = useI18n()
const { hydrate } = useProjectionSettings()
const { isDark, autoBrightness, setAutoBrightness, setThemeMode, setAccentColor } = useAppearanceSettings()
const modes = [{ key:'dark', icon:'moon' }, { key:'light', icon:'sun' }, { key:'system', icon:'device-desktop' }] as const
const states = [{ key:'ready', color:'success', icon:'circle-check' }, { key:'warning', color:'warning', icon:'alert-triangle' }, { key:'error', color:'danger', icon:'alert-circle' }, { key:'info', color:'info', icon:'info-circle' }]
const SHOW_LYRIC_CUSTOMIZATION = import.meta.env.VITE_SHOW_LYRIC_CUSTOMIZATION === '1'
function selectMode(mode: 'dark' | 'light' | 'system') {
  if (mode === 'system') setAutoBrightness(true)
  else setThemeMode(mode)
}
function restore() { setThemeMode('dark'); setAccentColor('azure') }
onMounted(() => { void hydrate() })
</script>
<template>
  <div class="appearance-experience">
    <header class="appearance-experience__hero">
      <div class="appearance-experience__eyebrow"><AppIcon name="palette" />{{ t('settings.appearance.accentColor') }}</div>
      <h1 class="appearance-experience__title">{{ t('visualIdentity.title') }}</h1>
      <p class="appearance-experience__subtitle">{{ t('visualIdentity.subtitle') }}</p>
    </header>
    <div class="appearance-experience__layout">
      <div class="appearance-experience__controls">
        <section class="appearance-panel">
          <h2>{{ t('visualIdentity.mode') }}</h2>
          <div class="appearance-modes" role="group" :aria-label="t('visualIdentity.mode')">
            <button v-for="mode in modes" :key="mode.key" type="button" :aria-pressed="mode.key === 'system' ? autoBrightness : !autoBrightness && (mode.key === 'dark') === isDark" @click="selectMode(mode.key)">
              <AppIcon :name="mode.icon" size="24" /><strong>{{ t(`visualIdentity.${mode.key}`) }}</strong><span>{{ t(`visualIdentity.${mode.key}Hint`) }}</span>
            </button>
          </div>
        </section>
        <div class="appearance-panel"><AccentColorCard /></div>
        <section class="appearance-panel appearance-motion"><h2>{{ t('visualIdentity.motion') }}</h2><InteractionModeCard /></section>
      </div>
      <aside class="appearance-preview appearance-panel" :aria-label="t('visualIdentity.preview')">
        <h2>{{ t('visualIdentity.preview') }}</h2><p>{{ t('visualIdentity.previewHint') }}</p>
        <div class="appearance-preview__app" aria-hidden="true">
          <div class="appearance-preview__bar"><span class="appearance-preview__brand"><AppIcon name="music" />Louange</span><AppIcon name="device-desktop" /></div>
          <div class="appearance-preview__body"><div class="appearance-preview__rail"><AppIcon name="home" /><AppIcon name="calendar-event" /><AppIcon name="book-2" /><AppIcon name="settings" /></div><div class="appearance-preview__content"><span class="appearance-preview__caption">{{ t('visualIdentity.sampleSubtitle') }}</span><h3>{{ t('visualIdentity.sampleTitle') }}</h3><div class="appearance-preview__selected"><AppIcon name="music" /><span>{{ t('visualIdentity.sampleSelected') }}</span><AppIcon name="check" /></div><div class="appearance-preview__line" /><div class="appearance-preview__line appearance-preview__line--short" /><span class="appearance-preview__action"><AppIcon name="player-play" />{{ t('visualIdentity.sampleAction') }}</span></div></div>
        </div>
        <h3 class="appearance-preview__states-title">{{ t('visualIdentity.states') }}</h3><p>{{ t('visualIdentity.statesHint') }}</p>
        <div class="appearance-states"><span v-for="state in states" :key="state.key" :style="{ color: `var(--ds-color-${state.color})` }"><AppIcon :name="state.icon" />{{ t(`visualIdentity.${state.key}`) }}</span></div>
      </aside>
    </div>
    <footer class="appearance-experience__footer"><span><AppIcon name="circle-check" />{{ t('visualIdentity.saved') }}</span><button type="button" @click="restore"><AppIcon name="arrows-exchange" />{{ t('visualIdentity.restore') }}</button></footer>
    <section v-if="SHOW_LYRIC_CUSTOMIZATION" class="appearance-experience__lyrics"><LyricCustomizationCard /></section>
  </div>
</template>
<style scoped>
.appearance-experience { container-type:inline-size; container-name:appearance; width:100%; max-width:1200px; margin:0 auto; padding-bottom:1.5rem; }
.appearance-experience__hero { margin-bottom:1.6rem; }
.appearance-experience__eyebrow { display:flex; align-items:center; gap:.5rem; color:var(--ds-color-primary); font-size:.75rem; font-weight:700; }
.appearance-experience h1 { margin:.6rem 0; font-size:clamp(1.4rem,2.3vw,2rem); line-height:1.3; letter-spacing:-.04em; }
.appearance-experience__hero p { max-width:42rem; font-size:.88rem; color:var(--ds-color-on-surface-variant); line-height:1.7; margin:0; }
.appearance-experience__layout { display:grid; grid-template-columns:minmax(0,1fr); gap:1.2rem; align-items:start; }
.appearance-experience__controls { display:grid; gap:1.2rem; }
.appearance-panel { padding:1.3rem; border:1px solid var(--ds-color-outline); border-radius:18px; background:var(--ds-color-surface-card); }
.appearance-panel h2 { margin:0 0 1rem; font-size:1rem; }
.appearance-modes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.6rem; }
.appearance-modes button { display:flex; flex-direction:column; align-items:flex-start; gap:.65rem; padding:.9rem; min-height:8.3rem; text-align:left; border:1px solid var(--ds-color-outline); border-radius:12px; color:var(--ds-color-on-surface); background:var(--ds-color-surface-container); font:inherit; cursor:pointer; }
.appearance-modes button[aria-pressed='true'] { border-color:var(--ds-color-primary); background:color-mix(in srgb,var(--ds-color-primary) 10%,var(--ds-color-surface-container)); box-shadow:inset 0 0 0 1px var(--ds-color-primary); }
.appearance-modes button[aria-pressed='true'] svg { color:var(--ds-color-primary); }
.appearance-modes strong { font-size:.82rem; }
.appearance-modes span { font-size:.7rem; line-height:1.5; color:var(--ds-color-on-surface-variant); }
.appearance-preview { position:static; top:0; }
.appearance-preview p { color:var(--ds-color-on-surface-variant); font-size:.78rem; line-height:1.6; }
.appearance-preview__app { margin:1.3rem 0; border:1px solid var(--ds-color-outline-strong); border-radius:13px; overflow:hidden; background:var(--ds-color-background); }
.appearance-preview__bar { display:flex; justify-content:space-between; padding:.8rem; border-bottom:1px solid var(--ds-color-outline); background:var(--ds-color-surface); }
.appearance-preview__brand { display:flex; align-items:center; gap:.4rem; font-size:.75rem; font-weight:700; }
.appearance-preview__brand svg { color:var(--ds-color-primary); }
.appearance-preview__body { display:flex; min-height:245px; }
.appearance-preview__rail { display:flex; flex-direction:column; gap:1.3rem; padding:1rem .7rem; border-right:1px solid var(--ds-color-outline); color:var(--ds-color-on-surface-variant); }
.appearance-preview__rail svg:nth-child(2) { color:var(--ds-color-primary); }
.appearance-preview__content { flex:1; min-width:0; padding:1.2rem .8rem; }
.appearance-preview__caption { font-size:.55rem; color:var(--ds-color-on-surface-variant); }
.appearance-preview h3 { font-size:.85rem; margin:.6rem 0 1rem; }
.appearance-preview__selected { display:flex; align-items:center; gap:.4rem; color:var(--ds-color-primary); background:color-mix(in srgb,var(--ds-color-primary) 12%,transparent); border:1px solid var(--ds-color-primary); padding:.65rem .45rem; border-radius:8px; font-size:.6rem; }
.appearance-preview__selected span { flex:1; }
.appearance-preview__line { height:.4rem; width:90%; border-radius:4px; background:var(--ds-color-outline); margin:.9rem 0; }
.appearance-preview__line--short { width:60%; }
.appearance-preview__action { display:inline-flex; align-items:center; gap:.5rem; padding:.55rem .7rem; color:var(--ds-color-on-primary); background:var(--ds-color-primary); border-radius:7px; font-size:.65rem; font-weight:700; }
.appearance-states { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.6rem; }
.appearance-states span { display:flex; gap:.5rem; align-items:center; padding:.6rem; background:var(--ds-color-surface-container); border-radius:8px; font-size:.75rem; }
.appearance-motion :deep(.interaction-card) { animation:none; background:transparent; border:0; padding:0; box-shadow:none; }
.appearance-experience__footer { display:flex; justify-content:space-between; flex-wrap:wrap; gap:1rem; align-items:center; margin-top:1.2rem; }
.appearance-experience__footer span, .appearance-experience__footer button { display:flex; align-items:center; gap:.5rem; font-size:.75rem; }
.appearance-experience__footer span { color:var(--ds-color-on-surface-variant); }
.appearance-experience__footer button { border:1px solid var(--ds-color-outline); border-radius:10px; color:var(--ds-color-on-surface); background:var(--ds-color-surface); padding:.7rem; cursor:pointer; }
@container appearance (min-width:760px) { .appearance-experience__layout { grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); } .appearance-preview { position:sticky; } }
@media(max-width:500px) { .appearance-modes { grid-template-columns:1fr; } .appearance-modes button { min-height:0; } }
</style>
