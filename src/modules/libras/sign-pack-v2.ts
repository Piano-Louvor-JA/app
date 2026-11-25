/**
 * sign-pack-v2 — F-A.2 (SPEC-libras v2.1.0)
 * Formato .spack v2: sinais como KEYFRAMES de pose (avatar 3D), sem vídeo.
 * Locale arbitrário (qualquer língua de sinais: lsb, lse, asl, zsl-foo...).
 * Puro, zero deps — portável para repo próprio.
 */
import type { Pose } from './sign-animator'

export interface RawV2Sign {
  keyframes?: Pose[]
}
export interface RawV2Pack {
  manifest: RawV2Manifest
  glossary: Record<string, RawV2Sign>
  fingerspelling?: Record<string, Pose[]>
}
export interface RawV2Manifest {
  specVersion: number
  locale: string
  version: string
  license: string
  attribution?: string
}

export interface V2Sign {
  keyframes: Pose[]
}
export interface SignPackV2 {
  manifest: RawV2Manifest
  glossary: Map<string, V2Sign>
  /** alfabeto manual (datilologia) — letra → keyframes */
  fingerspelling: Map<string, Pose[]>
}

function parsePose(p: unknown, where: string): Pose {
  if (p == null || typeof p !== 'object') throw new Error(`${where}: pose inválida`)
  const o = p as Record<string, unknown>
  const hands = o.hands as Record<string, Record<string, number>> | undefined
  if (!hands?.right || !hands.left) throw new Error(`${where}: pose sem hands.right/left`)
  const num = (v: unknown, w: string): number => {
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`${where}: ${w} não numérico`)
    return v
  }
  return {
    t: num(o.t, `${where}: t`),
    hands: {
      right: { x: num(hands.right.x, 'right.x'), y: num(hands.right.y, 'right.y'), z: num(hands.right.z, 'right.z') },
      left: { x: num(hands.left.x, 'left.x'), y: num(hands.left.y, 'left.y'), z: num(hands.left.z, 'left.z') },
    },
    expression: typeof o.expression === 'string' ? o.expression : 'neutral',
  }
}

export function parseSignPackV2(raw: RawV2Pack): SignPackV2 {
  const m = raw?.manifest
  if (m == null || typeof m !== 'object') throw new Error('manifest ausente')
  if (m.specVersion !== 2) throw new Error(`specVersion deve ser 2 (recebido ${m.specVersion}) — v1 use parseSignPack`)
  if (typeof m.locale !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(m.locale)) {
    throw new Error('manifest.locale inválido')
  }
  if (typeof m.version !== 'string' || !m.version) throw new Error('manifest.version ausente')
  if (typeof m.license !== 'string' || !m.license) throw new Error('manifest.license ausente')

  const glossary = new Map<string, V2Sign>()
  for (const [term, sign] of Object.entries(raw.glossary ?? {})) {
    const kfs = sign?.keyframes
    if (!Array.isArray(kfs) || kfs.length === 0) {
      throw new Error(`glossary.${term}: keyframes ausentes/vazios`)
    }
    glossary.set(term, { keyframes: kfs.map((k, i) => parsePose(k, `glossary.${term}[${i}]`)) })
  }

  const fingerspelling = new Map<string, Pose[]>()
  for (const [letter, kfs] of Object.entries(raw.fingerspelling ?? {})) {
    if (!Array.isArray(kfs) || kfs.length === 0) throw new Error(`fingerspelling.${letter}: keyframes vazios`)
    if (!/^[A-Z0-9]$/.test(letter)) throw new Error(`fingerspelling.${letter}: letra inválida`)
    fingerspelling.set(letter, kfs.map((k, i) => parsePose(k, `fingerspelling.${letter}[${i}]`)))
  }

  return { manifest: m, glossary, fingerspelling }
}
