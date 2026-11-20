import { resolveSlideImageUrl } from '../../media/services/media-audio'

/**
 * Miniatura (JPEG data URL) do fundo de um slide de hino, para a prévia do
 * celular. Fundo remoto que não deixa ler os pixels segue como endereço: o
 * celular baixa direto.
 */
export async function makeSlideBackgroundThumb(path: string, maxWidth = 480): Promise<string | null> {
  const source = await resolveSlideImageUrl(path)
  if (!source) return null
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = source
    await image.decode()
    const scale = Math.min(1, maxWidth / image.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return /^https?:\/\//i.test(source) ? source : null
  }
}
