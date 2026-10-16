# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-10-16 (III)
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work
- Current: título da aba replica o container + status de IA (2026-10-16 IX):
  `scripts/vpn-shell` (TERM/COLORTERM/TERM_PROGRAM, marca `VPN ▸ …`, restore,
  allow-rename no tmux) + `TERM` no Compose (exec direto herda do host) +
  `scripts/vpn-title-hook.zsh` opt-in com `vpn-ai` (🤖/✅❌ grudento — opencode
  nunca emite título, claude só na abertura; medido no fio). Container
  `terminal` recriado; verify-docs/compose OK. Falta teste interativo real.
  Commit/push ficam com o usuario.
- Previous: TUI sem ruído de ALSA (2026-10-16 VIII): `config/alsa-null.conf`
  redireciona o device `default` do ALSA para o plugin `null` e o
  `compose.windows.yml` aponta `ALSA_CONFIG_PATH` para ele (terminal +
  supervisor) — sem isso, `attention.sound` do `cli.json` compartilhado
  imprimia `ALSA lib ... Unknown PCM default` e quebrava a tela. Suite 42/42,
  Pester 9/9, verify-docs OK. Commit/push ficam com o usuario.
- Previous: caminhos Windows das instruções do host resolvidos no container
  (2026-10-16 VII): `vpn-home-link` cria a árvore de compatibilidade
  (`$HOME/C:/Users/<user>` → `/mnt/host-home`, `$HOME/C:/Dev` → `/workspace`),
  fazendo `rules.md`/`maestro.md`/`PERSISTENCE.md`/`SKILLS_INDEX.md`/skills do
  `AGENTS.md` do host resolverem; caminhos de skills do `AGENTS.md` corrigidos
  (`.codex/skills` → `.opencode/skills`, com backup). Commit/push ficam com o
  usuario.
- Previous: retomar conversas criadas no Windows dentro do container (2026-10-16 VI):
  `vpn-session-sync` reescreve os caminhos das conversas ao importar/exportar
  (`C:/Dev` → `/workspace`, `C:/Users/kiver` → `/home/developer`; mapeamento por
  env do compose), corrigindo `Location not found: C:/...`; o detector de banco
  em uso passou a considerar apenas o servidor (`serve`). Repro antes/depois
  validado no container. Commit/push ficam com o usuario.
- Previous: sincronização **automática e invisível** das conversas (2026-10-16 V):
  `vpn-opencode-wrapper` intercepta o `opencode` do container (PATH) e faz
  `autopull`/`autopush` em sessões interativas; `vpn.ps1` aplica o staging no
  host (mtime + guarda + backup `.bak`). Uso: só `docker exec ... opencode`.
  Descoberta: conversas são por **projeto**; repos **git** têm identidade
  independente do caminho (validado: sessões do host visíveis em
  `/workspace/appce-monorepo`). Suite Linux 41/41, Pester 9/9, verify-docs OK.
  Commit/push ficam com o usuario.
- Previous: comando `sessions-sync` (2026-10-16 IV): `.\scripts\vpn.ps1 sessions-sync`
  importa as conversas do host para o container e `sessions-sync --push` exporta
  de volta (modelo B, via `vpn-session-sync` + staging `.vpn/sync`); guardas com
  mensagem acionável quando o OpenCode do host está aberto. Pester 9/9 e
  verify-docs OK; runtime validado (push exportou o banco, guarda bloqueou a
  gravação no host). Commit/push ficam com o usuario.
- Previous: paridade completa da home Windows (2026-10-16 III): home inteira em
  `/mnt/host-home`; `vpn-home-link` cria symlinks configuraveis
  (`WINDOWS_HOME_LINKS`) no boot (skills, configs do OpenCode, preferencias
  TUI, plugins, git, npmrc, orquestrador, AGENTS.md); sessoes do OpenCode por
  snapshot no start/stop do `vpn.ps1` (SQLite nunca linkado — File Sharing sem
  locks POSIX), staging `.vpn/sync` (gitignored) com guardas de processo/mtime.
  Commit/push ficam com o usuario.
- Previous: paridade OpenCode host<->container no modo Windows (2026-10-16 II):
  `compose.windows.yml` monta skills (ro) e config global (ro) do host
  (`HOST_HOME_DIR`) nos dois servicos; `.local/share/opencode` (SQLite/WAL)
  NAO e montado (File Sharing nao suporta locks POSIX). Sessoes ficam isoladas
  no volume. Validado com container recriado (skills/config visiveis, opencode
  session list OK). Commit/push ficam com o usuario.
