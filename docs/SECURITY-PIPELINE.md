# Esteira de segurança

O workflow **Security** roda em pull requests, pushes em `main` e execução manual. Ferramentas usadas sem cadastro externo ou chave de API adicional:

| Etapa | Ferramenta | O que bloqueia |
| --- | --- | --- |
| SAST | GitHub CodeQL, suíte `security-extended` | Achados altos/críticos (security-severity ≥ 7), erro de análise ou relatório ausente |
| SCA | `npm audit --audit-level=high` | Vulnerabilidades conhecidas altas/críticas nas dependências diretas e transitivas |
| Alterações de dependências | Dependency Review | Nova dependência vulnerável alta/crítica no PR |
| Integridade do SDK | `npm run verify:vendor` | Bundle alterado ou versão diferente do pacote e do lockfile |
| Regressão | Node test runner + Docker/Supabase local | Falha de sintaxe, unidade, Auth local, Vault, isolamento ou sincronização |

CodeQL, Dependency Review e runners Linux padrão são gratuitos para este repositório **público**. O Actions usa o `GITHUB_TOKEN` automático com permissões mínimas; ninguém precisa criar/copiar uma chave de API. Não são usados SonarCloud, Snyk ou planos pagos. Se o repositório mudar para privado, reavaliar a disponibilidade/licença antes de assumir as mesmas condições.

O SDK Supabase incluído em `dist/vendor` também está declarado em `package.json` e `package-lock.json`, com seus cinco componentes. O verificador exige igualdade de versão e do SHA-256 do UMD oficial. Assim o SCA não dá resultado vazio enquanto ignora a biblioteca usada pelo navegador. O bundle upstream é excluído do SAST de código próprio e coberto por SCA/integridade.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run security:sca
```

SAST completo é executado pelo CodeQL no GitHub e publica os resultados em **Security → Code scanning** e em um artefato SARIF de sete dias. `scripts/check-sarif.mjs` transforma achados altos/críticos em falha real do job; fazer upload de alertas sozinho não seria um bloqueio de CI. O SCA consulta o registro público npm, sem enviar o código-fonte. CodeQL analisa o código hospedado no próprio GitHub.

As Actions estão fixadas por SHA. Dependabot propõe atualizações semanais de npm e Actions, sem auto-merge. Falha de rede da base de vulnerabilidades falha a verificação, em vez de produzir um resultado verde vazio. Nenhum scanner garante ausência de todas as vulnerabilidades.

Fontes: [Code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning), [Dependency Review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review), [cobrança do Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
