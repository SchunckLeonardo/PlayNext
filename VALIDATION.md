# Verificação — 19/10/2026

## Automatizada

- `npm test`: **29 testes passaram**. Filtros, três classificações, normalização, sorteio limitado, cancelamento, erros RAWG e regressão do contexto nativo de fetch. Novos testes comprovam snapshots de salvamento, fila/revisões, conflitos, retentativas, cancelamento na troca de conta e normalização de dados legados.
- O **SDK oficial Supabase JS 2.118.0** foi exercitado com login/logout simulado e armazenamento instrumentado. Com as mesmas opções usadas pelo aplicativo, não houve leitura ou gravação em armazenamento persistente.
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

O advisor de segurança retorna **três avisos intencionais** das RPCs SECURITY DEFINER acessíveis ao papel autenticado. Elas precisam desse privilégio para operar o Vault sem expor o schema e conferem `auth.uid()` internamente. Não há concessão a visitantes. Justificativa e fonte em `supabase/README.md`.

## Navegador, com Playwright no Codex

Prévia HTTP local, com conta sintética temporária criada exclusivamente para QA:

- Login real por senha no Supabase e carregamento do estado pelo SDK.
- Três decisões, uma em cada lista, salvas no banco. Consulta da fixture confirmou revisão 3, três escolhas, statuses played/no/yes e conteúdo físico criptografado.
- Recarregar exige novo login; após entrar, as três escolhas foram recuperadas do Supabase nas listas corretas.
- Exportação solicitada pela interface, sem chave, senha ou token na estrutura gerada. Login/logout e limpeza da coleção da aba ao sair verificados.
- Importação de escolhas da versão anterior é oferecida, sem importação automática. O histórico preexistente do navegador não foi removido nem atribuído à conta de teste.
- Formulário de chave oculto; chave fictícia exercitou a falha de conexão/CORS sem travar a interface. Nenhum erro `Illegal invocation` no log observado. Não foi lida a chave real do usuário.
- Cadastro e recuperação públicos exibem aviso de preparação e não submetem o formulário enquanto `PUBLIC_EMAIL_READY=false`.
- Modal de login, tutorial e navegação inspecionados visualmente no viewport 633×853. Layout base já havia passado em 375, 768, 1024 e 1440 em 17/10; não se atribui esse teste antigo aos novos elementos da conta.
- Tutorial: quatro capturas reais salvas, três das páginas públicas RAWG (API/login/cadastro) e uma do formulário vazio PlayNext. Navegação às páginas RAWG feita por locators Playwright. Nenhuma conta RAWG criada, nenhum termo aceito e nenhuma API key capturada.

## Configuração externa confirmada

- GitHub público `SchunckLeonardo/PlayNext`, branch `main`, publicação autorizada diretamente pelo mantenedor.
- No painel Supabase autenticado, Site URL alterado de localhost para o PlayNext; adicionado um único redirect HTTPS exato do mesmo site. Painel confirmou “Successfully added 1 URL”. Sem wildcard.
- SMTP próprio estava desabilitado. Confirmação de e-mail permanece habilitada.

## Limites e pendências

1. **SMTP e entrega real de confirmação/recuperação ainda pendentes.** O mantenedor não possui provedor/domínio. Caminho com Brevo e remetente verificado documentado; exige criação da conta, aprovação/ativação e entrada de credenciais pelo mantenedor. Após verificar entrega e recuperação reais, ativar a interface e republicar. Os testes de QA usam uma fixture confirmada previamente; não constituem prova de entrega de e-mail.
2. **Consulta RAWG com chave válida não exercitada.** Ela deve ser testada pelo visitante no próprio campo, sem enviar a chave ao chat. O transporte preserva a correção nativa; respostas de chave inválida podem não oferecer CORS.
3. **LGPD:** implementados controles técnicos, minimização, aviso, exportação, correção de escolhas e exclusão. Não há certificação jurídica. Região EUA e retenções de backup/logs dos provedores são divulgadas.
4. **Importação:** a ordem salvar antes de remover protege a origem. O fluxo real não foi acionado sobre escolhas existentes do usuário. Erros de sincronização mantêm dados na memória e alertam sobre a saída.
5. **Hospedagem:** público do Site preservado. Repositório público não torna o Site público. Capas/fontes são externas.

A conta temporária e seus dados são removidos ao encerrar o QA; nenhuma fixture real fica na versão publicada. Evidências visuais operacionais ficam fora do código público, em `outputs/playnext-validation/`.
