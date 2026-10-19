# Verificação — 19/10/2026

## Automatizada

- `npm test`: **33 testes passaram**. Filtros, três classificações, normalização, sorteio limitado, cancelamento, erros RAWG e regressão do contexto nativo de fetch. Novos testes comprovam snapshots de salvamento, fila/revisões, conflitos, retentativas, cancelamento na troca de conta e normalização de dados legados. O fluxo Google rejeita origem/janela incorretas, destino externo, popup bloqueado e cancelamento; transfere apenas tokens Supabase e limpa listeners/timers.
- O **SDK oficial Supabase JS 2.118.0** foi exercitado com URL OAuth Google, sessão/logout simulados e armazenamento instrumentado. Com as mesmas opções usadas pelo aplicativo, não houve leitura ou gravação em armazenamento persistente.
- `npm run check`: sintaxe de todos os módulos da aplicação.
- Testes HTTP simulados não usam credenciais reais. A chave publicável Supabase faz parte da configuração pública; nenhuma chave privilegiada foi obtida ou incluída.

## Banco real, via MCP Supabase

Migração `playnext_private_accounts` aplicada no projeto conectado. `supabase/tests/private_accounts.sql` passou com dados sintéticos e rollback:

- Salvamento criptografado e leitura equivalente pelo proprietário.
- Coluna física do Vault não contém o segredo sintético em texto legível.
- Revisão antiga é recusada; estado inválido é recusado.
- Usuário B não carrega os dados do usuário A.
- Papel autenticado não lê o schema Vault, não faz mutações diretas e só vê seus metadados pela RLS.
- Visitante não executa as RPCs nem lê os metadados.
- Exclusão da conta elimina seu segredo e preserva o outro usuário.
- Requisição sem identidade é recusada.

O advisor de segurança retorna **quatro avisos**: três das RPCs SECURITY DEFINER acessíveis ao papel autenticado e um de proteção de senhas vazadas desabilitada. O último não se aplica ao login atual, pois e-mail/senha está desabilitado e não criamos senhas próprias. As três RPCs são intencionais. Elas precisam desse privilégio para operar o Vault sem expor o schema e conferem `auth.uid()` internamente. Não há concessão a visitantes. Justificativa e fonte em `supabase/README.md`.

## Navegador, Google SSO atual

Prévia HTTP local com o provedor Google real:

- Entrada Google retornou ao callback e a interface exibiu a identidade conectada. Consulta agregada confirmou uma identidade Google e nenhuma senha própria.
- Uma decisão de demonstração foi salva. Consulta agregada confirmou revisão 1, uma escolha e conteúdo físico criptografado, sem retornar o documento privado.
- Recarregar encerrou a sessão da aba. Nova entrada Google recuperou a escolha na coleção; registro de teste removido pela interface ao terminar; consulta agregada confirmou revisão 2 e coleção vazia. Logout confirmado na interface. A conta Google e o histórico legado do navegador foram preservados.
- Permissões declaradas no Google: somente identidade, e-mail e perfil básico.
- A janela OAuth é separada e pode fechar rapidamente se o Google reutilizar uma sessão já aberta. A automação acompanha a aba principal; o retorno e a coleção restaurada foram verificados nela.

## Verificações anteriores preservadas

Antes de substituir senha por Google, prévia HTTP local com conta sintética temporária exclusiva de QA:

- Login real por senha no Supabase e carregamento do estado pelo SDK.
- Três decisões, uma em cada lista, salvas no banco. Consulta da fixture confirmou revisão 3, três escolhas, statuses played/no/yes e conteúdo físico criptografado.
- Recarregar exige novo login; após entrar, as três escolhas foram recuperadas do Supabase nas listas corretas.
- Exportação solicitada pela interface, sem chave, senha ou token na estrutura gerada. Login/logout e limpeza da coleção da aba ao sair verificados.
- Importação de escolhas da versão anterior é oferecida, sem importação automática. O histórico preexistente do navegador não foi removido nem atribuído à conta de teste.
- Formulário de chave oculto; chave fictícia exercitou a falha de conexão/CORS sem travar a interface. Nenhum erro `Illegal invocation` no log observado. Não foi lida a chave real do usuário.
- Modal de login, tutorial e navegação inspecionados visualmente no viewport 633×853. Layout base já havia passado em 375, 768, 1024 e 1440 em 17/10; não se atribui esse teste antigo aos novos elementos da conta.
- Tutorial: quatro capturas reais salvas, três das páginas públicas RAWG (API/login/cadastro) e uma do formulário vazio PlayNext. Navegação às páginas RAWG feita por locators Playwright. Nenhuma conta RAWG criada, nenhum termo aceito e nenhuma API key capturada.

## Configuração externa confirmada

- GitHub público `SchunckLeonardo/PlayNext`, branch `main`, publicação autorizada diretamente pelo mantenedor.
- Google OAuth web PlayNext criado no projeto do mantenedor e conectado ao Supabase por formulário autenticado, sem credenciais secretas no código.
- Google habilitado e e-mail/senha desabilitado no painel Supabase. Signup Google permitido, anônimo e vinculação manual desabilitados. Verificações de nonce e exigência de e-mail preservadas.
- Site URL HTTPS e dois redirects de produção exatos: raiz e `auth-callback.html`, sem wildcard. Callback local temporário removido após o QA; painel confirmou somente dois redirects de produção.
- Marca Google em **Testing / External**; não foi alegada verificação da marca. A exceção oficial dos escopos básicos permite login sem lista de testadores.

## Limites e pendências

1. **Marca Google ainda em teste.** O console bloqueia Publish app até completar a marca. Acesso básico funciona, mas não foi validado com uma segunda conta externa. A marca não foi verificada e pode aparecer como domínio Supabase/aviso de teste. Não há dependência de SMTP para entrar com Google.
2. **Consulta RAWG com chave válida não exercitada.** Ela deve ser testada pelo visitante no próprio campo, sem enviar a chave ao chat. O transporte preserva a correção nativa; respostas de chave inválida podem não oferecer CORS.
3. **LGPD:** implementados controles técnicos, minimização, aviso, exportação, correção de escolhas e exclusão. Não há certificação jurídica. Região EUA e retenções de backup/logs dos provedores são divulgadas.
4. **Importação:** a ordem salvar antes de remover protege a origem. O fluxo real não foi acionado sobre escolhas existentes do usuário. Erros de sincronização mantêm dados na memória e alertam sobre a saída.
5. **Hospedagem:** público do Site preservado. Repositório público não torna o Site público. Capas/fontes são externas.

A conta sintética anterior já foi removida com seus dados e segredo. O item usado no QA Google foi removido; a identidade real do mantenedor foi preservada. Nenhuma escolha sintética permanece na coleção da conta. Evidências visuais operacionais ficam fora do código público, em `outputs/playnext-validation/`.
