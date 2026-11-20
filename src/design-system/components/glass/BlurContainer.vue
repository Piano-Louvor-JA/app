<script setup lang="ts">
import { useBlurSystem } from "@design-system/composables";
import type { BlurToken } from "@design-system/tokens";
import { blur as blurTokens } from "@design-system/tokens";
import { computed } from "vue";

const props = withDefaults(
	defineProps<{
		level?: BlurToken;
	}>(),
	{
		level: undefined,
	},
);

const { backdropFilter, currentBlur } = useBlurSystem();

const style = computed(() => {
	const amount = props.level ? blurTokens[props.level] : currentBlur.value;
	const filter = props.level
		? `blur(${amount}) saturate(140%)`
		: backdropFilter.value;

	return {
		backdropFilter: filter,
		WebkitBackdropFilter: filter,
	};
});
</script>

<template>
  <div class="ds-blur-container" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ds-blur-container {
  isolation: isolate;
  background: color-mix(
    in srgb,
    var(--ds-color-surface-card) var(--ds-glass-fill, 72%),
    transparent
  );
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    backdrop-filter var(--ds-motion-duration, 280ms) ease;
}
</style>
