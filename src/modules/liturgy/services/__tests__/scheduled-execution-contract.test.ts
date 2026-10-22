import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import type { LiturgyItem } from '../../types/liturgy'
const mocks = vi.hoisted(() => ({
  entry:null as any, bible:{ books:[] as unknown[],bootstrap:vi.fn(),selectBook:vi.fn(),selectChapter:vi.fn(),applyVerseSearch:vi.fn(),verseSearchQuery:'' },
  music:vi.fn(), bridge:vi.fn(), target:vi.fn(),route:vi.fn(),turnOn:vi.fn(),publish:vi.fn(),
  image:vi.fn(),pdf:vi.fn(),presentation:vi.fn(),video:vi.fn(),localVideo:vi.fn(),site:vi.fn(),web:vi.fn(),
}))
vi.mock('../../stores/useScheduledStore', () => ({ useScheduledStore:()=>({ findOn:()=>mocks.entry }) }))
vi.mock('@modules/bible/stores/useBibleStore', () => ({ useBibleStore:()=>mocks.bible }))
vi.mock('@modules/media/services/open-music-player', () => ({ openMusicPlayer:mocks.music }))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge:mocks.bridge }))
vi.mock('../liturgy-local-video', () => ({ getLiturgyVideoObjectUrl:()=>undefined }))
vi.mock('../liturgy-web-projection', () => ({
  playLiturgyLocalImageOnScreens:mocks.image,playLiturgyLocalPdfOnScreens:mocks.pdf,playLiturgyLocalPresentationOnScreens:mocks.presentation,
  openLiturgyLocalImageControl:mocks.image,openLiturgyLocalPdfControl:mocks.pdf,openLiturgyLocalPresentationControl:mocks.presentation,
  playLiturgyLocalVideoOnScreens:mocks.localVideo,openLiturgyLocalVideoControl:mocks.localVideo,
  openLiturgyVideoControl:mocks.video,openLiturgySiteControl:mocks.site,openLiturgySiteOnScreens:mocks.site,
  playLiturgyWebOnConfiguredScreens:mocks.web,getPalcoRoute:mocks.route,parseLiturgyWebTarget:mocks.target,
}))
vi.mock('../../../settings/services/palco-session', () => ({ palcoSession:{turnOn:mocks.turnOn} }))
vi.mock('../liturgy-web-runtime', () => ({ publishLiturgyWebRuntime:mocks.publish }))
import { executeLiturgyItem,playLiturgyItemOnScreens } from '../liturgy-actions'
const router={push:vi.fn().mockResolvedValue(undefined)} as unknown as Router
const ref=(patch:Partial<LiturgyItem>={})=>({id:'scheduled',type:'scheduled',name:'Placeholder',scheduledRotationId:'rotation',...patch}) as LiturgyItem
async function execute(content:unknown,name='Entrada') {
  mocks.entry={name,content}
  return executeLiturgyItem(ref(),router,{dateISO:'2026-10-24'})
}
beforeEach(()=>{
  vi.resetAllMocks();mocks.entry=null;mocks.bible.books=[];mocks.bible.verseSearchQuery=''
  for(const fn of [mocks.image,mocks.pdf,mocks.presentation,mocks.video,mocks.localVideo,mocks.site,mocks.web]) fn.mockResolvedValue(true)
  mocks.music.mockResolvedValue({ok:true});mocks.route.mockReturnValue('mirror')
  mocks.target.mockReturnValue({url:'https://example.org/video',kind:'youtube',videoId:'video1'})
})

