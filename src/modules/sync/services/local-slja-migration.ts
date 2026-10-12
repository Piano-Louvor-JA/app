import {
  listLocalCollections,
  listLocalMusics,
  type LocalMusic,
} from '@modules/media/services/local-custom-store'
import {
  createCustomLyric,
  createCustomMusic,
  listCustomCollections,
  updateCustomMusic,
  uploadCustomFile,
} from '@modules/media/services/custom-catalog'
import { getAuthSession } from '@modules/media/services/auth-client'

/**
 * sync v2 fase 3 — migração de imports .slja LOCAIS → CONTA (app#336).
 *
 * Regra de produto (Rafael): local pode ter N cópias; pro banco sobe UM
 * arquivo (client_uuid determinístico do hash → dedupe na API) e SÓ
 * após aprovação do usuário.
 *
 * Fluxo pós-login: runSljaMigration(candidates, { confirmUpload }) —
 * o chamador (hook de login) decide COMO perguntar (appConfirm).
 */

const OFFERED_KEY = 'pianolouvorja:sync:slja-migration:offered'
const IMPORT_COLLECTION_NAME = 'Importações .slja'

export interface LocalSljaCandidate {
  localMusic: LocalMusic
  name: string
  sljaHash: string
}

function readOffered(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OFFERED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function writeOffered(hashes: string[]): void {
  try {
    localStorage.setItem(OFFERED_KEY, JSON.stringify(hashes))
  } catch {
    // quota — segue só em memória
  }
}

/** Marca um hash como "já oferecido" (não pergunta de novo). */
export function markSljaMigrationOffered(sljaHash: string): void {
  const offered = readOffered()
  if (!offered.includes(sljaHash)) offered.push(sljaHash)
  writeOffered(offered)
}

/** Músicas locais .slja ainda não oferecidas pra migração. */
export function localSljaMigrationCandidates(): LocalSljaCandidate[] {
  const offered = new Set(readOffered())
  const candidates: LocalSljaCandidate[] = []
  // síncrono de propósito: os stores locais são localStorage-backed
  const collections = (
    listLocalCollections as unknown as () => Array<{ id: number; name: string }>
  )()
  for (const collection of collections) {
    const musics = (
      listLocalMusics as unknown as (
        id: number,
      ) => LocalMusic[]
    )(collection.id)
    for (const music of musics) {
      if (!music.sljaHash || offered.has(music.sljaHash)) continue
      candidates.push({
        localMusic: music,
        name: music.name,
        sljaHash: music.sljaHash,
      })
    }
  }
  return candidates
}

/** hex sha256 → formato uuid (mesma função do import — identidade estável). */
function sha256ToUuid(hex: string): string {
  const h = hex.replace(/-/g, '').padEnd(32, '0').slice(0, 32)
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-')
}

/** data:URL base64 → bytes (áudio local guardado como data URL). */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  try {
    const binary = atob(match[1]!)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export interface SljaMigrationResult {
  uploaded: number
  declined: number
  failed: number
}

/**
 * Migra os candidatos aprovados pra conta. Um a um: falha de UM não
 * aborta os demais; falha de rede NÃO marca como oferecido (tenta de
 * novo no próximo login).
 */
export async function runSljaMigration(
  candidates: LocalSljaCandidate[],
  options: { confirmUpload: (candidate: LocalSljaCandidate) => Promise<boolean> },
): Promise<SljaMigrationResult> {
  const result: SljaMigrationResult = { uploaded: 0, declined: 0, failed: 0 }
  const session = getAuthSession()
  if (!session?.token) return result

  // coleção de destino: reaproveita a "Importações .slja" da conta
  let collectionId: number | null = null
  try {
    const collections = await listCustomCollections()
    const existing = collections.find(
      (c: { name: string }) => c.name === IMPORT_COLLECTION_NAME,
    )
    collectionId = existing?.id ?? null
  } catch {
    collectionId = null
  }

  for (const candidate of candidates) {
    const approved = await options
      .confirmUpload(candidate)
      .catch(() => false)
    if (!approved) {
      markSljaMigrationOffered(candidate.sljaHash)
      result.declined += 1
      continue
    }

    try {
      if (collectionId == null) {
        // sem coleção na conta ainda — criar (mesma semântica do import)
        const created = await (
          await import('@modules/media/services/custom-catalog')
        ).createCustomCollection(IMPORT_COLLECTION_NAME)
        if (!created) throw new Error('SLJA_MIGRATION_COLLECTION_FAILED')
        collectionId = created.id
      }

      const clientUuid = sha256ToUuid(candidate.sljaHash)
      const createdMusic = await createCustomMusic(collectionId, {
        name: candidate.name,
        client_uuid: clientUuid,
      })
      if (!createdMusic) throw new Error('SLJA_MIGRATION_MUSIC_FAILED')

      // API já tinha? (re-migração) — nada a upar
      if (!createdMusic.existed) {
        // áudio local (data URL) → upload
        if (candidate.localMusic.audioBase64) {
          const bytes = dataUrlToBytes(candidate.localMusic.audioBase64)
          if (bytes) {
            const uploaded = await uploadCustomFile(
              bytes,
              candidate.localMusic.audioName ?? 'audio.mp3',
              'audio',
            )
            if (uploaded) {
              await updateCustomMusic(createdMusic.id, {
                id_file_audio: uploaded.idFile,
              })
            }
          }
        }

        // lyrics locais → API (order explícito)
        const lyrics = candidate.localMusic.lyrics ?? []
        const BATCH = 5
        for (let i = 0; i < lyrics.length; i += BATCH) {
          const batch = lyrics.slice(i, i + BATCH)
          await Promise.all(
            batch.map((lyric, j) =>
              createCustomLyric(createdMusic.id, {
                lyric: lyric.lyric,
                time: lyric.time ?? undefined,
                order: i + j + 1,
                id_file_image: undefined,
              }),
            ),
          )
        }
      }

      markSljaMigrationOffered(candidate.sljaHash)
      result.uploaded += 1
    } catch {
      // falha de rede/API → NÃO marca: tenta de novo no próximo login
      result.failed += 1
    }
  }

  return result
}
