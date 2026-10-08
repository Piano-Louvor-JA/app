<script setup lang="ts">
import type { DockNavItem } from "@design-system/types/navigation";

const props = withDefaults(
	defineProps<{
		items: DockNavItem[];
		activeKey?: string;
	}>(),
	{
		activeKey: undefined,
	},
);

const emit = defineEmits<{
	select: [key: string];
}>();

function isActive(key: string) {
	return props.activeKey === key;
}

function onSelect(key: string) {
	emit("select", key);
}
</script>

<template>
  <nav class="ds-dock" aria-label="Navegação principal">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="ds-dock__item"
      :class="{ 'ds-dock__item--active': isActive(item.key) }"
      @click="onSelect(item.key)"
    >
      <i class="ti ds-dock__icon" :class="item.icon" aria-hidden="true" />
      <span class="ds-dock__label">{{ item.label }}</span>
      <span v-if="isActive(item.key)" class="ds-dock__dot" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped lang="scss">
.ds-dock {
  position: fixed;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: flex;
  width: 100%;
  height: var(--ds-dock-height, 72px);
  align-items: flex-end;
  justify-content: center;
  gap: clamp(0.25rem, calc(100vw / 30), 3rem);
  padding: 0 var(--ds-spacing-page, 32px) 0.5rem;
  border-top: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface);
  transition: background-color var(--ds-motion-duration, 280ms) ease;

  @media (max-width: 600px) {
    gap: 0;
    justify-content: space-around;
    padding: 0 0.25rem 0.25rem;
    height: calc(var(--ds-dock-height, 72px) - env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  @media (max-width: 1280px) {
      gap: clamp(0.25rem, calc(100vw / 40), 1.5rem);
    }
}

.ds-dock__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-width: 44px;
  min-height: 44px;
  padding: 0.25rem 0.5rem;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
  transform-origin: bottom center;
  transition:
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
    color 200ms ease;

  &:hover {
    color: var(--ds-color-on-surface);
    transform: scale(1.25) translateY(-4px);
  }

  &--active {
    color: var(--ds-color-primary-soft);
  }

  @media (max-width: 600px) {
    gap: 0.125rem;
    padding: 0.25rem 0.15rem;
    flex: 1 1 0;
    min-width: 0;
  }
}

.ds-dock__icon {
  font-size: 24px;
  line-height: 1;

  @media (max-width: 1280px) {
      font-size: 22px;
    }
}

.ds-dock__label {
  max-width: 7.5rem;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: 0.02em;
  text-align: center;
  white-space: normal;

  @media (max-width: 600px) {
    font-size: 9px;
    max-width: 3.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 1280px) {
      font-size: 10px;
      max-width: 6rem;
    }
}

.ds-dock__dot {
  position: absolute;
  bottom: -2px;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: var(--ds-color-primary);
}
</style>
