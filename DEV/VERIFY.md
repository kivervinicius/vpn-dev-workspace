# Verify

## Latest Verification

- Date: 2026-09-17
- Scope: revisão completa lote D (bugfixes A, CLI B, infra C). Estático + fixtures; runtime pendente no host/CI.

## Commands (2026-09-17, sem Docker no ambiente)

### Estáticas (passaram)

- `bash -n scripts/*` (todos), `sh -n scripts/vpn-entrypoint.sh`.
- `./scripts/verify-docs` (travas anteriores + plain-DNS, `VPN_HTTP_PROXY`, matriz `--help` ×14, acúmulo de erros).
- `git diff --check`.
- `--help` com exit 0 nos 14 scripts (matriz com timeout; achou e corrigiu `auto-reconnect` que pendurava e `hosts-import` com exit 2).
- `vpn-status --json/-q/--api-url` (parse + erros); `vpn-check --json/--only/ -q` (JSON válido, exit 0/1, grupos isolados); `vpn-top --json/--no-color`; `vpn-opencode` (porta fora da faixa rejeitada com dica); `vpn-server-rotate --list/--to` (sem API, erros); `vpn-hosts-import --domain` sem valor (exit 2 com mensagem).
- `vpn-top` corrigido: sem chave → aviso gracioso exit 0 (antes abortava).
- SHAs: Node `22.23.2` (SHASUMS oficial), OpenCode `1.18.31` (tarballs baixados + `sha256sum` + conteúdo `opencode` único), digest jammy via registry API (`829f6df2…`).
- Fixtures anteriores (gen/import/check) revalidadas após refactors.

### Não rodados (sem Docker)

- `./scripts/verify-compose`, `docker build` (valida SHAs na prática), ShellCheck local — CI (`ubuntu-24.04`, `checkout@v6`, shellcheck `-S error`, `bash -n`, `build --pull`).
- Runtime no host: `vpn-switch` (hardening, proxy, plain-DNS, bumps, rotate, hosts), `getent gitlab.omega` + `vpn-check`, `vpn-opencode stop/status`, rotação periódica.

## Commands (2026-09-17, sem Docker no ambiente)

### Estáticas (passaram)

- `bash -n scripts/*` (todos, incl. `vpn-hosts-gen` e `vpn-hosts-import`), `sh -n scripts/vpn-entrypoint.sh`.
- `./scripts/verify-docs` (travas anteriores + `LOCAL_HOSTS` no README/`.env.example`/Compose, override git-ignorado, plug do generator no `vpn-switch`, `vpn-hosts-import` no loop de scripts).
- `git diff --check`.
- Fixtures `vpn-hosts-gen` (snippet temporário via `VPN_HOSTS_SNIPPET_FILE`): vazio → sem arquivo; 2 nomes (+espaço como separador) → snippet `IP nome`; duplicado → aviso + último vence; 7 inválidos (sem `=`, hostname com `*`/`..`, octeto >255, lados vazios) → exit 2 com mensagem; IPv6 → ok.
- Fixture `vpn-hosts-import --domain` (hosts de teste): extrai só o domínio, dobra case-insensitive com dedup, ignora comentários/`localhost`/outros domínios, imprime linha `LOCAL_HOSTS` colável; domínio ausente → exit 1.
- `vpn-check` com `LOCAL_HOSTS`: match → ok; mismatch → FAIL com esperado×obtido; não-resolve → FAIL (sugere `vpn-switch`); inválido → FAIL; ausente → 0 linhas (opt-in inerte).

### Não rodados (sem Docker)

- `./scripts/verify-compose` (agora também valida o override gerado), `docker build`, ShellCheck local — cobertos pela CI (`.github/workflows/validate.yml`); rodar na CI ou no host com Docker.
- Runtime: `getent hosts gitlab.omega` no terminal + `vpn-check` + alcance com `FIREWALL_SUBNETS` — pendente no host.

## Commands (sessão anterior 2026-09-17 — robustez dos scripts, sem Docker)

### Estáticas (passaram)
- `./scripts/verify-docs` (incl. novas travas: genkey, runbook×`OPENCODE_VERSION`, PATH host-first, `SERVER_HOSTNAMES` por perfil, `INTERNAL_TEST_PORT`, `OPENVPN_PROTOCOL`).
- `git diff --check`.
- Teste negativo das travas: padrão `v3.40.0` detectado; `SERVER_HOSTNAMES` presente nos 6 perfis de provedor (`custom-*` excluídos por desenho); `OPENCODE_VERSION=1.18.25` no runbook; `INTERNAL_TEST_PORT`/`OPENVPN_PROTOCOL` no README e `.env.example`.
- Teste unitário do parse de `VPN_SERVER_HOSTNAMES`: `""`→0 (caminho aleatório), `"a, b"`→2 com trim, `", ,"`→0 (sem `PUT` vazio).

### Não rodados (sem Docker)

- `./scripts/verify-compose`, `docker build`, ShellCheck local — cobertos pela CI (`.github/workflows/validate.yml`); rodar na CI ou no host com Docker.

## Runtime anterior (2026-08-19, host com Docker) — mantido

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

## Outcome do runtime 2026-08-19 (mantido)

- Passed: verificações acima.
- Failed: nenhuma (2 achados ambientais: `*.omega.local` rejeitado pelo Gluetun; faixa 185.153.176.x bloqueada pela rede local).

## Outcome (2026-09-17)

- Passed: verificações estáticas + fixtures acima.
- Failed: nenhuma.
- Pending: `verify-compose`/ShellCheck/build na CI ou host com Docker; runtime `LOCAL_HOSTS` no host (`getent` + `vpn-check` + alcance); conexão real do Desktop App à ponta `serve`.