# Verificação — 17/10/2026

## Automatizada

`npm test`: 21 testes com Node, sem dependências nem credenciais reais. Cobertura de filtros combinados, identidades da demonstração, todas as plataformas pedidas, prevenção de repetição, movimentação entre listas, serialização do histórico, dados malformados, sorteio de página, fallback, cancelamento e mensagens dos códigos HTTP 401/403/429/500.

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
- Hospedagem Sites inicia com acesso privado. O projeto estático pode ser publicado em qualquer hospedagem estática.

Artefatos de teste do navegador não são incluídos no código ou na versão publicada.
