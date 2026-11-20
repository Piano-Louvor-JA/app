import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const [platform, expectedVersion] = process.argv.slice(2)
const expected = {
  win: { manifest: 'latest.yml', extension: '.exe' },
  linux: { manifest: 'latest-linux.yml', extension: '.AppImage' },
  mac: { manifest: 'latest-mac.yml', extension: '.zip' },
}[platform]

if (!expected || !expectedVersion) {
  throw new Error('Uso: node scripts/validate-release-artifacts.mjs <win|linux|mac> <versão>')
}

const outputDir = 'dist-electron'
if (!existsSync(outputDir)) throw new Error(`Diretório ausente: ${outputDir}`)
const files = readdirSync(outputDir).filter((file) => statSync(join(outputDir, file)).isFile())
const manifestName = files.includes(expected.manifest)
  ? expected.manifest
  : platform === 'linux'
    ? files.find((file) => /^latest-linux-[a-z0-9_]+\.yml$/.test(file))
    : undefined
if (!manifestName) throw new Error(`Metadado de atualização ausente: ${expected.manifest}`)
const manifestPath = join(outputDir, manifestName)

const yaml = readFileSync(manifestPath, 'utf8')
const version = yaml.match(/^version:\s*["']?([^\s"']+)["']?\s*$/m)?.[1]
const releaseDate = yaml.match(/^releaseDate:\s*["']?([^\s"']+)["']?\s*$/m)?.[1]
const sha512 = yaml.match(/^\s*sha512:\s*["']?([^\s"']+)["']?\s*$/m)?.[1]
const path = yaml.match(/^\s*path:\s*["']?([^\n"']+)["']?\s*$/m)?.[1]

if (version !== expectedVersion) throw new Error(`${expected.manifest}: version ${version ?? 'ausente'}; esperado ${expectedVersion}`)
if (!releaseDate || Number.isNaN(Date.parse(releaseDate))) throw new Error(`${expected.manifest}: releaseDate ausente ou inválido`)
if (!sha512 || sha512.length < 80) throw new Error(`${expected.manifest}: sha512 ausente ou inválido`)
if (!path) throw new Error(`${expected.manifest}: path ausente`)
if (!files.includes(path)) throw new Error(`${expected.manifest}: artefato referenciado não existe: ${path}`)
if (!path.endsWith(expected.extension)) throw new Error(`${expected.manifest}: path não é ${expected.extension}: ${path}`)

if (platform === 'mac') {
  if (!files.some((file) => file.endsWith('.dmg') && file.includes(`-${expectedVersion}-`))) {
    throw new Error('Instalador macOS DMG da versão ausente')
  }
  const urls = [...yaml.matchAll(/^\s*-\s*url:\s*["']?([^\s"']+)["']?\s*$/gm)]
    .map((match) => decodeURIComponent(basename(match[1])))
  if (!urls.includes(path)) throw new Error(`${expected.manifest}: ZIP ausente da lista files usada pelo atualizador macOS`)
}

const blockmap = `${path}.blockmap`
const hasExternalBlockmap = files.includes(blockmap)
const hasEmbeddedBlockmap = Number.parseInt(yaml.match(/^\s*blockMapSize:\s*(\d+)\s*$/m)?.[1] ?? '0', 10) > 0
if (!hasExternalBlockmap && !hasEmbeddedBlockmap) {
  throw new Error(`Blockmap ausente: nem ${blockmap} nem blockMapSize no metadado foram encontrados`)
}

console.log(`OK: ${platform} — ${manifestName}, ${path} e ${hasExternalBlockmap ? blockmap : 'blockmap embutido'} válidos`)
