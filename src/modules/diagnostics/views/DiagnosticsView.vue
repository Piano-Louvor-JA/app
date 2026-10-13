<script setup lang="ts">
import { computed, ref } from 'vue'

import { getDesktopBridge } from '@shared/services/desktop-bridge'

type RunResult = { report: unknown; jsonPath: string; txtPath: string }

type TriagemReport = {
  discoLivreMb?: number | null
  crashes?: { total?: number }
  memoria?: { totalMb?: number; livreMb?: number }
  antivirus?: Array<{ nome?: string }> | null
  logs?: Array<unknown> | null
  storage?: { lockOrfao?: boolean; ldbVazio?: boolean; localStorageSuspeito?: boolean } | null
  gpuFeatures?: Record<string, string> | null
  versaoInstalacaoReal?: string | null
}

type RedeReport = {
  mediaReal?: { ok?: boolean; status?: number | null; bytes?: number; erro?: { classe?: string } | null }
  dnsSuspeito?: Array<{ host: string; dnsSuspeito: boolean | null; motivo: string }>
  apis?: Array<{ host: string }>
}

const running = ref(false)
const result = ref<RunResult | null>(null)
const error = ref('')
const sendMessage = ref('')
const bridge = getDesktopBridge()
const available = computed(() => Boolean(bridge?.diagnostics))

const report = computed(() => (result.value?.report ?? null) as { triage?: TriagemReport; rede?: RedeReport; instalacaoReal?: { headersEssenciais?: Record<string, { bytes?: number; erro?: string } | null> } } | null)
const triage = computed(() => report.value?.triage ?? null)
const escritaLabel = computed(() => {
  const r = report.value as { instalacaoReal?: { escritaUserData?: { aplicavel?: boolean; ok?: boolean | null } } } | null
  const w = r?.instalacaoReal?.escritaUserData
  if (!w?.aplicavel) return 'pasta não existe ainda'
  return w.ok ? 'OK' : 'SEM PERMISSÃO ⚠'
})
const memoriaLabel = computed(() => {
  const m = triage.value?.memoria
  return m ? `${m.livreMb ?? '?'} / ${m.totalMb ?? '?'} MB livres` : '—'
})
const antivirusLabel = computed(() => {
  const av = triage.value?.antivirus
  if (av === null) return 'não se aplica (fora do Windows)'
  if (!av?.length) return 'nenhum detectado'
  return av.map((a) => a.nome).join(', ')
})
const logsLabel = computed(() => {
  const logs = triage.value?.logs
  if (logs === null) return 'nenhum log encontrado (em si, é info)'
  return `${logs?.length ?? 0} arquivo(s) anexado(s) ao JSON`
})
const storageLabel = computed(() => {
  const s = triage.value?.storage
  if (!s) return '—'
  const flags = [s.lockOrfao && 'lock órfão', s.ldbVazio && 'leveldb vazio', s.localStorageSuspeito && 'local storage gigante'].filter(Boolean)
  return flags.length ? `⚠ ${flags.join(', ')}` : 'OK'
})
const gpuLabel = computed(() => {
  const g = triage.value?.gpuFeatures
  if (!g) return '—'
  const ruim = Object.entries(g).filter(([, v]) => ['disabled', 'blocked', 'error'].includes(String(v).toLowerCase()))
  return ruim.length ? `⚠ ${ruim.map(([k, v]) => `${k}=${v}`).join(', ')}` : 'OK'
})
const dnsSuspeitos = computed(() => (report.value?.rede?.dnsSuspeito ?? []).filter((d) => d.dnsSuspeito === true))
const dnsSuspeitoAlgum = computed(() => dnsSuspeitos.value.length > 0)
const mediaLabel = computed(() => {
  const m = report.value?.rede?.mediaReal
  if (!m) return '—'
  if (m.ok) return `OK (HTTP ${m.status}, ${m.bytes} bytes)`
  return `FALHOU: ${m.erro?.classe ?? (m.status ? `HTTP ${m.status}` : 'erro desconhecido')} ⚠`
})
const headersTruncados = computed(() => {
  const headers = report.value?.instalacaoReal?.headersEssenciais
  if (!headers) return false
  return Object.values(headers).some((v) => v && typeof v === 'object' && 'bytes' in v && typeof v.bytes === 'number' && v.bytes < 512)
})

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
      <h1>Diagnóstico do aplicativo</h1>
      <p class="intro">
        Verifica conexão, armazenamento, memória e integridade dos dados. Não altera a instalação do LouvorJA.
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
        <div v-if="triage" class="triage">
          <h2>Coleta adicional (v2)</h2>
          <ul>
            <li>Disco livre: <strong>{{ triage.discoLivreMb ?? '—' }} MB</strong></li>
            <li>Escrita na pasta do app: <strong>{{ escritaLabel }}</strong></li>
            <li>Memória: <strong>{{ memoriaLabel }}</strong></li>
            <li>Crashes registrados: <strong>{{ triage.crashes?.total ?? 0 }}</strong></li>
            <li>Antivírus: <strong>{{ antivirusLabel }}</strong></li>
            <li>Versão instalada: <strong>{{ triage.versaoInstalacaoReal ?? 'não encontrada (portable?)' }}</strong></li>
            <li>Logs do app: <strong>{{ logsLabel }}</strong></li>
            <li>Armazenamento suspeito: <strong>{{ storageLabel }}</strong></li>
            <li>GPU bloqueada: <strong>{{ gpuLabel }}</strong></li>
            <li v-if="dnsSuspeitoAlgum">⚠ DNS suspeito:
              <ul><li v-for="d in dnsSuspeitos" :key="d.host">{{ d.host }} — {{ d.motivo }}</li></ul>
            </li>
            <li>Mídia real (/file/): <strong>{{ mediaLabel }}</strong></li>
            <li v-if="headersTruncados">⚠ Arquivo(s) essencial(is) com tamanho anômalo (possível página de bloqueio salva como catálogo)</li>
          </ul>
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
.triage { margin-top: 18px; padding: 16px; border: 1px solid var(--ds-color-outline-variant, var(--ds-color-outline-strong)); border-radius: var(--ds-radius-sm); }
.triage h2 { margin: 0 0 10px; font-size: 1rem; }
.triage ul { margin: 0; padding-left: 18px; display: grid; gap: 5px; font-size: .9rem; }
.triage ul ul { margin-top: 4px; }
.secondary { padding: 11px 16px; border: 1px solid var(--ds-color-outline-strong); border-radius: var(--ds-radius-sm); background: transparent; color: var(--ds-color-on-surface); font-weight: 700; cursor: pointer; }
.secondary:hover { background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent); }
</style>
