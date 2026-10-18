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
