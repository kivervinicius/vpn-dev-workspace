# Verify

## Latest Verification - 2026-10-16 VI (retomar conversas do Windows no container)

### Passaram

- Repro do defeito no container: `cd /workspace/appce-monorepo && opencode run --session ses_ebe31a0e8ffeyk5x5bE70zQ3Yc ping` → `Error: Location not found: C:/Dev/appce-monorepo` (a sessão guardava o diretório do Windows).
- Após a reescrita de caminhos (`rewrite_db_paths`): `session_v2.directory` = `/workspace/appce-monorepo`, `/workspace`, `/home/developer`; o mesmo comando deixa de emitir o erro e passa a resolver o diretório (segue para o modelo; timeout de 25s no modelo grátis = exit 124).
- Detector de banco em uso restrito ao processo `serve` (antes um cliente residual `opencode --yolo` bloqueava o import).
- Estático: shellcheck + `bash -n` limpos; suíte Linux 41/41 (com nodejs instalado, reproduzindo a CI); Pester 9/9; verify-docs OK.

### Não rodaram / observações

- As variáveis de mapeamento entram por `compose.windows.yml`: valem após recriar o container. Sem elas, o fallback mapeia qualquer caminho Windows para `/workspace`.
- A reescrita altera apenas `session_v2.directory`, `project.worktree` e `worktree.directory` (não toca no conteúdo das mensagens).

## Latest Verification - 2026-10-16 V (sincronizacao automatica via wrapper)

### Passaram

- Estático: shellcheck -S error + `bash -n` + `git diff --check` limpos; `verify-docs` OK (travas novas: wrapper no Compose + scripts no README).
- Suíte Linux 41/41 em ubuntu:24.04 (novo teste: `autopull`/`autopush` respeitam mtime, com backup no pull).
- Pester 9/9 no host.
- Runtime no container: `command -v opencode` resolve o wrapper (`/home/developer/.local/bin/opencode`) e `opencode --help` repassa o help real; sessão interativa simulada (pty) disparou `autopull` (importou o banco do host, 44 MB, preservando o anterior como `.bak`) e `autopush` (publicou o conjunto db+wal+shm no staging); o serviço de background (`opencode.exe serve --service`) foi detectado e parado antes da troca do banco.
- **Conversas visíveis**: `cd /workspace/appce-monorepo && opencode session list` lista as sessões criadas no host em `C:/Dev/appce-monorepo` (projetos git têm identidade independente do caminho).

### Não rodaram / observações

- Diretórios **sem git** (ex.: `C:/Users/kiver` vs `/workspace`) não compartilham sessões — o agrupamento é por projeto/diretório; retomada por ID (`opencode -s <id>`) continua possível.
- Aplicação no host de um `autopush` pendente exige o OpenCode do host fechado (guarda de banco em uso).

## Latest Verification - 2026-10-16 IV (sessions-sync on-demand)

### Passaram

- Pester 9/9 no host (novo caso: `sessions-sync --push` encaminha o push ao terminal via mock Docker).
- `verify-docs` OK (trava do README sobre `vpn-session-sync` mantida).
- Runtime: `vpn.ps1 help` lista `sessions-sync [--push]`; `sessions-sync --push` exportou o banco do container para `.vpn/sync/out` (`opencode.db` 13.6 MB + wal/shm) e a guarda bloqueou a gravação no host (OpenCode ativo) com mensagem acionável; `sessions-sync` (pull) respondeu com a guarda equivalente.

### Não rodaram / observações

- Importação/exportação **efetiva no host** exige o OpenCode do host fechado (guarda de banco em uso) — validada por mecanismo + mensagem, não pela cópia final.

## Latest Verification - 2026-10-16 III (paridade completa da home Windows)

### Passaram

- Estático: shellcheck -S error + bash -n + `git diff --check` limpos; `verify-docs` OK (incl. travas novas /mnt/host-home e vpn-home-link).
- Suíte Linux 40/40 em ubuntu:24.04 limpo (paridade CI): inclui teste 34 (vpn-home-link em sandbox: links idempotentes + backup de alvo existente) e 35 (vpn-session-sync round-trip pull/push).
- Pester 8/8 no host (Pester 6.2.0).
- `compose config --quiet` (perfis vpn e vpn+opencode com compose.windows.yml) OK.
- Runtime real (`vpn.ps1 start custom-openvpn`): /mnt/host-home montado com a home Windows inteira (rw); symlinks ativos para skills, opencode.json, cli.json, .gitconfig, .npmrc, AGENTS.md — todos resolvendo conteúdo real do host; alvos pré-existentes do volume preservados como `.volume-backup`; `opencode session list` lendo o volume.
- Guarda do snapshot validada em runtime: OpenCode ativo no host → aviso claro e snapshot pulado (banco em uso); `vpn-session-sync pull` com staging vazio = "nada para importar" (exit 0).

