import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const outFile = 'dist/PianoPalcoRoku.zip'
const staging = 'dist/staging'

mkdirSync('dist', { recursive: true })

// 1. Compile + validate (no package: keeps dist/staging populated).
execFileSync('npx', ['brighterscript', '--rootDir', '.', '--createPackage', 'false'], { stdio: 'inherit' })

// 2. Collect staging files in stable order.
function collectFiles(dir, base = dir) {
  const entries = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) entries.push(...collectFiles(full, base))
    else entries.push(path.relative(base, full))
  }
  return entries.sort()
}
const files = collectFiles(staging)

// 3. Build a reproducible ZIP via Python zipfile: fixed DOS timestamp
//    (1980-01-01 00:00), stable entry order, fixed permissions — identical
//    content yields identical bytes and the same SHA-256 on every build.
const py = `
import sys, json, zipfile
files = json.loads(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as z:
    for name in files:
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(sys.argv[3] + '/' + name, 'rb') as f:
            z.writestr(info, f.read())
`
execFileSync('python3', ['-c', py, JSON.stringify(files), outFile, staging], { stdio: 'inherit' })

const archive = readFileSync(outFile)
writeFileSync(`${outFile}.sha256`, `${createHash('sha256').update(archive).digest('hex')}  PianoPalcoRoku.zip\n`)
console.log(`packaged ${files.length} files -> ${outFile}`)
