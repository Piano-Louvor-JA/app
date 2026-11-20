<script setup lang="ts">
import { detectObsBeforeProjection } from '@modules/settings/services/obs-detection'
import { useObsConnections } from '@modules/settings/composables/useObsConnections'
import { obsConnectionName, assignObsConnection, obsAssignments, obsAssignmentModes, clearObsModule, type ObsModule } from '@modules/settings/services/obs-connections'

import {
  hasPalcoClients,
  listPalcoTvs,
  onPalcoClientsChanged,
  palcoTvKey,
  type PalcoClient,
} from '@modules/settings/services/palco-clients'
import { assignPalcoTv, clearPalcoTvModule, tvAssignmentModes, tvAssignments } from '@modules/settings/services/palco-tv-assignments'
import { identifySystemDisplays } from '@modules/settings/services/display-service'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'
import {
  useIndependentProjectionControl,
  type IndependentProjectionMode,
} from '@shared/composables/useIndependentProjection'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    /** Id do módulo na popup de projeção (clock, timer, countdown, random, bible, annotation). */
    moduleId: string
    /** Prepara o estado do módulo antes de abrir (ex.: publicar o versículo). */
    beforeProject?: () => boolean | Promise<boolean>
    /** Lista as saídas OBS (só módulos que a OBS sabe desenhar). */
    obs?: boolean
    /** Vários botões do mesmo módulo: só o dono do conteúdo no ar aparece ativo. */
    claimed?: boolean
    /** Botão menor, para linhas de lista. */
    compact?: boolean
  }>(),
  { beforeProject: undefined, obs: true, claimed: true, compact: false },
)

const { t } = useI18n()
const { monitors, available, activeMonitorIds: moduleMonitorIds, activeMode, project, unproject, stop } =
  useIndependentProjectionControl(props.moduleId)
/** Monitores (vários) onde este botão tem o módulo no ar. */
const activeMonitorIds = computed<number[]>(() => (props.claimed ? moduleMonitorIds.value : []))

/** Sobrepor (tela inteira) ou compartilhar (metade, com o que já está no monitor). */
const { activeConnections: allObsOutputs } = useObsConnections()
const obsOutputs = computed(() => (props.obs ? allObsOutputs.value : []))
const obsActive = computed(() => props.claimed && obsOutputs.value.some((item) => obsAssignments.value[item.id] === props.moduleId))

/** TVs do Palco: marcada = mostra só este módulo (sai da transmissão geral). */
const palcoEnabled = props.obs && hasPalcoClients()
const palcoTvs = ref<PalcoClient[]>([])
async function refreshPalcoTvs() {
  if (palcoEnabled) palcoTvs.value = await listPalcoTvs()
}
function tvHasModule(tv: PalcoClient) {
  return tvAssignments.value[palcoTvKey(tv)] === props.moduleId
}
const palcoActive = computed(() => props.claimed && palcoTvs.value.some(tvHasModule))
async function onTogglePalcoTv(tv: PalcoClient) {
  if (busy.value) return
  busy.value = true
  try {
    if (tvHasModule(tv)) {
      await assignPalcoTv(tv, null)
      return
    }
    if (props.beforeProject && !(await props.beforeProject())) return
    await assignPalcoTv(tv, props.moduleId as ObsModule, mode.value)
  } finally { busy.value = false }
}
let stopPalcoWatch: (() => void) | null = null

const outputAvailable = computed(() => available.value || obsOutputs.value.length > 0 || palcoTvs.value.length > 0)
/** Caixa de seleção da conexão: marca/desmarca só ela; monitores e outras conexões seguem. */
async function onToggleObs(id: string) {
  if (busy.value) return
  if (obsAssignments.value[id] === props.moduleId) {
    assignObsConnection(id, null)
    return
  }
  busy.value = true
  try {
    await detectObsBeforeProjection()
    if (props.beforeProject && !(await props.beforeProject())) return
    assignObsConnection(id, props.moduleId as ObsModule, mode.value)
  } finally { busy.value = false }
}

const mode = ref<IndependentProjectionMode>('overlay')
const MODES: IndependentProjectionMode[] = ['overlay', 'share']

const open = ref(false)
const busy = ref(false)
/** Monitores ligados no seletor "Telas" (lidos ao abrir o painel); os outros ficam desativados. */
const enabledMonitorIds = ref<number[]>(loadProjectionSettings().targetDisplayIds)
function isMonitorEnabled(monitorId: number): boolean {
  return enabledMonitorIds.value.includes(monitorId) || activeMonitorIds.value.includes(monitorId)
}
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const active = computed(() => activeMonitorIds.value.length > 0 || obsActive.value || palcoActive.value)
const effectiveMode = computed(() => {
  if (!props.claimed) return null
  const output = obsOutputs.value.find((item) => obsAssignments.value[item.id] === props.moduleId)
  return output ? obsAssignmentModes.value[output.id] ?? 'overlay' : activeMode.value
})
/** Números dos monitores no ar (mesmos do "Identificar"), em ordem. */
const activeIndexes = computed(() =>
  monitors.value.filter((monitor) => activeMonitorIds.value.includes(monitor.id)).map((monitor) => monitor.index),
)
const activeIndex = computed(() => (activeIndexes.value.length > 0 ? activeIndexes.value.join(', ') : null))

