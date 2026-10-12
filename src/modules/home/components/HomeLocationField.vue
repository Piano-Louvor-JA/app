<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
	defineProps<{
		value: string;
		label: string;
		placeholder: string;
		size?: "lg" | "md";
	}>(),
	{
		size: "lg",
	},
);

const emit = defineEmits<{
	save: [value: string];
}>();

const { t } = useI18n();

const editing = ref(props.value.trim().length === 0);
const draft = ref(props.value);
const inputRef = ref<HTMLInputElement | null>(null);
const isFilled = computed(() => props.value.trim().length > 0);

watch(
	() => props.value,
	(next) => {
		if (!editing.value) {
			draft.value = next;
		}
		if (next.trim().length === 0) {
			editing.value = true;
			draft.value = "";
		}
	},
);

async function startEdit() {
	draft.value = props.value;
	editing.value = true;
	await nextTick();
	inputRef.value?.focus();
	inputRef.value?.select();
}

function commit() {
	const next = draft.value.trim();
	editing.value = next.length === 0;
	draft.value = next;
	if (next !== props.value.trim()) {
		emit("save", next);
	}
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === "Enter") {
		event.preventDefault();
		commit();
		inputRef.value?.blur();
	}
	if (event.key === "Escape") {
		event.preventDefault();
		draft.value = props.value;
		editing.value = props.value.trim().length === 0;
		inputRef.value?.blur();
	}
}
</script>

<template>
  <div
    class="home-location-field"
    :class="[
      `home-location-field--${size}`,
      {
        'home-location-field--editing': editing,
        'home-location-field--filled': !editing && isFilled,
      },
    ]"
  >
    <template v-if="editing">
      <span class="home-location-field__label">{{ label }}:</span>
      <input
        ref="inputRef"
        v-model="draft"
        class="home-location-field__input"
        type="text"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKeydown"
        @blur="commit"
      >
    </template>

    <template v-else>
      <p class="home-location-field__display">
        <span class="home-location-field__text">{{ label }} {{ value }}</span>
        <button
          type="button"
          class="home-location-field__edit"
          :aria-label="t('home.editField', { field: label })"
          :title="t('home.editField', { field: label })"
          @click="startEdit"
        >
          <i
            class="ti ti-pencil"
            aria-hidden="true"
          />
        </button>
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.home-location-field {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  max-width: 36rem;
  margin-inline: auto;
}

.home-location-field--lg {
  margin-bottom: 0.5rem;

  .home-location-field__label,
  .home-location-field__text {
    font-size: 32px;
    font-weight: 700;
    line-height: 40px;
    letter-spacing: -0.02em;
    color: var(--ds-color-on-surface);
  }

  .home-location-field__input {
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
    color: var(--ds-color-on-surface);
  }
}

.home-location-field--md {
  margin-bottom: 0;

  .home-location-field__label,
  .home-location-field__text {
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
    letter-spacing: -0.01em;
    color: var(--ds-color-on-surface-variant);
  }

  .home-location-field__input {
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    color: var(--ds-color-on-surface-variant);
  }
}

.home-location-field__label {
  flex-shrink: 0;
  white-space: nowrap;
}

.home-location-field__input {
  flex: 1;
  min-width: 0;
  max-width: 22rem;
  margin: 0;
  padding: 0.15rem 0.5rem;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-outline) 70%, transparent);
  border-radius: 0;
  outline: none;
  background: transparent;
  text-align: left;
  font: inherit;

  &::placeholder {
    color: color-mix(in srgb, var(--ds-color-on-surface-variant) 55%, transparent);
    font-size: inherit;
    font-weight: 400;
    line-height: inherit;
    letter-spacing: normal;
  }

  &:focus {
    border-bottom-color: var(--ds-color-primary);
  }
}

.home-location-field__display {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  max-width: 100%;
  margin: 0;
  padding-inline: 1.75rem;
}

.home-location-field__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-location-field__edit {
  position: absolute;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: var(--ds-radius-sm, 0.25rem);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  transition:
    opacity 150ms ease,
    color 150ms ease,
    background-color 150ms ease;

  .ti {
    font-size: 1rem;
    line-height: 1;
  }

  &:hover,
  &:focus-visible {
    color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  }

  &:focus-visible {
    opacity: 1;
    pointer-events: auto;
    outline: 1px solid var(--ds-color-primary);
  }
}

.home-location-field--filled:hover .home-location-field__edit,
.home-location-field--filled:focus-within .home-location-field__edit {
  opacity: 1;
  pointer-events: auto;
}

@media (max-width: 1280px) {
  .home-location-field--lg {
    .home-location-field__label,
    .home-location-field__text {
      font-size: 26px;
      line-height: 32px;
    }

    .home-location-field__input {
      font-size: 12px;
    }
  }

  .home-location-field--md {
    .home-location-field__label,
    .home-location-field__text {
      font-size: 20px;
      line-height: 26px;
    }

    .home-location-field__input {
      font-size: 11px;
    }
  }

  .home-location-field__display {
    padding-inline: 1.25rem;
  }
}
</style>
