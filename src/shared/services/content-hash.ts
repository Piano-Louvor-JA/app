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
