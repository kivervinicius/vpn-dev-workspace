# Active Spec - vpn-dev-workspace

## Goal

- Oferecer um terminal VPN que funcione como extensão direta do host, preservando home, workspace, ferramentas e referências absolutas, com Zsh, recuperação automática autorizada, diagnóstico, dashboard de saúde, acesso opcional à rede interna do host e GUI do OpenCode pelo túnel — com scripts robustos (sem hangs, falhas claras) e documentação que não descola do código.

## Delivery mode

- Linux-first: the initial Linux workflow is the delivery target for this task.
  Passing Linux, Node, Compose, documentation, syntax, and image-build checks is
  sufficient for initial Linux use.
- Windows support remains implemented, but Pester and real Docker Desktop
  SQLite staging validation are deferred until a Windows host is available.
  Complete those checks before claiming the Windows path validated; they are
  not a prerequisite for initial Linux use.

## In Scope

- Documentação, imagem Docker, Compose, scripts de operação, CI e memória DEV.
- Alinhamento do OpenCode da imagem com o host e montagem integral da home no mesmo caminho.
- Correção do `vpn-reconnect` para aguardar e imprimir o IP público após a reconexão.
- Saúde do ambiente: `vpn-check` (túnel, IP, DNS do túnel e checagem básica de vazamento de DNS), `vpn-top` (dashboard), `vpn-server-rotate` (troca de servidor pela API de controle) e rotação automática opt-in no `vpn-auto-reconnect`.
- Gluetun v3.41.3 com base em digest fixado e imagem local `v3.41.3-publicip-recovery.1` (fonte e sha256 fixados em `gluetun/Dockerfile`; retry da coleta de IP público e `PUBLICIP_API=ifconfigco`), `jq` na imagem e DNS resolvido pelo túnel (`dns: 127.0.0.1`).
- Acesso opcional à rede interna do host: `FIREWALL_SUBNETS` (sub-rede da LAN detectada pelo `vpn-switch` + extras), `INTERNAL_DNS`/`INTERNAL_DNS_EXEMPT_HOSTNAMES` para nomes internos e `INTERNAL_TEST_HOST` no `vpn-check`.
- Paridade de home: `HOST_UID`/`HOST_GID` na imagem e mounts opcionais de `SSH_AUTH_SOCK` e `RUN_USER_DIR` no terminal.
- GUI do OpenCode pela VPN: `scripts/vpn-opencode` mantém `web`/`serve` e adiciona `supervise`; o processo roda no namespace VPN, sem Docker socket. Queda simples reinicia só o app; apenas desconexão confirmada ou túnel unhealthy dispara recuperação de rede e confirmação de saúde antes do restart. O supervisor verifica a sessão exata e informa retomada manual; não repete a requisição interrompida.
- Provider policy: plugins reconhecem apenas eventos estruturados e são status-only para quota, autenticação, conta, crédito e rate-limit. Não alteram VPN/modelo nem iniciam retry, replay de prompt ou replay de ferramentas; `Retry-After` serve somente para exibir countdown.
- Session sync v1/v2: baseline v1 1.19.6 e v2 2.3.2. Launchers TUI sincronizam as cinco sessões recentes por workspace com native JSON export/import e IDs mapeados. `--session <id>` inclui uma sessão antiga explicitamente. Textos, raciocínio e resultados de ferramentas concluídas são convertidos; anexos, ferramentas ativas e conteúdo não suportado ficam pendentes sem conversão lossiva. Bancos não são copiados entre versões.
- Windows: staging do SQLite v2 host/container permanece separado da conversão cross-version. Falha de push retorna status não-zero e impede aplicar snapshot antigo.
- Como as configurações globais dos plugins podem ser compartilhadas com o host, v1/v2 só registram recuperação/notificações quando `VPN_WORKSPACE_CONTAINER=1`; fora do container são inertes.
- Launchers do host devem delegar para launchers dentro do container e herdar `HOME`/XDG do Compose; o `service.json` do container fica separado do serviço iniciado diretamente no host, mesmo quando o shell do host usa home de perfil.
- Caminho do host: a API de controle do Gluetun é publicada no host em `127.0.0.1:${VPN_CONTROL_PORT:-18000}` (dentro dos containers continua `127.0.0.1:8000`); os scripts de host (`vpn-check/status/top/server-rotate/reconnect`) usam esse default via `vpn-control-api.sh` (`VPN_CONTROL_FORCE_HOST=1` força o modo host em testes), com fallback de segredo em `<repo>/.secrets/gluetun_api_key`. Publicar a porta exige recreate da stack via `vpn-switch`.
- Lock/estado unificados: o lock usa candidatos graváveis (`VPN_CONTROL_LOCK_FILE` explícito → `VPN_CONTROL_LOCK_DIR` → `<repo>/.vpn-control-lock`, que é o mesmo bind mount do container `/run/vpn-control-lock` → `/run/vpn-control-lock` → `/var/lib/vpn-control` → `$HOME`); estados (`vpn-rotate.index`, `opencode-limit-recovery.json`) preferem `/var/lib/vpn-control` no container e caem para `<repo>/.vpn-control-state/` no host.
- Rotação robusta: `vpn-server-rotate` faz snapshot da seleção anterior e reverte (PUT de restauração + reconnect best-effort) quando o PUT falha, a reconexão falha ou o túnel fica insaudável ao final; `--random` escolhe dentro de `VPN_SERVER_HOSTNAMES` (preserva a lista no runtime em vez de limpá-la até o próximo recreate).
- `vpn-opencode check` é observacional; `opencode-supervisor` recupera somente queda de processo ou desconexão/túnel unhealthy reais. `OPENCODE_AUTOCHECK` permanece apenas observacional.
- Robustez dos scripts: timeouts em todo I/O de rede (`--connect-timeout/--max-time`, `timeout 5` no TCP), checagem explícita de dependências (`need()`), sem aborts crípticos de `set -e`, `trap` em loops/sleeps longos, validações de porta/intervalo.
- Docs como contrato: `TESTING.md` preenchido, `BACKLOG.md` com pendências triadas, `verify-docs` trava drifts (versões, `SERVER_HOSTNAMES`, `PATH` host-first, `INTERNAL_TEST_PORT`, `LOCAL_HOSTS`).
- Hosts locais: `LOCAL_HOSTS` (`nome=ip`) vira snippet injetado no `/etc/hosts` do terminal pós-up via `vpn-switch` (sem Gluetun/DNS envolvido); `vpn-hosts-import --domain` sugere a linha a partir do `/etc/hosts` do host; `vpn-check` valida cada mapeamento.
- CLI scriptável: `--json`/`-q` em status/check/top e `opencode check`, `check --only`, exit 0/1 (opencode: `0`=ok, `1`=down|quota), `--help` em todos, `opencode stop/status/logs/check/watch`, rotate com `--to/--list` + periódica opt-in.
- DNS interno correto: modo plain automático; proxy HTTP opt-in; hardening base do Compose.
- Windows: interface PowerShell sem distribuição WSL, override Compose com
  workspace em `/workspace`, home Linux persistente e ponte temporária para o
  agente OpenSSH do Windows; WSL2 mantém o fluxo Bash sem autodetectar a LAN.

