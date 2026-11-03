// @vitest-environment node
import { expect, it } from 'vitest'
import { youtubeSourceId } from '../youtube-source.mjs'
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
  const node = () => ({ style: {}, appendChild() {}, remove() {} })
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
  options.events.onReady({ target: { mute() {} } })
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
it('sizes the YouTube iframe to cover the receiver viewport rather than its default embedded dimensions', async () => {
  const { readFileSync } = await import('node:fs')
  const { JSDOM } = await import('jsdom')
  const html = readFileSync(new URL('../palco/receiver.html', import.meta.url), 'utf8')
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''))
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
