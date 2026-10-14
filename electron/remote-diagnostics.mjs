// remote-diagnostics — sondas de rede local do Controle Remoto (SPEC v1.2).
// Módulo PURO: parsers e veredito testáveis em node (CI Linux); sondas de SO
// são execFile com timeout curto e null-safe (falha = null, nunca crash/throw).

import { execFile } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PROBE_TIMEOUT_MS = 5_000

// RF1 — nomes/IPs de adaptadores que NÃO são a LAN do celular na igreja.
const SUSPICIOUS_NAME = /vEthernet|WSL|Hyper-V|docker|br-|utun|vmware|virtualbox|vpn|tap\d|tun\d|wireguard|openvpn/i
const VPN_NAME = /vpn|wireguard|openvpn|utun/i

function ipSuspeito(address) {
  return /^172\./.test(address) || /^169\.254\./.test(address)
}

/**
 * RF1 — normaliza os.networkInterfaces() na visão do controle remoto.
 * Espelha a escolha de lanIp() (primeiro IPv4 não-internal) para diagnóstico.
 */
export function analyzeInterfaces(interfaces) {
  const list = []
  for (const [name, ifaces] of Object.entries(interfaces ?? {})) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      list.push({
        name,
        address: iface.address,
        cidr: iface.cidr ?? null,
        suspeito: SUSPICIOUS_NAME.test(name) || ipSuspeito(iface.address),
      })
    }
  }
  const escolhida = list[0] ?? null
  return {
    interfaces: list,
    ipEscolhido: escolhida?.address ?? '127.0.0.1',
    ipSuspeito: escolhida?.suspeito ?? false,
    vpnAtiva: list.some((i) => VPN_NAME.test(i.name)),
    subnetEscolhida: escolhida ? escolhida.address.split('.').slice(0, 3).join('.') : null,
    subnetsDiferentes: new Set(list.map((i) => i.address.split('.').slice(0, 3).join('.'))).size > 1,
  }
}

/**
 * RF5 — veredito do controle remoto. null = sem dados (não sobrepõe veredito geral).
 * Ordem H3 (porta excluída) → H4 (roubada) → H2 (adaptador) → H1 (firewall) → ok.
 */
export function computeRemoteVerdict({
  status,
  portaAtiva,
  portaEsperada = 7071,
  janelasPortasExcluidas = [],
  selfProbe,
  ipSuspeito,
  portaRoubada,
  redePublica,
  regraInbound,
}) {
  if (!status) return null
  const naJanela = (port) =>
    port != null && janelasPortasExcluidas.some(({ start, end }) => port >= start && port <= end)
  if (status === 'desligado' && (naJanela(portaEsperada) || janelasPortasExcluidas.some(({ start, end }) => portaEsperada >= start && portaEsperada <= end))) {
    return 'remote-porta-excluida'
  }
  if (portaRoubada) return 'remote-porta-roubada'
  if (ipSuspeito) return 'remote-ip-adaptador-errado'
  if (status === 'ok' && selfProbe && !selfProbe.ok) return 'remote-firewall'
  if (redePublica && !regraInbound) return 'remote-firewall'
  if (status === 'ok' && selfProbe?.ok && !ipSuspeito && !portaRoubada) return 'remote-ok'
  return null
}

// RF4 — portas excluídas/reservadas por SO.

/** win32: `netsh interface ipv4 show excludedportrange protocol=tcp`. */
export function parseExcludedPortsWin32(stdout) {
  const ranges = []
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/)
    if (m) ranges.push({ start: Number(m[1]), end: Number(m[2]) })
  }
  return ranges
}

/** linux: /proc/sys/net/ipv4/ip_local_reserved_ports ("7071-7075,8080"). */
export function parseExcludedPortsLinux(stdout) {
  const text = String(stdout ?? '').trim()
  if (!text) return []
  const ranges = []
  for (const part of text.split(',')) {
    const [a, b] = part.split('-').map(Number)
    if (Number.isFinite(a)) ranges.push({ start: a, end: Number.isFinite(b) ? b : a })
  }
  return ranges
}

export function parseExcludedPorts(platform, stdout) {
  if (platform === 'win32') return parseExcludedPortsWin32(stdout)
  if (platform === 'linux') return parseExcludedPortsLinux(stdout)
  return null // darwin: sem exclusão de porta
}

// RF4b — firewall do Windows (perfis + regras), ufw/firewalld, socketfilterfw.

/** `netsh advfirewall show allprofiles state` → { domain, private, public }. */
export function parseFirewallProfiles(stdout) {
  const perfis = {}
  let current = null
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const section = line.match(/^(Domain|Private|Public) Profile Settings:/i)
    if (section) { current = section[1].toLowerCase(); continue }
    const state = line.match(/^State\s+(ON|OFF)/i)
    if (current && state) perfis[current] = state[1].toUpperCase()
  }
  return perfis
}

function parseNetshRules(stdout) {
  const blocks = String(stdout ?? '').split(/(?=Rule Name:)/)
  const rules = { block: [], allow: [] }
  for (const block of blocks) {
    const get = (key) => block.match(new RegExp(`^${key}:\\s+(.*)$`, 'mi'))?.[1]?.trim()
    const nome = get('Rule Name')
    if (!nome) continue
    const enabled = get('Enabled')
    if (enabled && !/^yes$/i.test(enabled)) continue
    const porta = Number(get('LocalPort'))
    const rule = {
      nome,
      inbound: /^in$/i.test(get('Direction') ?? ''),
      perfis: get('Profiles') ?? null,
      porta: Number.isFinite(porta) ? porta : null,
      programa: get('Program')?.split(/[\\/]/).pop() ?? null,
    }
    const action = get('Action')
    if (/^block$/i.test(action ?? '')) rules.block.push(rule)
    else if (/^allow$/i.test(action ?? '')) rules.allow.push(rule)
  }
  return rules
}

