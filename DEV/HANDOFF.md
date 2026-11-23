# Active Handoff

## Troca dinâmica de modelo no OpenCode v2 — planejada

O [plano](SPECS/PLAN-OPENCODE-MODEL-FALLBACK.md) define três modelos por turno
selecionados pelo catálogo e reenvio automático após falha de cota quando o
turno for elegível. A primeira etapa é validar o evento, a identidade do turno
e a admissão do reenvio no v2.3.2 isolado com `429` simulado.

## Deep review corrigido — 2026-11-23 (commit local `134aadc`, sem push)

O maestro autorizou "ajuste tudo que encontrar"; os 30 achados do deep review
foram corrigidos e anexados localmente em `134aadc` (sem push). Destaques: guarda de
baseline do installer viva; rotate no-op retorna 3 e o auto-reconnect revalida
saúde (não declara mais healthy falso); restarts forçados têm piso de 60s
(`OPENCODE_NETWORK_RECOVERY_FORCE_MIN_INTERVAL_SECONDS`) e estado só é gravado
após sucesso; painel OpenCode e proxy HTTP recusam bind LAN sem senha no
próprio processo (`HOST_BIND_ADDRESS` agora chega ao supervisor/entrypoint);
supervisor não mata PID reutilizado nem rotaciona por prosa de log com VPN+app
saudáveis; journal de eventos poda no teto; UI não cai por erro de stream;
observer usa timeouts compatíveis com o vpn-check; session-sync tem heartbeat
de lock e purga de manifests antigos.

Ativação: scripts são bind mounts read-only — já valem nos containers. Os
plugins v1/v2 instalados na home são cópias: rodar `scripts/opencode-vpn-install`
e reabrir o OpenCode para carregar o código corrigido. O instalador corrigido
agora aplica o baseline mínimo de verdade (v2 < 2.2.6 é recusado).

Complemento do plano de achados remanescentes: revert do rotate falho agora é
exit 4 (3 continua no-op) e o índice de rotação falha alto; `vpn-reconnect`
confirma `status=stopped` antes do `running`; `vpn-auto-reconnect` usa
`XDG_STATE_HOME` no host e `/var/lib/vpn-control/auto-reconnect` no Compose
(healthcheck ajustado); supervisor não apaga o log se a poda falhar.
`verify-syntax` só avisa sobre ShellCheck ausente fora do CI.

Verificação: Linux 74/74, Node 51/51, verify-docs OK, sintaxe OK; ShellCheck e
verify-compose (docker) ausentes no ambiente atual — rodar na CI antes de
publicar. Evidências em `VERIFY.md`.

A release 1.3.1 está publicada no commit `c2b45d7c7b0d0e9a728fa4ee63d8474a23270dc8`.
CI, tag Git, release GitHub e imagens Docker locais estão registradas neste
handoff e em `VERIFY.md`.

## Correções locais após a release 1.2.0 — 2026-11-23

Implementados: comparação canônica dos bancos v1/v2 antes de importar,
recuperação de rede apenas diante de túnel explicitamente parado, verificação
local centralizada com a CI e bloqueio dos managed services v2 fora do baseline
testado 2.3.2 (canário isolado é opt-in). Recovery detém o lock compartilhado
de mutação VPN desde o diagnóstico até o reconnect. A validação CLI foi executada em
container descartável sem rede nos dois sentidos v1↔v2, com verificação `after`.
`make verify` passou; evidências detalhadas estão em `VERIFY.md`.

## Release 1.3.1 — restart de túnel em HTTP 429

O pedido atual altera a política: erro estruturado `rate_limit`/HTTP 429
reinicia o perfil VPN atual via `vpn-reconnect`, mesmo se Gluetun reportar o
túnel saudável. Isso não escolhe outro servidor, troca modelo nem repete a
requisição. O lock de mutação VPN e o timeout continuam; o cooldown comum não
bloqueia esse restart e eventos duplicados da mesma sessão/classe seguem o TTL
de deduplicação. A release `1.3.1` foi publicada após o gate local e a CI.

