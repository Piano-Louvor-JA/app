import { obsBlackIdle, obsConnections, notifyObsChanged, obsAllowsMirror, obsAssignments, assignObsConnection } from './obs-connections'
/**
 * PalcoSession — sessão de cast para TV no desktop (padrão StageSession do APK).
 *
 * O sender (WS :7081 + HTTP :7080) vive no main process (electron/palco-server.mjs);
 * este service no renderer comanda via preload (window.louvorja.palco.*) e traduz
 * StageSettings efetivo do escopo para as mensagens do protocolo Palco v2.
 */

import { useOutputRegistry } from './output-registry'
import { readEffectiveStageSettings } from './stage-settings-runtime'
import {
  bibleTransitionMs,
  resolveBackgroundImage,
  type StageSettings,
} from '../types/stage-settings'
import { getPalcoRoute, type PalcoModule } from './palco-routing'

/** Envolve o HTML do texto em cor (receiver não lê textColor separado). */
function colorizeProjectionText(text: string, color: string | null): string {
  if (!text || !color) return text
  // Já colorizado (reprojeção / caller explícito): não aninha.
  if (/^<span\s+style=["']color:/i.test(text.trim())) return text
  return `<span style="color:${color}">${text}</span>`
}

/**
 * Rodapé da Bíblia: a referência desktop já inclui a versão em " (ABR)".
 * Com showBibleVersion off, remove só o sufixo da versão (paridade APK).
 */
function resolveProjectionFooterRef(
  scope: string,
  settings: StageSettings,
  footerRef: string | undefined,
): string {
  const ref = footerRef ?? ''
  if (scope !== 'bible' || settings.showBibleVersion) return ref
  return ref.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

type PalcoStatus = {
  receiverIps?: string[]
  running: boolean
  clients: number
  url: string | null
  wsUrl: string | null
}

export type PalcoTimerOptions = { duration?: number; mode?: 'countdown' | 'chrono'; label?: string; background?: string; text?: string; obsPane?: boolean; timeFormat?: string; chronoRuntime?: { status: string; accumulatedMs: number; segmentStartedAt: number | null } }

export type ProjectionInput = {
  obsPane?: boolean
  /** HTML do texto (aceita <br>). */
  text: string
  /** Referência do rodapé (ex.: 'João 3:16 — ARC'). */
  footerRef?: string
  /** Versão da Bíblia no rodapé (ex.: 'ARC'). */
  footerVersion?: string
  /** BG: URL http(s) já resolvível pela TV; omitir usa o bg do stage. */
  background?: string
  /** Capa da música: título destaque amarelo, sem caixinha (paridade cabo). */
  isCover?: boolean
  /** Frame do slide PDF/PPT/imagens: dataURL completo (data:image/png;base64,…). */
  frameDataUrl?: string
}

/** Acesso tipado ao palco exposto pelo preload (contextBridge). */
function palcoApi(): {
  getPersistence(): Promise<{ enabled: boolean }>
  setPersistence(enabled: boolean): Promise<{ enabled: boolean }>
  status(slotId?: string): Promise<PalcoStatus>
  start(slotId?: string): Promise<boolean>
  stop(slotId?: string): Promise<void>
  send(m: unknown, slotId?: string): Promise<boolean>
  serveMedia(n: string, m: string, b: string, slotId?: string): Promise<string | null>
  servePath(p: string, slotId?: string): Promise<string | null>
  onEvent(cb: (m: unknown) => void): (() => void) | void
  onReceiverConnected(cb: (i: unknown) => void): (() => void) | void
  onReceiverDisconnected(cb: (i: unknown) => void): void
  wake?(): Promise<{ ok: boolean; results?: string[] } | null>
} {
  return (window as never as { louvorja: { palco: never } }).louvorja.palco
}

class PalcoSession {
  private baseUrl: string | null = null
  private activeSlotId = '0'
  /** Cache blob:/data: → URL /media/ — o runtime republisha por tick; sem
   * cache cada publish re-enviaria a capa base64 ao main (4 MB × 4/s). */
  private servedDataUrl = new Map<string, Map<string, string>>()

  /** Instância isolada evita que envios concorrentes troquem o destino uns dos outros. */
  private forSlot(id: string): PalcoSession {
    const session = new PalcoSession()
    session.setSlot(id)
    session.servedDataUrl = this.servedDataUrl
    return session
  }

  get slotId(): string {
    return this.activeSlotId
  }

  setSlot(slotId: string): void {
    this.activeSlotId = slotId
    this.baseUrl = null
  }

  async getConnectionPersistence(): Promise<boolean> {
    return this.isElectron ? (await palcoApi().getPersistence()).enabled : false
  }
  async setConnectionPersistence(enabled: boolean): Promise<boolean> {
    if (!this.isElectron) return false
    return (await palcoApi().setPersistence(enabled)).enabled
  }

  async slots(): Promise<Array<{ id: string; label: string; running: boolean; clients: number; httpPort: number; wsPort: number }>> {
    if (!this.isElectron) return []
    return (window as never as { louvorja: { palco: { slots(): Promise<Array<{ id: string; label: string; running: boolean; clients: number; httpPort: number; wsPort: number }>> } } }).louvorja.palco.slots()
  }

  async createSlot(label: string): Promise<{ id: string; label: string; httpPort: number; wsPort: number } | null> {
    if (!this.isElectron) return null
    return (window as never as { louvorja: { palco: { createSlot(label: string): Promise<{ id: string; label: string; httpPort: number; wsPort: number }> } } }).louvorja.palco.createSlot(label)
  }

  async removeSlot(id: string): Promise<boolean> {
    if (!this.isElectron) return false
    const removed = await (window as never as { louvorja: { palco: { removeSlot(id: string): Promise<boolean> } } }).louvorja.palco.removeSlot(id)
    if (removed) this.servedDataUrl.delete(id)
    return removed
  }

  async startSlot(id: string): Promise<boolean> {
    if (!this.isElectron) return false
    return (window as never as { louvorja: { palco: { start(id: string): Promise<boolean> } } }).louvorja.palco.start(id)
  }

  async stopSlot(id: string): Promise<void> {
    if (!this.isElectron) return
    await (window as never as { louvorja: { palco: { stop(id: string): Promise<void> } } }).louvorja.palco.stop(id)
    if (obsAssignments.value[id]) assignObsConnection(id, null)
    this.servedDataUrl.delete(id)
  }

  get isElectron(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!(window as never as { louvorja?: { palco?: unknown } }).louvorja?.palco
    )
  }

  async statusSlot(id: string): Promise<(PalcoStatus & { receiverUrl?: string | null }) | null> {
    if (!this.isElectron) return null
    return palcoApi().status(id)
  }

  async status(): Promise<PalcoStatus | null> {
    if (!this.isElectron) return null
    return palcoApi().status(this.activeSlotId)
  }

  async turnOn(): Promise<boolean> {
    if (!this.isElectron) return false
    this.baseUrl = null // recarrega no próximo project
    const ok = await palcoApi().start(this.activeSlotId)
    if (ok) {
      // liga o palco: bg permanente + idle + wakeup dos receivers
      this.sendBgPalco()
      this.idle()
      notifyObsChanged()
      try { void palcoApi().wake?.() } catch { /* best-effort */ }
    }
    return ok
  }

  async turnOff(): Promise<void> {
    if (!this.isElectron) return
    this.baseUrl = null
    await this.stopSlot(this.activeSlotId)
  }

  /** BaseUrl do sender (http://ip:7080) — cacheado após 1º status. */
  private async ensureBaseUrl(): Promise<string | null> {
    if (!this.baseUrl) {
      const st = await this.status()
      this.baseUrl = st?.url ?? null
    }
    return this.baseUrl
  }

  /**
   * BG do build do desktop (/assets/bg-XX-<hash>.png) não existe na TV —
   * o palco-server serve os oficiais em /bg/:id.png. Converte pra URL absoluta.
   * Imagens locais (local://media/...) também não existem na TV — o sender
   * publica em /media/ via servePath (mesma paridade do áudio/cover).
   */
  private async resolveBgUrl(bg: string | null | undefined): Promise<string | undefined> {
    if (!bg) return undefined
    if (/^https?:\/\//i.test(bg)) return bg
    const base = await this.ensureBaseUrl()
    // bg oficial do build: /assets/bg-XX-<hash>.png
    const m = bg.match(/bg-\d+/)
    if (m && bg.includes('/assets/')) return `${base}/bg/${m[0]}.png`
    // official:bg-XX (não resolvido)
    if (bg.startsWith('official:')) {
      const om = bg.match(/bg-\d+/)
      if (om) return `${base}/bg/${om[0]}.png`
    }
    // arquivo local (local://media/... ou path) → servePath
    const served = await this.serveLocal(bg)
    if (served) return served
    // não resolúvel (arquivo inexistente, path quebrado): SEM bg — a TV usa
    // o bg-fallback dela. Mandar `${base}/local://...` dá 404 na TV.
    return undefined
  }

  /** Projeta texto com o StageSettings do escopo (liturgia/bíblia/hinos/random...). */
  async project(scope: string, input: ProjectionInput): Promise<void> {
    if (!this.isElectron) return
    const s = readEffectiveStageSettings(scope)
    // BG do usuário (backgroundImage) é a personalização ativa: vence a capa/
    // asset da API em QUALQUER escopo — paridade com a projeção local
    // (MediaProjectionView: preferência ?? capa). Antes o palco fazia o
    // inverso (capa ?? preferência) → bg da API vencia a escolha do usuário
    // só no palco (14/10). Hymns overrideBg continua indiferente ao input.
    const overrideHymnBg = scope === 'hymns' && s.hymns?.overrideBg === true
    const userBg = resolveBackgroundImage(s.backgroundImage)
    const bg = await this.resolveBgUrl(
      overrideHymnBg || userBg
        ? userBg
        : input.background ?? userBg,
    )
    // Bíblia tem tipografia própria (paridade APK StageSession / PalcoOrchestrator).
    const isBible = scope === 'bible'
    const isHymns = scope === 'hymns'
    const sizeAt1920 = isBible ? s.bibleFontSize : s.fontSize
    const fontWeight = isBible ? s.bibleFontWeight : s.fontWeight
    const textColor = isBible ? s.bibleTextColor : s.textColor
    // Capa (isCover): o span colorido INLINE venceria o amarelo do
    // .cover-on no receiver (inline > classe) — título nascia branco.
    // Capa não leva colorize; estrofes sim (05/10).
    const colorized =
      input.isCover === true
        ? input.text
        : colorizeProjectionText(input.text, textColor)
    const footerRef = resolveProjectionFooterRef(scope, s, input.footerRef)
    // Frame de slide (PDF/PPT/imagens): imagem vira o bg e texto vai vazio —
    // receiver trata projection sem texto como mídia visual pura (sem véu),
    // preservando a tonalidade original do canvas do operador.
    const isFrameSlide = typeof input.frameDataUrl === 'string' && input.frameDataUrl.startsWith('data:image/')
    await palcoApi().send({
      v: 2,
      type: 'projection',
      scope,
      obsPane: input.obsPane === true,
      background: isFrameSlide ? input.frameDataUrl : bg,
      text: isFrameSlide ? '' : colorized,
      // px@1920 → o receiver divide por 10.8 (px@1080p → vw)
      fontSize: ((isHymns && input.isCover ? s.titleFontSize ?? sizeAt1920 : sizeAt1920) / 1920) * 1080,
      fontWeight: isHymns && input.isCover ? s.titleFontWeight ?? fontWeight : fontWeight,
      titleTextColor: isHymns && input.isCover ? s.titleTextColor ?? s.textColor ?? undefined : undefined,
      textShadow: isHymns && input.isCover ? s.titleTextShadow ?? s.textShadow : s.textShadow,
      shadowBlur: s.shadowBlur,
      shadowIntensity: s.shadowIntensity,
      // Caixa GRANDE (véu de leitura) é exclusiva da Bíblia (13/10 Rafael);
      // demais escopos: caixa justa ao texto (padrão media-slide/receiver).
      textBox: s.textBox,
      bibleBox: isBible,
      boxOpacity: s.boxOpacity,
      boxBorder: s.boxBorder
        ? { width: 0.2, color: 'rgba(255,255,255,0.85)' }
        : undefined,
      footerRef,
      footerColor: s.footerRefColor,
      footerWeight: s.footerRefWeight,
      footerPosition: isBible ? s.bibleRefPosition ?? 'below-right' : undefined,
      // Receiver anima a entrada do versículo novo; sem o campo, troca seca.
      transition: isBible ? s.bibleTransition ?? 'fade' : undefined,
      transitionMs: isBible ? bibleTransitionMs(s.bibleTransitionSpeed) : undefined,
      // Estrofes com aparência própria (paridade do title*):
      lyricFontSize: (isHymns && s.lyricFontSize != null ? s.lyricFontSize : sizeAt1920) / 1920 * 1080,
      lyricFontWeight: isHymns && s.lyricFontWeight != null ? s.lyricFontWeight : fontWeight,
      // Capa (isCover): null = deixa o .cover-on amarelo do receiver mandar —
      // NÃO cai pro textColor global (inline branco vencia a classe, 05/10).
      lyricTextColor:
        input.isCover === true
          ? (isHymns && s.lyricTextColor != null ? s.lyricTextColor : undefined)
          : (isHymns && s.lyricTextColor != null ? s.lyricTextColor : textColor),
      // Paridade total (13/10): uppercase da letra em TODOS os escopos —
      // mesma chave lUpper que o app/projeção aplicam.
      lyricUpperCase: s.lyricUpperCase,
      // Capa (isCover): uppercase do TÍTULO — paridade titleStyle local.
      titleUpperCase: s.titleUpperCase,
      // Caixa opcional na capa (14/10): default off = capa clássica amarela.
      titleTextBox: s.titleTextBox,
      lyricTextShadow: isHymns && s.lyricTextShadow != null ? s.lyricTextShadow : s.textShadow,
      // Personalização completa da projeção local refletida no palco:
      textAlign: s.textAlign,
      textVerticalAlign: s.textVerticalAlign,
      // null = usuário NÃO escolheu cor → não seta: receiver mantém o véu
      // padrão e a IMAGEM vence; cor só vai se for escolha explícita.
      // A selected module image sits above its fallback color, as in the local preview.
      backgroundColor: userBg && bg ? undefined : s.backgroundColor ?? undefined,
      margin: s.margin,
      // Capitalização do versículo (receiver aplica CSS text-transform).
      ...(isBible &&
      (s.bibleTextTransform === 'uppercase' || s.bibleTextTransform === 'capitalize')
        ? { textTransform: s.bibleTextTransform }
        : {}),
      // Versão já vem embutida em footerRef (formato desktop); não duplicar.
      footerVersion:
        isBible && !s.showBibleVersion ? undefined : input.footerVersion,
      isCover: input.isCover === true,
    }, this.activeSlotId)
  }

  /** Projeta numa TV específica sem deixar slot ativo global alterado. */
  async projectTo(slotId: string, scope: string, input: ProjectionInput): Promise<void> {
    await this.forSlot(slotId).project(scope, input)
  }

  /** Espelha módulo em todos slots ligados, ou usa rota individual.
   *
   * Spec multi-telas (registry de saídas): slot com módulo ATRIBUÍDO só
   * recebe o conteúdo atribuído; slot espelho (null) recebe tudo —
   * comportamento legado preservado quando ninguém configura nada. */
  async projectRouted(module: PalcoModule, scope: string, input: ProjectionInput): Promise<void> {
    const route = getPalcoRoute(module)
    if (route !== 'mirror') return this.projectTo(route, scope, input)
    const { moduleForSlot } = useOutputRegistry()
    const slots = await this.slots()
    const targets = slots
      .filter((s) => s.running && obsAllowsMirror(s.id, module))
      .filter((s) => moduleForSlot(s.id) === null || moduleForSlot(s.id) === module)
    // Mantém a ordem das publicações; cada destino usa uma sessão isolada.
    for (const target of targets) {
      await this.projectTo(target.id, scope, input)
    }
  }

  /** BG permanente do palco (idle) — bg global do stage. */
  async sendBgPalco(): Promise<void> {
    if (!this.isElectron) return
    const s = readEffectiveStageSettings('global')
    const bg = await this.resolveBgUrl(resolveBackgroundImage(s.backgroundImage))
    await palcoApi().send({
      v: 2,
      type: 'bgPalco',
      url: bg ?? '',
    }, this.activeSlotId)
  }

  /** Timer na TV (countdown/chrono) — com bg do escopo do módulo. */
  async timer(opts: PalcoTimerOptions): Promise<void> {
    if (!this.isElectron) return
    const settings = readEffectiveStageSettings(opts.mode === 'countdown' ? 'countdown' : 'timer')
    const background = await this.resolveBgUrl(opts.background ?? resolveBackgroundImage(settings.backgroundImage))
    await palcoApi().send({
      v: 2,
      type: 'timer',
      ...opts,
      background,
      backgroundColor: background ? undefined : settings.backgroundColor ?? undefined,
    }, this.activeSlotId)
  }

  async timerRouted(module: PalcoModule, opts: { duration?: number; mode?: 'countdown' | 'chrono'; label?: string }): Promise<void> {
    const route = getPalcoRoute(module)
    const slots = route === 'mirror' ? (await this.slots()).filter((s) => s.running && obsAllowsMirror(s.id, module)).map((s) => s.id) : [route]
    await Promise.all(slots.map((id) => this.forSlot(id).timer(opts)))
  }

  timerStop(): void {
    if (!this.isElectron) return
    void palcoApi().send({
      v: 2,
      type: 'timer',
      action: 'stop',
    }, this.activeSlotId)
  }

  /** Áudio na TV — o receiver sincroniza positionMs antes do play. */
  async audio(input: {
    url?: string
    title?: string
    subtitle?: string
    cover?: string
    background?: string
    positionMs?: number
    action?: 'play' | 'pause' | 'stop' | 'seek'
    position?: number
  }): Promise<void> {
    if (!this.isElectron) return
    const bg = await this.resolveBgUrl(input.background)
    // Áudio/cover locais (file://) não existem na TV — o sender serve em
    // /media/ (paridade serveMedia do APK). http(s) segue direto.
    let url = input.url
    if (url && !/^https?:\/\//i.test(url)) {
      url = (await this.serveLocal(url)) ?? undefined
    }
    let cover = input.cover
    if (cover && !/^https?:\/\//i.test(cover)) {
      cover = (await this.serveLocal(cover)) ?? undefined
    }
    await palcoApi().send({
      v: 2,
      type: 'audio',
      ...input,
      url,
      cover,
      background: bg,
    }, this.activeSlotId)
  }

  /** Vídeo na TV — arquivo local servido em /media/ pelo sender. */
  async video(input: {
    url?: string
    title?: string
    action?: 'play' | 'pause' | 'stop'
  }): Promise<void> {
    if (!this.isElectron) return
    let url = input.url
    if (url && !/^https?:\/\//i.test(url)) {
      url = (await this.serveLocal(url)) ?? undefined
    }
    if (!url && input.action !== 'stop') return
    await palcoApi().send({
      v: 2,
      type: 'video',
      ...input,
      url,
    }, this.activeSlotId)
  }

  /** Vídeo roteado: mirror → todas as TVs ligadas; slot individual → só essa. */
  async videoRouted(input: Parameters<PalcoSession['video']>[0]): Promise<void> {
    if (!this.isElectron) return
    const route = getPalcoRoute('liturgy')
    if (route !== 'mirror') {
      await this.forSlot(route).video(input)
      return
    }
    const slots = await this.slots()
    await Promise.all(slots.filter((slot) => slot.running && obsAllowsMirror(slot.id, 'liturgy')).map((slot) => {
      return this.forSlot(slot.id).video(input)
    }))
  }

  /**
   * Áudio roteado: rota mirror → todas as TVs ligadas; slot individual →
   * só essa TV (paridade com projectRouted). Play/pause/seek/stop vão ao
   * slot-alvo sem trocar o slot ativo global.
   */
  async audioRouted(input: Parameters<PalcoSession['audio']>[0]): Promise<void> {
    if (!this.isElectron) return
    // BG do escopo liturgy quando o chamador não manda (fix 27/08): MP3
    // sem background deixava o palco preto — o receiver mostra now-playing
    // + equalizador sobre este bg.
    if (!input.background) {
      const st = readEffectiveStageSettings('liturgy')
      input = { ...input, background: await this.resolveBgUrl(resolveBackgroundImage(st.backgroundImage)) ?? undefined }
    }
    const route = getPalcoRoute('liturgy')
    if (route !== 'mirror') {
      await this.forSlot(route).audio(input)
      return
    }
    const slots = await this.slots()
    await Promise.all(slots.filter((slot) => slot.running && obsAllowsMirror(slot.id, 'liturgy')).map((slot) => {
      return this.forSlot(slot.id).audio(input)
    }))
  }

  /** Publica arquivo local no /media/ do sender e devolve URL absoluta. */
  private async serveLocal(target: string): Promise<string | null> {
    // blob:/data: (capa .slja do IndexedDB — o renderer resolve coverMediaId
    // como objectURL) não são paths: o servePath do main faria stat("blob:...")
    // e falharia → TV sem bg (fallback). Busca os bytes e publica via
    // serveMedia (base64 → /media/ no sender), com nome determinístico
    // (hash dos bytes) e cache por sessão — mesma capa não republisha.
    if (/^(blob|data):/i.test(target)) {
      const slotId = this.activeSlotId
      const cached = this.servedDataUrl.get(slotId)?.get(target)
      if (cached) return cached
      try {
        const res = await fetch(target)
        if (!res.ok) return null
        const blob = await res.blob()
        const buf = new Uint8Array(await blob.arrayBuffer())
        if (buf.byteLength === 0 || buf.byteLength > 50 * 1024 * 1024) return null
        const mime = blob.type || 'image/png'
        const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
        let hash = 0
        for (const b of buf) hash = (Math.imul(hash, 31) + b) | 0
        const name = `slja_${(hash >>> 0).toString(16).padStart(8, '0')}${buf.byteLength.toString(16)}.${ext}`
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        }
        const url = await palcoApi().serveMedia(name, mime, btoa(bin), slotId)
        if (url) {
          let cache = this.servedDataUrl.get(slotId)
          if (!cache) {
            cache = new Map<string, string>()
            this.servedDataUrl.set(slotId, cache)
          }
          cache.set(target, url)
        }
        return url
      } catch {
        return null
      }
    }
    try {
      return await palcoApi().servePath(target, this.activeSlotId)
    } catch {
      return null
    }
  }

  async warmupObs(slotId: string): Promise<void> {
    if (!this.isElectron) throw new Error('OBS unavailable')
    await this.refreshObs(slotId)
    const requestId = `warmup-${slotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let timeout: ReturnType<typeof setTimeout> | undefined
    const cleanup: { unsubscribe?: (() => void) | void } = {}
    let fail: (error: Error) => void = () => {}
    const confirmed = new Promise<void>((resolve, reject) => {
      fail = reject
      cleanup.unsubscribe = palcoApi().onEvent(info => {
        const message = info as { type?: string; requestId?: string }
        if (message.type === 'obs-warmup-complete' && message.requestId === requestId) resolve()
      })
      timeout = setTimeout(() => reject(new Error('OBS source did not confirm the startup test')), 20000)
    })
    try {
      const sent = await palcoApi().send({ v: 2, type: 'obsWarmup', requestId, durationMs: 3000, expiresAt: Date.now() + 20000 }, slotId).catch(() => false)
      if (!sent) fail(new Error('OBS startup test could not be sent'))
      await confirmed
    } finally {
      if (timeout) clearTimeout(timeout)
      if (typeof cleanup.unsubscribe === 'function') cleanup.unsubscribe()
    }
  }

  async refreshObs(slotId: string): Promise<boolean> {
    if (!this.isElectron) return false
    const status = await palcoApi().status(slotId).catch(() => null)
    const requestId = `${slotId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let finish: ((connected: boolean) => void) | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    const cleanup: { unsubscribe?: (() => void) | void } = {}
    const reconnected = status?.clients ? new Promise<boolean>(resolve => {
      finish = resolve
      cleanup.unsubscribe = palcoApi().onEvent(info => {
        const message = info as { type?: string; requestId?: string }
        if (message.type === 'receiver-ready' && message.requestId === requestId) resolve(true)
      })
      timeout = setTimeout(() => resolve(false), 5000)
    }) : Promise.resolve(true)
    try {
      const sent = await palcoApi().send({ v: 2, type: 'obsControl', action: 'reload', requestId }, slotId)
      if (!sent) { finish?.(false); return false }
      // Older running main processes cache unknown commands: replace reload
      // before the receiver reconnects so it cannot enter a reload loop.
      await palcoApi().send({ v: 2, type: 'obsControl', action: 'ready' }, slotId)
      return await reconnected
    } finally {
      if (timeout) clearTimeout(timeout)
      if (typeof cleanup.unsubscribe === 'function') cleanup.unsubscribe()
    }
  }

  syncObsShare(slotId: string, enabled: boolean): void {
    if (!this.isElectron) return
    void palcoApi().send({ v: 2, type: 'obsShare', enabled }, slotId)
  }

  syncObsIdle(slotId: string): void {
    if (!this.isElectron) return
    void palcoApi().send({ v: 2, type: 'obsIdle', black: obsBlackIdle.value }, slotId)
  }

  /** Volta ao idle (aguardando conteúdo). */
  idle(msg?: string): void {
    if (!this.isElectron) return
    if (obsConnections.value.some((item) => item.id === this.activeSlotId)) this.syncObsIdle(this.activeSlotId)
    void palcoApi().send({
      v: 2,
      type: 'idle',
      msg,
    }, this.activeSlotId)
  }

  /** Idle num slot específico sem alterar o slot ativo global. */
  idleTo(slotId: string, msg?: string): void {
    const previous = this.activeSlotId
    this.setSlot(slotId)
    try { this.idle(msg) } finally { this.setSlot(previous) }
  }

  /** Timer num slot específico sem alterar o slot ativo global. */
  async timerTo(slotId: string, opts: PalcoTimerOptions): Promise<void> {
    await this.forSlot(slotId).timer(opts)
  }

  /** Serve mídia local e retorna a URL para a TV. */
  async serveMedia(name: string, mime: string, base64: string): Promise<string | null> {
    if (!this.isElectron) return null
    return palcoApi().serveMedia(name, mime, base64)
  }

  /** Eventos receiver→sender (remote-key, ended, unlocked...). */
  onEvent(cb: (msg: { v?: number; type?: string; [k: string]: unknown }) => void): void {
    if (!this.isElectron) return
    palcoApi().onEvent(cb as (m: unknown) => void)
  }

  onReceiverConnected(cb: (info: { ip?: string; count: number }) => void): (() => void) | void {
    if (!this.isElectron) return
    return palcoApi().onReceiverConnected(cb as (i: unknown) => void)
  }

  onReceiverDisconnected(cb: (info: { count: number }) => void): void {
    if (!this.isElectron) return
    palcoApi().onReceiverDisconnected(cb as (i: unknown) => void)
  }
}

export const palcoSession = new PalcoSession()
