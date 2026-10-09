// @vitest-environment jsdom
// Cobertura de gaps MediaEditorView (gaps_map3): capa (upload/remoção), busca e
// reuso de músicas custom, hino oficial, deleção via AppConfirm, painel de letra,
// aside colapsável, import/export .slja e áudio (upload local/API).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(() => ({ token: 'tok' }) as null | { token: string }),
  createCustomCollection: vi.fn(async () => ({ id: 9 })),
  updateCustomCollection: vi.fn(async () => null),
  listCustomCollections: vi.fn(async () => []),
}))

vi.mock('../../services/auth-client', () => ({
  getAuthSession: mocks.getSession,
  authHeaders: (token?: string | null) => (token ? { Authorization: `Bearer ${token}` } : {}),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
  createI18n: () => ({ global: { locale: 'pt-BR', t: (k: string) => k } }),
}))

vi.mock('../../components/MediaSlideStage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../components/MediaAccountBar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../components/PublicationRulesCard.vue', () => ({
  default: { template: '<div class="pub-rules" />' },
}))
vi.mock('@shared/components/AppConfirm.vue', () => ({
  default: {
    template: '<div class="confirm-stub" />',
    props: ['open', 'title', 'message'],
    emits: ['confirm', 'cancel'],
  },
}))
vi.mock('@modules/albums/services/album-music-search', () => ({
  filterAlbumMusicIndex: vi.fn(() => [
    { musicId: 410, name: 'Santo', displayTitle: 'Santo -CC', track: 1 },
  ]),
  loadAlbumMusicIndex: vi.fn(async () => [{ musicId: 410, name: 'Santo' }]),
}))
const { buildSlja, parseSljaFile } = vi.hoisted(() => ({
  buildSlja: vi.fn(async () => new ArrayBuffer(8)),
  parseSljaFile: vi.fn(),
}))
vi.mock('../../../../shared/services/slja', () => ({
  buildSlja,
  parseSljaFile,
}))

const catalogFns = vi.hoisted(() => ({
  listAllCustomMusics: vi.fn(async () => [
    { id: 21, name: 'Santo do intimacy', collectionId: 8, collectionName: 'Intimidade' },
    { id: 22, name: 'Outra', collectionId: 9 },
  ]),
  copyCustomMusic: vi.fn(async () => ({ id: 55 })),
  addOfficialMusicToCollection: vi.fn(async () => ({ id: 66 })),
  createCustomMusic: vi.fn(async () => ({ id: 71 })),
  createCustomLyric: vi.fn(async () => ({ id: 81 })),
  updateCustomLyric: vi.fn(async () => true),
  deleteCustomLyric: vi.fn(async () => true),
  deleteCustomMusic: vi.fn(async () => true),
  deleteCustomCollection: vi.fn(async () => true),
  updateCustomMusic: vi.fn(async () => true),
  uploadCustomFile: vi.fn(async () => ({ url: 'https://f/x.png', idFile: 3 })),
  listCustomMusics: vi.fn(async () => []),
  listCustomLyrics: vi.fn(async () => []),
  customFileUrl: vi.fn((p: string) => `https://f/${p}`),
}))
const {
  listAllCustomMusics, copyCustomMusic, addOfficialMusicToCollection, createCustomMusic,
  createCustomLyric, updateCustomLyric, deleteCustomLyric, deleteCustomMusic,
  deleteCustomCollection, updateCustomMusic, uploadCustomFile, listCustomMusics,
  customFileUrl,
} = catalogFns

vi.mock('../../services/custom-catalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/custom-catalog')>()
  return {
    ...actual,
    createCustomCollection: mocks.createCustomCollection,
    updateCustomCollection: mocks.updateCustomCollection,
    listCustomCollections: mocks.listCustomCollections,
    ...catalogFns,
  }
})

import MediaEditorView from '../MediaEditorView.vue'
import AppConfirm from '@shared/components/AppConfirm.vue'

function seedCollection() {
  mocks.listCustomCollections.mockResolvedValue([
    { id: 9, name: 'Coleção', description: null, ownerId: 4, visibility: 'public', musicsCount: 1 },
  ])
  listCustomMusics.mockResolvedValue([
    { id: 71, name: 'Minha música', collectionId: 9 },
  ])
}

