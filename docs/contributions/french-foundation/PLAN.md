# Plano de revisão da contribuição francesa

## Goal
Disponibilizar a implementação e a evidência de validação para avaliação da equipe, mantendo o PR em rascunho até decidir a forma de integração.

## Steps
1. Revisar SPEC, fontes bíblicas e licenças dos ícones.
2. Revisar persistência de idioma/tema/liturgia e compatibilidade de catálogos.
3. Revisar o servidor HTTP/WS, autenticação e isolamento do token do pregador.
4. Avaliar a navegação e as paletas com operadores; ajustar o rodapé em janelas estreitas.
5. Revisar o francês com falante fluente e verificar mensagens interpoladas.
6. Ensaiar abertura desktop com dados isolados, desconexão/reconexão de monitor e controle real por telefone.
7. Inspecionar os arquivos de runtime dentro de um pacote Electron antes de considerar o desktop entregue.
8. Definir com os mantenedores a divisão da proposta em contribuições menores, se desejado.

## Validation
Executar `npm run test:regression -- --baseline` na base limpa antes de novas alterações; depois executar `npm run test:regression -- --compare`. Não versionar o baseline gerado localmente como resultado do produto. Os testes Node dos scripts de release seguem separados do Vitest.

## Rollback
Manter a contribuição em branch própria até aprovação. As preferências novas usam chaves próprias; não apagar dados existentes para reverter o visual. Não fazer merge ou publicar release automaticamente.

## Desktop: Linux, Windows e macOS
Os comandos `electron:dev`, `electron:preview` e `electron:dev-log` usam um launcher Node comum. Ele resolve o executável pelo pacote Electron instalado, remove `ELECTRON_RUN_AS_NODE` somente do ambiente filho e aplica `--class` apenas no Linux. O modo de log grava stdout e stderr em `louvorja-dev.log` no diretório temporário do sistema, exibindo o caminho no terminal. O diretório opcional `PIANO_DEV_DATA_DIR` continua sendo preservado.

Antes de aprovar o desktop, executar em cada sistema:
- Abrir e fechar o app pelos três comandos, inclusive em um caminho com espaços; verificar encerramento dos processos e falhas de inicialização.
- Validar persistência de preferências e liturgia usando dados isolados e reiniciar o aplicativo.
- Validar monitores, DPI, tela cheia, áudio e controle remoto com equipamentos reais.
- Produzir e inspecionar o pacote/ASAR na plataforma apropriada: Linux x64/arm64, Windows x64 pelo CI Windows, macOS universal Intel/Apple Silicon.

Os testes automatizados do launcher verificam argumentos por plataforma, resolução do executável, ambiente, logs e códigos de saída. Executá-los no Linux não equivale a ensaio nativo de Windows/macOS, nem valida instaladores ou assinatura. Os idiomas dos instaladores NSIS/APPX e as traduções legais continuam sujeitos à revisão separada.