describe('conteúdo agendado — execução pelo tipo resolvido',()=>{
  it('sem categoria ou conteúdo válido informa programação vazia',async()=>{
    expect(await executeLiturgyItem(ref({scheduledRotationId:'',categoryId:null}),router)).toMatchObject({ok:false,messageKey:'liturgy.messages.scheduledEmpty'})
    expect(await execute({kind:'file',filePath:''})).toMatchObject({ok:false,messageKey:'liturgy.messages.scheduledEmpty'})
    mocks.entry={filePath:'   '}
    expect(await executeLiturgyItem(ref(),router)).toMatchObject({ok:false,messageKey:'liturgy.messages.scheduledEmpty'})
  })
  it.each([['picture.PNG','image'],['document.pdf','pdf'],['slides.pptx','presentation']] as const)('projeta arquivo %s com título e propaga falhas',async(filePath,kind)=>{
    const content={kind:'file',filePath}
    expect(await execute(content)).toEqual({ok:true,resolved:content})
    const fn=mocks[kind]
    expect(fn).toHaveBeenCalledWith(kind==='image'?[filePath]:filePath,'Entrada')
    fn.mockResolvedValue(false)
    expect(await execute(content,'')).toMatchObject({ok:false,messageKey:'liturgy.messages.projectionFailed',resolved:content})
    expect(fn).toHaveBeenLastCalledWith(kind==='image'?[filePath]:filePath,'Placeholder')
  })
  it('arquivo de áudio segue a preferência do player e mantém resultado resolvido',async()=>{
    const play=vi.fn().mockResolvedValue({ok:true})
    mocks.bridge.mockReturnValue({externalPlayer:{get:vi.fn().mockResolvedValue('vlc'),play}})
    const content={kind:'file',filePath:'/media/audio.mp3'}
    expect(await execute(content)).toEqual({ok:true,resolved:content})
    expect(play).toHaveBeenCalledWith('/media/audio.mp3','vlc')
  })
  it.each([true,false])('versículo agendado prepara catálogo quando necessário: %s',async needsBootstrap=>{
    mocks.bible.books=needsBootstrap?[]:[{id:1}]
    const content={kind:'verse',verseBookId:1,verseChapter:2,verseNumbers:' 3-5 '}
    expect(await execute(content)).toEqual({ok:true,resolved:content})
    expect(mocks.bible.bootstrap).toHaveBeenCalledTimes(needsBootstrap?1:0)
    expect(mocks.bible.selectBook).toHaveBeenCalledWith(1)
    expect(mocks.bible.selectChapter).toHaveBeenCalledWith(2)
    expect(mocks.bible.verseSearchQuery).toBe('3-5')
    expect(mocks.bible.applyVerseSearch).toHaveBeenCalledOnce()
    expect(router.push).toHaveBeenCalledWith({name:'bible'})
  })
  it('versículo sem filtro não inicia busca e anotação mantém conteúdo',async()=>{
    await execute({kind:'verse',verseBookId:1,verseChapter:1})
    expect(mocks.bible.applyVerseSearch).not.toHaveBeenCalled()
    const content={kind:'annotation',text:'Avisos'}
    expect(await execute(content)).toEqual({ok:true,resolved:content})
  })
  it.each([true,false])('vídeo online agendado propaga resultado %s e título opcional',async ok=>{
    mocks.video.mockResolvedValue(ok)
    const content={kind:'online_video',url:'https://example.org/clip',name:'  Clipe  '}
    expect((await execute(content)).ok).toBe(ok)
    expect(mocks.video).toHaveBeenCalledWith(content.url,'Clipe')
    await execute({...content,name:undefined})
    expect(mocks.video).toHaveBeenLastCalledWith(content.url,content.url)
  })
  it('não navega para mídia quando o player recusa música agendada',async()=>{
    vi.mocked(router.push).mockClear();mocks.music.mockResolvedValue({ok:false,messageKey:'media.failure'})
    expect(await execute({kind:'music',musicId:5})).toMatchObject({ok:false,messageKey:'media.failure'})
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('projeção web pela rota configurada',()=>{
  it('rejeita alvo que não pode ser interpretado',async()=>{
    mocks.target.mockReturnValue(null)
    expect(await playLiturgyItemOnScreens({type:'site',url:'invalid'} as LiturgyItem)).toMatchObject({ok:false,messageKey:'liturgy.messages.urlMissing'})
  })
  it('rota Palco liga a sessão e publica o alvo em vez de abrir espelho',async()=>{
    mocks.route.mockReturnValue('slot')
    const before=Date.now()
    expect(await playLiturgyItemOnScreens({type:'online_video',url:'https://example.org/video',name:'  Vídeo  '} as LiturgyItem)).toEqual({ok:true})
    expect(mocks.turnOn).toHaveBeenCalledOnce()
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({active:true,url:'https://example.org/video',title:'Vídeo',kind:'youtube',videoId:'video1'}))
    expect(mocks.publish.mock.calls[0]![0].startedAt).toBeGreaterThanOrEqual(before)
    expect(mocks.web).not.toHaveBeenCalled()
  })
})
