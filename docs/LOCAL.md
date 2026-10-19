# Testar PlayNext em Docker

O ambiente tem a aplicação em um container Node e Postgres, Auth, API REST e gateway do Supabase em containers separados. Não usa o projeto Supabase de produção e não precisa de chave Google ou RAWG para testar a demonstração.

## Iniciar

Pré-requisitos: macOS/Linux (ou WSL), Docker Desktop/Engine com socket Unix local funcionando, Node 24 e Supabase CLI **2.121.0**. A CLI é gratuita e `start`/`status`/`stop` locais não exigem login no Supabase. Instalação oficial: https://supabase.com/docs/guides/local-development/cli/getting-started

```sh
npm ci --ignore-scripts
npm run local:up
```

Abra http://127.0.0.1:4173. A faixa **AMBIENTE LOCAL** identifica os dados sintéticos. Em **Entrar**, clique **Entrar com conta de teste local**.

A identidade `qa@playnext.test` é registrada de verdade no **Auth local**. A senha aleatória é gerada automaticamente e fica em `.local/test-user.json` e `.local/app.env`, ignorados pelo Git. O frontend local recebe apenas sua chave publicável e essa fixture; a chave administrativa da CLI fica em memória no processo de preparação. Não envie nenhum desses arquivos a serviços de produção.

Esse adaptador local usa senha para testar sessão, coleção e criptografia sem uma conta Google de testes. O Google SSO de produção continua em `dist/oauth.js`; o adaptador e o botão locais são servidos somente por `local/server.mjs`, fora de `dist/`. O teste local não comprova a tela de consentimento OAuth real.

## Verificar e encerrar

```sh
npm run local:test
npm run local:status
npm run local:down
```

`local:test` executa os testes unitários dentro do container, o teste SQL transacional existente e um fluxo real de login, três listas, salvamento, revisão conflitante, logout e nova entrada. Ao terminar, restaura a coleção da fixture. O SQL usa rollback. O comando recusa URLs fora do loopback e não usa credenciais do projeto remoto.

`local:down` para somente os containers desse projeto e preserva o volume local e a conta para a próxima sessão. Não execute comandos de reset com dados que deseja manter.

## Código e isolamento

- `supabase/config.toml`: configuração local, sem Google/SMTP e sem vínculo ao projeto remoto. Não executar `supabase config push` com esse arquivo.
- `scripts/local.mjs`: inicia o stack, prepara a identidade via Auth Admin local e gera os arquivos ignorados.
- `local/`: imagem e servidor de desenvolvimento; a aplicação serve a configuração local em vez da configuração de produção.
- `compose.yaml`: container do PlayNext; arquivos `.local` entram como variáveis de ambiente e nunca são copiados à imagem.
- As portas da aplicação e do Supabase ficam vinculadas a `127.0.0.1`. A CLI 2.121.0 publica os serviços em todas as interfaces; `local/loopback.mjs` restringe apenas os containers `db` e `kong` deste projeto, preservando o volume e a configuração do gateway em memória. O script valida os rótulos antes de modificar um container.
- A imagem roda como usuário sem privilégios, filesystem somente leitura e sem capabilities adicionais.
- A primeira execução baixa imagens oficiais e precisa de internet/espaço em disco. As consultas RAWG continuam dependendo de uma chave própria quando quiser sair da demonstração.
