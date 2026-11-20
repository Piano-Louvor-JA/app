/**
 * RF-02 (SPEC-crud-comunidade-hub v1.0.0): nome da coletânea criada por
 * import .slja. Um arquivo = uma coletânea; nome = título do conteúdo;
 * colisão com coletânea existente do usuário → sufixo "(2)", "(3)"...
 */

const LEGACY_IMPORT_COLLECTION = 'Importações .slja'

/** Remove .slja / .slja.zip do nome do arquivo (wrapper do WhatsApp). */
export function stripSljaExtension(fileName: string): string {
  return fileName.replace(/\.slja(\.zip)?$/i, '')
}

/** Sufixo numérico de colisão existente no nome, ex. "X (3)" → 3. */
function collisionSuffix(name: string, base: string): number | null {
  if (!name.toLowerCase().startsWith(base.toLowerCase())) return null
  const rest = name.slice(base.length).trim()
  const m = /^\((\d+)\)$/.exec(rest)
  return m ? Number(m[1]) : rest === '' ? 1 : null
}

/**
 * Nome da coletânea para o import: título puro se livre; senão menor sufixo
 * disponível a partir de (2). Case-insensitive (storage do usuário).
 * Coletâneas legadas "Importações .slja" não interferem no nome novo.
 */
export function collectionNameForImport(
  title: string,
  existing: Array<{ name: string }>,
): string {
  const base = title.trim()
  if (!base) return base
  const lowerBase = base.toLowerCase()
  const relevant = existing.filter(
    (c) => c.name.toLowerCase() !== LEGACY_IMPORT_COLLECTION.toLowerCase(),
  )
  if (!relevant.some((c) => collisionSuffix(c.name, base) !== null)) return base
  let n = 2
  const taken = new Set<number>()
  for (const c of relevant) {
    const s = collisionSuffix(c.name, base)
    if (s !== null) taken.add(s)
  }
  while (taken.has(n)) n++
  return `${base} (${n})`
}
