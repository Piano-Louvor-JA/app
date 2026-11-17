/**
 * RF-02 (SPEC-crud-comunidade-hub-v1.0.0): nome da coletânea de importação.
 * Um arquivo .slja = uma coletânea própria — nome derivado do arquivo,
 * com sufixo incremental em colisão com coletâneas já existentes do usuário.
 */
export function deriveImportCollectionName(
  fileName: string,
  existingNames: readonly string[],
): string {
  const base =
    fileName
      .replace(/\.slja(\.zip)?$/i, '')
      .trim() || 'Importação'
  const taken = new Set(existingNames.map((n) => n.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base} (${n})`.toLowerCase())) n += 1
  return `${base} (${n})`
}
