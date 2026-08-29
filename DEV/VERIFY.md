# Verify

## Latest Verification

- Date: 2026-08-19
- Scope: rede interna opt-in (firewall + DNS), paridade de home (UID/GID, ssh-agent, /run/user), GUI do OpenCode pela VPN (`vpn-opencode`), manutenção da VPN e **validação de runtime no host com Docker**.

## Commands

### Estáticas (passaram)

- `bash -n scripts/*` (todos os scripts, incl. `vpn-opencode`), `sh -n scripts/vpn-entrypoint.sh`.
- `./scripts/verify-docs`, `git diff --check`.
- `./scripts/verify-compose` — oito perfis válidos.
- `docker compose --profile vpn config --quiet`.

### Runtime no host (Docker 29.2.1, Compose v5.0.2) — passou

- `./scripts/vpn-switch nordvpn-openvpn` — imagem reconstruída (`HOST_UID=1000`/`HOST_GID=1000`), perfil conectado, healthcheck ok. Rejeitou `*.omega.local` em `INTERNAL_DNS_EXEMPT_HOSTNAMES` (Gluetun só aceita nomes explícitos) — corrigido no `.env`.
- `vpn-check` — tudo ok (túnel, IP público, DNS, resolução, resolv.conf; alcance interno com `INTERNAL_TEST_HOST`/`INTERNAL_TEST_PORT`).
- Resolução interna: nomes `.omega.local` NXDOMAIN no DNS da LAN (192.168.5.4 só conhece nomes públicos; hosts internos vivem no `/etc/hosts` do host). Alcance real validado por IP: `http://192.168.30.20/ → 200` (nginx da LAN) pelo túnel, com e sem túnel ativo (exceções de firewall funcionam).
- DNS público pelo upstream plain da LAN: `github.com` resolve; `https://github.com → 200` pelo túnel.
- `vpn-reconnect` — 1ª execução falhou (servidor NordVPN inacessível + polling curto); após fixar `br72.nordvpn.com` via API e aumentar o polling (30×5s), reconectou imprimindo `IP público: 189.1.168.191` (exit 0).
- `vpn-server-rotate` — troca de servidor pela API aplicada (Gluetun reinicia o túnel); servidores 185.153.176.x inacessíveis da rede atual (falham também do host — bloqueio de rota do provedor de acesso; usar `VPN_SERVER_HOSTNAMES` com servidores conhecidos).
- `vpn-top` — dashboard com túnel, servidor fixado, país, IP e DNS.
- Paridade SSH: `ssh-add -l` dentro do terminal lista a chave do agente do host (`gitlab-ci-lightsaber-deploy`) via `SSH_AUTH_SOCK` montado; `git` presente (imagem passou a incluir `openssh-client`).
- `vpn-opencode web` — painel em `http://127.0.0.1:10001` (na faixa publicada): `401` sem senha, `200` com basic auth (`opencode`); o erro `xdg-open` no stderr é cosmético (sem navegador no container; servidor continua).
- `vpn-opencode serve` — `200` servindo o HTML do app (ponta para o Desktop App).

## Outcome

- Passed: verificações acima.
- Failed: nenhuma (2 achados ambientais: `*.omega.local` rejeitado pelo Gluetun; faixa 185.153.176.x bloqueada pela rede local).
- Pending: conexão real do Desktop App à ponta `serve`; ShellCheck pela CI.