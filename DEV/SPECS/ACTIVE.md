# Active Spec - vpn-dev-workspace

## Goal

- Oferecer um terminal VPN que funcione como extensão direta do host, preservando home, workspace, ferramentas e referências absolutas, com Zsh, recuperação automática autorizada, diagnóstico, dashboard de saúde, acesso opcional à rede interna do host e GUI do OpenCode pelo túnel — com scripts robustos (sem hangs, falhas claras) e documentação que não descola do código.

## In Scope

- Documentação, imagem Docker, Compose, scripts de operação, CI e memória DEV.
- Alinhamento do OpenCode da imagem com o host e montagem integral da home no mesmo caminho.
- Correção do `vpn-reconnect` para aguardar e imprimir o IP público após a reconexão.
- Saúde do ambiente: `vpn-check` (túnel, IP, DNS do túnel e checagem básica de vazamento de DNS), `vpn-top` (dashboard), `vpn-server-rotate` (troca de servidor pela API de controle) e rotação automática opt-in no `vpn-auto-reconnect`.
- Gluetun v3.41.3 com base em digest fixado e imagem local `v3.41.3-publicip-recovery.1` (fonte e sha256 fixados em `gluetun/Dockerfile`; retry da coleta de IP público e `PUBLICIP_API=ifconfigco`), `jq` na imagem e DNS resolvido pelo túnel (`dns: 127.0.0.1`).
- Acesso opcional à rede interna do host: `FIREWALL_SUBNETS` (sub-rede da LAN detectada pelo `vpn-switch` + extras), `INTERNAL_DNS`/`INTERNAL_DNS_EXEMPT_HOSTNAMES` para nomes internos e `INTERNAL_TEST_HOST` no `vpn-check`.
- Paridade de home: `HOST_UID`/`HOST_GID` na imagem e mounts opcionais de `SSH_AUTH_SOCK` e `RUN_USER_DIR` no terminal.
- GUI do OpenCode pela VPN: `scripts/vpn-opencode` mantém `web`/`serve` e adiciona `supervise`; o processo roda no namespace VPN, sem Docker socket. Queda simples reinicia só o app; apenas desconexão real ou túnel unhealthy dispara recuperação VPN e confirmação de saúde antes do restart. Sessão persistida é verificada, sem replay automático da requisição interrompida.
- Plugins das versões fixadas classificam somente eventos e campos estruturados. Free-tier e HTTP 429/rate-limit trocam servidor/IP automaticamente; account/credit não alteram a VPN. Texto arbitrário e logs nunca acionam recuperação.
- Recuperação por limite exige túnel running, IP público válido e IP de saída diferente, serializa alterações por lock compartilhado, aplica cooldown de 300 s, limita a 6 eventos por janela móvel de 3600 s e até 3 alvos distintos por evento. Timeout do helper: 600 s. Best effort; troca de IP não garante reset de quota.
- v1: retry estruturado só solicita recovery após abort confirmado; erro terminal estruturado não exige abort. v2: hook do servidor veta retry classificado e um único `session.execution.failed` da TUI pode recuperar; headless não tem recovery TUI. Nenhum plugin reenvia prompt.
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