const tooltip = computed(() => {
  if (!outputAvailable.value) {
    const unavailable = t('independentProjection.unavailable')
    return props.obs ? `${unavailable} ${t('obsOutputs.activateHint')}` : unavailable
  }
  if (activeIndex.value != null) {
    const key = effectiveMode.value === 'share' ? 'sharedOn' : 'activeOn'
    return t(`independentProjection.${key}`, { index: activeIndex.value })
  }
  return t('independentProjection.title')
})

watch(outputAvailable, (isAvailable) => {
  if (!isAvailable) open.value = false
})

function onTriggerClick() {
  if (!outputAvailable.value) return
  if (!open.value) enabledMonitorIds.value = loadProjectionSettings().targetDisplayIds
  open.value = !open.value
}

/** Caixa de seleção do monitor: liga/desliga só ele; o painel fica aberto para marcar outros. */
async function onToggle(monitorId: number) {
  if (busy.value) return
  if (activeMonitorIds.value.includes(monitorId)) {
    unproject(monitorId)
    return
  }
  if (!isMonitorEnabled(monitorId)) return
  busy.value = true
  try {
    await detectObsBeforeProjection()
    if (props.beforeProject && !(await props.beforeProject())) return
    await project(monitorId, mode.value)
  } finally {
    busy.value = false
  }
}

function onStop() {
  clearObsModule(props.moduleId)
  void clearPalcoTvModule(props.moduleId, palcoTvs.value)
  stop()
  open.value = false
}

function onIdentify() {
  void identifySystemDisplays()
}

