/**
 * Módulo Palco (Configurações › Conexões remotas › Palco): TVs com o app
 * Palco conectadas às transmissões, comandos por TV, marca e descoberta.
 * Paridade com Ferramentas › Palco do apk.
 */

export type PalcoPlatform = 'webos' | 'tizen' | 'androidtv' | 'obs' | 'browser'

export interface PalcoClient {
  uid: string
  slotId: string
  slotLabel: string
  ip: string
  platform: PalcoPlatform
  name: string
  version: string | null
  id: string | null
  muted: boolean
  /** Em projeção independente (um módulo só nela). */
  pinned?: boolean
}

export interface FoundTv {
  ip: string
  name: string
  platform: PalcoPlatform
  canWake: boolean
}

export type PalcoCommand = 'identify' | 'rename' | 'reload' | 'moveTo'

export interface PalcoSlotSummary {
  id: string
  label: string
  running: boolean
}

/** Conexão do Palco (as TVs conectam nela; separada da Transmissão). */
export interface PalcoConnection extends PalcoSlotSummary {
  httpPort: number
  wsPort: number
  clients: number
  error?: { code: string; port?: number } | null
}

interface PalcoClientsApi {
  slots(): Promise<Array<PalcoSlotSummary & { kind?: string; httpPort?: number; wsPort?: number; clients?: number; error?: PalcoConnection['error'] }>>
  createSlot?(label: string, kind?: string): Promise<{ id: string; label: string } | null>
  removeSlot?(id: string): Promise<boolean>
  clients(): Promise<PalcoClient[]>
  clientCommand(slotId: string, uid: string, command: PalcoCommand, args?: Record<string, unknown>): Promise<boolean>
  setClientMuted(slotId: string, uid: string, muted: boolean): Promise<boolean>
  setClientPinned(slotId: string, uid: string, pinned: boolean): Promise<boolean>
  discover(): Promise<{ ownIp: string | null; tvs: FoundTv[] }>
  wakeTv(ip: string): Promise<boolean>
  onClientsChanged(callback: () => void): () => void
}

function api(): PalcoClientsApi | null {
  if (typeof window === 'undefined') return null
  const palco = (window as unknown as { louvorja?: { palco?: Partial<PalcoClientsApi> } }).louvorja?.palco
  return palco?.clients ? (palco as PalcoClientsApi) : null
}

export function hasPalcoClients(): boolean {
  return api() !== null
}

const TV_PLATFORMS: ReadonlySet<PalcoPlatform> = new Set(['webos', 'tizen', 'androidtv'])

export function isTvClient(client: Pick<PalcoClient, 'platform'>): boolean {
  return TV_PLATFORMS.has(client.platform)
}

/** Só TVs com o app Palco: navegador e OBS ficam na aba Transmissão. */
export async function listPalcoTvs(): Promise<PalcoClient[]> {
  const list = await api()?.clients().catch(() => []) ?? []
  return list.filter(isTvClient)
}

/** Conexões do Palco no ar (destino de "Mover para…"). */
export async function listRunningSlots(): Promise<PalcoSlotSummary[]> {
  const list = await listPalcoConnections()
  return list.filter((slot) => slot.running).map(({ id, label, running }) => ({ id, label, running }))
}

/** Conexões do Palco, a principal primeiro. */
export async function listPalcoConnections(): Promise<PalcoConnection[]> {
  const list = await api()?.slots().catch(() => []) ?? []
  return list
    .filter((slot) => slot.kind === 'palco')
    .map((slot) => ({
      id: slot.id,
      label: slot.label,
      running: slot.running,
      httpPort: Number(slot.httpPort) || 0,
      wsPort: Number(slot.wsPort) || 0,
      clients: Number(slot.clients) || 0,
      error: slot.error ?? null,
    }))
}

/** Nova conexão do Palco (ex.: outra sala); null se não deu para criar. */
export async function createPalcoConnection(label: string): Promise<PalcoSlotSummary | null> {
  const created = await api()?.createSlot?.(label, 'palco').catch(() => null)
  return created ? { id: created.id, label: created.label, running: false } : null
}

export async function removePalcoConnection(id: string): Promise<boolean> {
  return await api()?.removeSlot?.(id).catch(() => false) ?? false
}

export async function sendPalcoCommand(
  client: Pick<PalcoClient, 'slotId' | 'uid'>,
  command: PalcoCommand,
  args: Record<string, unknown> = {},
): Promise<boolean> {
  return await api()?.clientCommand(client.slotId, client.uid, command, args).catch(() => false) ?? false
}

export async function setPalcoTvMuted(client: Pick<PalcoClient, 'slotId' | 'uid'>, muted: boolean): Promise<boolean> {
  return await api()?.setClientMuted(client.slotId, client.uid, muted).catch(() => false) ?? false
}

/** Tira a TV da transmissão geral para receber um módulo só (ou devolve). */
export async function setPalcoTvPinned(client: Pick<PalcoClient, 'slotId' | 'uid'>, pinned: boolean): Promise<boolean> {
  return await api()?.setClientPinned(client.slotId, client.uid, pinned).catch(() => false) ?? false
}

/** Mesma chave do servidor: id do hello ou, sem ele, IP + plataforma. */
export function palcoTvKey(client: Pick<PalcoClient, 'id' | 'ip' | 'platform'>): string {
  return client.id ? client.id : `${client.ip}|${client.platform}`
}

/** Alvo de envio para uma TV só ("slot#uid"). */
export function palcoTvTarget(client: Pick<PalcoClient, 'slotId' | 'uid'>): string {
  return `${client.slotId}#${client.uid}`
}

export async function discoverPalcoTvs(): Promise<{ ownIp: string | null; tvs: FoundTv[] }> {
  return await api()?.discover().catch(() => ({ ownIp: null, tvs: [] })) ?? { ownIp: null, tvs: [] }
}

export async function wakePalcoTv(ip: string): Promise<boolean> {
  return await api()?.wakeTv(ip).catch(() => false) ?? false
}

/** Avisa quando uma TV conecta, sai, se identifica ou muda de marca. */
export function onPalcoClientsChanged(callback: () => void): () => void {
  return api()?.onClientsChanged(callback) ?? (() => {})
}
