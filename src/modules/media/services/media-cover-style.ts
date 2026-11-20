/**
 * Sombra da capa. Leve de propósito: um véu preto mancha fundo claro
 * e a cor do título já separa o nome da imagem.
 */
export function coverTitleTextShadow(enabled: boolean, color: string): string {
  if (!enabled) return 'none'
  const glow = color.trim() || '#f6c32a'
  return [
    '0 0.04em 0.02em rgba(0, 0, 0, 0.45)',
    '0 0.14em 0.28em rgba(0, 0, 0, 0.28)',
    `0 0 0.45em color-mix(in srgb, ${glow} 40%, transparent)`,
  ].join(', ')
}
