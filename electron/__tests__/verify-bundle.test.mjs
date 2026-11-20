// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { HOSTS, rendererApiEnvFor } from '../profile.mjs'
import { verifyDist, verifyRendererBundle } from '../guard/verify-bundle.mjs'

const PROD = HOSTS.production
const STG = HOSTS.stg

// Trechos reais do bundle publicado na v1.31.0 (renderer sem o define do perfil).
const BROKEN_RELEASE_BUNDLE = [
  'var a={stg:`https://api-stg.pianolouvorja.com.br`,production:`https://api.pianolouvorja.com.br`};function s(){return`homologation`}',
  'function qe(e){return`https://api-stg.pianolouvorja.com.br/file/${e}`}',
]

function bundleFor(env) {
  return [`const db=${JSON.stringify(env.VITE_URL_DATABASE)},files=${JSON.stringify(env.VITE_URL_FILES)}`]
}

describe('verifyRendererBundle', () => {
  const release = rendererApiEnvFor({ PIANO_BUILD_PROFILE: 'release' })
  const homolog = rendererApiEnvFor({})

  it('release correto: perfil gravado e URLs de produção no bundle', () => {
    const result = verifyRendererBundle({ expected: release, bakedProfile: 'release', sources: bundleFor(release) })
    expect(result).toEqual({ ok: true, errors: [] })
  })

  it('reprova o bundle publicado na v1.31.0 (renderer em STG)', () => {
    const result = verifyRendererBundle({ expected: release, bakedProfile: 'release', sources: BROKEN_RELEASE_BUNDLE })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain(`${PROD}/json_db`)
    expect(result.errors.join('\n')).toContain(`${STG}/file`)
  })

  it('reprova pacote sem o perfil gravado para o main', () => {
    const result = verifyRendererBundle({ expected: release, bakedProfile: undefined, sources: bundleFor(release) })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/build-profile\.json/)
  })

  it('reprova perfil gravado diferente do perfil do build', () => {
    const result = verifyRendererBundle({ expected: release, bakedProfile: 'homologation', sources: bundleFor(release) })
    expect(result.ok).toBe(false)
  })

  it('homologation correto passa', () => {
    expect(verifyRendererBundle({ expected: homolog, bakedProfile: 'homologation', sources: bundleFor(homolog) }).ok).toBe(true)
  })

  it('homologation com URL de produção no bundle é reprovado', () => {
    const sources = [...bundleFor(homolog), `fetch("${PROD}/file/capa.jpg")`]
    const result = verifyRendererBundle({ expected: homolog, bakedProfile: 'homologation', sources })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain(`${PROD}/file`)
  })
})

describe('verifyDist (lê o dist/ gerado)', () => {
  function dist({ profile, sources }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'piano-dist-'))
    mkdirSync(path.join(dir, 'assets'))
    sources.forEach((src, i) => writeFileSync(path.join(dir, 'assets', `chunk-${i}.js`), src))
    if (profile) writeFileSync(path.join(dir, 'build-profile.json'), JSON.stringify({ profile }))
    return dir
  }

  it('aprova dist de release correto', () => {
    const release = rendererApiEnvFor({ PIANO_BUILD_PROFILE: 'release' })
    const dir = dist({ profile: 'release', sources: bundleFor(release) })
    expect(verifyDist({ distDir: dir, env: { PIANO_BUILD_PROFILE: 'release' } }).ok).toBe(true)
  })

  it('reprova dist sem build-profile.json', () => {
    const release = rendererApiEnvFor({ PIANO_BUILD_PROFILE: 'release' })
    const dir = dist({ profile: undefined, sources: bundleFor(release) })
    expect(verifyDist({ distDir: dir, env: { PIANO_BUILD_PROFILE: 'release' } }).ok).toBe(false)
  })

  it('reprova dist sem JS (build não rodou)', () => {
    const dir = dist({ profile: 'release', sources: [] })
    const result = verifyDist({ distDir: dir, env: { PIANO_BUILD_PROFILE: 'release' } })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/nenhum \.js/i)
  })
})
