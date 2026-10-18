<script setup lang="ts">
import AppIcon from '@design-system/components/AppIcon.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { DockNavItem } from '@design-system/types/navigation'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

const props = defineProps<{ items: DockNavItem[]; activeKey: string }>()
const emit = defineEmits<{ select: [key: string] }>()
const { t } = useI18n()
const route = useRoute()
const collapsed = ref(getUserPreference<boolean>('navigation.sidebarCollapsed', false) === true)
const groups = computed(() => [
  { title: 'navigation.worship', items: ['home', 'liturgy', 'bible'] },
  { title: 'navigation.library', items: ['albums', 'community'] },
  { title: 'navigation.tools', items: ['utilities'] },
].map(group => ({ ...group, items: group.items.flatMap(key => props.items.filter(item => item.key === key)) })))
const settings = computed(() => props.items.find(item => item.key === 'settings'))
const utilities = [
  { path: '/utilities/clock', icon: 'ti-clock', label: 'navigation.clock' },
  { path: '/utilities/timer', icon: 'ti-stopwatch', label: 'navigation.timer' },
  { path: '/utilities/countdown', icon: 'ti-hourglass', label: 'navigation.countdown' },
  { path: '/utilities/random', icon: 'ti-ticket', label: 'navigation.random' },
]
function toggle() {
  collapsed.value = !collapsed.value
  setUserPreference('navigation.sidebarCollapsed', collapsed.value)
}
</script>

<template>
  <aside class="workspace-sidebar" :class="{ 'workspace-sidebar--collapsed': collapsed }">
    <div class="workspace-sidebar__top">
      <span v-if="!collapsed" class="workspace-sidebar__caption">{{ t('navigation.title') }}</span>
      <button class="workspace-sidebar__toggle" type="button" :aria-label="t(collapsed ? 'navigation.expand' : 'navigation.collapse')" :title="t(collapsed ? 'navigation.expand' : 'navigation.collapse')" :aria-expanded="!collapsed" aria-controls="workspace-navigation" @click="toggle">
        <AppIcon :name="collapsed ? 'ti-layout-sidebar-left-expand' : 'ti-layout-sidebar-left-collapse'" aria-hidden="true" />
      </button>
    </div>
    <nav id="workspace-navigation" class="workspace-sidebar__nav" :aria-label="t('navigation.title')">
      <section v-for="group in groups" :key="group.title" class="workspace-sidebar__group">
        <h2 v-if="!collapsed">{{ t(group.title) }}</h2>
        <button v-for="item in group.items" :key="item.key" type="button" class="workspace-sidebar__link" :class="{ 'is-active': activeKey === item.key }" :aria-current="activeKey === item.key ? 'page' : undefined" :aria-label="item.label" :title="collapsed ? item.label : undefined" @click="emit('select', item.key)">
          <AppIcon :name="item.icon" aria-hidden="true" />
          <span v-if="!collapsed">{{ item.label }}</span>
          <AppIcon name="chevron-right" v-if="!collapsed && activeKey === item.key" class="workspace-sidebar__chevron" aria-hidden="true" />
        </button>
        <div v-if="group.title === 'navigation.tools' && activeKey === 'utilities' && !collapsed" class="workspace-sidebar__subnav">
          <RouterLink v-for="utility in utilities" :key="utility.path" :to="utility.path" :class="{ 'is-active': route.path === utility.path }" :aria-current="route.path === utility.path ? 'page' : undefined">
            <AppIcon :name="utility.icon" aria-hidden="true" />{{ t(utility.label) }}
          </RouterLink>
        </div>
      </section>
    </nav>
    <div class="workspace-sidebar__footer">
      <button v-if="settings" type="button" class="workspace-sidebar__link" :class="{ 'is-active': activeKey === 'settings' }" :aria-current="activeKey === 'settings' ? 'page' : undefined" :aria-label="settings.label" :title="collapsed ? settings.label : undefined" @click="emit('select', 'settings')">
        <AppIcon name="settings" aria-hidden="true" /><span v-if="!collapsed">{{ settings.label }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.workspace-sidebar { display:flex; flex-direction:column; flex-shrink:0; width:15rem; min-height:0; padding:.85rem .8rem; border-right:1px solid var(--ds-color-outline); background:var(--ds-color-surface); color:var(--ds-color-on-surface); }
.workspace-sidebar--collapsed { width:4.75rem; }
.workspace-sidebar__top { display:flex; align-items:center; justify-content:space-between; gap:.4rem; margin-bottom:1.25rem; min-height:2.5rem; }
.workspace-sidebar__caption { font-size:.72rem; color:var(--ds-color-on-surface-variant); padding-left:.6rem; }
.workspace-sidebar__toggle { display:grid; place-items:center; flex-shrink:0; width:2.5rem; height:2.5rem; border:1px solid var(--ds-color-outline); background:transparent; color:var(--ds-color-on-surface-variant); border-radius:.8rem; cursor:pointer; font-size:1.25rem; }
.workspace-sidebar--collapsed .workspace-sidebar__top { justify-content:center; }
.workspace-sidebar__nav { flex:1; min-height:0; overflow-y:auto; scrollbar-width:thin; }
.workspace-sidebar__group + .workspace-sidebar__group { margin-top:1.5rem; }
.workspace-sidebar__group h2 { margin:0 .7rem .6rem; font-size:.64rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--ds-color-on-surface-variant); }
.workspace-sidebar__link { display:flex; align-items:center; gap:.8rem; min-height:2.8rem; width:100%; margin:.25rem 0; padding:.7rem .8rem; border:1px solid transparent; border-radius:.8rem; background:transparent; color:var(--ds-color-on-surface-variant); text-align:left; font:inherit; font-size:.82rem; font-weight:500; cursor:pointer; transition:background 160ms ease,color 160ms ease; }
.workspace-sidebar__link > .app-icon { font-size:1.25rem; flex-shrink:0; }
.workspace-sidebar__link > span { flex:1; }
.workspace-sidebar__link .workspace-sidebar__chevron { font-size:.85rem; }
.workspace-sidebar__link:hover, .workspace-sidebar__toggle:hover { background:var(--ds-action-neutral-hover); color:var(--ds-color-on-surface); }
.workspace-sidebar__link.is-active { background:var(--ds-selection-bg); border-color:transparent; box-shadow:inset 3px 0 0 var(--ds-selection-text); color:var(--ds-selection-text); font-weight:700; }
.workspace-sidebar--collapsed .workspace-sidebar__link { justify-content:center; padding:.7rem; }
.workspace-sidebar__footer { border-top:1px solid var(--ds-color-outline); padding-top:.75rem; margin-top:1rem; }
.workspace-sidebar__subnav { margin:.4rem 0 .2rem 1.35rem; padding-left:.8rem; border-left:1px solid var(--ds-color-outline); }
.workspace-sidebar__subnav a { display:flex; align-items:center; gap:.55rem; padding:.6rem .35rem; text-decoration:none; color:var(--ds-color-on-surface-variant); font-size:.75rem; }
.workspace-sidebar__subnav a.is-active, .workspace-sidebar__subnav a:hover { color:var(--ds-color-primary); }
button:focus-visible, a:focus-visible { outline:3px solid var(--ds-focus-ring); outline-offset:-3px; }
@media (max-width: 800px) { .workspace-sidebar { display:none; } }
@media (prefers-reduced-motion: reduce) { .workspace-sidebar__link { transition:none; } }
</style>