- Previous: follow-ups de 2026-10-16 (robustez/seguranca/DX) aplicados e verificados:
  `.gitattributes` (`* text=auto eol=lf`), wait da ponte SSH 5s->30s, `vpn-top --json`
  mascarando credenciais do Gluetun, testes novos (suite Linux 38/38; Pester 8/8),
  runbooks alinhados (npm 2.x no `opencode-desktop-vpn.md`; secao 6 no troubleshooting)
  e backlog triado (#3/#9 priorizados; itens 11/12 feitos).
  - Verified: ubuntu:24.04 limpo com shellcheck/`bash -n`/`git diff --check` limpos;
    Pester 6.2.0 no host; `verify-docs` OK; container real sem segredos no `vpn-top --json`.
  - Pending: `verify-compose`/build nao afetados (CI cobre); commit/push ficam com o usuario.

- Previous: instalacao Windows validada (Docker Desktop 4.94, modo PowerShell sem WSL, sem distribuicao WSL).
  O ambiente conecta pelo perfil **`custom-openvpn`** com `.secrets/nordvpn-br71-tcp80.ovpn`
  (config oficial NordVPN, `proto tcp-client`, `remote 189.1.170.129 80`) porque esta rede
  bloqueia UDP 1194/51820 e reseta TCP 443/1231; a porta 80 completa o handshake TLS.
  Requisitos locais ja aplicados: `HOST_HOME_DIR` no `.env` (PowerShell sem `HOME`),
  clone com LF (`core.autocrlf=false`), `C:\Projects` no File Sharing do Docker Desktop e
  servico `ssh-agent` habilitado.
  Comandos: `.\scripts\vpn.ps1 start custom-openvpn` / `terminal` / `status` / `stop`.
  - `WORKSPACE_DIR` no `.env` (mesma variavel do modo Linux) escolhe a pasta do host
    que vira `/workspace`; hoje `C:\Dev` (File Sharing do Docker Desktop inclui
    `C:\Users\kiver`, `C:\Projects` e `C:\Dev`). Sem a variavel, `/workspace` volta
    a ser a raiz do repositorio. Patch no `vpn.ps1` (`Set-ActiveComposeEnvironment`).
  - Verified: `vpn-check` 5/5, IP publico 189.1.170.12 (BR), terminal com OpenCode 2.0.28
    (npm `@opencode/cli` em `/home/developer/.opencode/bin`, slot PATH-first; fallback do
    Dockerfile 1.18.31 so se o volume da home for perdido - reinstalar com
    `npm install -g @opencode/cli@2.0.28 --prefix /home/developer/.opencode`) e saida
    externa pelo tunel confirmada.
  - SSH: chave ed25519 gerada (`C:\Users\kiver\.ssh\id_ed25519`), carregada no agente e
    visivel no terminal via ponte, registrada no GitHub. `ssh -T git@github.com` =
    `Hi kivervinicius!` e `git ls-remote` do repo passam pelo tunel.
  - Pending: `FIREWALL_SUBNETS` atual so libera a rede do Docker Desktop; ajustar para a
    LAN real quando precisar de impressoras/NAS; `verify-compose`/testes Linux nao rodados
    no host Windows.

- Current: correção da detecção de limites do Zen (trabalho de 2026-10-13 revisado antes
  do commit). Quatro defeitos foram encontrados e corrigidos:
  1. `scripts/vpn-opencode` não era parseável — command substitution sem fechamento em
     `do_check`, o que quebrava `check` em runtime e passava despercebido porque um teste
     esperava exit 2.
  2. `OPENCODE_LIMIT_HOOK` e `OPENCODE_CREDIT_LIMIT_PATTERNS` não eram repassados pelo
     Compose ao `opencode-supervisor`; a funcionalidade documentada não funcionava.
  3. `extract_retry_after()` era código morto; agora alimenta as mensagens e o hook.
  4. O ramo 429 classificava com padrões de billing, então `FreeUsageLimitError` virava
     `rate-limit` em vez de `zen-usage-limit`.
  Também: novos padrões repassados a `terminal`/`vpn-auto-reconnect`, `OPENCODE_ZEN_PATTERNS`,
  documentação em `.env.example` e runbook, 7 novos testes (37/37 no total) e `socat`
  instalado na CI para os testes HTTP.
  - Verified: `bash -n` em todos os scripts, `sh -n vpn-entrypoint.sh`, `git diff --check`,
    `verify-docs`, 37/37 testes, e smoke funcional do `check` contra servidor HTTP real
    cobrindo `ouvindo`/`credit-exhausted`/`zen-usage-limit`/`rate-limit`/`quota-pattern-in-http`.
  - Pending: `verify-compose`, ShellCheck e `docker build` (Docker/ShellCheck ausentes aqui);
    runtime do hook dentro do container.
  - Spec: `SPECS/ACTIVE.md` (atualizada em 2026-10-14).

- Previous: implementação das melhorias gerais aprovadas no plano de evolução do workspace:
  1. Hardening de código: fallback dinâmico de `PATH` no `docker-compose.yml`, eliminação de `secrets/` legado (item #8 do backlog).
  2. Testes e diagnóstico: ferramenta unificada `scripts/vpn-doctor` com `--json` e `--fix`; suíte automatizada `tests/linux/test-scripts.sh` (30 testes) e inclusão no CI GitHub Actions.
  3. Documentação & DX: runbook `DEV/RUNBOOKS/troubleshooting-vpn.md`, guia `examples/cenarios-avancados.md`, assistente `scripts/vpn-setup`, `Makefile` na raiz e diagrama Mermaid na arquitetura.
  Toda a suíte de verificação (`make verify`: compose, docs, testes linux) passou com 100% de sucesso.

- Previous: diagnóstico e resolução de loop de reconexão na VPN (NordVPN OpenVPN)
  e melhorias preventivas. O protocolo TCP com porta 443 padrão causava `Connection reset`
  imediato na NordVPN, somado a hostnames antigos na lista de servidores. Adicionado
  repasse de `OPENVPN_ENDPOINT_PORT` nos perfis OpenVPN, validação preventiva de DNS
  de servidores e aviso de porta TCP no `vpn-switch`. Com `OPENVPN_PROTOCOL=udp`, a
  VPN conecta de imediato e passa 100% nas validações (`vpn-status`, `vpn-check`, `vpn-reconnect`).

- Entry: adição de `KILL` capability ao Gluetun para sinalizar e parar OpenVPN na reconexão.
- Spec: `SPECS/ACTIVE.md` (status: reviewed-and-upgraded; runtime Linux validado; Windows/WSL2 pendentes).
- Changed: `vpn` adiciona capability `KILL` ao `cap_add` em `docker-compose.yml`; `scripts/verify-compose` trava a presença de `KILL` em todos os perfis.
- Verified: `verify-compose` e `verify-docs` passaram; `vpn-switch nordvpn-openvpn` recriou contêineres saudáveis; `vpn-reconnect` executado duas vezes com sucesso e novo IP atribuído em ~9s; `vpn-status` e `vpn-check` aprovados.
- Risks: ShellCheck local indisponível; Windows/WSL2 continuam pendentes de validação real.
- Next context: validar Windows/WSL2 e executar os smoke tests restantes.

## Recent Entries

- Current implementation: `compose.windows.yml` + `scripts/vpn.ps1` provide the
  Docker Desktop path without a WSL distribution; the SSH bridge uses the
  Windows named pipe and a temporary token, while WSL2 explicitly requires
  `FIREWALL_SUBNETS` for LAN access.
- 2026-09-18 — suporte Windows PowerShell/WSL2 implementado; runtime Windows pendente.

- 2026-09-17 — revisão lote D (bugfixes, CLI máquina, bumps, hardening, proxy).
- 2026-09-17 — hosts locais via LOCAL_HOSTS (gen + import + check + travas).
- 2026-09-17 — robustez dos scripts + fechamento dos drifts 29/08 (docs, TESTING, BACKLOG, trava de drift no verify-docs).
- 2026-08-29 — OpenCode 1.18.25 + PATH host-first; SERVER_HOSTNAMES nos perfis de provedor.
- 2026-08-19 — rede interna (LAN/DNS), paridade de home (UID/GID, ssh-agent, /run/user) e `vpn-opencode` implementados; validação de runtime pendente.
- 2026-08-19 — aumento de poderes: IP pós-reconexão, saúde, dashboard, rotação e Gluetun v3.41.3.
- 2026-08-10 — implementação e validação concluídas.
