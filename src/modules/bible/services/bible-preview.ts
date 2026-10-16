import type { BibleSelection } from '../types/bible'

const SNIPPET_MAX_LENGTH = 120

export function hasBibleProjection(selection: Pick<BibleSelection, 'verses' | 'text'>): boolean {
  return selection.verses.length > 0 && Boolean(selection.text)
}

/** Texto curto para a miniatura da projeção (cabe no cartão 16:9). */
export function bibleProjectionSnippet(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= SNIPPET_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, SNIPPET_MAX_LENGTH - 3).trimEnd()}...`
}
