<script setup lang="ts">
import { computed } from 'vue'
import { iconNodes } from '../icons/tabler'
const props = withDefaults(defineProps<{ name: string; size?: number | string }>(), { size: '1.25em' })
const key = computed(() => props.name.replace(/^ti-/, ''))
const nodes = computed(() => iconNodes[key.value])
</script>
<template>
  <svg v-if="nodes" class="app-icon" :data-icon="key" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <component :is="node.tag" v-for="(node, index) in nodes" :key="index" v-bind="node.attrs" />
  </svg>
  <i v-else class="ti app-icon-fallback" :class="`ti-${key}`" aria-hidden="true" />
</template>
<style scoped>
.app-icon { display: inline-block; flex-shrink: 0; vertical-align: -.18em; }
.app-icon-fallback { font-size: 1.25em; }
</style>
