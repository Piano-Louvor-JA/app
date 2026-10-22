<script setup lang="ts">
import StagePaletteButton from "@modules/settings/components/StagePaletteButton.vue";
import { onBeforeUnmount, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from 'vue-i18n';
import { useInAppProjectionMinimized } from '@shared/composables/useInAppProjectionMinimized';
import { usePrimaryProjectionControls } from '@shared/composables/usePrimaryProjectionControls';

const { t } = useI18n();
const { primaryOnly, minimizeVisible, controlsVisible, wake } = usePrimaryProjectionControls();
const props = defineProps<{
	label: string;
	closeLabel: string;
	hint: string;
	scope: string;
}>();

const minimized = useInAppProjectionMinimized(props.scope);
const projectionWindow = ref<HTMLElement | null>(null);
const fullscreenRoot = ref<HTMLElement | null>(null);

async function leaveFullscreen() {
  if (!fullscreenRoot.value || document.fullscreenElement !== fullscreenRoot.value) return;
  try { await document.exitFullscreen?.(); } catch { /* Janela já saiu de fullscreen. */ }
}

async function enterFullscreen() {
  const root = fullscreenRoot.value;
  if (!root || document.fullscreenElement === root) return;
  try {
    await root.requestFullscreen?.();
  } catch {
    // Sem permissão do sistema, o palco ainda ocupa toda a área do aplicativo.
  }
}

watch(primaryOnly, (single) => {
  if (!single) minimized.value = false;
});

watch(minimized, (value) => {
  document.documentElement.classList.toggle('inapp-projection-open', !value);
  if (!value) wake();
}, { flush: 'sync' });

watch(minimized, (value) => {
  if (value) void leaveFullscreen();
  else {
    projectionWindow.value?.focus();
    void enterFullscreen();
  }
}, { flush: 'post' });

const emit = defineEmits<{
	close: [];
}>();

function onGlobalKeydown(event: KeyboardEvent) {
	if (minimized.value) return;
	if (event.key !== "Escape") return;
	const target = event.target as HTMLElement | null;
	if (target?.isContentEditable || target?.tagName === "TEXTAREA") return;
	if (target?.tagName === "INPUT") {
		const type = (target as HTMLInputElement).type.toLowerCase(); // HTMLInputElement.type defaults to "text".
		if (
			![
				"button",
				"checkbox",
				"radio",
				"range",
				"file",
				"reset",
				"submit",
				"color",
				"hidden",
			].includes(type)
		) {
			return;
		}
	}
	event.preventDefault();
	event.stopPropagation();
	emit("close");
}

onMounted(() => {
  minimized.value = false;
  void enterFullscreen();
	document.documentElement.classList.add("inapp-projection-open");
	window.addEventListener("keydown", onGlobalKeydown, true);
});

onBeforeUnmount(() => { void leaveFullscreen(); });

onUnmounted(() => {
  minimized.value = false;
	document.documentElement.classList.remove("inapp-projection-open");
	window.removeEventListener("keydown", onGlobalKeydown, true);
});
</script>

<template>
  <div
    ref="fullscreenRoot"
    v-show="!minimized"
    class="inapp-projection"
    :class="{ 'inapp-projection--idle': !controlsVisible }"
    role="dialog"
    aria-modal="true"
    :aria-label="props.label"
  >
    <section
      ref="projectionWindow"
      class="inapp-projection__window"
      tabindex="-1"
    >
      <header v-show="controlsVisible" class="inapp-projection__toolbar">
        <button
          type="button"
          class="inapp-projection__tool-btn"
          :aria-label="props.closeLabel"
          :title="props.closeLabel"
          @click="emit('close')"
        >
          <i
            class="ti ti-x"
            aria-hidden="true"
          />
        </button>
        <button
          v-if="minimizeVisible"
          type="button"
          class="inapp-projection__tool-btn"
          data-testid="minimize-projection"
          :aria-label="t('projection.minimizeProjection')"
          :title="t('projection.minimizeProjection')"
          @click="minimized = true"
        >
          <i class="ti ti-minus" aria-hidden="true" />
        </button>
      </header>

      <div v-show="controlsVisible" class="inapp-projection__stage-palette">
        <p class="inapp-projection__hotkey-hint">
          {{ props.hint }}
        </p>
        <StagePaletteButton :scope="props.scope" />
      </div>

      <div class="inapp-projection__stage">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.inapp-projection {
  position: fixed;
  inset: 0;
  z-index: 100002;
  display: flex;
  flex-direction: column;
  padding: 0;
  box-sizing: border-box;
  background: #000;
  width: 100%;
  height: 100%;
}

.inapp-projection--idle {
  cursor: none;
}

.inapp-projection__window {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 0;
  overflow: hidden;
  background: #000;
  border: none;
}

.inapp-projection__toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 30;
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.25rem;
  border-radius: var(--ds-radius-lg, 16px 0 16px 0);
  background: rgb(30 30 30 / 0.75);
  border: 1px solid rgb(255 255 255 / 0.12);
}

.inapp-projection__tool-btn {
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgb(255 255 255 / 0.12);
  }
}

.inapp-projection__stage-palette {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  max-width: calc(100% - 5.5rem);
}

.inapp-projection__hotkey-hint {
  margin: 0;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.45);
  border: 1px solid rgb(255 255 255 / 0.12);
  color: rgb(255 255 255 / 0.85);
  font-size: 0.72rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inapp-projection__stage {
  position: absolute;
  inset: 0;
}
</style>
