// @vitest-environment node
import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
vi.mock('node:net', async () => { const { EventEmitter } = await import('node:events'); return { default: { connect: () => {
 const socket = new EventEmitter()
 socket.destroy = () => {}
 queueMicrotask(() => socket.emit('connect'))
 return socket
} } } })
vi.mock('node:tls', async () => {
 const { EventEmitter } = await import('node:events')
 class TLSSocket extends EventEmitter { destroy() {} }
 return { default: { TLSSocket, connect: () => {
  const socket = new TLSSocket()
  queueMicrotask(() => socket.emit('secureConnect'))
  return socket
 } } }
})
import { generalProbes, computeVerdict } from '../diagnostics-core.mjs'
it('aguarda as sondas: o relatório contém resultados, nunca Promises', async () => {
 const result = await generalProbes()
 expect(result['1.1.1.1:443'].ok).toBe(true)
 expect(result['google.com:443'].ok).toBe(true)
 expect(JSON.parse(JSON.stringify(result))['google.com:443'].ok).toBe(true)
})
it.each([
 [{escritaUserData:{ok:false}}, 'sem-permissao-escrita'],
 [{storage:{lockOrfao:true}}, 'storage-corrompido'],
 [{crashes:{total:3}}, 'crash-loop'],
 [{headersTruncados:true}, 'arquivo-truncado'],
 [{gpuBloqueada:true}, 'gpu-bloqueada'],
])('mantém os vereditos da triagem v2 (%j)', (extra, expected) => {
 expect(computeVerdict({general:{'1.1.1.1:443':{ok:true}},apis:[],proxy:{},hosts:[],installation:{existe:false},extra})).toBe(expected)
})
