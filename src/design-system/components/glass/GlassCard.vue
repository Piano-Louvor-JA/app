<script setup lang="ts">
import { useBlurSystem } from "@design-system/composables";

withDefaults(
	defineProps<{
		padding?: boolean;
		elevated?: boolean;
	}>(),
	{
		padding: true,
		elevated: false,
	},
);

/** Garante ThemeManager aplicado (vars --ds-blur-active / --ds-glass-fill). */
useBlurSystem();
</script>

<template>
  <div
    class="ds-glass-card"
    :class="{
      'ds-glass-card--padded': padding,
      'ds-glass-card--elevated': elevated,
    }"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ds-glass-card {
  border-radius: var(--ds-radius-lg);
  background: color-mix(
    in srgb,
    var(--ds-color-surface-card) var(--ds-glass-fill, 72%),
    transparent
  );
  border: 1px solid var(--ds-color-outline-strong);
  color: var(--ds-color-on-surface);
  backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  transition:
    background-color var(--ds-motion-duration, 280ms) ease,
    border-color var(--ds-motion-duration, 280ms) ease,
    backdrop-filter var(--ds-motion-duration, 280ms) ease,
    -webkit-backdrop-filter var(--ds-motion-duration, 280ms) ease,
    transform 200ms ease;

  &--padded {
    padding: var(--ds-spacing-page, 20px);
    padding: 20px;
  
    @media (max-width: 1280px) {
          padding: 0.75rem;
        }
}

  &--elevated {
    background: color-mix(
      in srgb,
      var(--ds-color-surface-elevated) var(--ds-glass-fill, 80%),
      transparent
    );
  }

  &:hover {
    border-color: color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
  }
}
</style>