/** Monta o editor e seleciona coletânea + música. */
async function mountEditorWithMusic() {
  const wrapper = mount(MediaEditorView)
  await flushPromises()
  await flushPromises()
  await wrapper.find('.editor__list-item').trigger('click')
  await flushPromises()
  await wrapper.findAll('.editor__list-item')[1]!.trigger('click') // música
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** FileReader + File com arrayBuffer disponível (jsdom). */
function makeFile(name: string, type = 'image/png'): File {
  return {
    name,
    type,
    arrayBuffer: async () => new ArrayBuffer(4),
  } as unknown as File
}

async function setInputFile(wrapper: ReturnType<typeof mount>, selector: string, file: File) {
  const input = wrapper.find(selector)
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks NÃO reseta implementações — restaura os defaults explícitos
  uploadCustomFile.mockResolvedValue({ url: 'https://f/x.png', idFile: 3 })
  copyCustomMusic.mockResolvedValue({ id: 55 })
  addOfficialMusicToCollection.mockResolvedValue({ id: 66 })
  createCustomMusic.mockResolvedValue({ id: 71 })
  createCustomLyric.mockResolvedValue({ id: 81 })
  updateCustomLyric.mockResolvedValue(true)
  deleteCustomLyric.mockResolvedValue(true)
  deleteCustomMusic.mockResolvedValue(true)
  deleteCustomCollection.mockResolvedValue(true)
  updateCustomMusic.mockResolvedValue(true)
  listAllCustomMusics.mockResolvedValue([
    { id: 21, name: 'Santo do intimacy', collectionId: 8, collectionName: 'Intimidade' },
    { id: 22, name: 'Outra', collectionId: 9 },
  ])
  listCustomMusics.mockResolvedValue([])
  window.localStorage?.clear?.()
  // jsdom tenta navegar quando o anchor de export é clicado; download é validado sem navegação.
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:slja-export'),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  mocks.getSession.mockReturnValue({ token: 'tok' } as never)
  mocks.updateCustomCollection.mockResolvedValue(null)
  // onSelectMusic faz fetch direto (sem custom-catalog): stub global
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({
      name: 'Minha música',
      audio_url: null,
      lyrics: [
        { id_lyric: 90, lyric: 'Primeira', time: '00:01' },
        { id_lyric: 91, lyric: 'Segunda', time: '00:05' },
      ],
    }),
  })))
  Element.prototype.scrollTo = (() => {}) as unknown as typeof Element.prototype.scrollTo
})

describe('MediaEditorView — capa da coletânea', () => {
  it('upload da capa: atualiza coleção e mostra "Capa atualizada"', async () => {
    seedCollection()
    const updated = { id: 9, name: 'Coleção', visibility: 'public', cover_url: 'https://f/x.png', musicsCount: 1 }
    mocks.updateCustomCollection.mockResolvedValue(updated)
    const wrapper = await mountEditorWithMusic()
    await setInputFile(wrapper, 'input[accept="image/*"]', makeFile('capa.png'))
    expect(uploadCustomFile).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Capa atualizada')
    // thumb com a capa
    expect(wrapper.find('.editor__cover-thumb').exists()).toBe(true)
  })

  it('upload falha no uploadCustomFile: notifica falha', async () => {
    seedCollection()
    uploadCustomFile.mockResolvedValue(null)
    const wrapper = await mountEditorWithMusic()
    await setInputFile(wrapper, 'input[accept="image/*"]', makeFile('capa.png'))
    expect(wrapper.text()).toContain('Falha no upload da capa')
  })

  it('upload ok mas update falha: notifica falha ao salvar', async () => {
    seedCollection()
    // update falha (mock default do beforeEach): caminho do onCoverFile com upload ok
    mocks.updateCustomCollection.mockResolvedValue(null)
    const wrapper = await mountEditorWithMusic()
    await setInputFile(wrapper, 'input[accept="image/*"]', makeFile('capa.png'))
    expect(wrapper.text()).toContain('Falha ao salvar capa')
  })

  it('remover capa: cover_url null e notificação', async () => {
    seedCollection()
    mocks.updateCustomCollection
      .mockResolvedValueOnce({ id: 9, name: 'C', coverUrl: 'u', musicsCount: 1 })
      .mockResolvedValueOnce({ id: 9, name: 'C', coverUrl: null, musicsCount: 1 })
      .mockResolvedValue({ id: 9, name: 'C', coverUrl: null, musicsCount: 1 })
    const wrapper = await mountEditorWithMusic()
    // sobe a capa primeiro (o botão remover só existe com coverUrl)
    await setInputFile(wrapper, 'input[accept="image/*"]', makeFile('capa.png'))
    await flushPromises()
    const removeBtn = wrapper
      .findAll('button')
      .filter((b) => b.attributes('title') === 'Remover capa')[0]
    expect(removeBtn).toBeDefined()
    await removeBtn!.trigger('click')
    await flushPromises()
    expect(mocks.updateCustomCollection).toHaveBeenLastCalledWith(9, { cover_url: null })
    expect(wrapper.text()).toContain('Capa removida')
  })

  it('remover capa falha: notifica', async () => {
    seedCollection()
    mocks.updateCustomCollection
      .mockResolvedValueOnce({ id: 9, name: 'C', coverUrl: 'u', musicsCount: 1 })
      .mockResolvedValue(null)
    const wrapper = await mountEditorWithMusic()
    await setInputFile(wrapper, 'input[accept="image/*"]', makeFile('capa.png'))
    await flushPromises()
    const removeBtn = wrapper
      .findAll('button')
      .filter((b) => b.attributes('title') === 'Remover capa')[0]
    expect(removeBtn).toBeDefined()
    await removeBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Falha ao remover capa')
  })
})