## Out Of Scope

- Integrações de VPN fora dos perfis existentes, exposição na internet pública, mecanismos de evasão, proxy/SOCKS e port forwarding por provedor.

## Acceptance

- OpenCode baseline is v1 1.19.6 and v2 2.3.2; recent sessions sync between clients through native JSON conversion with verified detached target IDs. Unsafe or unsupported transcript content is reported pending without loss.
- Provider quota/auth/account/credit/rate-limit events only notify. They never change VPN/model or trigger automatic retry/replay; confirmed network recovery remains separate and returns a manual resume command for the verified session.
- Windows same-version SQLite staging reports push failures and never applies
  stale snapshots; cross-version session sync remains native JSON inside the
  Linux terminal. Real Docker Desktop staging validation is deferred to a
  Windows host and is not a gate for the Linux-first initial use.
- Todos os perfis validam; documentação e scripts passam; terminal não usa root; a recuperação confirma IP público.
- `vpn-reconnect` imprime o IP público após a reconexão (bug corrigido), com polling até o Gluetun publicá-lo.
- `vpn-check`, `vpn-top` e `vpn-server-rotate` funcionam; rotação automática permanece desligada por padrão e opera sem o socket Docker.
- A home e o workspace do host são visíveis nos mesmos caminhos, e o OpenCode no terminal corresponde ao OpenCode do host.
- Com a LAN/interno configurados, `vpn-check` alcança `INTERNAL_TEST_HOST` e o firewall libera apenas a sub-rede da rota padrão + `FIREWALL_SUBNETS`. Validado em runtime: `http://PRIVATE_IP_REDACTED/ → 200` pelo túnel e `vpn-check` todo ok.
- O terminal herda UID/GID do host; com `SSH_AUTH_SOCK` definido, `ssh-add -l` dentro do terminal lista as chaves da sessão do host. Validado: chave `gitlab-ci-lightsaber-deploy` listada.
- `vpn-opencode web` abre o painel em `http://127.0.0.1:${OPENCODE_GUI_PORT}` com o tráfego saindo pela VPN; `vpn-opencode serve` expõe a ponta para o Desktop App. Validado: `401` sem senha / `200` com basic auth (`web`) e `200` servindo o app (`serve`); conexão real do Desktop App pendente.
- `vpn-opencode check` distingue `ok|down|quota` (`--json` com `{status,port,detail}`); `watch` inicia o `opencode-supervisor`. O check é observacional e não dispara recovery. O supervisor recupera somente queda de processo ou desconexão/túnel unhealthy reais; não classifica limites de provider por texto/logs.
- Todos os eventos estruturados de limite do provider resultam apenas em notificação; nenhum aciona VPN/modelo, retry ou replay. `Retry-After` é apresentado como dado informativo.
- Launchers v1/v2 copiam sessões suportadas por JSON nativo em vez de copiar arquivos de banco entre versões. Conversões são verificadas por re-exportação do alvo e protegidas por ledger/lock.
- Os plugins VPN compartilhados são inertes quando o OpenCode roda fora do container (`VPN_WORKSPACE_CONTAINER` ausente ou diferente de `1`).
- Em v1, o plugin tenta cancelar retries estruturados quando a API confirma o abort e notifica; v2 define `retry: false` no hook do servidor e a TUI notifica. Nenhum caminho envia uma nova requisição.
- Scripts falham rápido e claro: `curl` nunca pendura (>10s), `vpn-check` valida `INTERNAL_TEST_PORT` e limita o TCP a 5s, `vpn-top` sobrevive a falha transitória de settings, `vpn-server-rotate` ignora hostnames vazios/espaçados, helpers resolvem via PATH com fallback.
- Docs acompanham o código: sem menção a `v3.40.0`/`1.18.16`, `INTERNAL_TEST_PORT` e `OPENVPN_PROTOCOL` documentados, `protonvpn-wireguard` com `SERVER_HOSTNAMES` como os demais.
- Com `LOCAL_HOSTS=gitlab.internal.example=<ip>`, `getent hosts gitlab.internal.example` no terminal retorna o IP e o `vpn-check` marca ok (alcance real exige a sub-rede em `FIREWALL_SUBNETS`). Validado via fixtures; runtime com túnel real pendente no host.
- `vpn-top` renderiza a seção Gluetun com chave válida e avisa graciosamente sem ela; `vpn-check --json` emite `{healthy, fails, checks[]}` e sai 0/1; `vpn-server-rotate --list` funciona sem API.
- Com `INTERNAL_DNS`, o Compose recebe `DNS_UPSTREAM_RESOLVER_TYPE=plain` (Gluetun obedece ao upstream plain); `verify-docs` trava o modo.
- `scripts/vpn.ps1` valida Compose >= 2.24.4, perfil, portas, segredos e
  healthcheck; os testes PowerShell simulam Docker e rejeitam perfis inválidos,
  caminhos/hosts inválidos e segredos ausentes.
