<script setup lang="ts">
import { useMonitorTargetSelect } from "@shared/composables/useMonitorTargetSelect";
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	ref,
	watch,
} from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
	defineProps<{
		modelValue?: number[];
		/** Persiste em projection.settings (default true). */
		persist?: boolean;
		/** Só monitores estendidos (default true). */
		extendedOnly?: boolean;
		disabled?: boolean;
		/** Layout compacto para barras de ação. */
		dense?: boolean;
		/** Exibe chip "Telas" ao lado do botão (header global). */
		showLabel?: boolean;
	}>(),
	{
		persist: true,
		extendedOnly: true,
		disabled: false,
		dense: false,
		showLabel: false,
	},
);

const emit = defineEmits<{
	"update:modelValue": [ids: number[]];
	change: [ids: number[]];
}>();

const { t } = useI18n();
const rootEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

const modelRef = computed(() => props.modelValue);

const {
	optionsList,
	selectedCount,
	hasDisplays,
	loading,
	identifying,
	open,
	toggle,
	identify,
	toggleOpen,
	close,
	refresh,
} = useMonitorTargetSelect({
	persist: props.persist,
	extendedOnly: props.extendedOnly,
	modelValue: () => modelRef.value,
	onUpdate: (ids) => {
		emit("update:modelValue", ids);
		emit("change", ids);
	},
});

const triggerLabel = computed(() => {
	if (selectedCount.value > 0) {
		return t("monitors.selectedCount", { count: selectedCount.value });
	}
	return t("monitors.selectScreens");
});

function updatePanelPosition() {
	const trigger = rootEl.value;
	if (!trigger) return;

	const rect = trigger.getBoundingClientRect();
	const panelWidth = Math.min(296, window.innerWidth - 16);
	const left = Math.min(
		Math.max(8, rect.right - panelWidth),
		window.innerWidth - panelWidth - 8,
	);
	const spaceBelow = window.innerHeight - rect.bottom;
	const openUp = spaceBelow < 280 && rect.top > spaceBelow;

	panelStyle.value = {
		position: "fixed",
		width: `${panelWidth}px`,
		left: `${left}px`,
		zIndex: "80",
		...(openUp
			? { bottom: `${window.innerHeight - rect.top + 8}px`, top: "auto" }
			: { top: `${rect.bottom + 8}px`, bottom: "auto" }),
	};
}

function onDocumentPointerDown(event: PointerEvent) {
	if (!open.value) return;
	const target = event.target;
	if (!(target instanceof Node)) return;
	if (rootEl.value?.contains(target)) return;
	if (panelEl.value?.contains(target)) return;
	close();
}

function onWindowChange() {
	if (!open.value) return;
	updatePanelPosition();
}

function onToggle(displayId: number) {
	if (props.disabled) return;
	toggle(displayId);
}

async function onIdentify() {
	if (props.disabled || identifying.value) return;
	await identify();
}

onMounted(() => {
	document.addEventListener("pointerdown", onDocumentPointerDown, true);
	window.addEventListener("resize", onWindowChange);
	window.addEventListener("scroll", onWindowChange, true);
});

onBeforeUnmount(() => {
	document.removeEventListener("pointerdown", onDocumentPointerDown, true);
	window.removeEventListener("resize", onWindowChange);
	window.removeEventListener("scroll", onWindowChange, true);
});

watch(open, async (isOpen) => {
	if (!isOpen) return;
	await refresh();
	await nextTick();
	updatePanelPosition();
});
</script>

<template>
  <div
    ref="rootEl"
    class="monitor-target-select"
    :class="{
      'monitor-target-select--dense': dense,
      'monitor-target-select--header': showLabel,
      'monitor-target-select--open': open,
      'monitor-target-select--disabled': disabled,
    }"
  >
    <span
      v-if="showLabel"
      class="monitor-target-select__chip"
    >
      {{ t('popupCount.label') }}
    </span>
    <button
      type="button"
      class="monitor-target-select__trigger"
      :disabled="disabled"
      :title="t('popupCount.tooltip')"
      :aria-label="t('monitors.selectScreens')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click.stop="toggleOpen"
    >
      <i
        class="ti ti-devices"
        aria-hidden="true"
      />
      <span
        v-if="!dense && !showLabel"
        class="monitor-target-select__trigger-label"
      >
        {{ triggerLabel }}
      </span>
      <span
        v-if="selectedCount > 0"
        class="monitor-target-select__badge"
      >
        {{ selectedCount }}
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelEl"
        class="monitor-target-select__panel"
        :style="panelStyle"
        role="dialog"
        :aria-label="t('monitors.selectScreens')"
        @click.stop
      >
        <div class="monitor-target-select__header">
          <p class="monitor-target-select__title">
            {{ t('monitors.selectScreens') }}
          </p>
          <button
            type="button"
            class="monitor-target-select__identify"
            :disabled="disabled || identifying || loading || !hasDisplays"
            :title="t('monitors.identify')"
            :aria-label="t('monitors.identify')"
            @click="onIdentify"
          >
            <i
              class="ti"
              :class="identifying ? 'ti-loader-2' : 'ti-zoom-scan'"
              aria-hidden="true"
            />
            <span>{{ t('monitors.identify') }}</span>
          </button>
        </div>

        <p class="monitor-target-select__hint">
          {{ t('monitors.hint') }}
        </p>

        <div
          v-if="loading && !hasDisplays"
          class="monitor-target-select__empty"
          role="status"
        >
          {{ t('monitors.loading') }}
        </div>

        <div
          v-else-if="!hasDisplays"
          class="monitor-target-select__empty"
          role="status"
        >
          {{ t('monitors.empty') }}
        </div>

        <ul
          v-else
          class="monitor-target-select__list"
          role="group"
          :aria-label="t('monitors.selectScreens')"
        >
          <li
            v-for="monitor in optionsList"
            :key="monitor.id"
          >
            <label
              class="monitor-target-select__option"
              :class="{
                'monitor-target-select__option--active': monitor.isSelected,
                'monitor-target-select__option--return': monitor.isReturn,
              }"
            >
              <input
                type="checkbox"
                class="monitor-target-select__checkbox"
                :checked="monitor.isSelected"
                :disabled="disabled"
                @change="onToggle(monitor.id)"
              >
              <span class="monitor-target-select__option-body">
                <span class="monitor-target-select__option-name">
                  {{ monitor.label }}
                  <span
                    v-if="monitor.isPrimary"
                    class="monitor-target-select__tag"
                  >
                    {{ t('monitors.primary') }}
                  </span>
                  <span
                    v-if="monitor.isReturn"
                    class="monitor-target-select__tag monitor-target-select__tag--return"
                  >
                    {{ t('monitors.returnScreen') }}
                  </span>
                </span>
                <span class="monitor-target-select__option-meta">
                  {{ monitor.resolutionLabel }}
                </span>
              </span>
            </label>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.monitor-target-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.monitor-target-select__chip {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  min-height: 2rem;
  padding: 0.25rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.2;
  user-select: none;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
}

