# DEV/AGENTS.md

Memória operacional do projeto. Leia nesta ordem e pare onde houver resposta:

1. `DEV/INDEX.md` — mapa.
2. `DEV/HANDOFF.md` — estado atual e próximos passos.
3. `DEV/CONTEXT.md` — contexto, comandos, riscos.
4. `DEV/SPECS/ACTIVE.md` — escopo vigente e aceite.
5. Só então o arquivo temático necessário.

Regras resumidas:

- `make verify` é o gate; `make verify-fast` é o atalho sem build Docker.
- Sem commit/push automático, sem chamada real a provider, sem segredo em log.
- Mudança substantiva atualiza `DEV/WORKLOG.md`, `DEV/VERIFY.md` e
  `DEV/HANDOFF.md`; mudança de escopo atualiza `DEV/SPECS/ACTIVE.md`.
- Novo documento em `DEV/` entra no índice.

Detalhes do contrato global: `AGENTS.md` na raiz do repositório.
