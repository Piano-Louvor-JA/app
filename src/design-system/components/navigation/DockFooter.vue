<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DockNavItem } from '@design-system/types/navigation'
import AppIcon from '../AppIcon.vue'
const { t } = useI18n()
const props = defineProps<{ items: DockNavItem[]; activeKey?: string }>()
const emit = defineEmits<{ select: [key: string] }>()
const expanded = ref(false)
const opener = ref<HTMLButtonElement>()
const panel = ref<HTMLElement>()
const panelId = useId()
const direct = computed(() => {
  if (props.items.length <= 5) return props.items
  const priorities = ['home', 'liturgy', 'bible', 'albums']
  const ordered = priorities.flatMap(key => props.items.filter(item => item.key === key))
  return [...ordered, ...props.items.filter(item => !priorities.includes(item.key))].slice(0, 4)
})
const overflow = computed(() => props.items.filter(item => !direct.value.includes(item)))
const overflowActive = computed(() => overflow.value.some(item => item.key === props.activeKey))
function close(restoreFocus = true) {
  expanded.value = false
  if (restoreFocus) opener.value?.focus()
}
async function toggle() {
  if (expanded.value) { close(); return }
  expanded.value = true
  await nextTick()
  panel.value?.querySelector<HTMLButtonElement>('button')?.focus()
}
function select(key: string) { if (expanded.value) close(); emit('select', key) }
function onKey(event: KeyboardEvent) { if (expanded.value && event.key === 'Escape') { event.preventDefault(); close() } }
watch(() => props.activeKey, () => close(false))
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <nav class="ds-dock" :aria-label="t('a11y.mainNav')">
    <button v-for="item in direct" :key="item.key" type="button" class="ds-dock__item" :class="{ 'ds-dock__item--active': activeKey === item.key }" :aria-current="activeKey === item.key ? 'page' : undefined" @click="select(item.key)">
      <AppIcon class="ds-dock__icon" :class="item.icon" :name="item.icon" />
      <span class="ds-dock__label">{{ item.label }}</span>
      <span v-if="activeKey === item.key" class="ds-dock__dot" aria-hidden="true" />
    </button>
    <button v-if="overflow.length" ref="opener" type="button" class="ds-dock__item" :class="{ 'ds-dock__item--active': overflowActive }" :aria-expanded="expanded" :aria-controls="panelId" @click="toggle">
      <AppIcon class="ds-dock__icon" name="menu-2" />
      <span class="ds-dock__label">{{ t('navigation.more') }}</span>
      <span v-if="overflowActive" class="ds-dock__dot" aria-hidden="true" />
    </button>
    <div v-if="expanded" class="ds-dock__backdrop" aria-hidden="true" @click="close(false)" />
    <section v-if="expanded" :id="panelId" ref="panel" class="ds-dock__overflow" :aria-label="t('navigation.more')">
      <h2>{{ t('navigation.title') }}</h2>
      <button v-for="item in overflow" :key="item.key" type="button" :aria-current="activeKey === item.key ? 'page' : undefined" @click="select(item.key)">
        <AppIcon :name="item.icon" /><span>{{ item.label }}</span><AppIcon v-if="activeKey === item.key" name="check" />
      </button>
    </section>
  </nav>
</template>

<style scoped>
.ds-dock { position:fixed; bottom:0; left:0; z-index:50; display:flex; width:100%; height:var(--ds-dock-height,72px); align-items:center; justify-content:center; gap:.25rem; padding:.25rem max(.5rem,env(safe-area-inset-right)) max(.25rem,env(safe-area-inset-bottom)) max(.5rem,env(safe-area-inset-left)); border-top:1px solid var(--ds-color-outline-strong); background:var(--ds-color-surface); }
.ds-dock__item { position:relative; display:flex; flex:1 1 0; max-width:9rem; min-width:0; min-height:48px; flex-direction:column; justify-content:center; align-items:center; gap:.2rem; padding:.3rem .15rem; border:0; border-radius:var(--ds-radius-sm); color:var(--ds-color-on-surface-variant); background:transparent; font:inherit; cursor:pointer; }
.ds-dock__item:hover { color:var(--ds-color-on-surface); background:var(--ds-action-neutral-hover); }
.ds-dock__item--active, .ds-dock__item--active:hover { color:var(--ds-selection-text); background:var(--ds-selection-bg); font-weight:700; }
.ds-dock__icon { width:22px; height:22px; }
.ds-dock__label { font-size:.72rem; line-height:1.2; text-align:center; overflow-wrap:anywhere; }
.ds-dock__dot { position:absolute; top:0; height:3px; width:1.1rem; border-radius:3px; background:currentColor; }
.ds-dock__backdrop { position:fixed; inset:0 0 var(--ds-dock-height) 0; background:rgb(0 0 0 / .22); }
.ds-dock__overflow { position:absolute; z-index:1; right:.75rem; bottom:calc(100% + .5rem); width:min(22rem,calc(100vw - 1.5rem)); max-height:60vh; overflow-y:auto; padding:.75rem; border:1px solid var(--ds-color-outline-strong); border-radius:var(--ds-radius-md); background:var(--ds-color-surface-card); box-shadow:0 8px 28px rgb(0 0 0 / .2); }
.ds-dock__overflow h2 { margin:.4rem .6rem .7rem; font-size:.8rem; color:var(--ds-color-on-surface-variant); }
.ds-dock__overflow button { display:flex; align-items:center; gap:.75rem; width:100%; min-height:48px; padding:.75rem; border:0; border-radius:var(--ds-radius-sm); background:var(--ds-action-neutral-default); color:var(--ds-action-neutral-text); font:inherit; text-align:left; cursor:pointer; }
.ds-dock__overflow button span { flex:1; }
.ds-dock__overflow button:hover { background:var(--ds-action-neutral-hover); }
.ds-dock__overflow button[aria-current] { background:var(--ds-selection-bg); color:var(--ds-selection-text); font-weight:700; }
.ds-dock button:focus-visible { outline:3px solid var(--ds-focus-ring); outline-offset:-3px; }
</style>