- Todos os perfis validam; documentação e scripts passam; terminal não usa root; a recuperação confirma IP público.
- `vpn-reconnect` imprime o IP público após a reconexão (bug corrigido), com polling até o Gluetun publicá-lo.
- `vpn-check`, `vpn-top` e `vpn-server-rotate` funcionam; rotação automática permanece desligada por padrão e opera sem o socket Docker.
- A home e o workspace do host são visíveis nos mesmos caminhos, e o OpenCode no terminal corresponde ao OpenCode do host.
- Com a LAN/interno configurados, `vpn-check` alcança `INTERNAL_TEST_HOST` e o firewall libera apenas a sub-rede da rota padrão + `FIREWALL_SUBNETS`. Validado em runtime: `http://192.168.30.20/ → 200` pelo túnel e `vpn-check` todo ok.
- O terminal herda UID/GID do host; com `SSH_AUTH_SOCK` definido, `ssh-add -l` dentro do terminal lista as chaves da sessão do host. Validado: chave `gitlab-ci-lightsaber-deploy` listada.
- `vpn-opencode web` abre o painel em `http://127.0.0.1:${OPENCODE_GUI_PORT}` com o tráfego saindo pela VPN; `vpn-opencode serve` expõe a ponta para o Desktop App. Validado: `401` sem senha / `200` com basic auth (`web`) e `200` servindo o app (`serve`); conexão real do Desktop App pendente.
- `vpn-opencode check` distingue `ok|down|quota` (`--json` com `{status,port,detail}`); `watch` inicia o `opencode-supervisor`. O check é observacional e não dispara recovery. O supervisor recupera somente queda de processo ou desconexão/túnel unhealthy reais; não classifica limites de provider por texto/logs.
- Os plugins v1/v2 classificam apenas campos/eventos estruturados: free-tier e HTTP 429/rate-limit estruturado acionam troca VPN automaticamente; account/credit nunca alteram VPN. A ação exige túnel saudável e IP válido diferente, lock compartilhado e limites de cooldown/orçamento/alvos definidos acima. Não garante reset de quota.
- Em v1, retry exige abort confirmado antes de solicitar a mudança; erro terminal estruturado não exige abort. Em v2, hook server veta retries estruturados e um único evento TUI `session.execution.failed` dispara recovery; headless não tem recovery TUI. Nenhum plugin reproduz prompt.
- Scripts falham rápido e claro: `curl` nunca pendura (>10s), `vpn-check` valida `INTERNAL_TEST_PORT` e limita o TCP a 5s, `vpn-top` sobrevive a falha transitória de settings, `vpn-server-rotate` ignora hostnames vazios/espaçados, helpers resolvem via PATH com fallback.
- Docs acompanham o código: sem menção a `v3.40.0`/`1.18.16`, `INTERNAL_TEST_PORT` e `OPENVPN_PROTOCOL` documentados, `protonvpn-wireguard` com `SERVER_HOSTNAMES` como os demais.
- Com `LOCAL_HOSTS=gitlab.omega=<ip>`, `getent hosts gitlab.omega` no terminal retorna o IP e o `vpn-check` marca ok (alcance real exige a sub-rede em `FIREWALL_SUBNETS`). Validado via fixtures; runtime com túnel real pendente no host.
- `vpn-top` renderiza a seção Gluetun com chave válida e avisa graciosamente sem ela; `vpn-check --json` emite `{healthy, fails, checks[]}` e sai 0/1; `vpn-server-rotate --list` funciona sem API.
- Com `INTERNAL_DNS`, o Compose recebe `DNS_UPSTREAM_RESOLVER_TYPE=plain` (Gluetun obedece ao upstream plain); `verify-docs` trava o modo.
- `scripts/vpn.ps1` valida Compose >= 2.24.4, perfil, portas, segredos e
  healthcheck; os testes PowerShell simulam Docker e rejeitam perfis inválidos,
  caminhos/hosts inválidos e segredos ausentes.
- Toolchain: Node `22.23.2`, OpenCode `1.18.31`, base Ubuntu 24.04 LTS (digest do índice multi-arch), CI `ubuntu-24.04` com jobs de validação, secret-scan (gitleaks) e supply-chain (trivy) — SHAs/digest verificados na origem e build revalidado na CI (2026-10-30).

## Constraints

- Sem segredos em logs ou Git; bind LAN somente em endereço explícito; sem commits automáticos.
- A home montada deve pertencer ao usuário que inicia o Compose, pois o terminal tem acesso de leitura e escrita a ela.
- Troca de servidor apenas pelo HTTP Control Server do Gluetun (autenticado), sem socket Docker.
- Com `INTERNAL_DNS` ativo, `INTERNAL_DNS_RESOLVERS` deve ficar vazio (upstream único).
- Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.

## Verification Plan

- Passed: OpenCode adapters **8/8**, Linux suite **45/45** (inclui 2 testes de bind LAN do painel), `verify-docs`, `verify-compose` (8 profiles), changed-script `bash -n`, and Docker image/runtime deployment.
- Runtime: both installed clients were exercised against a local mock returning structured HTTP 429. v1 changed egress `189.1.170.10` → `189.1.170.177` on br71; v2 changed `189.1.170.177` → `189.1.168.12` on br72. Recovery state confirmed each target and IP transition; final `vpn-check` passed **6/6**. Plugin discovery confirmed v2 `vpn-recovery`.
- Limits: no real provider quota was used; provider quota reset is not guaranteed by IP change. The pre-existing managed v2 service was not changed; its occupied port required standalone mode for the v2 TUI E2E.

## Status

- State: implementation, deployment and both runtime recovery paths verified; active VPN is healthy on `br72.nordvpn.com` (`189.1.168.12`). OpenCode `1.19.5` and `2.1.3` are available through the VPN terminal.
- Owner: Codex
- Last updated: 2026-10-30 (see HANDOFF/VERIFY/WORKLOG for runtime evidence)
