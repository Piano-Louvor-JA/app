<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import MainScreenOptionsCard from '../components/MainScreenOptionsCard.vue'
import MonitorArrangementCard from '../components/MonitorArrangementCard.vue'
import MultiScreenSelectCard from '../components/MultiScreenSelectCard.vue'
import ReturnScreenOptionsCard from '../components/ReturnScreenOptionsCard.vue'
import { useProjectionSettings } from '../composables/useProjectionSettings'

const { t } = useI18n()
const { hydrate, lastErrorKey } = useProjectionSettings()

onMounted(() => {
  void hydrate()
})
</script>

<template>
  <div class="projection-settings">
    <p
      v-if="lastErrorKey"
      class="projection-settings__error"
      role="alert"
    >
      {{ t(lastErrorKey) }}
    </p>

    <MonitorArrangementCard />

    <div class="projection-settings__split">
      <MultiScreenSelectCard />
      <div class="projection-settings__stack">
        <MainScreenOptionsCard />
        <ReturnScreenOptionsCard />
      </div>
    </div>



  </div>
</template>

<style scoped lang="scss">
.projection-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 64rem;
  margin: 0 auto;
  padding-bottom: 1.5rem;
}

.projection-settings__split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.projection-settings__stack {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

.projection-settings__error {
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--ds-radius-md);
  background: color-mix(in srgb, rgb(var(--v-theme-error)) 16%, transparent);
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
}
</style>
