// Serve a página /speaker real (speakerPageHtml de palco-server.mjs) numa porta
// livre para screenshot de validação — mesmo HTML que o slot 7080 entrega.
// Roda FORA do Electron: mocka 'electron' (palco-server só usa app.getPath/ipcMain).
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { register } from 'node:module'

register('./electron-mock.loader.mjs', pathToFileURL(path.dirname(fileURLToPath(import.meta.url)) + '/').href)

const here = path.dirname(fileURLToPath(import.meta.url))
const { speakerPageHtml } = await import(
  pathToFileURL(path.resolve(here, '../../palco-server.mjs')).href
)

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(speakerPageHtml())
})
server.listen(7099, '127.0.0.1', () => console.log('speaker-test-server :7099'))
