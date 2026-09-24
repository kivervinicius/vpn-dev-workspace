# Active Spec - vpn-dev-workspace

## Goal

- Oferecer um terminal VPN que funcione como extensão direta do host, preservando home, workspace, ferramentas e referências absolutas, com Zsh, recuperação automática autorizada, diagnóstico, dashboard de saúde, acesso opcional à rede interna do host e GUI do OpenCode pelo túnel — com scripts robustos (sem hangs, falhas claras) e documentação que não descola do código.

## In Scope

- Documentação, imagem Docker, Compose, scripts de operação, CI e memória DEV.
- Alinhamento do OpenCode da imagem com o host e montagem integral da home no mesmo caminho.
- Correção do `vpn-reconnect` para aguardar e imprimir o IP público após a reconexão.
- Saúde do ambiente: `vpn-check` (túnel, IP, DNS do túnel e checagem básica de vazamento de DNS), `vpn-top` (dashboard), `vpn-server-rotate` (troca de servidor pela API de controle) e rotação automática opt-in no `vpn-auto-reconnect`.
- Gluetun v3.41.3 (digest fixado), `jq` na imagem e DNS resolvido pelo túnel (`dns: 127.0.0.1`).
- Acesso opcional à rede interna do host: `FIREWALL_SUBNETS` (sub-rede da LAN detectada pelo `vpn-switch` + extras), `INTERNAL_DNS`/`INTERNAL_DNS_EXEMPT_HOSTNAMES` para nomes internos e `INTERNAL_TEST_HOST` no `vpn-check`.
- Paridade de home: `HOST_UID`/`HOST_GID` na imagem e mounts opcionais de `SSH_AUTH_SOCK` e `RUN_USER_DIR` no terminal.
- GUI do OpenCode pela VPN: `scripts/vpn-opencode` mantém `web`/`serve` diretos e adiciona `supervise`; o serviço `opencode-supervisor` possui o processo OpenCode dentro do namespace da VPN, sem Docker socket. Queda simples reinicia só o app; desconexão ou provider rate limit/429 dispara rotação pelo Control Server do Gluetun, aguarda túnel saudável e sobe novamente o OpenCode, com cooldown/janela/máximo de rotações. `Go limit reached`/`account_rate_limit` é tratado separadamente sem rotação inútil de VPN. `OPENCODE_AUTOCHECK` permanece apenas observacional.
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
- `vpn-opencode check` distingue `ok|down|quota` (`--json` com `{status,port,detail}`); `watch` reinicia só `down` com limite e nunca reinicia `quota` (alerta puro); com `OPENCODE_AUTOCHECK=true`, o `vpn-auto-reconnect` só alerta sem reconectar o túnel. Tudo opt-in, desligado por padrão.
- `vpn-reconnect` recupera e imprime o IP público após a reconexão. Validado: `IP público: 189.1.168.191` (com servidor fixado via API).
- Scripts falham rápido e claro: `curl` nunca pendura (>10s), `vpn-check` valida `INTERNAL_TEST_PORT` e limita o TCP a 5s, `vpn-top` sobrevive a falha transitória de settings, `vpn-server-rotate` ignora hostnames vazios/espaçados, helpers resolvem via PATH com fallback.
- Docs acompanham o código: sem menção a `v3.40.0`/`1.18.16`, `INTERNAL_TEST_PORT` e `OPENVPN_PROTOCOL` documentados, `protonvpn-wireguard` com `SERVER_HOSTNAMES` como os demais.
- Com `LOCAL_HOSTS=gitlab.omega=<ip>`, `getent hosts gitlab.omega` no terminal retorna o IP e o `vpn-check` marca ok (alcance real exige a sub-rede em `FIREWALL_SUBNETS`). Validado via fixtures; runtime com túnel real pendente no host.
- `vpn-top` renderiza a seção Gluetun com chave válida e avisa graciosamente sem ela; `vpn-check --json` emite `{healthy, fails, checks[]}` e sai 0/1; `vpn-server-rotate --list` funciona sem API.
- Com `INTERNAL_DNS`, o Compose recebe `DNS_UPSTREAM_RESOLVER_TYPE=plain` (Gluetun obedece ao upstream plain); `verify-docs` trava o modo.
- `scripts/vpn.ps1` valida Compose >= 2.24.4, perfil, portas, segredos e
  healthcheck; os testes PowerShell simulam Docker e rejeitam perfis inválidos,
  caminhos/hosts inválidos e segredos ausentes.
- Toolchain: Node `22.23.2`, OpenCode `1.18.31`, digest jammy atual, CI `ubuntu-24.04` (SHAs/digest verificados na origem; build real pendente na CI).

## Constraints

- Sem segredos em logs ou Git; bind LAN somente em endereço explícito; sem commits automáticos.
- A home montada deve pertencer ao usuário que inicia o Compose, pois o terminal tem acesso de leitura e escrita a ela.
- Troca de servidor apenas pelo HTTP Control Server do Gluetun (autenticado), sem socket Docker.
- Com `INTERNAL_DNS` ativo, `INTERNAL_DNS_RESOLVERS` deve ficar vazio (upstream único).
- Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.

## Verification Plan

- ShellCheck (CI), verificações de scripts, Compose, documentação e build da imagem; `verify-docs` como trava de drift; validação de runtime com túnel real pendente no host quando houver mudança de comportamento (Docker não disponível no ambiente de edição): build, `vpn-switch nordvpn-openvpn`, `vpn-reconnect` ×2, `vpn-check` (incl. host interno), `vpn-top`, `vpn-opencode web` e `serve`, `ssh-add -l` no terminal.

## Status

- State: opencode-vpn-self-heal-implemented (CI e runtime de recuperação pendentes de validação)
- Owner: Codex
- Last updated: 2026-09-24