### Nao rodaram / observacoes

- Import/export real de sessões com o host fechado (exige OpenCode do host fechado; comportamento validado por testes + guardas em runtime).
- `docker build` não afetado (sem mudança de imagem); CI cobre no push.

## Latest Verification - 2026-10-16 (follow-ups: gitattributes, ponte SSH, vpn-top)

### Passaram

- Suite Linux completa em ubuntu:24.04 limpo (paridade com a CI, com socat): **38/38**, incluindo o teste 33 novo (`vpn-top --json` mascara credenciais com curl simulado no PATH).
- `shellcheck -S error` + `bash -n` (todos os scripts) + `git diff --check`: limpos.
- Pester no host (Pester 6.2.0 em CurrentUser): **8/8**, incluindo o teste novo de `WORKSPACE_DIR` inexistente (exit 2 em 1.4s, sem depender do estado do host).
- `verify-docs` no host (Git Bash + `pwsh` no PATH): "Documentacao e perfis consistentes." (trava runbook x `OPENCODE_VERSION=1.18.31` mantida).
- Container real (bind mount vivo): `vpn-top --json` com `settings.openvpn.user/password` e `settings.provider.port_forwarding.username/password` = `***`; valores de `.secrets/nordvpn_user` e `.secrets/nordvpn_password` ausentes no output; `bash -n` OK no arquivo montado.
- Parser (Ast) do PowerShell OK em `scripts/vpn.ps1` e `tests/windows/vpn.Tests.ps1` apos as edicoes.

### Nao rodaram / observacoes

- `verify-compose`/`docker build`: nao afetados nesta rodada (sem mudanca em Compose/Dockerfile); CI cobre no push.
- `verify-docs` dentro de container ubuntu falha por ambiente (sem `pwsh`, o loop de `--help` tenta executar os `.ps1` porque a montagem Windows marca tudo como executavel) - rodado no host em vez disso.
- Host nao tinha Pester 5+ (so 3.4.0); Pester 6.2.0 foi instalado em `CurrentUser` para a verificacao (`Uninstall-Module Pester -Scope CurrentUser` reverte).

## Latest Verification - 2026-10-15 (Instalacao Windows, modo PowerShell sem WSL)

### Passaram

- `.\scripts\vpn.ps1 start custom-openvpn` em Docker Desktop 4.94 / Compose v5.5.1: build das imagens, `vpn` healthy, terminal e `vpn-auto-reconnect` iniciados.
- `docker exec terminal vpn-check` - **5/5**: tunel ativo, IP publico 189.1.170.12 (NordVPN Sao Paulo/BR), DNS do tunel ativo, resolucao de `github.com` funcional, `resolv.conf` apontando para o DNS do tunel.
- `vpn-status` no terminal: perfil `custom (openvpn)`, IP publico correto.
- Terminal: usuario `developer`, `/workspace` = projeto Windows, OpenCode 2.0.28 (`/home/developer/.opencode/bin/opencode`, npm `@opencode/cli`, paridade com o host; fallback da imagem 1.18.31), saida externa via tunel confirmada (`curl https://api.ipify.org` = 189.1.170.12).
- Ponte SSH do Windows ativa (`agent-start` implicito no start; `.vpn/windows-ssh-agent.json`, processo pwsh vivo).
- Ponte SSH funcional dentro do terminal: `LOCAL_HOSTS=host.docker.internal=192.168.65.254` + `FIREWALL_SUBNETS=192.168.65.0/24`; `ssh-add -l` no terminal devolve a identidade do host.
- SSH ao GitHub pelo tunel: chave ed25519 gerada e registrada (kivervinicius); `ssh -T git@github.com` = "Hi kivervinicius!" e `git ls-remote` do repo lista as branches.
- Publicacao de porta validada: host `127.0.0.1:10050` -> listener no terminal devolveu HTTP 200.
- `WORKSPACE_DIR` no Windows: patch no `vpn.ps1` (`Set-ActiveComposeEnvironment` le a variavel via `Get-ConfigValue`, fallback na raiz do repo); `.env` com `WORKSPACE_DIR=C:\Dev` e `C:\Dev` no File Sharing do Docker Desktop (restart do Desktop necessario - nao recarrega em runtime). Validado: `/workspace` lista `appce-monorepo` (conteudo real de `C:\Dev`), escrita bidirecional host<->container, `opencode --version` = 2.0.28, `ssh-add -l` via ponte.

