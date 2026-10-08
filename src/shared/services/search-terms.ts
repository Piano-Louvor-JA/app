/**
 * Match de busca por TERMOS (não substring contígua): cada termo da query
 * precisa aparecer em (título OU álbum) do item. "jesus adoradores 5"
 * encontra a música "Jesus" do álbum "Adoradores 5" — a substring contígua
 * "jesus adoradores" não existe em campo nenhum (bug 03/10).
 *
 * Substring contígua inteira continua casando (comportamento antigo preservado).
 */
export function matchesAllTerms(
  title: string,
  searchable: string,
  query: string,
): boolean {
  const t = title.toLowerCase()
  const s = searchable.toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (t.includes(q) || s.includes(q)) return true
  const terms = q.split(/\s+/).filter(Boolean)
  if (terms.length <= 1) return false
  return terms.every((term) => t.includes(term) || s.includes(term))
}