describe('MediaEditorView — busca de hino oficial e reuso de custom', () => {
  it('busca oficial: resultados aparecem e clique adiciona à coletânea', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    const search = wrapper.find('input[placeholder="Buscar hino oficial (nº ou nome)…"]')
    await search.setValue('san')
    await search.trigger('input')
    await flushPromises()
    await flushPromises()
    const results = wrapper.findAll('.editor__list--search .editor__list-item')
    expect(results.length).toBe(1)
    await results[0]!.trigger('click')
    await flushPromises()
    expect(addOfficialMusicToCollection).toHaveBeenCalledWith(9, 410, 'Santo -CC')
    expect(wrapper.text()).toContain('adicionada à coletânea')
  })

  it('add oficial falha: notifica', async () => {
    seedCollection()
    addOfficialMusicToCollection.mockResolvedValue(null)
    const wrapper = await mountEditorWithMusic()
    const search = wrapper.find('input[placeholder="Buscar hino oficial (nº ou nome)…"]')
    await search.setValue('san')
    await search.trigger('input')
    await flushPromises()
    await wrapper.findAll('.editor__list--search .editor__list-item')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Falha ao adicionar hino')
  })

  it('reuso: busca música de outra coletânea, copia com letra/áudio', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    const search = wrapper.find('input[placeholder="Reutilizar música existente…"]')
    await search.setValue('santo')
    await search.trigger('input')
    await flushPromises()
    await flushPromises()
    const hit = wrapper.findAll('.editor__list--search .editor__list-item').at(-1)!
    await hit.trigger('click')
    await flushPromises()
    await flushPromises()
    expect(copyCustomMusic).toHaveBeenCalledWith(9, 21)
    expect(wrapper.text()).toContain('copiada com letra e áudio')
  })

  it('reuso falha na cópia: notifica', async () => {
    seedCollection()
    copyCustomMusic.mockResolvedValue(null)
    const wrapper = await mountEditorWithMusic()
    const search = wrapper.find('input[placeholder="Reutilizar música existente…"]')
    await search.setValue('santo')
    await search.trigger('input')
    await flushPromises()
    await flushPromises()
    await wrapper.findAll('.editor__list--search .editor__list-item').at(-1)!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Falha ao copiar música')
  })
})

describe('MediaEditorView — estrofes, painel de letra e deleção', () => {
  it('nova estrofe via createCustomLyric', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    await wrapper
      .findAll('button')
      .filter((b) => b.classes().includes('editor__btn--add'))[0]!
      .trigger('click')
    await flushPromises()
    expect(createCustomLyric).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Estrofe adicionada')
  })

  it('painel de letra: oculta e restaura (toggle flutuante)', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    expect(wrapper.find('.editor__lyric-pane').exists()).toBe(true)
    await wrapper.find('.editor__lyric-pane-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor__lyric-pane').exists()).toBe(false)
    const floating = wrapper.find('.editor__lyric-pane-toggle--floating')
    expect(floating.exists()).toBe(true)
    await floating.trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor__lyric-pane').exists()).toBe(true)
  })

  it('aside colapsável esconde os painéis laterais', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    await wrapper.find('.editor__aside-toggle').trigger('click')
    expect(wrapper.find('.editor__body').classes()).toContain('editor__body--aside-collapsed')
  })

  it('excluir música via confirm stub emite deleteCustomMusic', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    // pede deleção da música
    await wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Excluir música'))[0]!
      .trigger('click')
    await flushPromises()
    // confirma no AppConfirm stub (emit direto no componente)
    wrapper.findComponent(AppConfirm).vm.$emit('confirm')
    await flushPromises()
    expect(deleteCustomMusic).toHaveBeenCalledWith(71)
    expect(wrapper.text()).toContain('Música excluída')
  })

  it('excluir coletânea falha: notifica', async () => {
    seedCollection()
    deleteCustomCollection.mockResolvedValue(false)
    const wrapper = await mountEditorWithMusic()
    await wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Excluir coletânea'))[0]!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent(AppConfirm).vm.$emit('confirm')
    await flushPromises()
    expect(wrapper.text()).toContain('Falha ao excluir coletânea')
  })

  it('excluir estrofe falha na API: notifica e mantém', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    await wrapper
      .findAll('button')
      .filter((b) => b.classes().includes('editor__btn--add'))[0]!
      .trigger('click')
    await flushPromises()
    deleteCustomLyric.mockResolvedValue(false)
    // botão de excluir estrofe (ícone trash no head da estrofe)
    await wrapper
      .findAll('button')
      .filter((b) => b.classes().includes('editor__btn--danger') && b.classes().includes('editor__btn--icon'))[0]!
      .trigger('click')
    await flushPromises()
    wrapper.findComponent(AppConfirm).vm.$emit('confirm')
    await flushPromises()
    expect(wrapper.text()).toContain('Falha ao excluir estrofe')
  })
})

