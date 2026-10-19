# Changelog

## [2.1.0] — Unreleased

- Esteira gratuita: SAST CodeQL com bloqueio de achados altos/críticos, SCA npm audit e Dependency Review em pull requests.
- SDK Supabase vendorizado e seus componentes incluídos no lockfile; integridade verificada contra o pacote npm.
- Aplicação e Supabase em Docker, com conta sintética registrada e ambiente limitado a loopback.
- Teste de integração local de criptografia, isolamento, revisões e recuperação da coleção após novo login.
- Preparação de release SemVer com ZIP, checksum e commit; publicação final passa pelo ambiente GitHub `production`, com aprovação do mantenedor.

## [2.0.0] — 2026-10-19

- Google SSO como único login em produção.
- Chave RAWG, coleção e filtros criptografados no Supabase Vault; sessões em memória.
- Tutorial RAWG com capturas reais, exportação e exclusão dos dados do PlayNext.
- Código de produção anterior: `a575ae3b3724d6a9f7b71c709fb704143a9d12c1`.
