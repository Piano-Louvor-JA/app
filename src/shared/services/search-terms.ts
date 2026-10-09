/**
 * Match de busca por TERMOS (não substring contígua): cada termo da query
 * precisa aparecer em (título OU álbum) do item. "jesus adoradores 5"
 * encontra a música "Jesus" do álbum "Adoradores 5" — a substring contígua
 * "jesus adoradores" não existe em campo nenhum (bug 03/10).
 *
 * Substring contígua inteira continua casando (comportamento antigo preservado).
 */
/**
 * Fold diacrítico (03/10): usuário digita "nao temas" e a letra tem
 * "não temas" — sem fold, a busca por letra falha por acento.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function matchesAllTerms(
  title: string,
  searchable: string,
  query: string,
  lyrics?: string,
): boolean {
  const t = fold(title.toLowerCase())
  const s = fold(searchable.toLowerCase())
  const l = fold((lyrics ?? '').toLowerCase())
  const q = fold(query.trim().toLowerCase())
  if (!q) return false
  // Busca por trecho da letra (03/10): substring na letra casa direto.
  if (l && l.includes(q)) return true
  if (t.includes(q) || s.includes(q)) return true
  const terms = q.split(/\s+/).filter(Boolean)
  if (terms.length <= 1) return false
  return terms.every((term) => t.includes(term) || s.includes(term) || (l && l.includes(term)))
}
