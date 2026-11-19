/**
 * Prévia do nome do arquivo baixado, igual à regra do processo main
 * (`electron/online-video/file-name.mjs`): sem acento, símbolo nem pontuação, até 80
 * caracteres, e o ID do YouTube no fim. Quem renomeia de verdade é o main.
 */
export const MAX_FILE_TITLE_CHARS = 80

export function sanitizeFileTitle(title: string): string {
  const clean = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
  return clean.slice(0, MAX_FILE_TITLE_CHARS).trim()
}

export function videoFileName(title: string, id: string): string {
  const clean = sanitizeFileTitle(title)
  return `${clean ? `${clean}_${id}` : id}.mp4`
}

/** Parte editável de um nome `<título>_<id>.mp4` (o que vem antes do `_<id>`). */
export function editableFileTitle(fileName: string | undefined, id: string): string {
  if (!fileName) return ''
  const base = fileName.replace(/\.mp4$/, '')
  if (base === id) return ''
  return base.endsWith(`_${id}`) ? base.slice(0, -(id.length + 1)) : base
}
