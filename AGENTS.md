# AGENTS.md — VPN Dev Workspace

Terminal Docker com tráfego forçado pela VPN (Gluetun + kill switch), OpenCode
v1/v2 dentro do túnel e scripts de operação no host.

## Ordem de leitura

1. `DEV/INDEX.md` — mapa da memória do projeto.
2. `DEV/HANDOFF.md` — estado atual e próximos passos.
3. `DEV/CONTEXT.md` — contexto, comandos e riscos.
4. `DEV/SPECS/ACTIVE.md` — escopo vigente e critérios de aceite.
5. Só então o detalhe temático em `DEV/`.

## Comandos

| Comando | Uso |
|---|---|
| `make verify` | Gate completo local/CI (sintaxe, compose, docs, testes, builds) |
| `make verify-fast` | Gate sem build das imagens Docker |
| `make lint` | Sintaxe + ShellCheck (host ou container) |
| `make test` | Suíte Linux |
| `node --test tests/opencode/*.test.mjs tests/control/*.test.cjs` | Testes Node |
| `./scripts/vpn-check --json` | Saúde do túnel/DNS (`{healthy, fails, checks[]}`) |
| `./scripts/vpn-doctor` | Diagnóstico completo do ambiente |
| `./scripts/vpn` | Dispatcher: `vpn sh`, `vpn run`, `vpn ai`, `vpn status` |

## Regras

- Sem commit e sem push automáticos; o maestro valida e autoriza.
- Sem chamadas reais a provider durante validação (gasta cota do usuário).
- Segredos nunca entram em logs, bundles, issues ou commits.
- O fallback de modelo do OpenCode só troca entre modelos **free**
  (provider `opencode`, custo explicitamente zero) e apenas em
  `provider.free-limit`; nenhum limite reinicia túnel ou troca IP.
- Recovery de rede só atua com o túnel confirmado como parado.
- Fora do container (`VPN_WORKSPACE_CONTAINER` diferente de `1`) os plugins de
  recuperação ficam inertes.

## Mapa

- `scripts/` — operação host (VPN, OpenCode, diagnóstico, CI local).
- `profiles/` — perfis de VPN por provider/protocolo.
- `opencode/v1`, `opencode/v2` — plugins de recuperação e fallback.
- `apps/control-plane` — dashboard local somente leitura.
- `tests/linux`, `tests/opencode`, `tests/control`, `tests/windows` — suítes.
- `docs/` — referência rápida e compatibilidade.

## Quando mudar X, atualize Y

- Scripts ou flags → `README.md`, `docs/TLDR.md`, `DEV/RUNBOOKS/`.
- Política de provider/fallback → `DEV/SPECS/ACTIVE.md`, `DEV/DECISIONS.md`.
- Verificação ou gate → `DEV/VERIFY.md`, `DEV/TESTING.md`.
- Qualquer entrega substantiva → `DEV/WORKLOG.md` e `DEV/HANDOFF.md`.
- Novo plano → `DEV/SPECS/` + link em `DEV/INDEX.md`.
