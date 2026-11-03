/** Roteamento de cast por módulo — mirror (todas TVs) ou slot individual.
 * Persistência local. Paridade conceitual com PalcoOrchestrator APK:
 * áudio continua tendo uma única TV alvo; conteúdos podem divergir por tela.
 */

export type PalcoRoute = 'mirror' | string // string = slotId (ex.: '0', '7082')
export type PalcoModule = 'bible' | 'hymns' | 'liturgy' | 'random' | 'clock' | 'timer' | 'countdown'

const KEY = 'louvorja-palco-routing-v1'
const MODULES: PalcoModule[] = ['bible', 'hymns', 'liturgy', 'random', 'clock', 'timer', 'countdown']

let routes: Record<PalcoModule, PalcoRoute> = Object.fromEntries(
  MODULES.map((module) => [module, 'mirror']),
) as Record<PalcoModule, PalcoRoute>

try {
  const raw = localStorage.getItem(KEY)
  if (raw) routes = { ...routes, ...(JSON.parse(raw) as Partial<typeof routes>) }
} catch {
  // defaults
}

// Music destinations are now exclusively controlled by the Telas selector.
routes.hymns = 'mirror'

export function getPalcoRoute(module: PalcoModule): PalcoRoute {
  if (module === 'hymns') return 'mirror'
  return routes[module] ?? 'mirror'
}

/**
 * Rota individual de TV: projeta só no slot Palco, sem abrir janela cabo.
 * mirror mantém cabo + TVs; cable:* é reservado para monitor cabeado.
 */
export function isPalcoTvOnlyRoute(module: PalcoModule): boolean {
  const route = getPalcoRoute(module)
  return route !== 'mirror' && !route.startsWith('cable:')
}

export function setPalcoRoute(module: PalcoModule, route: PalcoRoute): void {
  routes[module] = module === 'hymns' ? 'mirror' : route
  try { localStorage.setItem(KEY, JSON.stringify(routes)) } catch { /* ignore */ }
}

export function getPalcoRoutes(): Readonly<Record<PalcoModule, PalcoRoute>> {
  return { ...routes }
}

export function isMirrorRoute(module: PalcoModule): boolean {
  return getPalcoRoute(module) === 'mirror'
}

export { MODULES as PALCO_MODULES }
