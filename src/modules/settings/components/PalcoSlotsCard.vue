<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { GlassCard } from '@design-system/index'
import { palcoSession } from '../services/palco-session'

type Slot = {
  id: string
  label: string
  running: boolean
  clients: number
  httpPort: number
  wsPort: number
  receiverIps?: string[]
}

const { t } = useI18n()
const slots = ref<Slot[]>([])
const activeId = ref(palcoSession.slotId)
const loading = ref(false)

async function refresh() {
  if (!palcoSession.isElectron) return
  slots.value = (await (window as never as { louvorja: { palco: { slots(): Promise<Slot[]> } } }).louvorja.palco.slots()) ?? []
}

async function addSlot() {
  loading.value = true
  try {
    const api = (window as never as { louvorja: { palco: { createSlot(label: string): Promise<Slot> } } }).louvorja.palco
    await api.createSlot(`${t('settings.palco.tv')} ${slots.value.length + 1}`)
    await refresh()
  } finally {
    loading.value = false
  }
}

async function removeSlot(slot: Slot) {
  if (slot.id === '0') return
  const api = (window as never as { louvorja: { palco: { removeSlot(id: string): Promise<boolean> } } }).louvorja.palco
  await api.removeSlot(slot.id)
  if (activeId.value === slot.id) selectSlot('0')
  await refresh()
}

async function toggleSlot(slot: Slot) {
  const api = (window as never as { louvorja: { palco: { start(id: string): Promise<boolean>; stop(id: string): Promise<void> } } }).louvorja.palco
  if (slot.running) await api.stop(slot.id)
  else await api.start(slot.id)
  await refresh()
}

function selectSlot(id: string) {
  activeId.value = id
  palcoSession.setSlot(id)
}

let refreshTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void refresh()
  // Receiver pode conectar após abrir esta tela; IP deve aparecer sem fechar.
  if (palcoSession.isElectron) refreshTimer = setInterval(() => void refresh(), 3000)
})
onUnmounted(() => { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null } })
</script>

<template>
  <GlassCard class="palco-slots-card" :padding="false">
    <div class="palco-slots-card__header">
      <div>
        <h3>{{ t('settings.palco.tvs') }}</h3>
        <p>{{ t('settings.palco.tvsHint') }}</p>
      </div>
      <button type="button" class="palco-slots-card__add" :disabled="loading" @click="addSlot">
        <i class="ti ti-plus" aria-hidden="true" />
        {{ t('settings.palco.addTv') }}
      </button>
    </div>

    <div class="palco-slots-card__list">
      <div
        v-for="slot in slots"
        :key="slot.id"
        class="palco-slot"
        :class="{ 'palco-slot--active': activeId === slot.id }"
      >
        <button type="button" class="palco-slot__select" @click="selectSlot(slot.id)">
          <span class="palco-slot__dot" :class="{ 'palco-slot__dot--on': slot.running && slot.clients > 0 }" />
          <span>
            <strong>{{ slot.id === '0' ? t('settings.palco.mainTv') : slot.label }}</strong>
            <small>
              :{{ slot.httpPort }} ·
              {{ slot.clients ? t('settings.palco.connected', { count: slot.clients }) : t('settings.palco.waiting') }}
              <template v-if="slot.receiverIps?.length"> · {{ slot.receiverIps.join(', ') }}</template>
            </small>
          </span>
        </button>
        <span v-if="activeId === slot.id" class="palco-slot__badge">{{ t('settings.palco.selected') }}</span>
        <button type="button" class="palco-slot__power" :aria-label="slot.running ? t('settings.palco.stop') : t('settings.palco.start')" @click="toggleSlot(slot)">
          <i class="ti" :class="slot.running ? 'ti-player-stop' : 'ti-player-play'" aria-hidden="true" />
        </button>
        <button v-if="slot.id !== '0'" type="button" class="palco-slot__remove" :aria-label="t('settings.palco.removeTv')" @click="removeSlot(slot)">
          <i class="ti ti-trash" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p class="palco-slots-card__note">{{ t('settings.palco.moduleHint') }}</p>
  </GlassCard>
</template>

<style scoped lang="scss">
.palco-slots-card { overflow: hidden; }
.palco-slots-card__header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem .75rem; }
.palco-slots-card h3 { margin:0; color:var(--ds-color-on-surface); font-size:1rem; }
.palco-slots-card p { margin:.2rem 0 0; color:var(--ds-color-on-surface-variant); font-size:.75rem; }
.palco-slots-card__add { display:flex; align-items:center; gap:.35rem; padding:.45rem .7rem; border:1px solid color-mix(in srgb,var(--ds-color-primary) 50%,transparent); border-radius:.5rem 0 .5rem 0; background:transparent; color:var(--ds-color-primary); cursor:pointer; font-size:.75rem; }
.palco-slots-card__list { display:flex; flex-direction:column; gap:.35rem; padding:.5rem 1.25rem 1rem; }
.palco-slot { display:flex; align-items:center; gap:.5rem; padding:.55rem .65rem; border:1px solid transparent; border-radius:.5rem 0 .5rem 0; background:color-mix(in srgb,var(--ds-color-on-surface) 5%,transparent); }
.palco-slot--active { border-color:color-mix(in srgb,var(--ds-color-primary) 45%,transparent); background:color-mix(in srgb,var(--ds-color-primary) 8%,transparent); }
.palco-slot__select { display:flex; align-items:center; gap:.65rem; min-width:0; flex:1; border:0; background:none; color:var(--ds-color-on-surface); text-align:left; cursor:pointer; }
.palco-slot__select strong,.palco-slot__select small { display:block; }
.palco-slot__select small { margin-top:.15rem; color:var(--ds-color-on-surface-variant); font-size:.7rem; }
.palco-slot__dot { width:.55rem; height:.55rem; flex:none; border-radius:50%; background:var(--ds-color-on-surface-variant); opacity:.45; }
.palco-slot__dot--on { background:#39c56b; opacity:1; box-shadow:0 0 0 3px color-mix(in srgb,#39c56b 18%,transparent); }
.palco-slot__badge { color:var(--ds-color-primary); font-size:.65rem; }
.palco-slot__power,.palco-slot__remove { display:flex; align-items:center; justify-content:center; width:1.8rem; height:1.8rem; border:0; border-radius:.35rem; background:transparent; color:var(--ds-color-on-surface-variant); cursor:pointer; }
.palco-slot__power:hover { color:var(--ds-color-primary); background:color-mix(in srgb,var(--ds-color-primary) 12%,transparent); }
.palco-slot__remove:hover { color:#e65c66; }
.palco-slots-card__note { padding:0 1.25rem 1rem; }
</style>