### Nao rodaram / observacoes

- `verify-compose`, `verify-docs` e `tests/linux/test-scripts.sh`: nao executados neste host (Windows; sem jq/make no PATH).
- `ssh-add -l` vazio no host e no terminal: chaves SSH nao foram carregadas no agente.
- `FIREWALL_SUBNETS` nao definido: LAN do Windows permanece bloqueada dentro do tunel (aviso documentado do `vpn.ps1 start`).
- Rede deste host bloqueia UDP de VPN (1194/51820 sem resposta) e reseta TCP 443/1231 da NordVPN; a porta 80 TCP funciona. Perfis `nordvpn-*` nao conectam aqui - usar `custom-openvpn`.

### Anterior
 — 2026-10-14 (Detecção de limites do Zen, corrigida)

### Passaram

- `bash -n` em todos os scripts de `scripts/` e `sh -n scripts/vpn-entrypoint.sh`.
  Observação: `sh -n scripts/vpn-opencode` falha porque o script tem `#!/usr/bin/env bash` e
  usa `[[ ]]`; a verificação do projeto para esse arquivo é `bash -n`.
- `git diff --check`.
- `./scripts/verify-docs` — documentação e perfis consistentes.
- `./tests/linux/test-scripts.sh` — **37/37**. Inclui os 5 testes novos de classificação
  HTTP do `check`, servidos por `socat` com `fork`.
- Smoke funcional do `vpn-opencode check` contra servidor HTTP real (`socat`):

  | Resposta | `detail` | Resultado |
  |---|---|---|
  | 200 `OK` | `ouvindo` | PASS |
  | 402 `CreditLimitExceeded` | `credit-exhausted` | PASS |
  | 429 `FreeUsageLimitError` | `zen-usage-limit` | PASS |
  | 429 `too many requests` | `rate-limit` | PASS |
  | 200 `quota exceeded` | `quota-pattern-in-http` | PASS |

- `retry_hint` do supervisor: `retry-after: 1800` → ` (reset em 1800s)`;
  `reset in 4 days` → ` (reset in 4 days)`; sem hint → string vazia.
- Classificador do supervisor: `CreditLimitExceeded` e `InsufficientFunds` → `credit_limit`
  (agora cobertos pela suíte local, não só pela CI).

### Defeitos encontrados e corrigidos nesta rodada

- `scripts/vpn-opencode` não era parseável: `logs="$("${compose[@]}" ... || true)` sem o
  `"` de fechamento da command substitution. O parser consumia o resto do arquivo até o
  `(` da linha 218. Quebrava `check` em runtime; mascarado porque o teste
  `modo-invalido` (exit 2) passava pelo motivo errado.
- `OPENCODE_LIMIT_HOOK` e `OPENCODE_CREDIT_LIMIT_PATTERNS` não eram repassados pelo
  Compose ao serviço `opencode-supervisor`: a funcionalidade documentada no runbook
  nunca teria disparado.
- `extract_retry_after()` era código morto, apesar de o WORKLOG de 2026-10-13 afirmar uso.
- O ramo 429 de `do_check` classificava com `QUOTA_PATTERNS` (billing) em vez dos padrões
  Zen, então `FreeUsageLimitError` virava `rate-limit` em vez de `zen-usage-limit`.

### Ainda pendente

- `./scripts/verify-compose`, ShellCheck e `docker build`: Docker e ShellCheck não estão
  instalados neste ambiente; cobertos pela CI.
- Runtime real: supervisor disparando `OPENCODE_LIMIT_HOOK` dentro do container, e
  `vpn-opencode check` contra o OpenCode real (porta publicada).
- Pendências antigas: Windows/WSL2 (`vpn.ps1`, ponte `openssh-ssh-agent`, persistência
  da home), `LOCAL_HOSTS` com `getent` no host, conexão real do Desktop App à ponta
  `serve`, `OPENCODE_AUTOCHECK=true` no `vpn-auto-reconnect`.

## Latest Verification — 2026-09-19 (Verificação automática do OpenCode)

### Passaram (sem Docker no ambiente de edição)

