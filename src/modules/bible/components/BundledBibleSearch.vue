<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { searchBundledBible, type BibleSearchHit } from '../services/bundled-bibles'
const props = defineProps<{ versionId: number; query: string }>()
const emit = defineEmits<{ select: [hit: BibleSearchHit] }>()
const { t } = useI18n()
const hits = ref<BibleSearchHit[]>([])
const total = ref(0)
const busy = ref(false)
const failed = ref(false)
watch(() => [props.versionId, props.query] as const, ([id, query], _, onCleanup) => {
  let active = true
  busy.value = true
  failed.value = false
  hits.value = []
  const timer = setTimeout(async () => {
    try {
      const result = await searchBundledBible(id, query)
      if (!active) return
      hits.value = result.hits
      total.value = result.total
    } catch {
      if (active) failed.value = true
    } finally {
      if (active) busy.value = false
    }
  }, 180)
  onCleanup(() => { active = false; clearTimeout(timer) })
}, { immediate: true })
</script>

<template>
  <section class="bible-results" :aria-label="t('bible.searchBible')" :aria-busy="busy">
    <p role="status">{{ busy ? t('catalog.searching') : failed ? t('catalog.searchError') : total ? t('catalog.results', { count: total }) : t('catalog.noResults') }}</p>
    <button v-for="hit in hits" :key="`${hit.bookId}:${hit.chapter}:${hit.verse}`" type="button" @click="emit('select', hit)">
      <strong>{{ hit.bookName }} {{ hit.chapter }}:{{ hit.verse }}</strong>
      <span>{{ hit.text }}</span>
    </button>
  </section>
</template>

<style scoped>
.bible-results { overflow:auto; min-height:0; flex:1; }
p { padding:.6rem; opacity:.8; }
button { display:flex; flex-direction:column; text-align:left; gap:.35rem; width:100%; padding:1rem; color:inherit; background:var(--ds-color-surface); border:1px solid var(--ds-color-outline); border-radius:.6rem; margin-bottom:.5rem; cursor:pointer; }
button:hover { border-color:var(--ds-color-primary); }
strong { color:var(--ds-color-primary); }
span { line-height:1.6; }
</style>
