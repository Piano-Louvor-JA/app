# Manual do operador — PIANO

Status: documentação da contribuição em rascunho, integrada à base 1.31.2. Os nomes abaixo usam português; a interface também oferece outros idiomas. Este manual descreve o código desta contribuição, não todas as funções do Violin.

## Objetivo
Preparar a programação, conferir o conteúdo e conduzir a projeção mantendo o controle do operador separado da imagem exibida à congregação.

## 1. Primeiro uso
1. Abra **Configurações → Geral** e escolha o idioma da interface. A preferência é preservada ao reabrir.
2. Em **Configurações → Aparência**, escolha **Dia**, **Noite** ou **Automático**. Automático acompanha o tema do sistema; não é um sensor físico de luminosidade.
3. Escolha a paleta e o movimento das transições. A gravação é automática; a prévia mostra seleção, ação e mensagens de estado.
4. Configure as telas e teste o áudio antes de iniciar o culto.
5. Faça um backup dos dados antes de importar um acervo ou atualizar uma instalação em uso.

## 2. Navegação
Em janelas amplas, a barra lateral agrupa preparação do culto, biblioteca e ferramentas. O botão de recolher libera espaço e mantém os ícones com seus nomes acessíveis.

Em janelas estreitas, a barra inferior prioriza Início, Liturgia, Bíblia e Álbuns quando disponíveis. **Mais** abre os outros destinos com seus nomes completos. A seção ativa tem destaque e um marcador, além da cor. `Tab` percorre os controles; `Enter` ou espaço ativa um botão; `Esc` fecha **Mais** e devolve o foco ao botão de abertura. O histórico e as páginas minimizadas continuam disponíveis.

## 3. Preparar a liturgia
1. Abra **Liturgia** e selecione a programação desejada.
2. Acrescente os itens do culto e confira sua sequência.
3. Preencha responsáveis e duração quando aplicável. Use os modelos como ponto de partida e ajuste ao culto real.
4. Revise o cronograma e exporte o CSV quando precisar compartilhar a programação. A exportação não envia mensagens automaticamente à equipe.
5. Antes de apresentar, confira título, conteúdo e destino de projeção de cada item.

## 4. Bíblia
1. Abra **Bíblia**, escolha idioma e edição, depois livro, capítulo e versículo.
2. Use a pesquisa para localizar referências ou palavras. A busca combina os termos e desconsidera diferenças de acentuação.
3. Use a comparação quando houver mais de uma edição disponível no idioma escolhido.
4. Confira a referência e o texto antes de projetar. A edição escolhida deve ser adequada à leitura pública.

As edições francesas locais incluídas são Louis Segond 1910 e Darby BPC 2024. Seus arquivos e fontes estão registrados no manifesto bíblico. A interface em francês não implica disponibilidade ou autorização de um hinário francês. Entradas sem texto na fonte não são completadas por geração automática.

## 5. Hinos e mídia
Use **Álbuns e mídias** para localizar o conteúdo disponível e confira o tipo de reprodução. Arquivos locais e downloads dependem do acervo instalado; serviços online exigem conexão. A preferência por player externo é configurada em **Configurações → Mídia** e precisa de um player compatível instalado.

Se um arquivo estiver ausente, localize ou importe novamente a mídia pelo fluxo do aplicativo. Não altere manualmente os identificadores do catálogo. Teste o início e o final da faixa, o volume e a saída de áudio antes de usar em público.

## 6. Telas e projeção
1. Conecte o monitor/projetor e habilite a área de trabalho estendida nas configurações do sistema operacional.
2. No aplicativo desktop, abra **Configurações → Projeção** e confira as telas detectadas.
3. Escolha a tela principal e, quando necessário, a tela de retorno. Confirme visualmente o destino antes de começar.
4. Teste a projeção com um conteúdo conhecido e confira margens, escala, tela cheia e legibilidade à distância.
5. Ao conectar ou remover uma tela, confira novamente o destino. Não presuma que a numeração permaneceu igual.

O navegador comum pode não oferecer as mesmas capacidades do Electron. Se a detecção não estiver disponível, a interface deve informar a limitação; uma lista simulada não confirma a presença de um monitor. A transmissão para TV usa o protocolo próprio do projeto, não Chromecast.

## 7. Controle remoto
Abra **Configurações → Controle remoto** e siga o endereço/pareamento apresentado pelo aplicativo. Desktop e navegador podem usar fluxos diferentes. O telefone deve alcançar o host conforme o modo escolhido. Use a função adequada: o acesso do pregador é limitado e não equivale ao controle completo do operador.

Se não conectar, confira a rede, o endereço mostrado, o estado do servidor e o código de acesso. Não publique o código de uma sessão ativa. Mudanças de firewall devem ser realizadas pelo responsável pelo computador, conforme a rede utilizada.

## 8. Aparência e acessibilidade
- Azul é a ação principal na paleta padrão; dourado permanece ligado à identidade visual. Avisos usam cor, ícone e texto.
- A seleção possui marcador ou contorno, sem depender somente da cor.
- O foco de teclado tem contorno próprio. Respeita-se a preferência de movimento reduzido do sistema.
- O modo claro é útil na preparação; o escuro reduz a luminosidade da área de operação. Isso não altera automaticamente o estilo do conteúdo projetado.
- Um controle desabilitado permanece legível, mas não aceita a ação. Confira os campos e o conteúdo necessários para habilitá-lo.

## 9. Encerrar e recuperar
Pare a reprodução/projeção, confira a programação salva e feche o aplicativo. Preferências e programação devem sobreviver à reabertura. Mantenha cópias de segurança dos dados importantes; teste uma restauração em ambiente separado antes de depender dela.

| Situação | Verificação inicial |
| --- | --- |
| Prévia local não abre | O servidor de desenvolvimento precisa estar em execução; uma aba aberta não mantém o servidor ativo. |
| Segunda tela não aparece | Confira conexão, modo estendido e se está usando o aplicativo desktop. |
| Texto pouco legível | Ajuste o tema da interface ou o estilo de projeção correspondente; verifique a edição e o tamanho do texto. |
| Áudio não sai | Confira volume, dispositivo, arquivo disponível e preferência de player externo. |
| Telefone não conecta | Confira endereço/código, rede e servidor ativo. |
| Opção parece ausente na janela pequena | Abra **Mais**; aumente a janela se precisar ver biblioteca e ferramentas simultaneamente. |

## Limites desta versão
Este documento não certifica instaladores ou equipamentos. A validação nativa em Linux, Windows e macOS e o ensaio com projetor/telefone permanecem registrados no [plano de integração](INTEGRATION.md). Consulte também o [sistema visual](DESIGN_SYSTEM.md) e as [referências inspecionadas](REFERENCE_REVIEW.md).