.monitor-target-select__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 2.05rem;
  height: 2.05rem;
  padding: 0 0.45rem;
  border: 0;
  border-radius: 0.4rem 0 0.4rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
    color: var(--ds-color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  i {
    font-size: 1.15rem;
    line-height: 1;
  }
}

.monitor-target-select--header .monitor-target-select__trigger {
  min-width: 2.25rem;
  min-height: 2.25rem;
  height: 2.25rem;
  border-radius: var(--ds-radius-md, 0.75rem);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);

  &:hover:not(:disabled) {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
    color: var(--ds-color-primary);
  }

  i {
    font-size: 1.05rem;
  }
}

.monitor-target-select--dense .monitor-target-select__trigger {
  width: 2.05rem;
  height: 2.05rem;
  padding: 0;
  color: var(--ds-color-on-primary, #003258);
  background: var(--ds-color-primary);
  box-shadow: 0 0 14px color-mix(in srgb, var(--ds-color-primary) 36%, transparent);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 90%, white);
    color: var(--ds-color-on-primary, #003258);
  }
}

.monitor-target-select--open .monitor-target-select__trigger {
  outline: 2px solid color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
  outline-offset: 1px;
}

.monitor-target-select__trigger-label {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.monitor-target-select__badge {
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 16%, transparent);
  color: inherit;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.1rem;
  text-align: center;
}

.monitor-target-select--dense .monitor-target-select__badge {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  background: var(--ds-color-secondary, #78d6d2);
  color: var(--ds-color-on-secondary, #003736);
}

.monitor-target-select--header .monitor-target-select__badge {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 0.6875rem;
  line-height: 1.15rem;
}

.monitor-target-select__panel {
  padding: 0.75rem;
  border-radius: 0.65rem 0 0.65rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  background: color-mix(
    in srgb,
    var(--ds-color-surface-container-high, #2a2a2a) 96%,
    transparent
  );
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  color: var(--ds-color-on-surface);
}

.monitor-target-select__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.monitor-target-select__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ds-color-on-surface);
}

.monitor-target-select__identify {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: 0.4rem 0 0.4rem 0;
  background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 18%, transparent);
  color: var(--ds-color-secondary, #78d6d2);
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 28%, transparent);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  i {
    font-size: 0.95rem;
    line-height: 1;
  }

  .ti-loader-2 {
    animation: monitor-target-spin 0.9s linear infinite;
  }
}

@keyframes monitor-target-spin {
  to {
    transform: rotate(360deg);
  }
}

.monitor-target-select__hint {
  margin: 0.45rem 0 0.65rem;
  font-size: 0.68rem;
  line-height: 1.35;
  color: color-mix(in srgb, var(--ds-color-on-surface) 55%, transparent);
}

.monitor-target-select__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 14rem;
  overflow: auto;
}

.monitor-target-select__option {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.55rem 0.6rem;
  border-radius: 0.45rem 0 0.45rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease;

  &:hover {
    border-color: color-mix(in srgb, var(--ds-color-primary) 40%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  }

  &--active {
    border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  }

  &--return {
    border-color: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 55%, transparent);
    background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 14%, transparent);

    &:hover {
      border-color: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 55%, transparent);
      background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 18%, transparent);
    }

    .monitor-target-select__checkbox {
      accent-color: var(--ds-color-secondary, #78d6d2);
    }
  }
}

.monitor-target-select__checkbox {
  margin: 0.15rem 0 0;
  width: 0.95rem;
  height: 0.95rem;
  accent-color: var(--ds-color-primary);
  cursor: pointer;
}

.monitor-target-select__option-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.monitor-target-select__option-name {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--ds-color-on-surface);
}

.monitor-target-select__option-meta {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--ds-color-on-surface) 52%, transparent);
}

.monitor-target-select__tag {
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.monitor-target-select__tag--return {
  background: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 22%, transparent);
  color: var(--ds-color-secondary, #78d6d2);
}

.monitor-target-select__empty {
  margin: 0;
  padding: 0.7rem 0.75rem;
  border-radius: 0.45rem 0 0.45rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  color: color-mix(in srgb, var(--ds-color-on-surface) 62%, transparent);
  font-size: 0.72rem;
  line-height: 1.4;
}
</style>