/** Abre como popup no centro da tela (a lista presa ao botão ficava espremida). */
function updatePanelPosition() {
  panelStyle.value = {
    width: 'min(28rem, calc(100vw - 2rem))',
    maxHeight: 'calc(100vh - 4rem)',
  }
}

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
  void refreshPalcoTvs()
  const selectedObs = obsOutputs.value.find((item) => obsAssignments.value[item.id] === props.moduleId)
  const selectedTvKey = Object.keys(tvAssignments.value).find((key) => tvAssignments.value[key] === props.moduleId)
  mode.value = (selectedObs ? obsAssignmentModes.value[selectedObs.id] : null)
    ?? (selectedTvKey ? tvAssignmentModes.value[selectedTvKey] : null)
    ?? activeMode.value ?? 'overlay'
  await nextTick()
  updatePanelPosition()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updatePanelPosition)
  if (palcoEnabled) {
    void refreshPalcoTvs()
    stopPalcoWatch = onPalcoClientsChanged(() => void refreshPalcoTvs())
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updatePanelPosition)
  stopPalcoWatch?.()
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
        'independent-projection__trigger--compact': compact,
        'independent-projection__trigger--active': active,
        'independent-projection__trigger--disabled': !outputAvailable,
      }"
      :aria-disabled="!outputAvailable"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-label="tooltip"
      :title="tooltip"
      data-testid="independent-projection-trigger"
      @click.stop="onTriggerClick"
    >
      <i
        class="ti"
        :class="effectiveMode === 'share' ? 'ti-layout-columns' : 'ti-device-desktop-share'"
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
        class="independent-projection__overlay"
        data-testid="independent-projection-overlay"
      >
      <div
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
          <span class="independent-projection__header-actions">
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
            <button
              type="button"
              class="independent-projection__identify"
              :title="t('common.close')"
              :aria-label="t('common.close')"
              data-testid="independent-projection-close"
              @click="open = false"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </span>
        </div>
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
        <div
          class="independent-projection__modes"
          role="radiogroup"
          :aria-label="t('independentProjection.modeLabel')"
        >
          <button
            v-for="option in MODES"
            :key="option"
            type="button"
            role="radio"
            class="independent-projection__mode"
            :class="{ 'independent-projection__mode--active': mode === option }"
            :aria-checked="mode === option"
            :data-mode="option"
            @click="mode = option"
          >
            <i
              class="ti"
              :class="option === 'share' ? 'ti-layout-columns' : 'ti-device-desktop-share'"
              aria-hidden="true"
            />
            {{ t(`independentProjection.mode.${option}`) }}
          </button>
        </div>

        <p class="independent-projection__hint">
          {{ t(mode === 'share' ? 'independentProjection.hintShare' : 'independentProjection.hint') }}
        </p>

        <p v-if="monitors.length" class="independent-projection__section-title" data-testid="independent-wired-title">
          <i class="ti ti-device-desktop" aria-hidden="true" /> {{ t('monitors.wiredTitle') }}
        </p>
        <ul
          class="independent-projection__list"
          role="group"
          :aria-label="t('independentProjection.title')"
        >
          <li
            v-for="monitor in monitors"
            :key="monitor.id"
          >
            <button
              type="button"
              role="checkbox"
              class="independent-projection__option"
              :class="{ 'independent-projection__option--active': activeMonitorIds.includes(monitor.id) }"
              :aria-checked="activeMonitorIds.includes(monitor.id)"
              :disabled="busy || !isMonitorEnabled(monitor.id)"
              :data-monitor-id="monitor.id"
              @click="onToggle(monitor.id)"
            >
              <i
                class="ti"
                :class="activeMonitorIds.includes(monitor.id) ? 'ti-square-check' : 'ti-square'"
                aria-hidden="true"
              />
              <span class="independent-projection__option-body">
                <span class="independent-projection__option-name">
                  {{ t('independentProjection.monitor', { index: monitor.index }) }}
                </span>
                <span class="independent-projection__option-meta">{{ monitor.resolutionLabel }}</span>
                <span
                  v-if="!isMonitorEnabled(monitor.id)"
                  class="independent-projection__option-note"
                >{{ t('independentProjection.enableHint') }}</span>
              </span>
            </button>
          </li>
        </ul>
        <div v-if="obs" class="obs-outputs-separator" role="separator" />
        <p v-if="obsOutputs.length" class="obs-outputs-active" role="status">
          <i class="ti ti-broadcast" aria-hidden="true" /> {{ t('obsOutputs.active') }}
        </p>
        <p v-if="obs && !obsOutputs.length" class="obs-outputs-empty" role="status">{{ t('obsOutputs.activateHint') }}</p>
        <ul v-if="obsOutputs.length" class="independent-projection__list" role="group" :aria-label="t('obsOutputs.title')">
          <li v-for="connection in obsOutputs" :key="connection.id">
            <button type="button" class="independent-projection__option" role="checkbox" :disabled="busy"
              :aria-checked="obsAssignments[connection.id] === moduleId"
              :class="{ 'independent-projection__option--active': obsAssignments[connection.id] === moduleId }"
              :data-obs-id="connection.id"
              @click="onToggleObs(connection.id)">
              <i class="ti" :class="obsAssignments[connection.id] === moduleId ? 'ti-square-check' : 'ti-square'" aria-hidden="true" />
              <span class="independent-projection__option-body">
                <span class="independent-projection__option-name">{{ obsConnectionName(connection) }}</span>
                <span class="independent-projection__option-meta">{{ t('obsOutputs.activeConnections', { count: connection.clients }) }}</span>
              </span>
            </button>
          </li>
        </ul>
        <template v-if="palcoEnabled && palcoTvs.length">
          <div class="obs-outputs-separator" role="separator" />
          <p class="obs-outputs-active" data-testid="independent-palco-title">
            <i class="ti ti-device-tv" aria-hidden="true" /> {{ t('palcoOutputs.title') }}
          </p>
          <ul class="independent-projection__list" role="group" :aria-label="t('palcoOutputs.title')">
            <li v-for="tv in palcoTvs" :key="tv.uid">
              <button type="button" class="independent-projection__option" role="checkbox" :disabled="busy"
                :aria-checked="tvHasModule(tv)"
                :class="{ 'independent-projection__option--active': tvHasModule(tv) }"
                :data-palco-tv="tv.uid"
                @click="onTogglePalcoTv(tv)">
                <i class="ti" :class="tvHasModule(tv) ? 'ti-square-check' : 'ti-square'" aria-hidden="true" />
                <span class="independent-projection__option-body">
                  <span class="independent-projection__option-name">{{ tv.name }}</span>
                  <span class="independent-projection__option-meta">{{ tv.slotLabel }}</span>
                </span>
              </button>
            </li>
          </ul>
        </template>
      </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.independent-projection__option-note {
  display: block;
  color: var(--ds-color-warning, #fbbf24);
  font-size: 0.68rem;
}

.independent-projection__option:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.obs-outputs-separator {
  height: 1px;
  margin: 0.8rem 0 0.65rem;
  background: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
}
.obs-outputs-empty {
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-left: 3px solid var(--ds-color-primary);
  border-radius: 0.3rem;
  background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.45;
}
.obs-outputs-active {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.6rem;
  color: #4ade80;
  font-size: 0.78rem;
  font-weight: 700;
}

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

  &--compact {
    width: 2.05rem;
    height: 2.05rem;

    .ti {
      font-size: 1.1rem;
    }
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

.independent-projection__overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
}

.independent-projection__header-actions {
  display: inline-flex;
  gap: 0.35rem;
}

.independent-projection__panel {
  box-sizing: border-box;
  padding: 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
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

.independent-projection__section-title {
  /* Mesmo padrão de "Conexões Remotas" e "TVs com Palco". */
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.6rem;
  color: #4ade80;
  font-size: 0.78rem;
  font-weight: 700;
}

.independent-projection__hint {
  margin: 0.25rem 0 0.6rem;
  font-size: 0.72rem;
  line-height: 1.35;
  color: color-mix(in srgb, var(--ds-color-on-surface) 70%, transparent);
}

.independent-projection__modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem;
  margin-top: 0.5rem;
}

.independent-projection__mode {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.4rem 0.35rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  background: transparent;
  color: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;

  .ti {
    font-size: 1rem;
  }

  &--active {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }
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
  margin: 0.6rem 0;
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