- `bash -n` em `vpn-opencode`, `vpn-auto-reconnect`, `vpn-top`, `verify-docs`, `verify-compose`; `sh -n vpn-entrypoint.sh`; `git diff --check`.
- `./scripts/verify-docs` (incl. novas travas: `check|watch`, `OPENCODE_AUTOCHECK`, mounts/env no Compose, seção `OpenCode` no `vpn-top`).
- Matriz `--help` exit 0 (`vpn-opencode`, `vpn-auto-reconnect`, `vpn-top`, `vpn-check`, `vpn-status`).
- `vpn-opencode check --port` em porta fechada → `down` exit 1 (texto e `--json`); responder HTTP com `quota exceeded` → `quota` exit 1 com `quota-pattern-in-http`; corpo neutro → `ok` exit 0; `watch` sem Docker falha rápido exit 2 (sem hang); `vpn-top --json` inclui `.opencode`.
- Greps do Compose: mount `vpn-opencode` em 2 serviços + repasse `OPENCODE_AUTOCHECK`/`OPENCODE_GUI_PORT`.

### Ainda pendente

- `./scripts/verify-compose` completo, `docker build`, ShellCheck (sem Docker/ShellCheck aqui — CI/host).
- Runtime real: `vpn-switch`, `web|serve --detach`, `check --json`, matar processo p/ `watch` recuperar com limite, `OPENCODE_AUTOCHECK=true` no `auto-reconnect` (só alerta), `vpn-top` com túnel + OpenCode, `vpn.ps1 opencode check|watch` em Windows real.

## Latest Verification — 2026-09-19 (Adição de KILL capability)

### Passaram

- `./scripts/verify-compose`: oito perfis Linux e oito combinações Windows válidas, confirmando `KILL` junto a `DAC_READ_SEARCH`, `DAC_OVERRIDE`, `CHOWN`, `SETUID`, `SETGID`.
- `./scripts/verify-docs`.
- `./scripts/vpn-switch nordvpn-openvpn`: recriação completa dos contêineres; serviços `vpn`, `terminal` e `vpn-auto-reconnect` saudáveis.
- `docker exec vpn-dev-workspace-terminal-1 vpn-reconnect`: executado 2x consecutivas com encerramento gracioso do OpenVPN, polling e novo IP público obtido sem timeouts (tempo de execução ~9s).
- `docker exec vpn-dev-workspace-terminal-1 vpn-status`: túnel running, servidores listados e IP público identificado.
- `docker exec vpn-dev-workspace-terminal-1 vpn-check`: túnel, IP, DNS do túnel, resolução e hosts locais 100% ok.

- `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh` e `git diff --check`.
- `./scripts/verify-docs`.
- `./scripts/verify-compose`: oito perfis Linux e oito combinações com
  `compose.windows.yml` válidas; `!override` foi processado pelo Compose 5.0.2.
- ShellCheck `-S error` em todos os scripts shell (excluindo os `.ps1`).
- Parse dos scripts PowerShell e da suíte Pester com PowerShell 7 em container;
  `vpn.ps1 --help`, perfil inválido e importação de hosts foram exercitados.
- `docker build --pull=false .`: imagem construída com `socat` e os hashes
  existentes de Node/OpenCode verificados durante o build.
- `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh` e `git diff --check`
  após o ajuste de capabilities e lifecycle.
- `./scripts/verify-docs` e `./scripts/verify-compose`: oito perfis Linux e
  oito combinações Windows válidas; `DAC_READ_SEARCH`, `DAC_OVERRIDE`, `CHOWN`,
  `SETUID` e `SETGID` presentes no serviço `vpn` de cada perfil.
- `./scripts/vpn-switch stop`: encerrou o projeto sem Compose manual.
- Runtime Linux: `./scripts/vpn-switch nordvpn-openvpn` recriou os serviços e
  deixou `vpn`, `terminal` e `vpn-auto-reconnect` saudáveis; `vpn-status --json`
  mostrou IP público `189.1.168.11` e `vpn-check --json` passou com `healthy=true`,
  DNS do túnel e `LOCAL_HOSTS`.

### Ainda pendente

- Runner Windows/Pester e teste real no Docker Desktop Windows: agente
  `openssh-ssh-agent`, túnel/DNS, `ssh-add -l`, OpenCode e persistência da home.
- Repetição do fluxo Bash em WSL2 integrado ao Docker Desktop, incluindo
  confirmação de que a LAN só funciona com `FIREWALL_SUBNETS` explícito.
- Runtime Windows/WSL2 e demais smoke tests pendentes; ShellCheck local não
  instalado.

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
