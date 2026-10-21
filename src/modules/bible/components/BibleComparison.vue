<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadChapterVerses } from '../services/bible-catalog'
import type { BibleVersion } from '../types/bible'

const props = defineProps<{ versions: BibleVersion[]; versionId: number | null; bookId: number | null; chapter: number; verses: number[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const otherVersions = computed(() => props.versions.filter(version => version.id !== props.versionId))
const otherId = ref<number | null>(null)
const leftTitle = computed(() => props.versions.find(version => version.id === props.versionId)?.name ?? '')
const rightTitle = computed(() => props.versions.find(version => version.id === otherId.value)?.name ?? '')
const rows = ref<Array<{ verse: number; left: string; right: string }>>([])
const busy = ref(false), failed = ref(false)

watch(otherVersions, versions => {
  if (!versions.some(version => version.id === otherId.value)) otherId.value = versions[0]?.id ?? null
}, { immediate: true })
watch(() => [props.versionId, otherId.value, props.bookId, props.chapter, props.verses.join(',')] as const, async (_, __, onCleanup) => {
  let current = true
  onCleanup(() => { current = false })
  rows.value = []; failed.value = false; busy.value = false
  if (!props.versionId || !otherId.value || !props.bookId || !props.chapter) return
  busy.value = true
  try {
    const [left, right] = await Promise.all([loadChapterVerses(props.versionId, props.bookId, props.chapter), loadChapterVerses(otherId.value, props.bookId, props.chapter)])
    if (!current) return
    const numbers = props.verses.length ? [...props.verses].sort((a, b) => a - b) : Object.keys(left).map(Number).sort((a, b) => a - b)
    rows.value = numbers.map(verse => ({ verse, left: left[String(verse)] ?? '', right: right[String(verse)] ?? '' }))
  } catch { if (current) failed.value = true }
  finally { if (current) busy.value = false }
}, { immediate: true })
</script>

<template>
  <section class="bible-comparison" :aria-label="t('bibleStudy.compare')" :aria-busy="busy">
    <header>
      <strong>{{ t('bibleStudy.compare') }}</strong>
      <select v-model="otherId" :aria-label="t('bibleStudy.version')">
        <option v-for="version in otherVersions" :key="version.id" :value="version.id">{{ version.name }}</option>
      </select>
      <button type="button" :aria-label="t('bibleStudy.close')" @click="emit('close')"><i class="ti ti-x" aria-hidden="true" /></button>
    </header>
    <p v-if="busy" role="status">{{ t('bibleStudy.loading') }}</p>
    <p v-else-if="failed" role="alert">{{ t('bibleStudy.error') }}</p>
    <p v-else-if="!rows.length" role="status">{{ t('bibleStudy.choosePassage') }}</p>
    <div v-else class="bible-comparison__scroll">
      <div class="bible-comparison__titles"><strong>{{ leftTitle }}</strong><strong>{{ rightTitle }}</strong></div>
      <div v-for="row in rows" :key="row.verse" class="bible-comparison__row">
        <p><b>{{ row.verse }}</b> {{ row.left || t('bibleStudy.missing') }}</p>
        <p><b>{{ row.verse }}</b> {{ row.right || t('bibleStudy.missing') }}</p>
      </div>
    </div>
    <small>{{ t('bibleStudy.note') }}</small>
  </section>
</template>

<style scoped>
.bible-comparison { flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; max-height: 38vh; border: 1px solid var(--ds-color-outline); background: var(--ds-color-surface); border-radius: .8rem; padding: .85rem 1rem; gap: .5rem; }
header { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
header strong { margin-right: auto; font-size: .85rem; }
select, button { color: inherit; background: var(--ds-color-surface); border: 1px solid var(--ds-color-outline); border-radius: .5rem; padding: .4rem .6rem; font: inherit; font-size: .8rem; }
select { max-width: 55%; }
button { cursor: pointer; }
.bible-comparison__scroll { overflow-y: auto; min-height: 0; }
.bible-comparison__titles, .bible-comparison__row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.bible-comparison__titles { color: var(--ds-color-primary); font-size: .8rem; padding: .3rem 0; }
p { margin: 0; font-size: .85rem; line-height: 1.6; }
.bible-comparison__row { padding: .45rem 0; border-top: 1px solid var(--ds-color-outline); }
b { color: var(--ds-color-primary); }
small { color: var(--ds-color-on-surface-variant); font-size: .7rem; }
@media (max-width: 560px) { select { max-width: 75%; } .bible-comparison__row { gap: .6rem; } }
</style>
