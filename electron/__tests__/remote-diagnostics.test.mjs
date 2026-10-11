// @vitest-environment node
// remote-diagnostics — RF1..RF6 da SPEC piano-remote-diagnostics v1.2.
// Módulo PURO (sem import de electron) para testar em node puro.
import { describe, expect, it } from 'vitest'

import {
  analyzeInterfaces,
  computeRemoteVerdict,
  listenersOnPort,
  parseExcludedPorts,
  parseFirewallProfiles,
  parseFirewallRules,
  parseListeners,
} from '../remote-diagnostics.mjs'

// ---------- RF1: interfaces ----------

describe('RF1 analyzeInterfaces', () => {
  it('marca suspeito por IP 172.x/169.254.x e por nome vEthernet/docker/utun', () => {
    const picked = analyzeInterfaces({
      lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', cidr: '127.0.0.1/8' }],
      eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.10', cidr: '192.168.1.10/24' }],
      'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.30.16.1', cidr: '172.30.16.1/20' }],
      docker0: [{ family: 'IPv4', internal: false, address: '172.17.0.1', cidr: '172.17.0.1/16' }],
      utun3: [{ family: 'IPv4', internal: false, address: '10.2.0.5', cidr: '10.2.0.5/24' }],
    })
    // lanIp() pega o PRIMEIRO não-internal: eth0 aqui
    expect(picked.ipEscolhido).toBe('192.168.1.10')
    const byName = Object.fromEntries(picked.interfaces.map((i) => [i.name, i]))
    expect(byName['vEthernet (WSL)'].suspeito).toBe(true)
    expect(byName.docker0.suspeito).toBe(true)
    expect(byName.utun3.suspeito).toBe(true)
    expect(byName.eth0.suspeito).toBe(false)
    expect(picked.vpnAtiva).toBe(true)
    expect(picked.subnetEscolhida).toBe('192.168.1')
  })

  it('IPv6 ignorado; 169.254 suspeito; sem iface → 127.0.0.1', () => {
    const picked = analyzeInterfaces({
      eth1: [{ family: 'IPv6', internal: false, address: 'fe80::1', cidr: null }],
      eth2: [{ family: 'IPv4', internal: false, address: '169.254.3.4', cidr: '169.254.3.4/16' }],
    })
    expect(picked.interfaces).toHaveLength(1)
    expect(picked.interfaces[0].suspeito).toBe(true)
    const empty = analyzeInterfaces({
      lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', cidr: '127.0.0.1/8' }],
    })
    expect(empty.ipEscolhido).toBe('127.0.0.1')
  })
})

// ---------- RF2/RF5: veredito remoto ----------

function verdictInput(over = {}) {
  return {
    status: 'ok',
    portaAtiva: 7071,
    janelasPortasExcluidas: [],
    selfProbe: { ok: true },
    ipSuspeito: false,
    listeners: [],
    portaRoubada: false,
    redePublica: false,
    regraInbound: true,
    ...over,
  }
}

describe('RF2/RF5 computeRemoteVerdict', () => {
  it('remote-porta-excluida quando desligado e porta na janela excluída', () => {
    expect(computeRemoteVerdict(verdictInput({
      status: 'desligado',
      portaAtiva: null,
      janelasPortasExcluidas: [{ start: 7069, end: 7179 }],
      selfProbe: null,
    }))).toBe('remote-porta-excluida')
  })

  it('remote-porta-roubada quando outro PID escuta a porta esperada', () => {
    expect(computeRemoteVerdict(verdictInput({
      status: 'fallback',
      portaAtiva: 7072,
      portaRoubada: true,
      listeners: [{ port: 7071, pid: 4242, processo: 'outro.exe' }],
    }))).toBe('remote-porta-roubada')
  })

  it('remote-ip-adaptador-errado quando ipEscolhido é suspeito', () => {
    expect(computeRemoteVerdict(verdictInput({ ipSuspeito: true }))).toBe('remote-ip-adaptador-errado')
  })

  it('remote-firewall quando listening e selfProbe falha; também redePublica sem regra', () => {
    expect(computeRemoteVerdict(verdictInput({ selfProbe: { ok: false }, regraInbound: false }))).toBe('remote-firewall')
    expect(computeRemoteVerdict(verdictInput({ redePublica: true, regraInbound: false }))).toBe('remote-firewall')
  })

  it('remote-ok quando tudo verde; null quando nem roda (status null)', () => {
    expect(computeRemoteVerdict(verdictInput())).toBe('remote-ok')
    expect(computeRemoteVerdict(verdictInput({ status: null, selfProbe: null }))).toBeNull()
  })
})

// ---------- RF4: parses de SO (fixtures reais) ----------

