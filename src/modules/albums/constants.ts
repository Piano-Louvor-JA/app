/**
 * Feature flag: seção "Minhas Coletâneas" da Central de Mídia.
 * Religado 16/09 (Rafael) junto com a aba Comunidade.
 *
 * TODO(minhas-coletaneas): desligado em 20/11/2026 porque o recurso ainda
 * não está pronto. A seção deve ir para a aba Comunidade; rever depois se
 * ela volta a aparecer na Central de Mídia, e então religar esta flag (ou
 * removê-la junto com a seção daqui).
 *
 * Com a flag desligada, a Central não carrega a categoria e esconde o botão
 * de mostrar/ocultar. A preferência do usuário (olho) fica em visibility.ts.
 */
export const SHOW_CUSTOM_COLLECTIONS = false
