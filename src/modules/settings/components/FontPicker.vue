<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFontPicker } from '../composables/useFontPicker'
import FontPreview from './FontPreview.vue'
import SettingsToggle from './SettingsToggle.vue'

const props = defineProps<{ scope: string; compact?: boolean }>()
const { t } = useI18n()
const usageHintId = useId()
const categories = ['sans', 'serif', 'display', 'handwriting'] as const
const {
  search, category, uiOnly, selected, page, pages, visible, filtered, installedIds, inUse,
  previews, busy, error, status, progress, apply, downloadAll, cancel, remove, restore,
  previewFamilyName, previewFamily, previewLoading, previewFailed, canApply, projectionOnly,
} = useFontPicker(props.scope)
</script>

<template>
  <div class="font-picker" :class="{ 'font-picker--compact': compact }" :aria-busy="busy">
    <div class="font-picker__toolbar">
      <label class="font-picker__search">
        <i class="ti ti-search" aria-hidden="true" />
        <input v-model="search" type="search" :aria-label="t('settings.fonts.search')" :placeholder="t('settings.fonts.search')" :disabled="busy">
      </label>
      <div class="font-picker__system-filter">
        <span>{{ t('settings.fonts.forSystem') }}</span>
        <SettingsToggle v-model="uiOnly" :label="t('settings.fonts.forSystem')" :disabled="busy" />
      </div>
    </div>

    <div class="font-picker__filters" :aria-label="t('settings.fonts.categories')" role="group">
      <button type="button" :aria-pressed="category === ''" :disabled="busy" @click="category = ''">{{ t('settings.fonts.all') }}</button>
      <button v-for="item in categories" :key="item" type="button" :aria-pressed="category === item" :disabled="busy" @click="category = item">{{ t(`settings.fonts.category.${item}`) }}</button>
    </div>

    <div class="font-picker__workspace">
      <div class="font-picker__catalog">
        <button type="button" class="font-picker__default" data-inherit-font :aria-pressed="selected === null" :disabled="busy" @click="selected = null">
          <i :class="scope === 'system' ? 'ti ti-device-desktop' : 'ti ti-link'" aria-hidden="true" />
          <span>{{ t(scope === 'system' ? 'settings.fonts.default' : 'settings.fonts.inherit') }}</span>
          <i v-if="selected === null" class="ti ti-check" aria-hidden="true" />
        </button>
        <div class="font-picker__catalog-heading">
          <span>{{ t('settings.fonts.catalog') }}</span>
          <span>{{ t('settings.fonts.familyCount', filtered.length) }}</span>
        </div>
        <p v-if="!filtered.length" class="font-picker__empty"><i class="ti ti-search-off" aria-hidden="true" /> {{ t('settings.fonts.empty') }}</p>
        <ul class="font-picker__list" :aria-label="t('settings.fonts.catalog')">
          <li v-for="font in visible" :key="font.id" :data-font-id="font.id" :class="{ 'font-picker__item--selected': selected === font.id }">
            <button type="button" :data-select-font="font.id" :disabled="busy" :aria-pressed="selected === font.id" class="font-picker__choice" @click="selected = font.id">
              <span class="font-picker__glyph" :style="{ fontFamily: previews[font.id], fontSynthesis: 'none' }" aria-hidden="true">Aa</span>
              <span class="font-picker__identity">
                <strong>{{ font.family }}</strong>
                <span class="font-picker__availability" :class="{ 'font-picker__availability--offline': installedIds.has(font.id) }">
                  <i :class="installedIds.has(font.id) ? 'ti ti-circle-check' : 'ti ti-cloud-download'" aria-hidden="true" />
                  {{ t(installedIds.has(font.id) ? 'settings.fonts.installed' : 'settings.fonts.notInstalled') }}
                  <span v-if="!font.ui" class="font-picker__usage-tag">{{ t('settings.fonts.projectionOnly') }}</span>
                </span>
              </span>
              <span class="font-picker__radio" aria-hidden="true"><i v-if="selected === font.id" class="ti ti-check" /></span>
            </button>
            <button v-if="installedIds.has(font.id)" type="button" class="font-picker__remove" :disabled="busy || inUse.includes(font.id)" :aria-label="t('settings.fonts.removeNamed', { name: font.family })" :title="t(inUse.includes(font.id) ? 'settings.fonts.inUse' : 'settings.fonts.remove')" @click="remove(font.id)">
              <i :class="inUse.includes(font.id) ? 'ti ti-lock' : 'ti ti-trash'" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <nav class="font-picker__pagination" :aria-label="t('settings.fonts.pages')">
          <button type="button" :disabled="busy || page === 0" :aria-label="t('settings.fonts.previous')" @click="page--"><i class="ti ti-chevron-left" aria-hidden="true" /></button>
          <span>{{ page + 1 }} <span class="font-picker__page-divider">/</span> {{ pages }}</span>
          <button type="button" :disabled="busy || page + 1 >= pages" :aria-label="t('settings.fonts.next')" @click="page++"><i class="ti ti-chevron-right" aria-hidden="true" /></button>
        </nav>
      </div>

      <div class="font-picker__preview-panel">
        <FontPreview :family-name="previewFamilyName" :font-family="previewFamily" :loading="previewLoading" :unavailable="previewFailed" />
        <p v-if="projectionOnly" :id="usageHintId" class="font-picker__usage-hint" data-font-usage role="status">
          <i class="ti ti-presentation" aria-hidden="true" />
          {{ t(scope === 'system' ? 'settings.fonts.projectionSystemHint' : 'settings.fonts.projectionUseHint') }}
        </p>
      </div>
    </div>

    <div class="font-picker__actions">
      <div v-if="scope === 'system'" class="font-picker__secondary-actions">
        <button type="button" class="font-picker__action" :disabled="busy" @click="downloadAll"><i class="ti ti-download" aria-hidden="true" /> {{ t('settings.fonts.downloadAll') }}</button>
        <button type="button" class="font-picker__action font-picker__action--muted" :disabled="busy" @click="restore"><i class="ti ti-restore" aria-hidden="true" /> {{ t('settings.fonts.restore') }}</button>
      </div>
      <button v-if="busy" type="button" class="font-picker__action" @click="cancel">{{ t('settings.fonts.cancel') }}</button>
      <div class="font-picker__apply">
        <button type="button" class="font-picker__action font-picker__action--primary" data-apply-font :disabled="busy || !canApply" :aria-describedby="!canApply ? usageHintId : undefined" @click="apply"><i class="ti ti-check" aria-hidden="true" /> {{ t('settings.fonts.apply') }}</button>
        <span>{{ t(!canApply ? 'settings.fonts.projectionApplyHint' : 'settings.fonts.selectedOnly') }}</span>
      </div>
    </div>

    <div v-if="busy" class="font-picker__feedback" role="status" aria-live="polite">
      <i class="ti ti-loader-2" aria-hidden="true" /> {{ t('settings.fonts.downloading') }}
      <template v-if="progress"><progress :value="progress.done" :max="progress.total" :aria-label="t('settings.fonts.downloading')" /><span>{{ progress.done }} / {{ progress.total }}</span></template>
    </div>
    <p v-if="error" class="font-picker__feedback" role="alert"><i class="ti ti-alert-circle" aria-hidden="true" /> {{ t(error) }}</p>
    <p v-if="status" class="font-picker__feedback" role="status" aria-live="polite"><i class="ti ti-info-circle" aria-hidden="true" /> {{ t(status) }}</p>
  </div>
