<script setup lang="ts">
import { identifySystemDisplays } from '@modules/settings/services/display-service'
import { useIndependentProjectionControl } from '@shared/composables/useIndependentProjection'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** Id do módulo na popup de projeção (clock, timer, countdown, random, bible). */
  moduleId: string
  /** Prepara o estado do módulo antes de abrir (ex.: publicar o versículo). */
  beforeProject?: () => boolean | Promise<boolean>
}>()

const { t } = useI18n()
const { monitors, available, activeMonitorId, project, stop } =
  useIndependentProjectionControl(props.moduleId)

const open = ref(false)
const busy = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const active = computed(() => activeMonitorId.value != null)
const activeIndex = computed(
  () => monitors.value.find((monitor) => monitor.id === activeMonitorId.value)?.index ?? null,
)

const tooltip = computed(() => {
  if (!available.value) return t('independentProjection.unavailable')
  if (activeIndex.value != null) {
    return t('independentProjection.activeOn', { index: activeIndex.value })
  }
  return t('independentProjection.title')
})

watch(available, (isAvailable) => {
  if (!isAvailable) open.value = false
})

function onTriggerClick() {
  if (!available.value) return
  open.value = !open.value
}

async function onSelect(monitorId: number) {
  if (busy.value) return
  busy.value = true
  try {
    if (props.beforeProject && !(await props.beforeProject())) return
    if (await project(monitorId)) open.value = false
  } finally {
    busy.value = false
  }
}

function onStop() {
  stop()
  open.value = false
}

function onIdentify() {
  void identifySystemDisplays()
}

/* v8 ignore start -- posicionamento do painel depende de layout real (jsdom zera rects) */
function updatePanelPosition() {
  const trigger = rootEl.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const panelWidth = Math.min(264, window.innerWidth - 16)
  const left = Math.min(
    Math.max(8, rect.right - panelWidth),
    window.innerWidth - panelWidth - 8,
  )
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceBelow < 260 && rect.top > spaceBelow
  panelStyle.value = {
    position: 'fixed',
    width: `${panelWidth}px`,
    left: `${left}px`,
    zIndex: '80',
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + 8}px`, top: 'auto' }
      : { top: `${rect.bottom + 8}px`, bottom: 'auto' }),
  }
}
/* v8 ignore stop */

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (rootEl.value?.contains(target) || panelEl.value?.contains(target)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') open.value = false
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updatePanelPosition()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="independent-projection"
  >
    <button
      type="button"
      class="independent-projection__trigger"
      :class="{
        'independent-projection__trigger--active': active,
        'independent-projection__trigger--disabled': !available,
      }"
      :aria-disabled="!available"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-label="tooltip"
      :title="tooltip"
      data-testid="independent-projection-trigger"
      @click.stop="onTriggerClick"
    >
      <i
        class="ti ti-device-desktop-share"
        aria-hidden="true"
      />
      <span
        v-if="activeIndex != null"
        class="independent-projection__badge"
      >{{ activeIndex }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelEl"
        class="independent-projection__panel"
        :style="panelStyle"
        role="dialog"
        :aria-label="t('independentProjection.title')"
        data-testid="independent-projection-panel"
        @click.stop
      >
        <div class="independent-projection__header">
          <p class="independent-projection__title">
            {{ t('independentProjection.title') }}
          </p>
          <button
            type="button"
            class="independent-projection__identify"
            :title="t('monitors.identify')"
            :aria-label="t('monitors.identify')"
            @click="onIdentify"
          >
            <i
              class="ti ti-zoom-scan"
              aria-hidden="true"
            />
          </button>
        </div>
        <p class="independent-projection__hint">
          {{ t('independentProjection.hint') }}
        </p>

        <ul
          class="independent-projection__list"
          role="radiogroup"
          :aria-label="t('independentProjection.title')"
        >
          <li
            v-for="monitor in monitors"
            :key="monitor.id"
          >
            <button
              type="button"
              role="radio"
              class="independent-projection__option"
              :class="{ 'independent-projection__option--active': monitor.id === activeMonitorId }"
              :aria-checked="monitor.id === activeMonitorId"
              :disabled="busy"
              :data-monitor-id="monitor.id"
              @click="onSelect(monitor.id)"
            >
              <i
                class="ti"
                :class="monitor.id === activeMonitorId ? 'ti-circle-check' : 'ti-circle'"
                aria-hidden="true"
              />
              <span class="independent-projection__option-body">
                <span class="independent-projection__option-name">
                  {{ t('independentProjection.monitor', { index: monitor.index }) }}
                </span>
                <span class="independent-projection__option-meta">{{ monitor.resolutionLabel }}</span>
              </span>
            </button>
          </li>
        </ul>

        <button
          v-if="active"
          type="button"
          class="independent-projection__stop"
          data-testid="independent-projection-stop"
          @click="onStop"
        >
          <i
            class="ti ti-player-stop"
            aria-hidden="true"
          />
          {{ t('independentProjection.stop') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.independent-projection {
  position: relative;
  display: inline-flex;
  pointer-events: auto;
}

.independent-projection__trigger {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background-color 160ms ease,
    opacity 160ms ease;

  .ti {
    font-size: 1.25rem;
    line-height: 1;
  }

  &:hover {
    transform: scale(1.06);
    background: color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
  }

  &--active {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
    border-color: transparent;
  }

  &--disabled,
  &--disabled:hover {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    background: color-mix(in srgb, var(--ds-color-surface-card) 88%, transparent);
  }
}

.independent-projection__badge {
  position: absolute;
  top: -0.3rem;
  right: -0.3rem;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--ds-color-on-surface);
  color: var(--ds-color-surface, #121212);
}

.independent-projection__panel {
  padding: 0.75rem;
  border-radius: 0.65rem 0 0.65rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  background: color-mix(in srgb, var(--ds-color-surface-container-high, #2a2a2a) 96%, transparent);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(14px);
  color: var(--ds-color-on-surface);
}

.independent-projection__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.independent-projection__title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
}

.independent-projection__identify {
  width: 1.9rem;
  height: 1.9rem;
  border: none;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  }
}

.independent-projection__hint {
  margin: 0.25rem 0 0.6rem;
  font-size: 0.72rem;
  line-height: 1.35;
  color: color-mix(in srgb, var(--ds-color-on-surface) 70%, transparent);
}

.independent-projection__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.independent-projection__option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  }

  &--active {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }

  &:disabled {
    cursor: progress;
  }
}

.independent-projection__option-body {
  display: flex;
  flex-direction: column;
}

.independent-projection__option-name {
  font-size: 0.82rem;
  font-weight: 600;
}

.independent-projection__option-meta {
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--ds-color-on-surface) 65%, transparent);
}

.independent-projection__stop {
  margin-top: 0.6rem;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  border: none;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 85%, transparent);
  color: #1a1a1a;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
</style>
