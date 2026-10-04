<script setup lang="ts">
import StagePaletteButton from "@modules/settings/components/StagePaletteButton.vue";
import { onMounted, onUnmounted } from "vue";

const props = defineProps<{
	label: string;
	closeLabel: string;
	hint: string;
	scope: string;
}>();

const emit = defineEmits<{
	close: [];
}>();

function onGlobalKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	const target = event.target as HTMLElement | null;
	if (target?.isContentEditable || target?.tagName === "TEXTAREA") return;
	if (target?.tagName === "INPUT") {
		const type = ((target as HTMLInputElement).type || "text").toLowerCase();
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
	document.documentElement.classList.add("inapp-projection-open");
	window.addEventListener("keydown", onGlobalKeydown, true);
});

onUnmounted(() => {
	document.documentElement.classList.remove("inapp-projection-open");
	window.removeEventListener("keydown", onGlobalKeydown, true);
});
</script>

<template>
  <div
    class="inapp-projection"
    role="dialog"
    aria-modal="true"
    :aria-label="props.label"
  >
    <section
      class="inapp-projection__window"
      tabindex="-1"
    >
      <header class="inapp-projection__toolbar">
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
      </header>

      <div class="inapp-projection__stage-palette">
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
  z-index: 80;
  display: flex;
  flex-direction: column;
  padding:
    calc(var(--app-titlebar-height, 0px) + 1.5rem)
    1.25rem
    calc(var(--ds-dock-height, 5.5rem) + 0.75rem);
  box-sizing: border-box;
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(2px);
}

.inapp-projection__window {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  overflow: hidden;
  background: #000;
  border: 1px solid rgb(255 255 255 / 0.08);
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
