# Supabase do PlayNext

Projeto conectado via MCP: `cckunethwmnyjkmlgpsi`, região `us-east-1`.

## Banco aplicado

Migração `playnext_private_accounts`, fonte em `migrations/202610190001_private_accounts.sql`. Vault e pgcrypto já estavam instalados.

`playnext_accounts` contém apenas UUIDs, revisão e timestamps. O documento privado é criptografado pelo Vault. Funções públicas `playnext_load`, `playnext_save` e `playnext_delete_account` conferem `auth.uid()`, não recebem IDs de outros usuários e têm `search_path` fixo. Revogados acesso anônimo, mutações diretas e acesso dos usuários ao schema Vault. A função de limpeza remove o segredo ao excluir a conta, inclusive em exclusões administrativas.

`tests/private_accounts.sql` foi executado via MCP e passou; todas as suas contas e segredos sintéticos usam rollback. Nunca execute testes com dados de usuários reais.

O advisor retorna três avisos de funções SECURITY DEFINER acessíveis a usuários autenticados. É o desenho intencional dessas RPCs: permite que o proprietário use o Vault sem conceder acesso direto a ele ou a `auth.users`. As verificações de proprietário e os grants estão nos testes. Não há acesso anônimo. [Explicação do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Auth e URLs

E-mail/senha e confirmação de e-mail estão habilitados. Não foi desativada a verificação de e-mail.

Site URL e único redirect exato, salvos no painel em 19/10/2026:

```text
https://playnext-game-swipe.leonardorainha.chatgpt.site/
```

Não há wildcard. A prévia local valida login por senha e sincronização; links de e-mail de produção devem retornar ao endereço acima. Para outra hospedagem, atualize ambos no painel Auth → URL Configuration.

## Pendência: e-mails públicos

O SMTP padrão do Supabase só envia a endereços autorizados da equipe e não serve cadastro público. O mantenedor informou que ainda não tem provedor nem domínio próprio. `PUBLIC_EMAIL_READY=false` impede submissões de cadastro/recuperação enquanto o envio não está pronto. Login de contas já confirmadas permanece disponível.

Uma opção inicial sem domínio próprio é o Brevo, com remetente verificado e possível substituição do endereço por domínio do provedor. O serviço pode exigir ativação/revisão e a entrega depende das suas regras; domínio autenticado é recomendado para produção. O cadastro, aceite dos termos, confirmação do e-mail e geração/entrada de credenciais são feitos pelo mantenedor, diretamente nos painéis.

Quando a conta e o remetente estiverem aprovados:

1. Brevo → Settings → SMTP & API → SMTP: obter o **SMTP login** e gerar chave SMTP padrão. Não usar chave API ou senha pessoal como senha SMTP.
2. Supabase → Auth → Emails → SMTP Settings: habilitar custom SMTP; host `smtp-relay.brevo.com`, porta `587`, usuário igual ao SMTP login, senha igual à chave SMTP; nome do remetente `PlayNext`, endereço igual ao remetente verificado. Manter as credenciais apenas nos painéis/provedor.
3. Salvar, habilitar `PUBLIC_EMAIL_READY=true` apenas em uma prévia de validação e testar cadastro real com um e-mail controlado pelo mantenedor. Ele cria a própria senha e confirma o link recebido. Testar também recuperação e definição de nova senha. Não enviar senhas, chaves ou links de recuperação ao chat ou ao GitHub.
4. Após essas verificações, executar checks, commitar e publicar a fonte correspondente com `PUBLIC_EMAIL_READY=true`. Essa flag só controla a disponibilidade na interface; a autorização permanece no Supabase Auth/RPC/RLS.

O plano gratuito consultado em 19/10/2026 informa 300 envios/dia; consultar limites atuais antes de ativar. Desative rastreamento de cliques nos e-mails de Auth se o provedor permitir, para não reescrever os links de confirmação.

Fontes oficiais: [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [chaves SMTP](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys), [plano Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans), [remetente e domínio](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).
