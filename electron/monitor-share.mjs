/**
 * Compartilhar monitores com o app mobile (apk).
 *
 * O celular é o transmissor do palco (portas 4980/4981…). Aqui o desktop
 * só EMPRESTA os monitores: o apk lê o QR (ou digita o endereço), chama
 * POST /monitor-share/connect com o token e o endereço dele, e o desktop
 * abre em cada monitor escolhido uma janela de tela cheia com o MESMO
 * receiver (electron/palco/receiver.html) apontado para o celular —
 * Espelho do Palco ou Retorno de palco por monitor, sempre sem som
 * (?mute=1: o áudio fica no celular).
 *
 * Canal próprio (porta 48090) e token próprio: o Controle Remoto (48080)
 * continua sendo o celular COMANDANDO o desktop; isto é o inverso.
 */
import { randomInt } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import QRCode from 'qrcode'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECEIVER_HTML = path.join(__dirname, 'palco', 'receiver.html')
export const DEFAULT_MONITOR_SHARE_PORT = 48090
const PORT_ATTEMPTS = 10
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** @typedef {'mirror' | 'return'} ShareMode */

export function createShareToken() {
  let out = ''
  for (let i = 0; i < 6; i += 1) out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]
  return out
}

/** Endereço do celular aceito para abrir o receiver: IPv4 em formato estrito. */
export function validPhoneHost(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return null
  const parts = value.split('.').map(Number)
  if (parts.some((n) => n > 255) || parts[0] === 0 || parts[0] >= 224) return null
  return parts.join('.')
}

export function validPhonePort(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null
}

/**
 * Monitores que podem ser emprestados ao celular: SÓ os estendidos.
 * O principal é do sonoplasta (onde o app desktop roda) e nunca entra;
 * com um monitor só, a lista fica vazia e o compartilhamento não liga.
 * @param {{ id: number }[]} displays  ordem do sistema (Monitor 1, 2…)
 * @param {number} primaryId
 */
export function shareableDisplays(displays, primaryId) {
  return displays
    .map((display, index) => ({ display, label: `Monitor ${index + 1}` }))
    .filter(({ display }) => display.id !== primaryId)
}

/** Remove da escolha salva o que não é monitor estendido disponível. */
export function sanitizeShareModes(modes, shareableIds) {
  const allowed = new Set(shareableIds.map(String))
  const next = {}
  for (const [id, mode] of Object.entries(modes ?? {})) {
    if (allowed.has(String(id)) && (mode === 'mirror' || mode === 'return')) next[String(id)] = mode
  }
  return next
}

/**
 * Endereços para tentar alcançar o celular, em ordem: o que ele informou,
 * o de onde o pedido chegou (aparelho com 2 redes informa a errada) e a
 * própria máquina (emulador com adb forward). Sem repetição.
 */
export function phoneCandidates(declared, remoteAddress) {
  const remote = validPhoneHost(String(remoteAddress ?? '').replace(/^::ffff:/, ''))
  const list = [declared, remote, '127.0.0.1'].filter(Boolean)
  return [...new Set(list)]
}

/** O celular responde? GET /status na porta HTTP (WS − 1) do palco dele. */
function probePhone(host, wsPort, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host, port: wsPort - 1, path: '/status', timeout: timeoutMs }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        try { resolve('unlocked' in JSON.parse(raw)) } catch { resolve(false) }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

/** Primeiro endereço do celular que responde (ou o informado, se nenhum). */
export async function reachablePhoneHost(declared, remoteAddress, wsPort, probe = probePhone) {
  for (const host of phoneCandidates(declared, remoteAddress)) {
    if (await probe(host, wsPort)) return host
  }
  return declared
}

/** Query do receiver para um monitor (testável sem Electron). */
export function receiverQuery(host, port, mode) {
  return { host, port: String(port), mute: '1', ...(mode === 'return' ? { mode: 'retorno' } : {}) }
}

function lanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function configPath() {
  return path.join(app.getPath('userData'), 'monitor-share.json')
}

function loadConfig() {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8'))
    return {
      enabled: raw.enabled === true,
      token: typeof raw.token === 'string' && /^[A-Z0-9]{6}$/.test(raw.token) ? raw.token : createShareToken(),
      displays: raw.displays && typeof raw.displays === 'object' ? raw.displays : {},
    }
  } catch {
    return { enabled: false, token: createShareToken(), displays: {} }
  }
}

