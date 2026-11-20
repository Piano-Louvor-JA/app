<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useObsConnections } from '@modules/settings/composables/useObsConnections'
import { clearObsModule, obsAssignmentModes, obsAssignments, obsConnectionName } from '@modules/settings/services/obs-connections'
import {
  hasPalcoClients,
  listPalcoTvs,
  onPalcoClientsChanged,
  palcoTvKey,
  type PalcoClient,
} from '@modules/settings/services/palco-clients'
import { clearPalcoTvModule, tvAssignmentModes, tvAssignments } from '@modules/settings/services/palco-tv-assignments'
import { useIndependentProjectionControl } from '@shared/composables/useIndependentProjection'

/**
 * Onde a projeção independente deste módulo está no ar: "Sobrepondo em" /
 * "Compartilhando em" e os destinos ativos (monitores, conexões e TVs do Palco).
 */
const props = withDefaults(
  defineProps<{ moduleId: string; obs?: boolean; /** Fica logo abaixo do card da prévia. */ below?: boolean }>(),
  { obs: true, below: false },
)
const { t } = useI18n()

type Mode = 'overlay' | 'share'
type Target = { key: string; icon: string; label: string; mode: Mode }

const { monitors, activeMonitorIds, activeMode, stop } = useIndependentProjectionControl(props.moduleId)
const { activeConnections } = useObsConnections()

const palcoEnabled = props.obs && hasPalcoClients()
const palcoTvs = ref<PalcoClient[]>([])
async function refreshPalcoTvs() {
  if (palcoEnabled) palcoTvs.value = await listPalcoTvs()
}
let stopWatch: (() => void) | null = null
onMounted(() => {
  if (!palcoEnabled) return
  void refreshPalcoTvs()
  stopWatch = onPalcoClientsChanged(() => void refreshPalcoTvs())
})
onBeforeUnmount(() => stopWatch?.())

const targets = computed<Target[]>(() => {
  const list: Target[] = []
  const monitorMode: Mode = activeMode.value ?? 'overlay'
  for (const monitor of monitors.value) {
    if (!activeMonitorIds.value.includes(monitor.id)) continue
    list.push({
      key: `monitor-${monitor.id}`,
      icon: 'ti-device-desktop',
      label: t('independentProjection.status.monitor', { index: monitor.index }),
      mode: monitorMode,
    })
  }
  if (props.obs) {
    for (const connection of activeConnections.value) {
      if (obsAssignments.value[connection.id] !== props.moduleId) continue
      list.push({
        key: `obs-${connection.id}`,
        icon: 'ti-broadcast',
        label: obsConnectionName(connection),
        mode: obsAssignmentModes.value[connection.id] ?? 'overlay',
      })
    }
  }
  for (const tv of palcoTvs.value) {
    const key = palcoTvKey(tv)
    if (tvAssignments.value[key] !== props.moduleId) continue
    list.push({ key: `tv-${tv.uid}`, icon: 'ti-device-tv', label: tv.name, mode: tvAssignmentModes.value[key] ?? 'overlay' })
  }
  return list
})

/** Mesmo efeito do "Encerrar projeção independente" do popup. */
function onStop() {
  clearObsModule(props.moduleId)
  void clearPalcoTvModule(props.moduleId, palcoTvs.value)
  stop()
}

const groups = computed(() =>
  (['overlay', 'share'] as Mode[])
    .map((mode) => ({ mode, items: targets.value.filter((target) => target.mode === mode) }))
    .filter((group) => group.items.length > 0),
)
</script>

<template>
  <div v-if="groups.length" class="independent-status" :class="{ 'independent-status--below': below }" data-testid="independent-projection-status" role="status">
    <div v-for="group in groups" :key="group.mode" class="independent-status__group" :data-mode="group.mode">
      <p class="independent-status__title">
        <i class="ti" :class="group.mode === 'share' ? 'ti-layout-columns' : 'ti-device-desktop-share'" aria-hidden="true" />
        {{ t(`independentProjection.status.${group.mode}`) }}
      </p>
      <ul class="independent-status__list">
        <li v-for="item in group.items" :key="item.key" class="independent-status__item">
          <i class="ti" :class="item.icon" aria-hidden="true" /> {{ item.label }}
        </li>
      </ul>
    </div>
    <button type="button" class="independent-status__stop" data-testid="independent-projection-status-stop" @click="onStop">
      <i class="ti ti-player-stop" aria-hidden="true" /> {{ t('independentProjection.status.stop') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.independent-status {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid color-mix(in srgb, #4ade80 35%, transparent);
  border-radius: 0.6rem 0 0.6rem 0;
  background: color-mix(in srgb, var(--ds-color-surface-container-high, #2a2a2a) 94%, transparent);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  color: var(--ds-color-on-surface);
  pointer-events: auto;
}

.independent-status--below {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  z-index: 2;
}

.independent-status__title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.25rem;
  color: #4ade80;
  font-size: 0.75rem;
  font-weight: 700;
}

.independent-status__stop {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  margin-top: 0.15rem;
  padding: 0.4rem 0.6rem;
  border: none;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 85%, transparent);
  color: #1a1a1a;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.independent-status__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.independent-status__item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-primary) 16%, transparent);
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
