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
  resolveBackgroundImage,
  type StageSettings,
} from '../types/stage-settings'
import { getPalcoRoute, type PalcoModule } from './palco-routing'

/** Envolve o HTML do texto em cor (receiver não lê textColor separado). */
function colorizeProjectionText(text: string, color: string): string {
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
  running: boolean
  clients: number
  url: string | null
  wsUrl: string | null
}

export type ProjectionInput = {
  /** HTML do texto (aceita <br>). */
  text: string
  /** Referência do rodapé (ex.: 'João 3:16 — ARC'). */
  footerRef?: string
  /** Versão da Bíblia no rodapé. */
  footerVersion?: string
  /** BG: URL http(s) já resolvível pela TV; omitir usa o bg do stage. */
  background?: string
  /** Capa da música: título destaque amarelo, sem caixinha (paridade cabo). */
  isCover?: boolean
}

/** Acesso tipado ao palco exposto pelo preload (contextBridge). */
function palcoApi(): {
  status(slotId?: string): Promise<PalcoStatus>
  start(slotId?: string): Promise<boolean>
  stop(slotId?: string): Promise<void>
  send(m: unknown, slotId?: string): Promise<boolean>
  serveMedia(n: string, m: string, b: string, slotId?: string): Promise<string | null>
  servePath(p: string, slotId?: string): Promise<string | null>
  onEvent(cb: (m: unknown) => void): void
  onReceiverConnected(cb: (i: unknown) => void): void
  onReceiverDisconnected(cb: (i: unknown) => void): void
  wake?(): Promise<{ ok: boolean; results?: string[] } | null>
} {
  return (window as never as { louvorja: { palco: never } }).louvorja.palco
}

class PalcoSession {
  private baseUrl: string | null = null
  private activeSlotId = '0'

  get slotId(): string {
    return this.activeSlotId
  }

  setSlot(slotId: string): void {
    this.activeSlotId = slotId
    this.baseUrl = null
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
    return (window as never as { louvorja: { palco: { removeSlot(id: string): Promise<boolean> } } }).louvorja.palco.removeSlot(id)
  }

  async startSlot(id: string): Promise<boolean> {
    if (!this.isElectron) return false
    return (window as never as { louvorja: { palco: { start(id: string): Promise<boolean> } } }).louvorja.palco.start(id)
  }

  async stopSlot(id: string): Promise<void> {
    if (!this.isElectron) return
    await (window as never as { louvorja: { palco: { stop(id: string): Promise<void> } } }).louvorja.palco.stop(id)
  }

