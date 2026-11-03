<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useMediaStore } from '@modules/media/stores/useMediaStore'
const { t } = useI18n()
const media = useMediaStore()
const { audioRoute } = storeToRefs(media)
function change(event: Event) {
  void media.setAudioRoute((event.target as HTMLSelectElement).value as 'pc' | 'tv' | 'both')
}
</script>
<template>
  <label class="transmission-audio">
    <i class="ti ti-speakerphone" aria-hidden="true" />
    <span>{{ t('settings.palco.audioRoute') }}</span>
    <select :value="audioRoute" @change="change">
      <option value="pc">{{ t('settings.palco.audioPc') }}</option>
      <option value="tv">{{ t('settings.palco.audioTv') }}</option>
      <option value="both">{{ t('settings.palco.audioBoth') }}</option>
    </select>
  </label>
</template>
<style scoped>
.transmission-audio { display:flex; flex-wrap:wrap; align-items:center; gap:.65rem; padding:1rem 0; color:var(--ds-color-on-surface); }
select { padding:.5rem .75rem; border:1px solid var(--ds-color-outline); border-radius:.5rem; background:var(--ds-color-surface,#171717); color:inherit; }
</style>
