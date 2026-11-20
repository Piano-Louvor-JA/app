<script setup lang="ts">
import type { DockNavItem } from "@design-system/types/navigation";
import DockFooter from "./DockFooter.vue";

defineProps<{
	items: DockNavItem[];
	activeKey?: string;
}>();

defineEmits<{
	select: [key: string];
}>();
</script>

<template>
  <DockFooter
    :items="items"
    :active-key="activeKey"
    @select="$emit('select', $event)"
  />
</template>
