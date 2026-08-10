# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-08-10
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: objetivo documental consolidado.
- Spec: `SPECS/ACTIVE.md`.
- Changed: README, exemplo, especificação, arquitetura, decisões e verificador descrevem e protegem o contrato de terminal como extensão direta do host pela VPN.
- Verified: sintaxe do verificador, `verify-docs`, `verify-compose` e `git diff --check`; `VERIFY.md`.
- Risks: o terminal tem leitura e escrita em toda a home montada; a API do Gluetun v3.40 ainda avisa que duas rotas locais usam a política padrão de autenticação.
- Next context: inicie por `./scripts/vpn-switch <perfil>`; ao atualizar o OpenCode do host, atualize também a versão e os checksums da imagem, preservando o contrato documentado.

## Recent Entries

- 2026-08-10 — implementação e validação concluídas.
