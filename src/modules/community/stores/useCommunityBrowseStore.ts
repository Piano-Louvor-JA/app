import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Busca e página da lista da Comunidade. Fica na store (e não na tela) para
 * o operador voltar onde estava ao sair e voltar para a Comunidade.
 * Só memória: não persiste entre reinícios do app.
 */
export const useCommunityBrowseStore = defineStore('community-browse', () => {
  const searchQuery = ref('')
  const page = ref(1)

  return { searchQuery, page }
})