Verificação local concluída: `make verify` passou (Linux 65/65, suites
Node/control, 8 perfis Compose, docs, ShellCheck/sintaxe e builds Docker). Os
casos de 429 e falha do toast foram simulados; não houve provider real nem
mutação do túnel. CI run `45174698361` passou os quatro jobs. A tag anotada
`1.3.1` aponta para o commit acima e a [GitHub Release 1.3.1](https://github.com/kivervinicius/vpn-dev-workspace/releases/tag/1.3.1)
foi publicada.

Imagens locais do gate: `vpn-dev-workspace-terminal:1.3.1`
(`a8b7535b04dc`) e `vpn-dev-workspace-gluetun:1.3.1`
(`ccc655126ca2`). Nenhuma imagem foi enviada a registry.

Não foi feita chamada real a provider.

Após o relato de que o banner/restart não ocorreu, inspeção do container
encontrou plugins antigos em `$HOME` e ausência de
`/usr/local/bin/opencode-network-recover` (o container precede o mount novo do
Compose). `opencode-vpn-install` atualizou os plugins; comparação recursiva
confirma igualdade com os arquivos 1.3.1. O helper atual foi copiado ao
container sem recriar a stack. E2E sintético no plugin v2 instalado, usando
`provider.free-limit` com status 429 e helper stub, confirmou toast e
`--force-restart`; nenhum reconnect real foi disparado.

O instalador mostrou erros aritméticos ao checar a versão v2, mas completou a
instalação; a falha de parsing do baseline ficou registrada no backlog para
correção separada.

Após o pedido para montar todos os projetos, o serviço `terminal` foi recriado
isoladamente com `/projetos:/projetos`; `/projetos/desktop-v2` agora existe no
container. VPN e auto-reconnect permaneceram ativos e saudáveis (VPN check
passou). Os processos OpenCode do terminal anterior foram encerrados. Inicie a
nova sessão com `docker exec -it -w /projetos/desktop-v2 vpn-dev-workspace-terminal-1 opencode2 --yolo`.
PRs #7/#8 foram comparadas: não são seguras para merge como estão; #7 está com
`validate` vermelho, e #8 inclui rotação VPN em limite de provider HTTP 429,
contrária à política atual. Ambas continuam abertas no GitHub.

Pendências de ambiente: conexão real do Desktop App, staging SQLite com Docker
Desktop em Windows, e teste `read_only+tmpfs` nos serviços que gravam estado.
O timer local de atualização automática também pode instalar v2 além do baseline
testado; é preciso coordenar pin/validação antes de atualizar serviços gerenciados.

## Release 1.3.0 — publicada

- Tag Git anotada `1.3.0` e GitHub Release
  [VPN Dev Workspace 1.3.0](https://github.com/kivervinicius/vpn-dev-workspace/releases/tag/1.3.0)
  apontam para o commit `f9d5ccb9738b1b68aaba82ace77a59c9b921e943` em `master`.
- GitHub Actions
  [run 45115003447](https://github.com/kivervinicius/vpn-dev-workspace/actions/runs/45115003447)
  passou os quatro jobs para esse commit.
- Imagens locais `vpn-dev-workspace-terminal:1.3.0` e
  `vpn-dev-workspace-gluetun:1.3.0` foram marcadas com os builds aprovados.
  Os containers em uso permanecem na versão anterior; nenhum recreate foi feito.

## Release plan 1.3.0 — concluído

- Version: minor `1.3.0`; no database schema migration. The new recovery state is
  a separate JSON timestamp and rollback ignores it.
- Compatibility: managed OpenCode services require v2 **2.3.2**. Version
  exceptions are only for an isolated canary with `OPENCODE_V2_ALLOW_UNVERIFIED`.
- Secrets: no new secret or credential is required. No provider request was
  made during verification.
- Order: local `make verify` → push `master` → hosted Linux/Windows and security
  CI success → tag and publish 1.3.0. Completed. Keep the running Compose
  stack on its existing image until a maintenance window with OpenCode closed.
- Smoke/rollback: after a later recreate, run `vpn-check --json` (6 checks),
  `opencode1/2 --version`, session-sync status and managed service `--check`.
  Keep release 1.2.0 images/tags available for rollback. Owner: project
  maintainer.

Updated: 2026-11-23

## E2E local Docker — 2026-11-22

A última verificação local confirmou Compose ativo no checkout principal com
NordVPN OpenVPN. VPN, DNS, IP público e host interno passaram 6/6. OpenCode
v1.19.6 e v2.3.2 responderam no terminal. O servidor Desktop/Web passou HTTP
200 autenticado durante teste temporário e foi encerrado. Ver
[VERIFY.md](VERIFY.md) para evidências. O endpoint Desktop/Web ficou desligado
ao final, conforme estava antes do teste.

## Current state

Release 1.2.0 is published: annotated Git tag and GitHub Release
[VPN Dev Workspace 1.2.0](https://github.com/kivervinicius/vpn-dev-workspace/releases/tag/1.2.0)
point to commit `2210100ecc99f2d8cb097a86839538d36fbce10e` on `master`.
GitHub Actions run
[45032833141](https://github.com/kivervinicius/vpn-dev-workspace/actions/runs/45032833141)
passed all four jobs for this exact commit. Local terminal and Gluetun images
were built and tagged `:1.2.0`. The running Compose stack remains on the
previous local installation and was not redeployed.

Release 1.1.0 is published: annotated Git tag `1.1.0` and GitHub Release
[VPN Dev Workspace 1.1.0](https://github.com/kivervinicius/vpn-dev-workspace/releases/tag/1.1.0)
both point to commit `3671a78506ee826ba84dbd72d98b697e3ce81862`
(`docs(release): prepare 1.1.0 changelog`) on local and remote `master`.
GitHub Actions run
[`45024958928`](https://github.com/kivervinicius/vpn-dev-workspace/actions/runs/45024958928)
passed all four jobs for this exact commit.

The existing Compose project has been recreated from the main checkout
`/projetos/vpn-dev-workspace`, not the temporary integration worktree. The
terminal, VPN and auto-reconnect services are up; Gluetun and auto-reconnect
are healthy; `vpn-check` passed 6/6 in the terminal and 5/5 on the host. The
container bind-mounts the main checkout, and the persistent state volume was
retained.

Previous local work is recoverable: stash
`377397b7f6731230749e3d806bcdeecd40d0f825` contains the dirty and untracked
`feat/vpn-unified-ia` work; `archive/master-before-1.1.0-357a33d` preserves the
old local master. Three old Docker images remain tagged
`vpn-v1v2-integration:rollback-*-before-1.1.0-20261122`. Current local images
also have `:1.1.0` tags; no image was published to a registry.

The old `/tmp/vpn-v1v2-integration` worktree remains on the pushed integration
branch because it contains ignored `.hosts.local.gen` and
`.vpn-control-lock/operation.lock` files. It is inactive; the running Compose
project mounts the main checkout.

## Confirmar a versão instalada

- `git rev-parse '1.1.0^{commit}'` identifica o commit exato do release; `master`
  está alguns commits à frente somente por atualizações de documentação DEV.
- Compare os IDs de `docker image inspect vpn-dev-workspace-terminal:1.1.0
  --format '{{.Id}}'` e `docker inspect vpn-dev-workspace-terminal-1
  --format '{{.Image}} {{index .Config.Labels "com.docker.compose.project.working_dir"}}'`.
  Os IDs devem coincidir e o caminho exibido deve ser o checkout principal.
- `docker exec vpn-dev-workspace-terminal-1 vpn-check --json` confirma a saúde
  da versão em execução; `gh release view 1.1.0` ou o link acima confirma a
  publicação no GitHub.

## Implemented

- Cross-version sessions use native JSON export/import, schema conversion,
  linked target IDs, an owner-only ledger, locking, verification by target
  re-export, and pending states for unsupported content. No database file is
  copied between v1 and v2.
- Provider quota, rate-limit, auth, account, and credit events are status-only.
  They never change VPN/model or replay prompts/tools. Network recovery is
  separate and requires a confirmed connectivity failure; session resume is
  manual after exact-session verification.
- Windows SQLite staging reports push failures and does not publish or apply
  stale snapshots. Compose mounts the cross-version helper separately.
- Tested baseline is v1 1.19.6 and v2 2.3.2. The Docker fallback pin and
  release hashes now match v1 1.19.6.

## Verification

- Node suites: 37/37 passed (`tests/opencode` + `tests/control`).
- Linux shell suite: 60/60 passed in three consecutive runs after hardening the
  per-connection HTTP fixture against `socat` forked-stdin races.
- `verify-docs`, `verify-compose`, shell/Node syntax, `git diff --check`, and
  PowerShell parser checks passed.
- ShellCheck `-S error` passed in an ephemeral Ubuntu 24.04 container.
- Terminal and local Gluetun image builds passed; the Gluetun build ran both Go
  test packages. Gitleaks scanned 232 commits and the worktree with no findings.
- Actual v1/v2 native CLI transfer was exercised earlier in this task with
  synthetic sessions and isolated temporary data homes; no active user DB or
  real provider request was used.
- Runtime deployment through `vpn-switch nordvpn-openvpn` passed from the main
  checkout: Gluetun and `vpn-auto-reconnect` are healthy, `vpn-check` reports
  6/6 checks in the terminal and 5/5 on the host, and the container reports
  OpenCode v1 1.19.6, v2 2.3.2, Node 22.17.0. Compose project working
  directory and workspace mount both point to `/projetos/vpn-dev-workspace`.
- Previous images are retained under
  `vpn-v1v2-integration:rollback-*-before-1.1.0-20261122`; current images have
  local `vpn-dev-workspace-*:1.1.0` aliases.
- GitHub Actions run `45024958928` for exact commit `3671a785` passed
  `validate`, `validate-windows-cli`, `supply-chain`, and `secret-scan`.
- Pester is unavailable in this Linux environment; Windows tests ran on the
  hosted Windows runner. The live Docker Desktop SQLite staging path remains
  unverified.

## Future Windows validation

- When a Windows host is available, run real SQLite staging checks with Docker
  Desktop. This is required to claim the Windows path validated, but is not a
  prerequisite for the Linux-first initial use.
- The live Desktop App reconnect remains untested.

## Delivery constraints

- The maestro authorized the 1.1.0 GitHub release and local runtime cutover.
  Do not publish a container image to a registry; none is part of this release.
- Detailed evidence: `VERIFY.md`; chronological record: `WORKLOG.md`;
  task contract: `SPECS/ACTIVE.md`.