export function parseFirewallRules(stdout) {
  return parseNetshRules(stdout)
}

/** ufw verbose → regras; retorna null se não gerenciado. */
function parseUfw(stdout) {
  const text = String(stdout ?? '')
  if (!/Status: active/i.test(text)) return null
  const allow7071 = /7071.*ALLOW/i.test(text) || /ALLOW.*7071/i.test(text)
  return { allow7071 }
}

// RF4c — quem escuta as portas do controle remoto.

export function parseListeners(platform, stdout) {
  const text = String(stdout ?? '')
  const seen = new Map()
  if (platform === 'win32') {
    for (const line of text.split(/\r?\n/)) {
      const m = line.trim().match(/^TCP\s+\S*?(\d+)\s+\S+\s+LISTENING\s+(\d+)$/)
      if (m) seen.set(Number(m[1]), { port: Number(m[1]), pid: Number(m[2]), processo: null })
    }
  } else if (platform === 'linux') {
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/LISTEN\s+\S+\s+\S+\s+[\d.]+:(\d+)\s+\S+\s+users:\(\("([^"]+)",pid=(\d+)/)
      if (m) seen.set(Number(m[1]), { port: Number(m[1]), pid: Number(m[3]), processo: m[2] })
    }
  } else if (platform === 'darwin') {
    for (const line of text.split(/\n/)) {
      const m = line.match(/^(\S+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+TCP .*:(\d+) \(LISTEN\)/)
      if (m) seen.set(Number(m[3]), { port: Number(m[3]), pid: Number(m[2]), processo: m[1] })
    }
  }
  return [...seen.values()]
}

/** Porta roubada: listener de OUTRO processo na porta esperada. */
export function listenersOnPort(listeners, port, myPid) {
  const found = (listeners ?? []).find((l) => l.port === port && l.pid != null && l.pid !== myPid)
  if (!found) return { portaRoubada: false, dono: null }
  return { portaRoubada: true, dono: `${found.processo ?? 'pid'} (${found.pid})` }
}

// ---------- Sondas (execução real; null-safe, timeout 5s, sem sudo) ----------

async function safeRun(cmd, args) {
  try {
    const { stdout } = await run(cmd, args, { timeout: PROBE_TIMEOUT_MS, windowsHide: true })
    return stdout
  } catch {
    return null // sem permissão / comando ausente / timeout → null, nunca falso
  }
}

/** RF4 — sonda de portas excluídas do SO atual. */
export async function probeExcludedPorts() {
  const p = process.platform
  if (p === 'win32') {
    const out = await safeRun('netsh', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'])
    return out == null ? null : parseExcludedPortsWin32(out)
  }
  if (p === 'linux') {
    const { readFile } = await import('node:fs/promises')
    try {
      return parseExcludedPortsLinux(await readFile('/proc/sys/net/ipv4/ip_local_reserved_ports', 'utf8'))
    } catch { return null }
  }
  return null
}

/** RF4b — mapa de firewall do SO atual (perfis + regras relevantes, máx 10). */
export async function probeFirewall() {
  const p = process.platform
  if (p === 'win32') {
    const [stateOut, rulesOut] = await Promise.all([
      safeRun('netsh', ['advfirewall', 'show', 'allprofiles', 'state']),
      safeRun('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=all']),
    ])
    if (stateOut == null && rulesOut == null) return null
    const rules = rulesOut == null ? { block: [], allow: [] } : parseNetshRules(rulesOut)
    return {
      perfis: stateOut == null ? null : parseFirewallProfiles(stateOut),
      block: rules.block.slice(0, 10),
      allow: rules.allow.filter((r) => r.porta === 7071).slice(0, 10),
    }
  }
  if (p === 'linux') {
    const ufw = await safeRun('ufw', ['status', 'verbose'])
    if (ufw != null) {
      const parsed = parseUfw(ufw)
      return parsed && { gerenciador: 'ufw', ...parsed }
    }
    const fwalld = await safeRun('firewall-cmd', ['--list-all'])
    if (fwalld != null) {
      const allow7071 = /7071/.test(fwalld)
      return { gerenciador: 'firewalld', allow7071 }
    }
    return null // iptables sem root não informa
  }
  if (p === 'darwin') {
    const global = await safeRun('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate'])
    if (global == null) return null
    return { gerenciador: 'socketfilterfw', global: global.trim() }
  }
  return null
}

/** RF4c — quem escuta 7071..7075 neste momento. */
export async function probeListeners() {
  const p = process.platform
  const out = p === 'win32'
    ? await safeRun('netstat', ['-ano'])
    : p === 'linux'
      ? await safeRun('ss', ['-tlnp'])
      : await safeRun('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n'])
  if (out == null) return null
  return parseListeners(p, out).filter((l) => l.port >= 7071 && l.port <= 7075)
}

/** RF4c (win32) — categoria da rede atual (Public = rede pública). */
export async function probeNetworkCategory() {
  if (process.platform !== 'win32') return null
  const out = await safeRun('powershell.exe', ['-NoProfile', '-Command',
    '(Get-NetConnectionProfile | Select-Object -First 1).NetworkCategory'])
  return out == null ? null : /public/i.test(out)
}

/** RF3 — self-probe TCP: simula a conexão do APK a partir da própria máquina. */
export function selfProbe(host, port, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!host || !port) { resolve(null); return }
    const socket = net.connect({ host, port })
    const finish = (result) => {
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, erro: 'timeout' }), timeoutMs)
    socket.once('connect', () => finish({ ok: true }))
    socket.once('error', (err) => finish({ ok: false, erro: err?.code ?? err?.message }))
  })
}
