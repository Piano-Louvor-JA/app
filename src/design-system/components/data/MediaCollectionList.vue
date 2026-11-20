<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		modelValue: string;
		searchPlaceholder: string;
		searchAriaLabel?: string;
		clearAriaLabel?: string;
		numberLabel: string;
		titleLabel: string;
		durationLabel: string;
		actionsLabel: string;
		loading?: boolean;
		loadingLabel?: string;
		empty?: boolean;
		emptyLabel?: string;
	}>(),
	{
		searchAriaLabel: "",
		clearAriaLabel: "",
		loading: false,
		loadingLabel: "",
		empty: false,
		emptyLabel: "",
	},
);

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

function updateSearch(event: Event) {
	emit("update:modelValue", (event.target as HTMLInputElement).value);
}

function clearSearch() {
	emit("update:modelValue", "");
}
</script>

<template>
  <div class="ds-media-collection-list">
    <label class="ds-media-collection-list__search">
      <i
        class="ti ti-search"
        aria-hidden="true"
      />
      <input
        type="search"
        :value="modelValue"
        :placeholder="searchPlaceholder"
        :aria-label="searchAriaLabel || searchPlaceholder"
        autocomplete="off"
        @input="updateSearch"
      >
      <button
        v-if="modelValue"
        type="button"
        class="ds-media-collection-list__clear"
        :aria-label="clearAriaLabel || searchAriaLabel || searchPlaceholder"
        @click="clearSearch"
      >
        <i
          class="ti ti-x"
          aria-hidden="true"
        />
      </button>
    </label>

    <div class="ds-media-collection-list__content">
      <div
        class="ds-media-collection-list__header"
        aria-hidden="true"
      >
        <span>{{ numberLabel }}</span>
        <span>{{ titleLabel }}</span>
        <span class="ds-media-collection-list__header-center">
          {{ durationLabel }}
        </span>
        <span class="ds-media-collection-list__header-end">
          {{ actionsLabel }}
        </span>
      </div>

      <div class="ds-media-collection-list__panel">
        <div
          v-if="loading"
          class="ds-media-collection-list__state"
        >
          {{ loadingLabel }}
        </div>
        <div
          v-else-if="empty"
          class="ds-media-collection-list__state"
        >
          {{ emptyLabel }}
        </div>
        <div
          v-else
          class="ds-media-collection-list__items"
        >
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ds-media-collection-list {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: var(--ds-spacing-6, 24px);
  container-type: inline-size;
  container-name: media-collection-list;
}

.ds-media-collection-list__search {
  align-self: center;
  display: flex;
  width: 100%;
  min-height: 3.5rem;
  align-items: center;
  gap: var(--ds-spacing-2, 8px);
  padding: 0 var(--ds-spacing-4, 16px);
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: color-mix(
    in srgb,
    var(--ds-color-surface-elevated) var(--ds-glass-fill, 80%),
    transparent
  );
  color: var(--ds-color-on-surface-variant);
  backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  transition:
    border-color var(--ds-motion-duration, 280ms) ease,
    box-shadow var(--ds-motion-duration, 280ms) ease,
    background-color var(--ds-motion-duration, 280ms) ease;

  /* Mesma proporção dos containers de hinário (2 colunas). */
  @media (min-width: 768px) {
    width: calc((100cqi - 1.25rem) / 2);
  }

  &:focus-within {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  > .ti {
    flex-shrink: 0;
    color: var(--ds-color-outline);
    font-size: 1.35rem;
    transition: color var(--ds-motion-duration, 280ms) ease;
  }

  &:focus-within > .ti {
    color: var(--ds-color-primary);
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ds-color-on-surface);
    font-family: var(--ds-font-family);
    font-size: 1rem;
    line-height: 1.5rem;

    &::placeholder {
      color: color-mix(
        in srgb,
        var(--ds-color-on-surface-variant) 55%,
        transparent
      );
    }

    &::-webkit-search-cancel-button {
      display: none;
    }
  }
}

.ds-media-collection-list__clear {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: var(--ds-radius-full, 9999px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  &:hover {
    background: color-mix(
      in srgb,
      var(--ds-color-surface-variant) 65%,
      transparent
    );
    color: var(--ds-color-primary);
  }
}

.ds-media-collection-list__content {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: var(--ds-spacing-1, 4px);
}

.ds-media-collection-list__header {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) 7rem 11.5rem;
  align-items: center;
  gap: var(--ds-spacing-3, 12px);
  padding: var(--ds-spacing-2, 8px) var(--ds-spacing-6, 24px);
  color: var(--ds-color-primary);
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 0.875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ds-media-collection-list__header-center {
  text-align: center;
}

.ds-media-collection-list__header-end {
  text-align: right;
}

.ds-media-collection-list__panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
}

.ds-media-collection-list__items {
  height: 100%;
  overflow-y: auto;
  padding: var(--ds-spacing-2, 8px);
  scrollbar-width: thin;
  scrollbar-color: var(--ds-color-primary) transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: var(--ds-radius-full, 9999px);
    background: var(--ds-color-primary);
  }
}

.ds-media-collection-list__state {
  padding: var(--ds-spacing-6, 24px);
  color: var(--ds-color-on-surface-variant);
  font-size: 0.875rem;
  line-height: 1.25rem;
}

@media (max-width: 800px) {
  .ds-media-collection-list__header {
    display: none;
  }
}

@media (max-width: 1280px) {
  .ds-media-collection-list {
    gap: 1rem;
  }

  .ds-media-collection-list__search {
    min-height: 2.75rem;
  }

  .ds-media-collection-list__header {
    padding: 0.375rem 1rem;
  }

  .ds-media-collection-list__items {
    padding: 0.35rem;
  }

  .ds-media-collection-list__state {
    padding: 1rem;
  }
}
</style>
