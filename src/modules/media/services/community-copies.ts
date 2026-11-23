import type { CollectionOrigin, LocalCollection } from './local-custom-store'
import { listLocalCollections } from './local-custom-store'

/**
 * RF-3/RF-4 (SPEC-louvorja-community-copies): a origem de uma coletânea
 * local decide ONDE ela aparece — cópias da Comunidade listam em
 * /community/copies; manuais continuam em /albums. Filtro NA FONTE (D2),
 * nunca CSS/flag de UI.
 */
export function isCommunityCopy(
	collection: Pick<LocalCollection, 'origin'>,
): boolean {
	return collection.origin?.type === 'community'
}

/** Cópia de coletânea pública, ordenada por copiedAt DESC (RF-3). */
export function listCommunityCopies(): LocalCollection[] {
	return listLocalCollections()
		.filter(isCommunityCopy)
		.sort(
			(a, b) =>
				Date.parse((b.origin as CollectionOrigin).copiedAt) -
				Date.parse((a.origin as CollectionOrigin).copiedAt),
		)
}

/** Coletâneas manuais (sem origin) — feed da categoria 'custom' de /albums. */
export function listManualLocalCollections(): LocalCollection[] {
	return listLocalCollections().filter((c) => !isCommunityCopy(c))
}