</template>

<style scoped lang="scss">
.font-picker { display: grid; gap: 1.1rem; min-width: 0; color: var(--ds-color-on-surface); }
.font-picker__toolbar { display: flex; align-items: center; gap: 1.25rem; }
.font-picker__search { display: flex; flex: 1; align-items: center; gap: .65rem; min-width: 0; padding: .7rem .9rem; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-full); background: color-mix(in srgb, var(--ds-color-surface-container) 60%, transparent); }
.font-picker__search > i { color: var(--ds-color-on-surface-variant); font-size: 18px; }
.font-picker__search input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: var(--ds-color-on-surface); font-size: 13px; line-height: 20px; }
.font-picker__search input::placeholder { color: var(--ds-color-on-surface-variant); opacity: .75; }
.font-picker__search:focus-within { border-color: var(--ds-color-primary); }
.font-picker__system-filter { display: flex; align-items: center; gap: .75rem; color: var(--ds-color-on-surface-variant); font-size: 12px; white-space: nowrap; }
.font-picker__filters { display: flex; flex-wrap: wrap; gap: .4rem; }
.font-picker__filters button { padding: .4rem .8rem; border: 1px solid transparent; border-radius: var(--ds-radius-full); background: var(--ds-color-surface-variant); color: var(--ds-color-on-surface-variant); font-size: 11px; font-weight: 500; line-height: 16px; transition: background-color 160ms ease, color 160ms ease; }
.font-picker__filters button[aria-pressed='true'] { border-color: color-mix(in srgb, var(--ds-color-primary) 35%, transparent); background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent); color: var(--ds-color-primary); }
.font-picker__workspace { display: grid; grid-template-columns: minmax(240px, .85fr) minmax(0, 1.4fr); align-items: start; gap: 1.5rem; }
.font-picker__catalog { min-width: 0; }
.font-picker__preview-panel { display: grid; gap: .75rem; min-width: 0; }
.font-picker__usage-hint { display: flex; align-items: flex-start; gap: .5rem; margin: 0; padding: .75rem; border: 1px solid color-mix(in srgb, var(--ds-color-primary) 20%, transparent); border-radius: var(--ds-radius-sm); background: color-mix(in srgb, var(--ds-color-primary) 7%, transparent); color: var(--ds-color-on-surface-variant); font-size: 11px; line-height: 1.6; }
.font-picker__usage-hint > i { flex-shrink: 0; margin-top: .1rem; color: var(--ds-color-primary); font-size: 17px; }
.font-picker__usage-tag { padding: .1rem .35rem; border-radius: var(--ds-radius-full); background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent); color: var(--ds-color-primary); font-size: 9px; white-space: nowrap; }
.font-picker__default { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .75rem; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-md); background: transparent; color: var(--ds-color-on-surface-variant); text-align: left; font-size: 11px; line-height: 16px; }
.font-picker__default > span { flex: 1; }
.font-picker__default > i { font-size: 16px; }
.font-picker__default[aria-pressed='true'] { border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent); color: var(--ds-color-primary); background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent); }
.font-picker__catalog-heading { display: flex; justify-content: space-between; gap: .5rem; margin: 1rem 0 .6rem; color: var(--ds-color-on-surface-variant); font-size: 10px; font-weight: 600; letter-spacing: .05em; }
.font-picker__catalog-heading > span:first-child { text-transform: uppercase; }
.font-picker__list { display: grid; gap: .35rem; max-height: 330px; overflow-y: auto; overscroll-behavior: contain; margin: 0; padding: 2px 4px 2px 2px; list-style: none; scrollbar-width: thin; }
.font-picker__list li { display: flex; align-items: center; min-width: 0; border: 1px solid transparent; border-radius: var(--ds-radius-md); background: color-mix(in srgb, var(--ds-color-surface-container) 50%, transparent); transition: background-color 150ms ease, border-color 150ms ease; }
.font-picker__list li:hover { background: var(--ds-color-surface-variant); }
.font-picker__list .font-picker__item--selected { border-color: color-mix(in srgb, var(--ds-color-primary) 50%, transparent); background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent); }
.font-picker__choice { display: flex; flex: 1; align-items: center; gap: .65rem; min-width: 0; padding: .65rem; border: 0; background: transparent; color: var(--ds-color-on-surface); text-align: left; }
.font-picker__glyph { display: grid; place-items: center; flex-shrink: 0; width: 2.25rem; height: 2.25rem; border-radius: var(--ds-radius-sm); background: var(--ds-color-surface-variant); color: var(--ds-color-on-surface); font-size: 21px; line-height: 1; }
.font-picker__identity { display: grid; flex: 1; gap: .25rem; min-width: 0; }
.font-picker__identity strong { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.font-picker__availability { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .25rem; color: var(--ds-color-on-surface-variant); font-size: 9px; line-height: 13px; }
.font-picker__availability--offline { color: var(--ds-color-primary); }
.font-picker__radio { display: grid; place-items: center; flex-shrink: 0; width: 1rem; height: 1rem; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-full); font-size: 11px; }
.font-picker__item--selected .font-picker__radio { border-color: var(--ds-color-primary); background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
.font-picker__remove { padding: .4rem; margin-right: .25rem; border: 0; background: transparent; color: var(--ds-color-on-surface-variant); font-size: 15px; }
.font-picker__pagination { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .65rem; font-size: 11px; }
.font-picker__pagination button { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border: 0; border-radius: var(--ds-radius-full); background: var(--ds-color-surface-variant); color: var(--ds-color-on-surface); }
.font-picker__page-divider { margin: 0 .25rem; color: var(--ds-color-on-surface-variant); }
.font-picker__actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; padding-top: 1.1rem; border-top: 1px solid var(--ds-color-outline-strong); }
.font-picker__secondary-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; }
.font-picker__action { display: inline-flex; justify-content: center; align-items: center; gap: .4rem; padding: .6rem .85rem; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-full); background: transparent; color: var(--ds-color-on-surface); font-size: 11px; font-weight: 600; line-height: 18px; }
.font-picker__action > i { font-size: 16px; }
.font-picker__action--muted { border-color: transparent; color: var(--ds-color-on-surface-variant); }
.font-picker__action--primary { min-width: 10rem; border-color: transparent; background: var(--ds-color-primary); color: var(--ds-color-on-primary); font-size: 12px; }
.font-picker__apply { display: grid; justify-items: end; gap: .4rem; margin-left: auto; }
.font-picker__apply > span { color: var(--ds-color-on-surface-variant); font-size: 9px; }
.font-picker__feedback { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem; margin: 0; padding: .75rem; border-radius: var(--ds-radius-sm); background: var(--ds-color-surface-container); color: var(--ds-color-on-surface-variant); font-size: 11px; line-height: 18px; }
.font-picker progress { flex: 1; min-width: 5rem; height: .4rem; accent-color: var(--ds-color-primary); }
.font-picker__empty { display: grid; justify-items: center; gap: .75rem; padding: 2rem .5rem; color: var(--ds-color-on-surface-variant); font-size: 12px; }
.font-picker button:not(:disabled) { cursor: pointer; }
.font-picker button:disabled { opacity: .4; cursor: default; }
.font-picker button:focus-visible { outline: 2px solid var(--ds-color-primary); outline-offset: 2px; }
.font-picker--compact {
  gap: .85rem;
  .font-picker__toolbar { gap: .65rem; flex-wrap: wrap; }
  .font-picker__search { flex-basis: 100%; }
  .font-picker__workspace { display: flex; flex-direction: column-reverse; gap: 1rem; }
  .font-picker__workspace > * { width: 100%; }
  .font-picker__preview-panel { max-width: 480px; align-self: center; }
  .font-picker__list { max-height: 245px; }
  .font-picker__apply { width: 100%; justify-items: stretch; text-align: center; }
}

@media (max-width: 800px) {
  .font-picker__workspace { grid-template-columns: 1fr; }
  .font-picker__workspace > .font-picker__preview-panel { grid-row: 1; }
  .font-picker__toolbar { flex-wrap: wrap; }
  .font-picker__search { flex-basis: 100%; }
}
</style>
