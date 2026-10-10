<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPalcoRoute, setPalcoRoute, type PalcoModule } from '../services/palco-routing'

type Slot = { id: string; label: string; running: boolean; clients: number; httpPort: number; wsPort: number }
type PalcoStatusLike = { running: boolean }
type DisplayInfo = { id: number; bounds?: { width: number; height: number } }
const props = defineProps<{ module: PalcoModule; compact?: boolean }>()
const { t } = useI18n()
const slots = ref<Slot[]>([])
const displays = ref<DisplayInfo[]>([])
const route = ref(getPalcoRoute(props.module))
const senderOn = ref(false)
const hasElectron = computed(() => Boolean((window as never as { louvorja?: { palco?: unknown } }).louvorja?.palco))

async function refresh() {
  if (!hasElectron.value) return
  const api = (window as never as { louvorja: { palco: { slots(): Promise<Slot[]>; status(): Promise<PalcoStatusLike | null> } } }).louvorja.palco
  // Visível apenas com o Palco ativo — desligado, o seletor não faz sentido.
  const st = await api.status().catch(() => null)
  senderOn.value = Boolean(st?.running)
  if (!senderOn.value) return
  slots.value = await api.slots().catch(() => [])
  // Monitores cabeados como destino também (spec multi-telas):
  // destinos unificados — TVs Palco + monitores no mesmo select.
  const dispApi = (window as never as { louvorja: { displays?: { list?: () => Promise<DisplayInfo[]> } } }).louvorja?.displays
  displays.value = dispApi?.list ? await dispApi.list().catch(() => []) : []
}
function update(value: string) {
  route.value = value
  setPalcoRoute(props.module, value)
}
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void refresh()
  // re-check leve: status muda quando o toggle liga/desliga em outra tela
  timer = setInterval(() => void refresh(), 4000)
})
onUnmounted(() => clearInterval(timer!)) // onUnmounted sempre ocorre após onMounted.
</script>

<template>
  <label v-if="hasElectron && senderOn" class="palco-route" :class="{ 'palco-route--compact': compact }">
    <i class="ti ti-device-tv" aria-hidden="true" />
    <span>{{ t('settings.palco.route') }}</span>
    <select :value="route" @change="update(($event.target as HTMLSelectElement).value)">
      <option value="mirror">{{ t('settings.palco.mirror') }}</option>
      <optgroup v-if="displays.length" :label="t('settings.palco.cableGroup')">
        <option v-for="(d, i) in displays" :key="'cable-' + d.id" :value="'cable:' + d.id">
          {{ t('settings.palco.monitor', { n: i + 1 }) }}{{ d.bounds ? ` · ${d.bounds.width}×${d.bounds.height}` : '' }}
        </option>
      </optgroup>
      <optgroup v-if="slots.length" :label="t('settings.palco.tvGroup')">
        <option v-for="slot in slots" :key="slot.id" :value="slot.id">
          {{ slot.label }}{{ slot.clients ? ` · ${slot.clients} ${t('settings.palco.connectedShort')}` : '' }}
        </option>
      </optgroup>
    </select>
  </label>
</template>

<style scoped lang="scss">
.palco-route { display:inline-flex; align-items:center; gap:.4rem; color:var(--ds-color-on-surface-variant); font-size:.72rem; }
.palco-route .ti { color:var(--ds-color-primary); }
.palco-route select { max-width:9rem; padding:.3rem .45rem; border:1px solid color-mix(in srgb,var(--ds-color-on-surface) 18%,transparent); border-radius:.4rem 0 .4rem 0; background:var(--ds-color-surface); color:var(--ds-color-on-surface); font-size:.72rem; }
.palco-route--compact span { display:none; }
</style>
