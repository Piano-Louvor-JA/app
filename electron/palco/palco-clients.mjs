/**
 * Quem está conectado a uma transmissão (módulo Palco).
 *
 * Paridade com o apk (PalcoClientInfo): a plataforma vem do User-Agent na
 * conexão e o `hello` do receiver das TVs completa com id estável, nome e
 * versão. Navegador e OBS não mandam hello e ficam só com o User-Agent.
 */

const TV_PLATFORMS = new Set(['webos', 'tizen', 'androidtv'])

/** 'webos' | 'tizen' | 'androidtv' | 'obs' | 'browser'. */
export function platformFromUserAgent(ua = '') {
  if (/Web0S|webOS/i.test(ua)) return 'webos'
  if (ua.includes('Tizen')) return 'tizen'
  if (ua.includes('OBS')) return 'obs'
  if (ua.includes('Android') && !ua.includes('Mobile')) return 'androidtv'
  return 'browser'
}

export function defaultName(platform) {
  switch (platform) {
    case 'webos': return 'TV LG (webOS)'
    case 'tizen': return 'TV Samsung (Tizen)'
    case 'androidtv': return 'Android TV'
    case 'obs': return 'OBS'
    default: return 'Navegador'
  }
}

export function isTv(info) { return TV_PLATFORMS.has(info?.platform) }

let seq = 0

/** Cliente recém-conectado, antes do hello. */
export function clientFromRequest({ ip = '', userAgent = '', now = Date.now() } = {}) {
  const platform = platformFromUserAgent(userAgent)
  seq += 1
  return { uid: `c${now.toString(36)}${seq}`, ip, platform, name: defaultName(platform), version: null, id: null, connectedAt: now }
}

/** Completa com o hello do receiver: {platform, name, version, id}. */
export function withHello(info, fields = {}) {
  let platform = typeof fields.platform === 'string' ? fields.platform.replace(/^palco-/, '') : ''
  if (!platform) platform = info.platform
  const name = typeof fields.name === 'string' ? fields.name.trim() : ''
  return {
    ...info,
    platform,
    name: name || defaultName(platform),
    version: typeof fields.version === 'string' ? fields.version : info.version,
    id: typeof fields.id === 'string' && fields.id ? fields.id : info.id,
  }
}

/** Chave da marca (TV desmarcada): id do hello ou, sem ele, IP + plataforma. */
export function muteKey(info) {
  return info.id ? info.id : `${info.ip}|${info.platform}`
}

/**
 * A mesma TV reconectou? Mesmo id; ou, faltando id em um dos lados, mesmo
 * IP e plataforma. Ids diferentes atrás do mesmo IP (NAT) são TVs diferentes.
 */
export function sameTv(a, b) {
  if (a.id && b.id) return a.id === b.id
  return a.ip === b.ip && a.platform === b.platform
}

/** Comandos que o receiver entende (enviados a uma TV só). */
export function commandMessage(command, args = {}) {
  switch (command) {
    case 'identify':
      return { v: 2, type: 'identify', name: String(args.name ?? ''), slotLabel: String(args.slotLabel ?? '') }
    case 'rename': {
      const name = String(args.name ?? '').trim().slice(0, 40)
      return name ? { v: 2, type: 'rename', name } : null
    }
    case 'reload':
      return { v: 2, type: 'reload' }
    case 'moveTo': {
      const port = Number(args.port)
      return Number.isInteger(port) && port >= 1024 && port <= 65535 ? { v: 2, type: 'moveTo', port } : null
    }
    default:
      return null
  }
}
