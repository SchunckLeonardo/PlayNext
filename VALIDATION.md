# Verificação — 17/10/2026

## Automatizada

`npm test`: 33 testes com Node, sem dependências nem credenciais reais. Cobertura de filtros combinados, identidades da demonstração, todas as plataformas pedidas, prevenção de repetição, movimentação entre listas, serialização do histórico, dados malformados, sorteio de página, fallback, cancelamento e mensagens dos códigos HTTP 401/403/429/500.

`npm run check`: validação de sintaxe dos módulos executáveis.

## Navegador

Verificado na prévia HTTP local:

- Escolher Vou jogar, Já joguei e Sem interesse; contadores e registros correspondentes na coleção.
- Buscar Elden Ring na coleção, alterar sua classificação e recarregar: histórico e mudança preservados.
- Filtrar DS/NDS: Pokémon HeartGold, SoulSilver; combinar com Ação: estado vazio; limpar: sugestões retomadas.
- Abrir detalhes: título, imagem, descrição, plataforma, Metacritic e link para o jogo na RAWG.
- Teclado → e Z, com foco no conteúdo principal: escolha e desfazer. Corrigido e retestado um problema em que o foco em MAIN bloqueava os atalhos.
- Arrastar uma capa para a direita em viewport de celular: jogo movido para Vou jogar; desfazer o recupera.
- Coleção só contém uma classificação por jogo; jogos decididos saem do baralho.
- Formulário de chave oculta, links, fechamento de modal e resposta de falha de rede/chave sem derrubar a demonstração.
- Larguras de 375, 768, 1024 e 1440 pixels; nenhuma rolagem horizontal nas medições. Inspeção visual da composição desktop e celular.

## Limites confirmados

- Não foi fornecida uma chave RAWG válida, portanto não houve teste completo de consulta autenticada real. O transporte foi exercitado por respostas HTTP simuladas e a falha de conexão/chave foi testada no navegador. Uma consulta HTTPS separada à RAWG com chave fictícia recebeu HTTP 401, sem cabeçalhos CORS.
- Movimento reduzido é tratado em CSS e JavaScript; sua preferência no sistema não foi alterada durante o teste.
- Capas e fontes são recursos externos; indisponibilidade da imagem mantém o card e os controles utilizáveis.
- Coleção e filtros pertencem ao navegador; a chave é específica da sessão. Não há sincronização entre dispositivos.
- Hospedagem Sites mantém o acesso privado. A versão corrigida executa um Worker ESM para a interface e a rota `/api/rawg`.

Artefatos de teste do navegador não são incluídos no código ou na versão publicada.

## Correção da conexão RAWG

- Causa reproduzida no navegador: `Failed to execute 'fetch' on 'Window': Illegal invocation`. A função nativa era armazenada e chamada como método do cliente, perdendo o contexto de Window. Um teste que simula essa exigência falhou antes da correção e passou depois; o padrão foi substituído por uma função que chama `globalThis.fetch` com seu contexto correto.
- Detectado também que a RAWG responde HTTP 401 a uma chave fictícia sem cabeçalhos CORS. A rota do próprio site permite receber a resposta original, com erros específicos, mesmo nessas condições.
- No navegador local, a mesma chave fictícia passou de erro genérico para “A RAWG não aceitou esta chave”. Uma consulta HTTP à rota também retornou 401 com JSON legível e `Cache-Control: no-store`.
- Testes integram o cliente à rota, com respostas sem CORS, cobrindo conexão, plataformas, gêneros, sorteio e detalhes; testam também destinos e parâmetros bloqueados, limites de tamanho, falhas e segredo fora das respostas. Os testes usam fixtures identificadas, sem credenciais de terceiros.
- A migração preserva todos os oito assets originais. Um teste compara os conteúdos servidos pelo Worker com as fontes e garante entrega sem cache antigo.
- A chave real do usuário não foi lida nem usada durante o diagnóstico. O sucesso com ela ainda depende de repetir a conexão no site corrigido.
