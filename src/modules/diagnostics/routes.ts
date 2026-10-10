import type { RouteRecordRaw } from 'vue-router'

/**
 * Não navegado no app normal. A rota existe somente no Vite dev para Rafael
 * validar a mesma bridge diagnostics:* antes do portable.
 * A URL é /#/diagnostics quando Electron usa hash router.
 */
export const diagnosticsRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      {
        path: 'diagnostics',
        name: 'diagnostics',
        component: () => import('./views/DiagnosticsView.vue'),
        meta: { navKey: 'diagnostics' },
      },
    ]
  : []
