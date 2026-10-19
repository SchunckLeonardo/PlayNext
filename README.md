# PlayNext

Um jogo por vez para decidir seu próximo play. Filtros de plataforma e gênero, swipe e três listas: **Vou jogar**, **Sem interesse** e **Já joguei**.

Site: https://playnext-game-swipe.leonardorainha.chatgpt.site

Código: https://github.com/SchunckLeonardo/PlayNext

## Executar

Node.js 22+; sem instalação ou build. O SDK oficial Supabase JS 2.118.0 está versionado em `dist/vendor/`, com sua licença.

```sh
npm run dev
# http://127.0.0.1:4173
npm test
npm run check
```

Para outra hospedagem estática, publique `dist/` e atualize as URLs permitidas no Supabase Auth. Produção requer HTTPS.

## Usar

1. Experimente 12 jogos reais da demonstração ou conecte sua própria chave RAWG. **Como obter a chave** abre um tutorial com quatro capturas reais feitas com Playwright.
2. Selecione plataformas e gênero, ou deixe geral. Plataformas: PC, PS1–PS5, DS/NDS, 3DS, Nintendo Switch e Xbox 360. DS e NDS são a mesma plataforma.
3. Deslize à direita para **Vou jogar**, à esquerda para **Sem interesse**, ou use **Já joguei**. Teclas ← ↓ → também escolhem; **Z** desfaz.
4. Na coleção, busque, mude a classificação ou remova jogos. Cada jogo tem apenas uma classificação e deixa de aparecer no baralho depois de escolhido.
5. Entre para sincronizar sua coleção, filtros e chave criptografados entre dispositivos. Sem login, os dados ficam apenas na memória da aba. Ao recarregar, entre novamente; tokens não são persistidos no navegador.

**Estado do envio de e-mails em 19/10/2026:** login de contas confirmadas e banco funcionando. Site URL e redirect exato configurados. O projeto ainda não tem SMTP próprio; cadastro e recuperação públicos aparecem como “em preparação”, sem submeter dados a um fluxo sem entrega. O código desses fluxos está implementado. Ative `PUBLIC_EMAIL_READY` em `dist/config.js` somente depois de configurar e verificar o envio real conforme `supabase/README.md`.

## Segurança e dados

- Supabase Auth gerencia e-mail, hash de senha, confirmação, recuperação e sessões. Não copiamos senhas ou e-mails para o estado da aplicação.
- Supabase Vault armazena **um documento criptografado por usuário**, com chave RAWG, coleção e filtros. A chave de criptografia é gerenciada pelo Supabase, fora do banco. Dados de Auth também dependem das proteções da infraestrutura do provedor.
- RPCs vinculam cada operação a `auth.uid()`; não aceitam um identificador de proprietário fornecido pelo cliente. RLS protege os metadados; visitantes não têm acesso e usuários não podem ler o Vault diretamente.
- Salvamentos serializados usam revisão otimista para impedir que outra aba sobrescreva escolhas recentes. Falhas ficam visíveis, com retentativa, exportação e saída com descarte explícito.
- A chave RAWG descriptografada e os tokens ficam na memória. Não há novas gravações em `localStorage` ou `sessionStorage`. As chaves legadas conhecidas são removidas de ambos sem leitura. Escolhas antigas ficam disponíveis para **importação explícita**, sendo removidas do armazenamento antigo após o salvamento criptografado.
- Exportação pessoal exclui chave RAWG, senha e tokens. Exclusão da conta remove Auth, sessões, metadados e o segredo correspondente do banco ativo. Backups e logs seguem a retenção dos provedores.
- `dist/config.js` contém URL e **chave publicável** do Supabase; ela é pública por definição. Nunca coloque uma chave `service_role`, chave secreta Supabase ou credencial SMTP no frontend/repositório.
- O serviço descriptografa os dados para uso; administradores autorizados podem acessá-los. Não é criptografia de ponta a ponta nem certificação de conformidade com a LGPD. O aviso de privacidade no site descreve finalidades, provedores, região EUA, retenção, exportação e exclusão. Governança jurídica e processos do controlador continuam necessários.

## RAWG

As consultas vão diretamente à API oficial por HTTPS, usando a chave do visitante. Não há proxy. A RAWG exige a chave no parâmetro da URL; ferramentas de rede do navegador e o próprio provedor podem vê-la. O aplicativo não a registra em logs, exportações ou analytics.

`/platforms` e `/genres` descobrem os IDs atuais. `/games` filtra plataformas/gênero/jogos lançados e sorteia páginas em até quatro tentativas limitadas; não promete distribuição estatística uniforme. Escolhas anteriores e duplicatas são excluídas. `/games/{id}` carrega detalhes sob demanda, possivelmente em inglês. Demonstração tem textos editoriais e metadados verificados em 17/10/2026; capas e fontes dependem de internet.

O transporte preserva o contexto nativo de `fetch`, corrigindo `Illegal invocation`. Respostas inválidas podem não ter CORS; nesses casos o navegador só permite uma mensagem genérica de chave/conexão. Sem uma chave RAWG válida fornecida pelo visitante no próprio formulário, não afirmamos ter validado uma consulta real autenticada.

Fontes: [RAWG API](https://rawg.io/apidocs), [Vault](https://supabase.com/docs/guides/database/vault), [Auth](https://supabase.com/docs/guides/auth/passwords), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [direitos dos titulares na ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares).

## Organização

- `dist/app.js`, `model.js`, `api.js`: descoberta, escolhas e RAWG.
- `dist/account.js`, `account-ui.js`, `config.js`: sincronização, Auth e conta.
- `dist/index.html`, `styles.css`, `account.css`: interface responsiva.
- `dist/assets/tutorial/`: capturas públicas da RAWG e formulário vazio do PlayNext.
- `supabase/migrations/`: esquema reproduzível, Vault, RLS e RPCs.
- `supabase/tests/`: prova transacional de criptografia, isolamento e exclusão, com rollback.
- `tests/`: regressões independentes da rede; SDK oficial exercitado com armazenamento instrumentado.
- `design-system/MASTER.md`: direção visual baseada no UI UX Pro Max.
- `VALIDATION.md`: evidências e limites atuais.