- Toolchain: Node `22.23.2`, OpenCode baseline v1 `1.19.6`/v2 `2.3.2`, base Ubuntu 24.04 LTS (digest do índice multi-arch), CI `ubuntu-24.04` com validação, secret-scan (gitleaks) e supply-chain (trivy).

## Constraints

- Sem segredos em logs ou Git; bind LAN somente em endereço explícito; sem commits automáticos.
- A home montada deve pertencer ao usuário que inicia o Compose, pois o terminal tem acesso de leitura e escrita a ela. `rw` é o padrão para compartilhar e persistir configuração, autenticação e sessões do OpenCode; `ro` fica restrito a fluxos somente leitura.
- Troca de servidor apenas pelo HTTP Control Server do Gluetun (autenticado), sem socket Docker.
- Com `INTERNAL_DNS` ativo, `INTERNAL_DNS_RESOLVERS` deve ficar vazio (upstream único).
- Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.

## Verification Plan

- Run `node --test tests/opencode/*.test.mjs tests/control/*.test.cjs`, the Linux shell suite, `verify-docs`, `verify-compose`, shell/Node syntax checks, and `git diff --check` after changes.
- Exercise v1/v2 CLI transfer only with synthetic sessions and isolated temporary data homes; never access an active user database during test runs.
- Linux-first gate: run Linux/Node tests, documentation and Compose validation, syntax checks, `git diff --check`, and Docker build. This gate is sufficient for initial Linux use.
- Windows validation gate: run Pester and verify real Docker Desktop SQLite mounts/staging when a Windows host is available; complete it before claiming Windows support validated.
- Do not make provider requests to validate notification-only policy. Any real provider probe requires explicit user authorization because it consumes a request.

## Status

- State: cross-version session sync, provider status-only policy, and truthful
  Windows staging status are implemented. The Linux-first gate passed in the
  isolated integration worktree, and the updated Linux stack is running with
  all six VPN checks healthy. Deferred Windows validation does not block initial
  Linux use. See `HANDOFF.md` and `VERIFY.md` for evidence and limits.
- Pending: commit/push the integration branch (authorized by the maestro) and
  review CI checks; Pester and real Docker Desktop SQLite staging remain future
  Windows-host validation. No merge or registry image publication was requested.
- Owner: Codex
- Last updated: 2026-11-22