describe('MediaEditorView — export/import .slja e áudio', () => {
  it('export .slja: gera download e notifica sucesso', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    await wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Exportar'))[0]!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Exportado com sucesso')
  })

  it('export sem estrofes: early-return silencioso', async () => {
    seedCollection()
    // fetch da música SEM lyrics → lyrics.value vazio
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ name: 'Minha música', lyrics: [] }),
    })))
    const wrapper = await mountEditorWithMusic()
    await wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Exportar'))[0]!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('.editor__toast-text').text()).toBe('')
    expect(buildSlja).not.toHaveBeenCalled()
  })

  it('import .slja: parseia e cria estrofes', async () => {
    seedCollection()
    const { parseSljaFile } = await import('../../../../shared/services/slja')
    ;(parseSljaFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      title: 'Importada',
      slides: [
        { lyric: 'Primeira', type: 'LETRA', timeMs: 1000, order: 1 },
        { lyric: 'Segunda', type: 'LETRA', timeMs: 5000, order: 2 },
      ],
    })
    createCustomMusic.mockResolvedValue({ id: 71 })
    createCustomLyric.mockResolvedValue({ id: 90 })
    const wrapper = await mountEditorWithMusic()
    await setInputFile(wrapper, '.editor__file-input', makeFile('musica.slja', 'application/zip'))
    expect(createCustomLyric).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Importado: 2 estrofes de musica.slja')
  })

  it('import .slja inválido: notifica erro', async () => {
    seedCollection()
    const { parseSljaFile } = await import('../../../../shared/services/slja')
    ;(parseSljaFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('zip ruim'))
    const wrapper = await mountEditorWithMusic()
    await setInputFile(wrapper, '.editor__file-input', makeFile('ruim.slja', 'application/zip'))
    expect(wrapper.text()).toContain('Arquivo .slja inválido')
  })

  it('áudio: upload vinculado à música API', async () => {
    seedCollection()
    const wrapper = await mountEditorWithMusic()
    const audioInput = wrapper.find('.editor__audio + input[type=file], input[accept*=audio]')
    // localiza o input de áudio pelo accept
    const inputs = wrapper.findAll('input[type=file]')
    const target = inputs.find((i) => (i.attributes('accept') ?? '').includes('audio'))
    void audioInput
    await setInputFile(wrapper, `input[accept="${target!.attributes('accept')}"]`, makeFile('a.mp3', 'audio/mpeg'))
    expect(updateCustomMusic).toHaveBeenCalledWith(71, { id_file_audio: 3 })
    expect(wrapper.text()).toContain('Áudio "a.mp3" vinculado')
  })

  it('áudio local (sem auth): guarda base64 no store local', async () => {
    mocks.getSession.mockReturnValue(null)
    // coletânea local: listCustomCollections devolve local? Editor cria via API mock; usamos rota query?collection com id local não dá.
    // Caminho local do áudio é exercitado via onSelectMusic(id<0) — coberto em outra suíte; aqui só falha de upload:
    seedCollection()
    uploadCustomFile.mockResolvedValue(null)
    const wrapper = await mountEditorWithMusic()
    const inputs = wrapper.findAll('input[type=file]')
    const target = inputs.find((i) => (i.attributes('accept') ?? '').includes('audio'))
    await setInputFile(wrapper, `input[accept="${target!.attributes('accept')}"]`, makeFile('a.mp3', 'audio/mpeg'))
    expect(wrapper.text()).toContain('Falha no upload do áudio')
  })
})
