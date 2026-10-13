import type { RouteRecordRaw } from 'vue-router'

/**
 * Disponível em desenvolvimento e nos builds com VITE_DIAGNOSTICS_CAMPAIGN=1.
 * Builds normais de produção não registram a rota.
 * A URL é /#/diagnostics quando Electron usa hash router.
 */
export const diagnosticsRoutes: RouteRecordRaw[] =
  import.meta.env.DEV || import.meta.env.VITE_DIAGNOSTICS_CAMPAIGN === '1'
    ? [
        {
          path: 'diagnostics',
          name: 'diagnostics',
          component: () => import('./views/DiagnosticsView.vue'),
          meta: { navKey: 'diagnostics' },
        },
      ]
    : []
