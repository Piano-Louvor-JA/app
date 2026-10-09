# Revisão de pull requests

PRs de desenvolvimento devem ter `staging` como destino. A promoção para `main` deve partir de `staging`.

## Antes de aprovar

- Aguarde `Quality Gate`, `PR Pre-review` e as duas análises CodeQL concluírem com sucesso.
- Confira a revisão do Codex para o commit atual, não apenas uma revisão de um commit anterior.
- Corrija os problemas identificados e resolva as discussões de revisão.
- Em `main`, obtenha uma aprovação humana após a última alteração do código. Novos commits invalidam aprovações anteriores.

O Codex segue as preferências pessoais e os limites do plano. Quando não houver revisão automática, uma conta com acesso pode solicitar `@codex review` em um comentário do PR. Nunca publique credenciais nos comentários.

## Check de conclusão do Codex

O workflow `Codex Review Gate` está em implantação. Só deve ser adicionado aos checks obrigatórios depois de promovido para a branch padrão e validado com a integração real.

`Codex Review Complete` comprova que o bot concluiu a revisão do commit atual. Não significa ausência de problemas: resolução das discussões e aprovação humana são condições separadas.

Se a revisão demorar mais de dez minutos, o check pode falhar durante a espera. A atualização do resumo oficial do Codex dispara nova verificação quando a revisão termina; também é possível executar o workflow manualmente, informando o número do PR.

Não desbloqueie branches nem ignore checks para acelerar um merge. Para sincronizar históricos, use um PR de uma branch que contenha os commits atuais da origem e do destino.
