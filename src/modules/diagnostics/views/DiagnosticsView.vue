<script setup lang="ts">
import { computed, ref } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'

type RunResult = { report: unknown; jsonPath: string; txtPath: string }

const running = ref(false)
const result = ref<RunResult | null>(null)
const error = ref('')
const sendMessage = ref('')
const bridge = getDesktopBridge()
const available = computed(() => Boolean(bridge?.diagnostics))

async function run() {
  if (!bridge?.diagnostics) return
  running.value = true
  result.value = null
  error.value = ''
  sendMessage.value = ''
  try {
    result.value = await bridge.diagnostics.run()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível executar o diagnóstico.'
  } finally {
    running.value = false
  }
}

async function send() {
  if (!bridge?.diagnostics || !result.value) return
  try {
    // result.value.report é um Proxy do Vue (ref) — IPC estruturado do Electron
    // não clona Proxy. JSON round-trip gera plain object clonável.
    const plain = JSON.parse(JSON.stringify(result.value.report))
    const response = await bridge.diagnostics.send(plain)
    sendMessage.value = response.ok
      ? 'Relatório enviado. Obrigado!'
      : `Envio indisponível. Compartilhe o arquivo salvo. ${response.reason ?? ''}`
  } catch (cause) {
    sendMessage.value = `Falha no envio. Compartilhe o arquivo salvo. ${
      cause instanceof Error ? cause.message : String(cause)
    }`
  }
}

function openFolder() {
  if (result.value) void bridge?.diagnostics?.openFolder(result.value.jsonPath)
}
</script>

<template>
  <main class="diagnostics-page">
    <section class="diagnostics-card">
      <p class="eyebrow">LOUVORJA PIANO</p>
      <h1>Diagnóstico de download</h1>
      <p class="intro">
        Este teste verifica a conexão com o catálogo. Ele não altera a instalação do LouvorJA.
      </p>

      <p v-if="!available" class="warning">
        Abra pelo Electron. O diagnóstico precisa do processo principal para testar a rede.
      </p>

      <button class="run" :disabled="running || !available" @click="run">
        {{ running ? 'Executando diagnóstico…' : 'Executar diagnóstico' }}
      </button>
      <p v-if="running" class="progress">Testando DNS, rede, proxy, certificado e catálogo. Pode levar até 90 segundos.</p>
      <p v-if="error" class="warning">{{ error }}</p>

      <template v-if="result">
        <div class="success">
          <strong>Diagnóstico concluído.</strong>
          <span>Relatórios salvos em:</span>
          <code>{{ result.jsonPath }}</code>
          <code>{{ result.txtPath }}</code>
        </div>
        <div class="actions">
          <button class="secondary" @click="send">Enviar relatório</button>
          <button class="secondary" @click="openFolder">Abrir pasta</button>
        </div>
        <p v-if="sendMessage" class="progress">{{ sendMessage }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.diagnostics-page { min-height: 100%; display: grid; place-items: center; padding: var(--ds-spacing-page, 32px); background: var(--ds-color-background); color: var(--ds-color-on-surface); }
.diagnostics-card { width: min(620px, 100%); padding: 38px; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-lg); background: var(--ds-color-surface-card); box-shadow: 0 20px 60px rgb(0 0 0 / 40%); }
.eyebrow { margin: 0; color: var(--ds-color-primary-soft); font-size: .75rem; font-weight: 800; letter-spacing: .12em; }
h1 { margin: 8px 0 10px; font-size: 2rem; }
.intro, .progress { color: var(--ds-color-on-surface-variant); line-height: 1.5; }
.run { width: 100%; min-height: 62px; border: 0; border-radius: var(--ds-radius-md); background: var(--ds-color-primary); color: var(--ds-color-on-primary); font-size: 1.2rem; font-weight: 800; cursor: pointer; }
.run:disabled { opacity: .55; cursor: wait; }
.warning { margin-top: 18px; color: var(--ds-color-brand-yellow, #f8c800); }
.success { display: grid; gap: 6px; margin-top: 24px; padding: 18px; border-radius: var(--ds-radius-sm); background: var(--ds-color-surface-container); color: var(--ds-color-on-surface); }
code { overflow-wrap: anywhere; font-size: .78rem; color: var(--ds-color-on-surface-variant); }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.secondary { padding: 11px 16px; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-sm); background: transparent; color: var(--ds-color-on-surface); font-weight: 700; cursor: pointer; }
.secondary:hover { background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent); }
</style>