  get isElectron(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!(window as never as { louvorja?: { palco?: unknown } }).louvorja?.palco
    )
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
      try { void palcoApi().wake?.() } catch { /* best-effort */ }
    }
    return ok
  }

  async turnOff(): Promise<void> {
    if (!this.isElectron) return
    this.baseUrl = null
    await palcoApi().stop(this.activeSlotId)
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
    // Hinos com overrideBg: o bg configurado no escopo vence o asset da
    // música (capa/slide) — fundo próprio pra todas as músicas.
    const overrideHymnBg = scope === 'hymns' && s.hymns?.overrideBg === true
    const bg = await this.resolveBgUrl(
      overrideHymnBg
        ? resolveBackgroundImage(s.backgroundImage)
        : input.background ?? resolveBackgroundImage(s.backgroundImage),
    )
    // Bíblia tem tipografia própria (paridade APK StageSession / PalcoOrchestrator).
    const isBible = scope === 'bible'
    const isHymns = scope === 'hymns'
    const sizeAt1920 = isBible ? s.bibleFontSize : s.fontSize
    const fontWeight = isBible ? s.bibleFontWeight : s.fontWeight
    const textColor = isBible ? s.bibleTextColor : s.textColor
    const footerRef = resolveProjectionFooterRef(scope, s, input.footerRef)
    await palcoApi().send({
      v: 2,
      type: 'projection',
      background: bg,
      text: colorizeProjectionText(input.text, textColor),
      // px@1920 → o receiver divide por 10.8 (px@1080p → vw)
      fontSize: (sizeAt1920 / 1920) * 1080,
      fontWeight,
      textShadow: s.textShadow,
      shadowBlur: s.shadowBlur,
      shadowIntensity: s.shadowIntensity,
      textBox: s.textBox,
      boxOpacity: s.boxOpacity,
      boxBorder: s.boxBorder
        ? { width: 0.4, color: 'rgba(255,255,255,.25)' }
        : undefined,
      footerRef,
      footerColor: s.footerRefColor,
      footerWeight: s.footerRefWeight,
      // Estrofes com aparência própria (paridade do title*):
      lyricFontSize: (isHymns && s.lyricFontSize != null ? s.lyricFontSize : sizeAt1920) / 1920 * 1080,
      lyricFontWeight: isHymns && s.lyricFontWeight != null ? s.lyricFontWeight : fontWeight,
      lyricTextColor: (isHymns && s.lyricTextColor != null ? s.lyricTextColor : textColor),
      lyricUpperCase: isHymns ? s.lyricUpperCase : false,
      lyricTextShadow: isHymns && s.lyricTextShadow != null ? s.lyricTextShadow : s.textShadow,
      // Personalização completa da projeção local refletida no palco:
      textAlign: s.textAlign,
      textVerticalAlign: s.textVerticalAlign,
      backgroundColor: s.backgroundColor,
      margin: s.margin,
      // Versão já vem embutida em footerRef (formato desktop); não duplicar.
      footerVersion:
        isBible && !s.showBibleVersion ? undefined : input.footerVersion,
      isCover: input.isCover === true,
    }, this.activeSlotId)
  }

  /** Projeta numa TV específica sem deixar slot ativo global alterado. */
  async projectTo(slotId: string, scope: string, input: ProjectionInput): Promise<void> {
    const previous = this.activeSlotId
    this.setSlot(slotId)
    try { await this.project(scope, input) } finally { this.setSlot(previous) }
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
      .filter((s) => s.running)
      .filter((s) => moduleForSlot(s.id) === null || moduleForSlot(s.id) === module)
    // SERIAL, nunca Promise.all: projectTo troca activeSlotId/baseUrl para
    // gerar URLs (/bg,/media) daquele sender. Em paralelo, TV Principal
    // recebia URL :7082 (TV 2) e caía no fallback (caso real 26/08).
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
  async timer(opts: { duration?: number; mode?: 'countdown' | 'chrono'; label?: string; background?: string }): Promise<void> {
    if (!this.isElectron) return
    let background = opts.background
    if (!background) {
      const s = readEffectiveStageSettings('timer')
      background = await this.resolveBgUrl(resolveBackgroundImage(s.backgroundImage))
    }
    await palcoApi().send({
      v: 2,
      type: 'timer',
      ...opts,
      background,
    }, this.activeSlotId)
  }

  async timerRouted(module: PalcoModule, opts: { duration?: number; mode?: 'countdown' | 'chrono'; label?: string }): Promise<void> {
    const route = getPalcoRoute(module)
    const slots = route === 'mirror' ? (await this.slots()).filter((s) => s.running).map((s) => s.id) : [route]
    await Promise.all(slots.map(async (id) => {
      const previous = this.activeSlotId
      this.setSlot(id)
      try { await this.timer(opts) } finally { this.setSlot(previous) }
    }))
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
      const previous = this.activeSlotId
      this.setSlot(route)
      try { await this.video(input) } finally { this.setSlot(previous) }
      return
    }
    const slots = await this.slots()
    await Promise.all(slots.filter((slot) => slot.running).map((slot) => {
      const previous = this.activeSlotId
      this.setSlot(slot.id)
      return this.video(input).finally(() => this.setSlot(previous))
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
      const previous = this.activeSlotId
      this.setSlot(route)
      try { await this.audio(input) } finally { this.setSlot(previous) }
      return
    }
    const slots = await this.slots()
    await Promise.all(slots.filter((slot) => slot.running).map((slot) => {
      const previous = this.activeSlotId
      this.setSlot(slot.id)
      return this.audio(input).finally(() => this.setSlot(previous))
    }))
  }

  /** Publica arquivo local no /media/ do sender e devolve URL absoluta. */
  private async serveLocal(target: string): Promise<string | null> {
    try {
      return await palcoApi().servePath(target, this.activeSlotId)
    } catch {
      return null
    }
  }

  /** Volta ao idle (aguardando conteúdo). */
  idle(msg?: string): void {
    if (!this.isElectron) return
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
  timerTo(slotId: string, opts: { duration?: number; mode?: 'countdown' | 'chrono'; label?: string }): void {
    const previous = this.activeSlotId
    this.setSlot(slotId)
    try { this.timer(opts) } finally { this.setSlot(previous) }
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

  onReceiverConnected(cb: (info: { ip?: string; count: number }) => void): void {
    if (!this.isElectron) return
    palcoApi().onReceiverConnected(cb as (i: unknown) => void)
  }

  onReceiverDisconnected(cb: (info: { count: number }) => void): void {
    if (!this.isElectron) return
    palcoApi().onReceiverDisconnected(cb as (i: unknown) => void)
  }
}

export const palcoSession = new PalcoSession()
