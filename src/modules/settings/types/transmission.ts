/** Contratos da aba Transmissão (SPEC-06) — espelham o palco-server do main. */

export type OverlayLayout = 'lower-third' | 'fullscreen'
export type OverlayTheme = 'dark' | 'light' | 'transparent'
export type OverlayPosition = 'bottom' | 'top'

export interface OverlayStyle {
  layout: OverlayLayout
  theme: OverlayTheme
  position: OverlayPosition
  /** Percentual do tamanho base do texto (70–160, passo 10). */
  textScale: number
  /** Mostra a referência/rodapé (versículo, legenda do cronômetro). */
  showHeading: boolean
  accentColor: string
}

export const DEFAULT_OVERLAY_STYLE: Readonly<OverlayStyle> = Object.freeze({
  layout: 'lower-third',
  theme: 'dark',
  position: 'bottom',
  textScale: 100,
  showHeading: true,
  accentColor: '#FFD54A',
})

export const OVERLAY_SCALE_MIN = 70
export const OVERLAY_SCALE_MAX = 160
export const OVERLAY_SCALE_STEP = 10

/** 'all' = todas as redes; 'local' = só este computador; ou um IPv4 da máquina. */
export type TransmissionBind = 'all' | 'local' | (string & {})

export interface NetworkInterfaceOption {
  name: string
  address: string
  virtual: boolean
}

export interface TransmissionInfo {
  bind: TransmissionBind
  requireToken: boolean
  listenHost: string
  linkHost: string
  /** O IP salvo não existe mais na máquina (caiu em todas as redes). */
  missing: boolean
  interfaces: NetworkInterfaceOption[]
  token: string | null
}

export type TransmissionSetResult =
  | { ok: true; bind: TransmissionBind; requireToken: boolean }
  | { ok: false; reason: 'running' }

export interface SlotError {
  code: 'port-in-use' | 'start-failed'
  port: number
  suggestedPort?: number | null
}

export interface PalcoSlotStatus {
  id: string
  label: string
  running: boolean
  clients: number
  httpPort: number
  wsPort: number
  receiverIps?: string[]
  error?: SlotError | null
  overlay?: OverlayStyle
  url?: string
  receiverUrl?: string | null
  overlayUrl?: string | null
}

export type SlotUpdateFailure = 'range' | 'collision' | 'running' | 'not-found' | 'port-in-use'

export type SlotUpdateResult =
  | { ok: true; status?: PalcoSlotStatus }
  | { ok: false; reason: SlotUpdateFailure; status?: PalcoSlotStatus }

export interface SlotUpdate {
  httpPort?: number
  overlay?: Partial<OverlayStyle>
}

/** Conexão pronta para o cartão da aba Transmissão. */
export interface TransmissionConnection {
  id: string
  /** "Fonte N", já traduzido. */
  name: string
  nickname?: string
  running: boolean
  clients: number
  receiverIps: string[]
  httpPort: number | null
  error: SlotError | null
  overlay: OverlayStyle
  overlayUrl: string | null
  receiverUrl: string | null
}
