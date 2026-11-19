/**
 * Nome dos arquivos baixados: `<título>_<id>`, legível na pasta e seguro em qualquer sistema.
 * O título perde acentos, símbolos e pontuação (sobram letras e números ASCII separados por um
 * espaço) e é cortado em {@link MAX_TITLE_CHARS}. O ID do YouTube no fim garante nome único e
 * deixa o arquivo reconhecível mesmo se o título ficar vazio (só o ID).
 *
 * Por que ASCII e curto: o Windows limita o caminho inteiro a 260 caracteres por padrão e
 * proíbe `<>:"/\|?*`; o Linux limita o nome a 255 bytes (acento ocupa 2); o macOS normaliza
 * acentos de outro jeito (NFD). Só letras, números e espaço passam em todos.
 */

/** Título com até 80 caracteres: `título_id.mp4` fica abaixo de 100, sobrando caminho no Windows. */
export const MAX_TITLE_CHARS = 80

/** @param {unknown} title */
export function sanitizeTitle(title) {
  if (typeof title !== 'string') return ''
  const clean = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
  return clean.slice(0, MAX_TITLE_CHARS).trim()
}

/**
 * Nome do arquivo sem extensão.
 * @param {unknown} title @param {string} id
 */
export function videoFileBase(title, id) {
  const clean = sanitizeTitle(title)
  return clean ? `${clean}_${id}` : id
}

/** Nome guardado no índice é aceito só se for um nome simples, sem pasta nem caractere proibido. */
export function isSafeFileBase(name) {
  return typeof name === 'string' && /^[A-Za-z0-9 _-]{1,120}$/.test(name) && name.trim() === name
}
