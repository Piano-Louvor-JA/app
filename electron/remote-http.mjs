import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const directory = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(directory, 'remote-web.html'), 'utf8')
const client = readFileSync(join(directory, 'remote-web-client.js'), 'utf8')
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
const styleHash = createHash('sha256').update(style).digest('base64')

export function remoteHttpHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'sha256-${styleHash}'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`)
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
  const pathname = req.url?.split('?')[0]
  const isPage = pathname === '/' || pathname === '/control'
  const body = isPage ? html : pathname === '/control.js' ? client : null
  if (body == null) { res.writeHead(404); res.end(); return }
  res.setHeader('Content-Type', isPage ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8')
  res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : body)
}

/** HTTP et WebSocket partagent la même adresse et le même port de pareamento. */
export function listenRemoteHttp(WebSocketServer, port) {
  return new Promise((resolve, reject) => {
    const httpServer = createServer(remoteHttpHandler)
    const wss = new WebSocketServer({ server: httpServer, maxPayload: 65536 })
    const fail = error => { wss.close(); httpServer.close(); reject(error) }
    wss.once('error', fail)
    httpServer.once('error', fail)
    httpServer.listen(port, () => resolve({ wss, httpServer }))
  })
}
