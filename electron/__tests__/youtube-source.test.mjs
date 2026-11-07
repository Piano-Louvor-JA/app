// @vitest-environment node
import { expect, it } from 'vitest'
import { isYoutubeEmbedUrl, youtubeEmbedUrl, youtubeSourceId, youtubeWatchUrl } from '../youtube-source.mjs'
it('player embutido limpo: toca sozinho, sem controles, anotações, sugestões nem teclado', () => {
  const url = new URL(youtubeEmbedUrl('abcdefghijk'))
  expect(url.origin + url.pathname).toBe('https://www.youtube.com/embed/abcdefghijk')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    autoplay: '1', controls: '0', rel: '0', fs: '0', iv_load_policy: '3', disablekb: '1', modestbranding: '1', playsinline: '1',
  })
  expect(youtubeWatchUrl('abcdefghijk')).toBe('https://www.youtube.com/watch?v=abcdefghijk')
  expect(isYoutubeEmbedUrl(youtubeEmbedUrl('abcdefghijk'))).toBe(true)
  expect(isYoutubeEmbedUrl('https://youtube.com/embed/abcdefghijk')).toBe(true)
  expect(isYoutubeEmbedUrl(youtubeWatchUrl('abcdefghijk'))).toBe(false)
  expect(isYoutubeEmbedUrl('https://evil.test/embed/abcdefghijk')).toBe(false)
  expect(isYoutubeEmbedUrl('file:///player.html')).toBe(false)
  expect(isYoutubeEmbedUrl('not a url')).toBe(false)
})
it('resolves videos without requiring a local file', () => {
  for (const url of ['https://www.youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk?t=30', 'https://m.youtube.com/shorts/abcdefghijk']) {
    expect(youtubeSourceId({ url })).toBe('abcdefghijk')
  }
  expect(youtubeSourceId({ videoId: 'abcdefghijk' })).toBe('abcdefghijk')
  expect(youtubeSourceId({ url: 'https://evil.test/watch?v=abcdefghijk' })).toBeNull()
  expect(youtubeSourceId({ filePath: '/video.mp4' })).toBeNull()
})
it('sends YouTube metadata to receivers without a local-path guard and retains it for replay', async () => {
  const { readFileSync } = await import('node:fs')
  const bar = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
  expect(bar).toContain('(!media.filePath && !media.youtubeId)')
  expect(bar).toContain('tvSendMedia(slot.id, media, posMs')
  const send = bar.slice(bar.indexOf('async function tvSendMedia'), bar.indexOf('async function tvSendVideo'))
  expect(send).toContain('getNetworkMirrorSender().start(slotId)')
  expect(send).not.toContain('youtubeId: media.youtubeId')
  expect(send).not.toContain("action: paused ?")
})
it('receiver loads the YouTube player and applies transport commands after it becomes ready', async () => {
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const html = readFileSync(new URL('../palco/receiver.html', import.meta.url), 'utf8')
  const code = html.slice(html.indexOf('let youtubePlayer='), html.indexOf('function showIdle(msg)'))
  let options
  const calls = []
  const created = []
  const node = () => {
    const el = { style: {}, classes: new Set(), appendChild() {}, remove() {} }
    el.classList = { add: (name) => el.classes.add(name) }
    created.push(el)
    return el
  }
  const context = {
    window: {}, location: { origin: 'http://receiver' },
    document: { getElementById: () => null, createElement: node, body: node(), head: node() },
    YT: { Player: class {
      constructor(target, config) { options = config }
      seekTo(position) { calls.push(['seek', position]) }
      playVideo() { calls.push(['play']) }
      pauseVideo() { calls.push(['pause']) }
      destroy() { calls.push(['stop']) }
      mute() {}
      getOption() { return { languageCode: 'pt' } }
      setOption(module, option, value) { calls.push(['caption-option', module, option, value]) }
      loadModule(module) { calls.push(['captions-on', module]) }
    } },
    $: () => ({ pause() {}, removeAttribute() {}, load() {}, style: {} }),
    showIdle() {}, hideIdle() {}, hideNp() {}, showMuteBadge() {}, hideMuteBadge() {}, sendEvent() {}, L10N: { idle: '' },
  }
  context.window.YT = context.YT
  runInNewContext(code + `
    handleYoutube({youtubeId:'abcdefghijk',positionMs:12000});
  `, context)
  expect(calls).toEqual([])
  expect(options.playerVars).toEqual({ autoplay: 1, controls: 0, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3, disablekb: 1, origin: 'http://receiver' })
  const veil = created.find((el) => el.id === 'youtubeVeil')
  options.events.onReady({ target: { mute() {} } })
  options.events.onStateChange({ data: 3 })
  expect(veil.classes.has('is-hidden')).toBe(false)
  options.events.onStateChange({ data: 1 })
  expect(veil.classes.has('is-hidden')).toBe(true)
  expect(calls).toContainEqual(['seek', 12])
  expect(calls).toContainEqual(['play'])
  const playCalls = calls.filter(call => call[0] === 'play').length
  runInNewContext("handleYoutube({action:'captions',captionsHidden:true});", context)
  expect(calls).toContainEqual(['caption-option', 'captions', 'track', {}])
  runInNewContext("handleYoutube({action:'captions',captionsHidden:false});", context)
  expect(calls).toContainEqual(['caption-option', 'captions', 'track', { languageCode: 'pt' }])
  expect(calls.filter(call => call[0] === 'play')).toHaveLength(playCalls)
  runInNewContext("handleYoutube({action:'pause'});handleYoutube({action:'seek',position:30});handleYoutube({action:'stop'});", context)
  expect(calls).toContainEqual(['pause'])
  expect(calls).toContainEqual(['seek', 30])
  expect(calls).toContainEqual(['stop'])
})
it('reloads an outdated receiver and waits for YouTube support before sending media', async () => {
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const bar = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
  const code = bar.slice(bar.indexOf('var youtubeReceiverReady ='), bar.indexOf('async function tvSendVideo'))
  const calls = []
  let listener
  let requestId
  const context = { Date, Math, Promise, Error, setTimeout, clearTimeout,
    getNetworkMirrorSender: () => ({ prepare: async () => {}, start: async slot => calls.push({ slot, message: { type: 'video', cleanMirror: true } }) }),
    networkProjectionActive: true, tvChecked: {}, tvHint: { style: {} },
    window: { louvorja: {
      palco: {
        onEvent(cb) { listener = cb; return () => { listener = null } },
        async send(message, slot) { calls.push({ message, slot }); if (message.type === 'obsControl') requestId = message.requestId; return true },
      },
      projection: { async getPlaybackState() { return { currentTime: 25, paused: false } } },
    } },
  }
  runInNewContext(code, context)
  const pending = context.tvSendMedia('7082', { youtubeId: 'abcdefghijk', title: 'Vídeo' }, 0, false)
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(calls.map(call => call.message.type)).toEqual(['obsControl'])
  listener({ type: 'receiver-ready', requestId: 'another', youtube: true })
  expect(calls).toHaveLength(1)
  listener({ type: 'receiver-ready', requestId, youtube: true, cleanMirror: true })
  await pending
  expect(calls[1]).toMatchObject({ slot: '7082', message: { type: 'video', cleanMirror: true } })
  await context.tvSendMedia('7082', { youtubeId: 'abcdefghijk' }, 0, false)
  expect(calls.filter(call => call.message.type === 'obsControl')).toHaveLength(1)
})
it('sends the downloaded YouTube copy to receivers as a local video and mirrors when it cannot be served', async () => {
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const bar = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
  const code = bar.slice(bar.indexOf('var tvYoutubeRoutes'), bar.indexOf('/** Manda ação'))
  const sent = []
  const mirrored = []
  let served = 'http://tv/media/copy.mp4'
  const context = {
    networkProjectionActive: true, tvChecked: {}, audioOutputMode: 'pc', tvHint: { style: {} },
    getNetworkMirrorSender: () => ({ prepare: async () => {}, start: async (slot) => { mirrored.push(slot) } }),
    prepareYoutubeReceiver: async () => true,
    window: { louvorja: { palco: {
      servePath: async () => served,
      send: async (message, slot) => { sent.push({ message, slot }); return true },
    } } },
  }
  runInNewContext(code, context)
  const media = { youtubeId: 'abcdefghijk', filePath: '/cache/abcdefghijk.mp4', title: 'Hino' }
  await context.tvSendMedia('1', media, 4000, false)
  expect(sent.map(({ message }) => message)).toEqual([
    { v: 2, type: 'video', url: served, title: 'Hino', connectionsMuted: false, positionMs: 4000 },
    { v: 2, type: 'video', action: 'play' },
  ])
  expect(mirrored).toEqual([])

  served = null
  const large = { ...media, filePath: '/cache/large.mp4' }
  await context.tvSendMedia('2', large, 0, false)
  expect(mirrored).toEqual(['2'])
  served = 'http://tv/media/large.mp4'
  await context.tvSendMedia('2', large, 0, false)
  expect(mirrored).toEqual(['2', '2'])
  await context.tvSendMedia('3', { youtubeId: 'abcdefghijk', filePath: '' }, 0, false)
  expect(mirrored).toEqual(['2', '2', '3'])

  context.window.louvorja.palco.servePath = async () => { throw new Error('slot caiu') }
  await context.tvSendMedia('4', { ...media, filePath: '/cache/other.mp4' }, 0, false)
  expect(mirrored).toEqual(['2', '2', '3', '4'])

  context.window.louvorja.palco.servePath = async () => { context.tvChecked['5'] = false; return served }
  await context.tvSendMedia('5', media, 0, false)
  expect(mirrored).toEqual(['2', '2', '3', '4'])
  expect(sent).toHaveLength(2)
})
it('turning captions on moves receivers from the downloaded file to the mirror, and back when they are hidden', async () => {
  const { readFileSync } = await import('node:fs')
  const { runInNewContext } = await import('node:vm')
  const bar = readFileSync(new URL('../player/control-bar.html', import.meta.url), 'utf8')
  const code = bar.slice(bar.indexOf('var tvYoutubeRoutes'), bar.indexOf('/** Manda ação'))
  const sent = []
  const mirrored = []
  const removed = []
  let media = { youtubeId: 'abcdefghijk', filePath: '', title: 'Hino' }
  let playback = { currentTime: 12.4, paused: false }
  const sender = { prepare: async () => {}, start: async (slot) => { mirrored.push(slot) }, remove: async (slot) => { removed.push(slot) } }
  const context = {
    networkProjectionActive: true, tvChecked: { 3: false }, audioOutputMode: 'pc', tvHint: { style: {} },
    tvSlots: [{ id: '1', clients: 1 }, { id: '2', clients: 0 }, { id: '3', clients: 1 }, { id: '4', clients: 1 }],
    networkMirrorSender: null,
    getNetworkMirrorSender: () => sender,
    prepareYoutubeReceiver: async () => true,
    window: { louvorja: {
      palco: { servePath: async () => 'http://tv/media/copy.mp4', send: async (message, slot) => { sent.push({ message, slot }); return true } },
      projection: { getSourceMediaInfo: async () => media, getPlaybackState: async () => playback },
    } },
  }
  runInNewContext(code, context)
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  await context.tvSendMedia('1', media, 0, false)
  expect(mirrored).toEqual(['1'])
  await context.tvRerouteYoutube()
  expect(sent).toEqual([])

  context.networkMirrorSender = sender
  media = { ...media, filePath: '/cache/abcdefghijk.mp4' }
  await context.tvRerouteYoutube()
  await settle()
  expect(removed).toEqual(['1'])
  expect(sent.map(({ message, slot }) => [slot, message.url ?? message.action])).toEqual([['1', 'http://tv/media/copy.mp4'], ['1', 'play']])
  expect(sent[0].message.positionMs).toBe(12400)

  sent.length = 0
  playback = null
  media = { ...media, filePath: '' }
  await context.tvRerouteYoutube()
  await settle()
  expect(sent).toEqual([{ message: { v: 2, type: 'video', action: 'stop' }, slot: '1' }])
  expect(mirrored).toEqual(['1', '1'])

  context.window.louvorja.projection.getSourceMediaInfo = async () => ({ filePath: '/x.mp4' })
  await context.tvRerouteYoutube()
  context.window.louvorja.projection.getSourceMediaInfo = async () => null
  await context.tvRerouteYoutube()
  context.networkProjectionActive = false
  await context.tvRerouteYoutube()
  expect(mirrored).toEqual(['1', '1'])
  expect(sent).toHaveLength(1)
})
it('sizes the YouTube iframe to cover the receiver viewport rather than its default embedded dimensions', async () => {
  const { readFileSync } = await import('node:fs')
  const { JSDOM } = await import('jsdom')
  const html = readFileSync(new URL('../palco/receiver.html', import.meta.url), 'utf8')
  const dom = new JSDOM(html)
  try {
    const view = dom.window.document.createElement('div')
    view.id = 'youtubeProjection'
    const frame = dom.window.document.createElement('iframe')
    frame.width = '640'; frame.height = '360'
    view.appendChild(frame); dom.window.document.body.appendChild(view)
    const style = dom.window.getComputedStyle(frame)
    expect(style.position).toBe('absolute')
    expect(parseFloat(style.width)).toBe(dom.window.innerWidth)
    expect(parseFloat(style.minWidth)).toBeCloseTo(dom.window.innerHeight * 16 / 9, 2)
    expect(parseFloat(style.minHeight)).toBeCloseTo(dom.window.innerWidth * 9 / 16, 2)
  } finally { dom.window.close() }
})
