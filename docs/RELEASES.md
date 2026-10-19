# Releases e aprovação

Versões seguem SemVer: correção `PATCH`, funcionalidade compatível `MINOR`, mudança incompatível `MAJOR`. Atualizar `package.json`, lockfile e `CHANGELOG.md` juntos. Não mover tags já publicadas.

1. Desenvolver em branch e abrir PR. Exigir checks verdes de Security e testar em Docker.
2. Preparar uma versão concreta com `npm run release:prepare` depois de commitar a fonte completa. O comando recusa alterações pendentes e gera em `reports/release/` um ZIP apenas de `dist/` e do manifesto de hospedagem, checksum SHA-256, notas e commit exato. A geração não publica nada.
3. Preparar o rascunho GitHub e apresentar PR, versão, commit, notas e resultados ao mantenedor. A aprovação para produção deve ser explícita e aplicável à versão concreta. Arquivos `.env`, `.local`, AGENTS.md e fixtures de conta não entram no ZIP de produção.
4. Depois da aprovação aplicável e merge, executar o workflow manual **Release** na branch `main`, informando em `approved_sha` o SHA completo aprovado e testado. O workflow verifica que esse commit pertence ao histórico de `main` e prepara exatamente essa fonte, mesmo que `main` tenha avançado depois. Preservar o commit aprovado no merge (merge commit, sem rebase/squash); se a fonte aprovada mudar, preparar e aprovar o novo SHA.
5. O job `publish` depende do ambiente GitHub **production**, com aprovação do mantenedor. A automação não deve aprovar essa etapa pelo usuário. O job também exige um Security concluído com sucesso para o mesmo SHA e confere o checksum do artefato recebido da preparação.
6. Publicar a release e o Site correspondente somente após aprovação. O workflow publica a **release GitHub**, sem fazer deploy no Sites nem armazenar tokens Sites/Supabase/Google no GitHub Actions. O deploy do Site é uma etapa separada, vinculada ao mesmo código aprovado. Registrar a versão/URL resultante.

O workflow aceita somente `main`. Se já existe rascunho, exige que ele aponte ao mesmo SHA antes de anexar o artefato e publicar; uma release final existente interrompe o processo. As permissões `contents:write` ficam somente no job protegido de publicação.

## Rollback

Usar a última release aprovada e seu checksum/commit. Reimplantar essa fonte no Site existente, preservando o público de acesso. Não reescrever tags, não restaurar banco automaticamente e não executar migrations destrutivas. A versão 2.1.0 acrescenta ferramentas e ambiente local sem alterar o esquema do Supabase de produção.

As instruções operacionais do agente ficam também no **AGENTS.md local**, excluído em `.git/info/exclude`, conforme a preferência do mantenedor. Esse arquivo não acompanha clone, GitHub ou artefatos; cada novo checkout de trabalho precisa receber sua cópia local antes de desenvolver novas features.
