import type { RouteRecordRaw } from 'vue-router'

/**
 * Rota legada /#/diagnostics: removida de Utilitários — o diagnóstico agora
 * vive no card de /config/general (DiagnosticsCard) e está SEMPRE disponível
 * no desktop (campanha virou supérflua: coletores rodam stealth em todo boot).
 * Mantido array vazio para não quebrar o import do router.
 */
export const diagnosticsRoutes: RouteRecordRaw[] = []
