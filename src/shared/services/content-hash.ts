/**
 * Hash SHA-256 (hex) de bytes — identidade de conteúdo de arquivos importados
 * (.slja/.ja). Nativo (crypto.subtle), rápido; usado pra dedupe de imports:
 * o mesmo arquivo re-importado atualiza em vez de duplicar (app#331 feedback).
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** hex sha256 → formato uuid (determinístico; não precisa ser RFC v5 canônico,
 *  só estável pro mesmo conteúdo). */
export function sha256ToUuid(hex: string): string {
  const h = hex.replace(/-/g, '').padEnd(32, '0').slice(0, 32)
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-')
}
