# Supabase do PlayNext

Projeto conectado via MCP: `cckunethwmnyjkmlgpsi`, região `us-east-1`.

## Banco aplicado

Migração `playnext_private_accounts`, fonte em `migrations/202610190001_private_accounts.sql`. Vault e pgcrypto já estavam instalados.

`playnext_accounts` contém apenas UUIDs, revisão e timestamps. O documento privado é criptografado pelo Vault. Funções públicas `playnext_load`, `playnext_save` e `playnext_delete_account` conferem `auth.uid()`, não recebem IDs de outros usuários e têm `search_path` fixo. Revogados acesso anônimo, mutações diretas e acesso dos usuários ao schema Vault. A função de limpeza remove o segredo ao excluir a conta, inclusive em exclusões administrativas.

`tests/private_accounts.sql` foi executado via MCP e passou; todas as suas contas e segredos sintéticos usam rollback. Nunca execute testes com dados de usuários reais.

O advisor retorna três avisos de funções SECURITY DEFINER acessíveis a usuários autenticados, além do aviso de proteção de senhas vazadas (inaplicável ao provedor de e-mail/senha desabilitado). É o desenho intencional dessas RPCs: permite que o proprietário use o Vault sem conceder acesso direto a ele ou a `auth.users`. As verificações de proprietário e os grants estão nos testes. Não há acesso anônimo. [Explicação do aviso](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Google como único login

No projeto Google Cloud `project-ec3b2670-b01c-42c3-8fb` foi criado o cliente OAuth web **PlayNext**. Seu ID público é `316543035245-b9uhfnfmv2slil66o0ri38bsgbuj91ed.apps.googleusercontent.com`. O segredo foi transferido diretamente do painel Google para o provedor Google do Supabase; nunca faz parte do código ou do frontend.

- Google habilitado; e-mail/senha, telefone e login anônimo desabilitados.
- Novas identidades podem entrar pelo Google. Vinculação manual permanece desabilitada.
- Verificações de nonce e exigência de e-mail do Google preservadas.
- Escopos declarados: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`. Nenhum acesso a Gmail, Drive ou outros dados Google.
- Origem JavaScript do cliente Google: `https://playnext-game-swipe.leonardorainha.chatgpt.site`.
- Retorno autorizado no Google: `https://cckunethwmnyjkmlgpsi.supabase.co/auth/v1/callback`.

A marca está em **Testing / External**. O console exige completar a marca para publicar. A documentação Google permite a entrada de qualquer usuário sem lista de teste quando apenas os três escopos básicos de identidade são pedidos. Isso não equivale a verificação da marca; a tela Google pode mostrar o domínio Supabase e aviso de teste. Não foram solicitadas permissões adicionais para contornar essa limitação.

Site URL do Supabase:

```text
https://playnext-game-swipe.leonardorainha.chatgpt.site/
```

Redirects de produção exatos (sem wildcard): a raiz acima e `https://playnext-game-swipe.leonardorainha.chatgpt.site/auth-callback.html`. A URL local temporária usada no QA foi removida ao concluí-lo. Para outra hospedagem, atualize o Site URL, callback permitido no Supabase e origem no Google.

## Sessão e retorno

O SDK oficial usa sessão em memória (`persistSession:false`), fluxo implícito e renovação enquanto a aba está aberta. Recarregar exige entrar com Google novamente. Uma janela separada faz o login, retorna a `auth-callback.html` e envia somente os tokens Supabase à aba de origem. A aba exige correspondência exata de origem e da janela antes de validar a sessão com Auth. O token Google não é enviado à aba principal nem persistido.

O callback remove o fragmento da URL, usa `no-referrer` e não inclui analytics. Chave RAWG e escolhas anteriores continuam apenas na memória durante a entrada. A coleção anterior é oferecida para importação explícita; a chave de visitante deve ser conectada novamente após entrar. O aplicativo não cria formulário de senha Google e não necessita de serviço de envio de e-mails.

Fontes oficiais: [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google), [estados e exceção para escopos básicos](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [verificação da marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
