import type { RouteRecordRaw } from 'vue-router'

/**
 * Não navegado no app normal. Rota de diagnóstico (release sob medida para
 * campanha SrCaldeira) — ativa também em produção portable.
 * A URL é /#/diagnostics quando Electron usa hash router.
 */
export const diagnosticsRoutes: RouteRecordRaw[] = [
  {
    path: 'diagnostics',
    name: 'diagnostics',
    component: () => import('./views/DiagnosticsView.vue'),
    meta: { navKey: 'diagnostics' },
  },
]