function saveConfig(config) {
  try {
    writeFileSync(configPath(), JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('[monitor-share] falha ao salvar config', error)
  }
}

/**
 * @param {() => Electron.WebContents | null} getContents janela principal (avisos para a tela de configurações)
 */
export function attachMonitorShare(getContents) {
  const config = loadConfig()
  /** @type {http.Server | null} */
  let server = null
  let port = null
  /** @type {{ host: string, port: number, device: string } | null} */
  let phone = null
  /** @type {Map<number, BrowserWindow>} */
  const windows = new Map()
  /** Monitores marcados no celular (null = todos os escolhidos aqui). */
  /** @type {Set<number> | null} */
  let selected = null
  const isSelected = (id) => selected === null || selected.has(id)
  /** Celular pede "sem fundo preto de espera": janelas escondidas até projetar. */
  let visible = true

  const applyVisibility = () => {
    for (const win of windows.values()) {
      if (win.isDestroyed()) continue
      if (visible) {
        win.showInactive()
        win.setFullScreen(true)
      } else {
        win.hide()
      }
    }
  }

  const shareable = () => shareableDisplays(screen.getAllDisplays(), screen.getPrimaryDisplay().id)

  const shareDisplays = () => shareable().map(({ display, label }) => ({
    id: display.id,
    label,
    isPrimary: false,
    mode: /** @type {ShareMode | null} */ (config.displays[String(display.id)] ?? null),
    active: config.displays[String(display.id)] != null && isSelected(display.id),
  }))

  /** Sem monitor estendido não há o que emprestar: desliga. */
  const enforceRules = () => {
    const list = shareable()
    config.displays = sanitizeShareModes(config.displays, list.map(({ display }) => display.id))
    if (list.length === 0) config.enabled = false
  }

  const closeWindows = () => {
    // destroy(): fecha já (close() é assíncrono e outros hooks do app podem segurar).
    for (const win of windows.values()) if (!win.isDestroyed()) win.destroy()
    windows.clear()
  }

  const openWindows = () => {
    closeWindows()
    if (!phone) return 0
    // Nunca o principal (sonoplasta): só os estendidos escolhidos.
    for (const { display } of shareable()) {
      const mode = config.displays[String(display.id)]
      if (mode !== 'mirror' && mode !== 'return') continue
      if (!isSelected(display.id)) continue
      const win = new BrowserWindow({
        show: visible,
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        frame: false,
        // fullscreen no construtor mostra a janela no Linux: só se visível
        // (applyVisibility põe em tela cheia ao mostrar).
        fullscreen: visible,
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        title: `Palco do celular · ${mode === 'return' ? 'Retorno' : 'Espelho'}`,
        webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
      })
      win.setBounds(display.bounds)
      if (visible) win.setFullScreen(true)
      // Criada escondida (espera sem fundo preto): alguns gerenciadores de
      // janela mostram ao posicionar/carregar — reaplica após carregar.
      void win.loadFile(RECEIVER_HTML, { query: receiverQuery(phone.host, phone.port, mode) })
        .then(() => { if (!visible && !win.isDestroyed()) win.hide() })
      if (!visible) win.hide()
      // Só apaga a si mesma: a janela antiga fecha DEPOIS da nova do mesmo
      // monitor ser criada (trocar a seleção) e não pode tirá-la da lista.
      win.on('closed', () => { if (windows.get(display.id) === win) windows.delete(display.id) })
      windows.set(display.id, win)
    }
    return windows.size
  }

  const pairing = async () => {
    const host = lanIp()
    const address = port ? `${host}:${port}` : ''
    const connectUrl = port ? `louvorja://monitors?host=${address}&token=${config.token}` : ''
    return {
      enabled: config.enabled,
      running: server !== null,
      extendedCount: shareable().length,
      address,
      token: config.token,
      connectUrl,
      qrDataUrl: connectUrl ? await QRCode.toDataURL(connectUrl, { margin: 1, width: 220 }) : '',
      displays: shareDisplays(),
      phone: phone ? { device: phone.device, host: phone.host, monitors: windows.size } : null,
    }
  }

  const notify = async () => {
    const contents = getContents()
    if (contents && !contents.isDestroyed()) contents.send('monitor-share:changed', await pairing())
  }

  const readBody = (req) => new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 8192) req.destroy()
    })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve(null) }
    })
  })

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const handle = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (req.method === 'GET' && url.pathname === '/monitor-share/status') {
      if (url.searchParams.get('token') !== config.token) return reply(res, 401, { ok: false, code: 'bad_token' })
      return reply(res, 200, { ok: true, displays: shareDisplays(), connected: phone !== null })
    }
    if (req.method !== 'POST') return reply(res, 404, { ok: false })
    const body = await readBody(req)
    if (!body || body.token !== config.token) return reply(res, 401, { ok: false, code: 'bad_token' })
    if (url.pathname === '/monitor-share/connect') {
      const host = validPhoneHost(body.host)
      const wsPort = validPhonePort(body.port)
      if (!host || !wsPort) return reply(res, 400, { ok: false, code: 'bad_address' })
      const reachable = await reachablePhoneHost(host, req.socket.remoteAddress, wsPort)
      if (reachable !== host) console.info(`[monitor-share] celular informou ${host}, alcançável em ${reachable}`)
      phone = { host: reachable, port: wsPort, device: typeof body.device === 'string' ? body.device.slice(0, 60) : 'Celular' }
      selected = null // ao conectar, todos os monitores escolhidos vêm marcados
      visible = body.visible !== false
      const monitors = openWindows()
      void notify()
      return reply(res, 200, { ok: true, monitors })
    }
    if (url.pathname === '/monitor-share/select') {
      // ✓ do celular: só os marcados ficam abertos (o principal nunca entra).
      if (!phone) return reply(res, 409, { ok: false, code: 'not_connected' })
      const ids = Array.isArray(body.displays) ? body.displays.map(Number).filter(Number.isFinite) : []
      selected = new Set(ids)
      const monitors = openWindows()
      void notify()
      return reply(res, 200, { ok: true, monitors, displays: shareDisplays() })
    }
    if (url.pathname === '/monitor-share/visibility') {
      // Espera sem projeção: o monitor mostra o que já estava nele.
      if (!phone) return reply(res, 409, { ok: false, code: 'not_connected' })
      visible = body.visible !== false
      applyVisibility()
      return reply(res, 200, { ok: true, visible })
    }
    if (url.pathname === '/monitor-share/disconnect') {
      phone = null
      closeWindows()
      void notify()
      return reply(res, 200, { ok: true })
    }
    return reply(res, 404, { ok: false })
  }

  const start = () => new Promise((resolve) => {
    if (server) return resolve(true)
    let attempt = 0
    const tryListen = () => {
      const candidate = DEFAULT_MONITOR_SHARE_PORT + attempt
      const srv = http.createServer((req, res) => { void handle(req, res) })
      srv.once('error', () => {
        attempt += 1
        if (attempt >= PORT_ATTEMPTS) return resolve(false)
        tryListen()
      })
      srv.listen(candidate, '0.0.0.0', () => {
        server = srv
        port = candidate
        console.info(`[monitor-share] ouvindo em ${lanIp()}:${port}`)
        resolve(true)
      })
    }
    tryListen()
  })

  const stop = () => {
    phone = null
    closeWindows()
    server?.close()
    server = null
    port = null
  }

  ipcMain.handle('monitor-share:get', () => pairing())
  ipcMain.handle('monitor-share:set', async (_event, changes) => {
    if (changes && typeof changes.enabled === 'boolean') config.enabled = changes.enabled
    if (changes && changes.displays && typeof changes.displays === 'object') {
      const next = {}
      for (const [id, mode] of Object.entries(changes.displays)) {
        if (mode === 'mirror' || mode === 'return') next[id] = mode
      }
      config.displays = next
    }
    enforceRules()
    if (changes?.resetToken === true) {
      config.token = createShareToken()
      phone = null
      closeWindows()
    }
    saveConfig(config)
    if (config.enabled) {
      await start()
      if (phone) openWindows()
    } else {
      stop()
    }
    await notify()
    return pairing()
  })

  // Monitor saiu/entrou ou mudou o principal: reaplica as regras.
  const onDisplaysChanged = async () => {
    enforceRules()
    saveConfig(config)
    if (!config.enabled) stop()
    else if (phone) openWindows()
    await notify()
  }
  screen.on('display-removed', () => { void onDisplaysChanged() })
  screen.on('display-added', () => { void onDisplaysChanged() })
  // Mudança de principal chega aqui: só reaplica as regras (sem reabrir
  // janelas, que também disparam este evento). Se o novo principal tinha
  // janela de palco, ela fecha.
  screen.on('display-metrics-changed', () => {
    enforceRules()
    saveConfig(config)
    if (!config.enabled) stop()
    const primaryId = screen.getPrimaryDisplay().id
    const onPrimary = windows.get(primaryId)
    if (onPrimary && !onPrimary.isDestroyed()) onPrimary.destroy()
    void notify()
  })
  app.on('before-quit', stop)

  enforceRules()
  saveConfig(config)
  if (config.enabled) void start().then(() => notify())
}
