<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCurrentApiPrefix } from '@modules/sync/services/library-catalog'
import AlbumsView from './AlbumsView.vue'
const { t, locale } = useI18n()
const language = computed(() => { void locale.value; return getCurrentApiPrefix() })
</script>
<template>
  <section class="multilingual-library">
    <div v-if="language === 'fr'" class="french-collection">
      <i class="ti ti-music" aria-hidden="true" />
      <h2>{{ t('catalog.frenchMusicTitle') }}</h2>
      <p>{{ t('catalog.frenchMusicBody') }}</p>
    </div>
    <AlbumsView :key="language" />
  </section>
</template>
<style scoped>
.multilingual-library { display:flex; flex:1; flex-direction:column; min-height:0; }
.french-collection { margin:1rem var(--ds-spacing-page) 0; padding:1rem; border:1px solid var(--ds-color-outline); border-radius:var(--ds-radius-lg); }
.french-collection i { float:left; margin-right:.75rem; font-size:1.4rem; color:var(--ds-color-primary); }
.french-collection h2 { font-size:1rem; margin:0; }
.french-collection p { margin:.5rem 0 0; line-height:1.5; font-size:.9rem; }
</style>
