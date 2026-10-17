# PlayNext

Um jogo por vez para decidir o próximo play. Site em português, responsivo, com filtros e interações inspiradas em swipe.

## Executar

Requer Node.js 22 ou mais recente. Não há dependências para instalar.

```sh
npm run dev
```

Abra `http://127.0.0.1:4173`. A interface e a rota RAWG rodam juntas. `npm run build` gera o Worker ESM em `dist/server/index.js`, com todos os assets incorporados. A hospedagem precisa executar esse Worker; servir apenas arquivos estáticos não executa a conexão com a RAWG.

## Usar

1. Experimente a seleção de 12 jogos da demonstração ou clique em **Conectar RAWG** e cole sua própria API key.
2. Selecione uma ou várias plataformas e um gênero, ou deixe todas as plataformas e gêneros.
3. Deslize para a direita para **Vou jogar**, para a esquerda para **Sem interesse**, ou clique em **Já joguei**. Botões e teclas ← ↓ → também funcionam. **Z** ou **Desfazer última escolha** recupera a escolha anterior durante a sessão.
4. Em **Minha coleção**, consulte as três listas, busque pelo nome, altere a classificação ou remova o jogo. Removê-lo permite que volte às sugestões.

Plataformas: PC, PS1, PS2, PS3, PS4, PS5, DS/NDS, 3DS, Nintendo Switch e Xbox 360. DS e NDS são a mesma plataforma.

## Dados e integração

- A chave vai no corpo de um POST para `/api/rawg` no próprio PlayNext. O servidor encaminha a consulta exclusivamente à API oficial da RAWG. A chave não é gravada, registrada em logs nem armazenada no cache do servidor; fica apenas na requisição. No navegador, é mantida em `sessionStorage` durante a sessão; desconectar remove a chave. Não aparece na URL do site, no histórico ou no código publicado.
- Escolhas e filtros em `localStorage`. Não há conta nem sincronização entre dispositivos. Limpar os dados do navegador remove a coleção.
- `/platforms` e `/genres` descobrem os IDs e gêneros atuais ao conectar. A consulta usa apenas as plataformas solicitadas, inclusive quando “todas” está selecionado.
- `/games` consulta jogos já lançados e sorteia páginas do catálogo e jogos dentro da página. Exclui os três tipos de escolha e duplicatas. A amostragem ocorre em lotes de até 40 e usa até quatro tentativas limitadas, com fallback se a RAWG não servir uma página aleatória; não promete distribuição estatística uniforme.
- `/games/{id}` carrega os detalhes sob demanda. Descrições originais da API podem estar em inglês.
- A demonstração tem 12 jogos reais, com metadados verificados em 17/10/2026 e descrições editoriais. Ela não realiza consultas ao catálogo. Capas e fontes tipográficas precisam de internet; há fontes e fundo locais de fallback.
- As escolhas são locais e continuam disponíveis sem conectar a RAWG. A chave e a cota da RAWG pertencem a cada visitante.
- A rota do próprio site evita depender de cabeçalhos CORS da RAWG e preserva erros de autenticação e limite de consultas. Caminhos e parâmetros são restritos; não aceita outros destinos, redirecionamentos ou credenciais substitutas.

Fontes: [API e obtenção de chave](https://rawg.io/apidocs), [documentação oficial](https://api.rawg.io/docs/), [RAWG](https://rawg.io). O rodapé e os detalhes mantêm os links de atribuição.

## Verificação

```sh
npm test
npm run check
```

Testes com `node:test` e transporte HTTP simulado verificam filtros, classificações, persistência, normalização, sorteio, cancelamento e erros. Não são feitas consultas com credenciais reais nos testes.

Validação em navegador: escolhas, coleção, alteração de status, busca, persistência após reload, filtros, estados vazios, detalhes, teclado, desfazer e layout responsivo. Consulte `VALIDATION.md` para os resultados finais e limites de verificação.

## Organização

- `public/index.html` e `public/styles.css`: interface e design responsivo.
- `public/app.js`: estado e interações da interface.
- `public/model.js`: filtros, histórico, dados e normalização.
- `public/api.js`: cliente RAWG com cancelamento e erros tratados.
- `public/demo.js`: seleção de demonstração identificada.
- `worker/`: transporte seguro para a RAWG e entrega da interface.
- `scripts/`: build determinístico e validação do Worker ESM.
- `tests/`: testes independentes da rede e sem chaves reais.
- `design-system/MASTER.md`: decisões de design baseadas na UI UX Pro Max.

Sem framework ou dependências de terceiros. O build incorpora os arquivos da interface no Worker ESM para publicação.