describe('RF4 parseExcludedPorts', () => {
  it('parseia netsh excludedportrange (win32 fixture real)', () => {
    const fixture = [
      'Protocol tcp Port Exclusion Ranges',
      '',
      'Start Port    End Port',
      '----------    --------',
      '      1024        1123',
      '      7069        7168',
      '* - Used by at least one application.',
    ].join('\r\n')
    expect(parseExcludedPorts('win32', fixture)).toEqual([
      { start: 1024, end: 1123 },
      { start: 7069, end: 7168 },
    ])
  })

  it('parseia ip_local_reserved_ports (linux); vazio → []; darwin → null', () => {
    expect(parseExcludedPorts('linux', '7071-7075,8080')).toEqual([
      { start: 7071, end: 7075 },
      { start: 8080, end: 8080 },
    ])
    expect(parseExcludedPorts('linux', '')).toEqual([])
    expect(parseExcludedPorts('darwin', 'x')).toBeNull()
  })
})

describe('RF4b parseFirewallProfiles/Rules', () => {
  it('parseia perfis netsh allprofiles state (fixture real)', () => {
    const fixture = [
      'Domain Profile Settings:',
      '--------------------------------------',
      'State                                 ON',
      '',
      'Private Profile Settings:',
      '--------------------------------------',
      'State                                 ON',
      '',
      'Public Profile Settings:',
      '--------------------------------------',
      'State                                 OFF',
    ].join('\r\n')
    expect(parseFirewallProfiles(fixture)).toEqual({ domain: 'ON', private: 'ON', public: 'OFF' })
  })

  it('parseia block/allow rules do netsh show rule (fixture real)', () => {
    const fixture = [
      'Rule Name:                            LouvorJA Block Test',
      '----------------------------------------------------------------------',
      'Enabled:                              Yes',
      'Direction:                            In',
      'Profiles:                             Domain,Private',
      'Protocol:                             TCP',
      'LocalPort:                            7071',
      'Action:                               Block',
      'Program:                              C:\\Program Files\\LouvorJA\\louvorja-piano.exe',
      '',
      'Rule Name:                            Allow LouvorJA Remote',
      '----------------------------------------------------------------------',
      'Enabled:                              Yes',
      'Direction:                            In',
      'Profiles:                             Domain,Private',
      'Protocol:                             TCP',
      'LocalPort:                            7071',
      'Action:                               Allow',
      'Program:                              C:\\Program Files\\LouvorJA\\louvorja-piano.exe',
    ].join('\r\n')
    const rules = parseFirewallRules(fixture)
    expect(rules.block).toHaveLength(1)
    expect(rules.block[0]).toMatchObject({
      nome: 'LouvorJA Block Test',
      inbound: true,
      perfis: 'Domain,Private',
      programa: 'louvorja-piano.exe',
      porta: 7071,
    })
    expect(rules.allow.some((r) => r.inbound && r.porta === 7071)).toBe(true)
  })
})

// ---------- RF4c: listeners ----------

describe('RF4c parseListeners', () => {
  it('parseia netstat -ano (win32 fixture real)', () => {
    const fixture = [
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:7071           0.0.0.0:0              LISTENING       8192',
      '  TCP    192.168.1.10:52344     172.30.16.1:443        ESTABLISHED     4242',
      '  TCP    [::]:7071              [::]:0                 LISTENING       8192',
    ].join('\r\n')
    expect(parseListeners('win32', fixture)).toEqual([{ port: 7071, pid: 8192, processo: null }])
  })

  it('parseia ss -tlnp (linux fixture real)', () => {
    const fixture = [
      'State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process',
      'LISTEN 0      511        0.0.0.0:7071       0.0.0.0:*    users:(("louvorja",pid=1234,fd=20))',
      'LISTEN 0      511        0.0.0.0:7072       0.0.0.0:*    users:(("node",pid=5678,fd=30))',
    ].join('\n')
    expect(parseListeners('linux', fixture)).toEqual([
      { port: 7071, pid: 1234, processo: 'louvorja' },
      { port: 7072, pid: 5678, processo: 'node' },
    ])
  })

  it('parseia lsof (darwin fixture real)', () => {
    const fixture = [
      'COMMAND   PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME',
      'louvorja  1234 rafael   20u  IPv4 0x1234abcd      0t0  TCP *:7071 (LISTEN)',
    ].join('\n')
    expect(parseListeners('darwin', fixture)).toEqual([{ port: 7071, pid: 1234, processo: 'louvorja' }])
  })
})

describe('RF4c listenersOnPort', () => {
  it('porta roubada = listener de outro PID na porta esperada', () => {
    const listeners = [
      { port: 7071, pid: 4242, processo: 'other.exe' },
      { port: 7072, pid: process.pid, processo: 'self' },
    ]
    expect(listenersOnPort(listeners, 7071, process.pid)).toEqual({ portaRoubada: true, dono: 'other.exe (4242)' })
    expect(listenersOnPort(listeners, 7072, process.pid)).toEqual({ portaRoubada: false, dono: null })
  })
})
