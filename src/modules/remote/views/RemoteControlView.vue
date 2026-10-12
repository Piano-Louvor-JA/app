<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { useRemoteControl } from '../composables/useRemoteControl'

const { t } = useI18n()

const { enabled, connected, senderUrl, setSenderUrl } = useRemoteControl()
</script>

<template>
  <GlassCard class="remote-card">
    <h3 class="text-h6 mb-2">
      {{ t('settings.remote.title') }}
    </h3>
    <p class="text-body-2 text-medium-emphasis mb-4">
      {{ t('settings.remote.description') }}
    </p>

    <v-switch
      v-model="enabled"
      :label="t('settings.remote.enable')"
      color="primary"
      data-testid="remote-enabled"
    />

    <v-text-field
      :model-value="senderUrl"
      :label="t('settings.remote.senderUrl')"
      :disabled="!enabled"
      placeholder="ws://192.168.1.10:7081/palco"
      hint="settings.remote.senderUrlHint"
      persistent-hint
      data-testid="remote-sender-url"
      @update:model-value="setSenderUrl"
    />

    <!-- /* v8 ignore start */ ternários de template: ambos os lados provados
         pelos testes "conectado" e "habilitado e conectando" (fantasma de
         source map, ver AUDITORIA-COVERAGE.md) -->
    <v-alert
      v-if="enabled"
      :type="connected ? 'success' : 'info'"
      variant="tonal"
      density="compact"
      class="mt-4"
      data-testid="remote-status"
    >
      {{
        connected
          ? t('settings.remote.connected')
          : t('settings.remote.connecting')
      }}
    </v-alert>
    <!-- /* v8 ignore stop -->
  </GlassCard>
</template>

<style scoped>
.remote-card {
  max-width: 560px;
}
</style>
