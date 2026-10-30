# Verify

## Latest Verification - 2026-10-30 (OpenCode VPN recovery v1/v2)

### Passaram

- `node --test tests/opencode/*.test.mjs`: **8/8**; structured v1/v2 classification, abort/retry behavior, TUI deduplication, and account/credit exclusions.
- `bash tests/linux/test-scripts.sh`: **43/43**; lock contention, verified changed IP, cooldown/window limits, free-tier/429 rotation, and launcher behavior.
- `./scripts/verify-docs`, `./scripts/verify-compose` (**8 perfis**) e `bash -n` nos scripts alterados.
- `opencode1 --version` → **1.19.5**; `opencode2 --version` → **2.1.3**. Installed v2 plugin discovery included `vpn-recovery`.
- Runtime E2E with a local-only synthetic HTTP 429 provider triggered actual VPN recovery in both clients. v1: `br71.nordvpn.com`, `189.1.170.10` → `189.1.170.177`. v2: `br72.nordvpn.com`, `189.1.170.177` → `189.1.168.12`. Both helper state records confirmed the target and before/after IP; final `vpn-check --json` passed **6/6**.
- The active tunnel now uses `br72.nordvpn.com`, public IP `189.1.168.12` (São Paulo). Both E2E requests went only to the local mock; no real provider quota or prompt replay.

### Limites

- The pre-existing managed OpenCode service occupied its default port, so v2 E2E ran in `--standalone` mode without changing that service.
- A changed egress IP does not guarantee that the provider resets its quota.

The older records below are historical. A VPN switch changes egress IP but cannot guarantee that the provider's quota resets.



## Historical Verification - 2026-10-23 (free tier × IP; superseded)

### Passaram

- v2 free na VPN: 9/9 modelos free OK (`beam`, `big-pickle`, `deepseek`, `flint`, `glm`, `mimo`, `nemotron-3-ultra`, `nemotron-3.5-lightning`, `nemotron-3.5-super-vl`).
- Host (IP residencial): 9/9 modelos free BLOCKED (QUOTA).
- **Descoberta**: o limite free tier v2 é **por IP** (janela ~200 req/5h), não por conta/modelo.
- Host (IP residencial `168.205.49.98`): todos 9 modelos QUOTA.
- VPN (IP `189.1.168.17`): 9/9 modelos OK.
- `VPN_ROTATE_SERVERS=true` reativado — rotação de IP renova a janela de 5h.
- `opencode-free` (v1) funciona no host e no container.

### Observações

- O limite free v2 é por IP (janela ~200 req/5h), não por conta/modelo.
- Host (IP residencial) → janela esgotada; VPN (IP datacenter) → janela própria → todos modelos OK.
- `VPN_ROTATE_SERVERS=true` reativado — rotação de IP renova a janela de 5h.
- v1 continua como fallback (contrato legado `/api/chat`).

## Latest Verification - 2026-10-22 (quota free v2 é intermitente)

### Passaram

- v2.0.29, v2.1.2 e v2.1.3 com `--standalone` + home temporário/auth: `glm-5.3-flash-free` e `deepseek-v4.1-flash-free` responderam `OK` quando a quota permitiu.
- Histórico por versão: 2.0.29 (25 succeeded), 2.1.1 (1), 2.1.2 (7 succeeded/5 failed), 2.1.3 (2 succeeded/4 failed).
- Em 22/10: `deepseek` falhou às 16:29 e voltou às 20:30; `glm` funcionou no intervalo. Não houve versão de corte.

### Observações

- O limite é por conta/modelo/janela; trocar o modelo free costuma resolver antes de pensar em downgrade.
- v1 continua como fallback por usar o contrato legado.

## Latest Verification - 2026-10-22 (contorno do free tier via v1)

### Passaram

- `opencode-free run -m opencode/deepseek-v4.1-flash-free "Responda apenas OK"` → `OK` no host e no container/VPN.
- `opencode2 run` com o mesmo modelo → `Free usage limit reached. Connect a provider or subscribe to OpenCode Go...`.
- `opencode-free --version` → `1.19.4` (v1).
- Mesmo IP/conta: v1 responde, v2 bloqueia. O limite é aplicado ao v2, não ao ASN.

### Observações

- Contorno legítimo: usar o cliente oficial v1 (`opencode-free`); sem spoofing de headers/endpoint.
- v2 fica para modelo pago/chave própria.

## Latest Verification - 2026-10-22 (free tier × ASN)

### Passaram

- `vpn-asn` no host: `168.205.49.98` / **AS265363 RV NET** (residencial).
- `vpn-asn` no container: `189.1.168.17` / **AS262287 Latitude.sh** (datacenter, com aviso).
- `opencode-free --version` no host: `opencode v2.1.3`.
- `opencode-free` no container: recusa com exit 1 e instrução para usar o host.
- Amostra NordVPN: Datacamp AS60068/AS212238, Hydra AS25369, Latitude AS262287/AS396356; todos datacenter.

## Latest Verification - 2026-10-22 (histórico v2 → v1)

### Passaram

- `opencode1-import-v2`: snapshot `VACUUM INTO` com **1.500 sessões**, `quick_check ok`; executado no container via `node:sqlite` (sem python3); banco v1 anterior salvo em `.bak-<data>`.
- `opencode1 session list` lista o histórico (ex.: `Verificação do repositório`, `Replicar título container para aba externa`).
- Export direto do binário v1 de uma sessão: **71 mensagens**.
- `opencode1 --version` = 1.19.4.

### Observações

- `opencode1 export` através do wrapper (`docker exec -i`) trunca em ~192 KB; usar o binário direto no host para exports grandes.
- O snapshot é unidirecional; novas sessões no v2 exigem rodar `opencode1-import-v2` de novo.

## Latest Verification - 2026-10-22 (atualização automática v1/v2)

### Passaram

- `opencode-update --check`: v1 `1.19.4` = latest; v2 `2.1.3` = latest.
- `systemctl --user start opencode-update.service`: concluído, log com “já atualizado”.
- Timer `opencode-update.timer` habilitado; próxima execução 2026-10-23 00:10.
- `npm install -g @opencode/cli@2.1.3 --prefix /tmp/...` validado (binário 2.1.3 funcional).

### Observações

- v2 é atualizado via npm (`@opencode/cli`), não pelo GitHub releases (o “latest” do GitHub é a linha 1.x). v1 é atualizado pelo GitHub `v1.*`.

## Latest Verification - 2026-10-22 (opencode1/opencode2)

### Passaram

- `opencode2 --version` → `2.1.3` no host e no container.
- `opencode1 --version` → `1.19.4` no host (via `docker exec`) e no container.
- `opencode1 models` lista o catálogo atual (`deepseek-v4.1-flash-free`, `glm-5.3-flash-free`, `nemotron-3.5-*`, etc.).
- `~/.opencode-v1` criado com `opencode.db` próprio; banco do v2 não foi alterado.
- `auth.json` copiado do v2 apenas quando o v1 ainda não tem o seu.

### Não passou / limitação

- `opencode2 session export <id>` → `opencode1 import` falha: `Missing key at ["slug"]`; com shim `slug`/`version`, falha em `Expected Message`. Sessões v1↔v2 não são compatíveis; sync automático não implementado.

## Latest Verification - 2026-10-22 (rotação entre países + free tier opt-in)

### Passaram

- Suíte Linux **55/55**, incluindo `vpn-server-rotate --countries "Brazil, Argentina"` (patch com `countries` e `hostnames:[]`) e `--countries ""`/`--to` retornando exit 2.
- `opencode-limit-watch --once` com `OPENCODE_FREE_TIER_ROTATE=false`: não chama `vpn-server-rotate` e loga `rotação ignorada`.
- `bash -n` nos scripts alterados; `verify-docs`; `verify-compose` (8 perfis).
- Runtime: `--countries "Argentina"` falhou no handshake (103.50.33.x) e a re-seleção aleatória no Brasil também; com `VPN_SERVER_HOSTNAMES` fixo (br71…) o túnel voltou (`189.1.168.6`) e `vpn-check` passou 6/6.
- Teste de países com Gluetun temporário: Chile/Colômbia/Peru/México/EUA/Espanha timeout; Portugal/Canadá `auth-failure` (provável rate limit); Argentina timeout; TCP 443 pendurou; porta custom 1231 rejeitada para NordVPN. Apenas o range fixo `br71…` (`189.1.168.x`) conectou.

### Não rodaram / observações

- A mudança de país em runtime depende da API do Gluetun; o teste usa stub de `curl`. Falta validar `--countries` contra o Gluetun real.

## Latest Verification - 2026-10-22 (isolamento host x container + DB)

### Passaram

- `docker compose config`: `XDG_STATE_HOME=/home/desenvolvedor/.local/state-vpn` no `terminal` e no `opencode-supervisor`; `XDG_DATA_HOME` permanece o padrão (`~/.local/share`) para compartilhar DB/sessões/auth com o host.
- `terminal` recriado após reverter o `XDG_DATA_HOME`; `~/.local/share/opencode/opencode.db` (3,0 GB) visível dentro do container; sessões/histórico restaurados.
- `opencode.db`: `VACUUM` concluído em 33,8s, de 17 GB para 3,0 GB; backup `opencode.db.backup-20261022-124116` (3,0 GB).
- `verify-compose` (8 perfis) e `verify-docs`.
- `terminal` recriado; variáveis presentes no container; `opencode-limit-watch` rodando; último `registration replaced` às 16:32 (antes da recriação) e `service.json` estável no host.
- `VACUUM INTO`: 3.141.517.312 bytes; `quick_check ok`; contagens preservadas (1.500 sessões, 67.481 mensagens, 301.831 parts).
- `opencode.db`: `page_count` 4.261.952 e `freelist_count` 3.487.278 (14,3 GB livres).

### Não rodaram / observações

- A compactação in-place (`VACUUM`) encerra todas as instâncias do OpenCode; o resultado fica em `~/.local/share/opencode/compact-db.log`.

## Latest Verification - 2026-10-22 (stack recriada + contenção do OpenCode)

### Passaram

- `./scripts/vpn-switch nordvpn-openvpn` no host: `down` + `up -d --build --force-recreate`; 3 containers recriados (`vpn-1` e `vpn-auto-reconnect-1` healthy, `terminal` Up).
- `vpn-check` no `terminal`: 6/6 ok (túnel, IP público, DNS do túnel, resolução, `/etc/resolv.conf`, `gitlab.omega`).
- `vpn-status --json`: `running`, NordVPN/OpenVPN, IP `189.1.170.12` (São Paulo).
- Egress: container `189.1.170.12` (VPN) x host `168.205.49.98` (direto).
- `terminal` recriado sobe `opencode-limit-watch` via Compose (PID 10 no container).

### Não rodaram / observações

- A sessão OpenCode ativa desta execução ficou no host (`opencode --yolo` em `user.slice`), portanto fora do túnel; a instância do container foi encerrada pela recriação.

## Latest Verification - 2026-10-22 (rotação no limite gratuito do OpenCode)

### Passaram

- Suíte Linux 51/51 (inclui `opencode-limit-watch` no `--help` e classificação v1/v2/banner; `vpn-home-link` linka `tui.json`, `agents/` e `auth.json` e mantém `node_modules` local).
- `bash -n scripts/opencode-limit-watch scripts/opencode-supervisor scripts/vpn-opencode tests/linux/test-scripts.sh`.
- `scripts/verify-docs` ("Documentação e perfis consistentes.").
- `opencode-limit-watch --dry-run --once "AI.Error: Free usage limit reached. Subscribe to OpenCode Go..."` => `free_tier_limit` sem rotacionar.
- Runtime em 2026-10-22 14:40 UTC: o watcher detectou o limite real no log do TUI, rotacionou a VPN (IP `189.1.170.176`, túnel saudável em ~14s) e a sessão voltou a responder; nenhum novo erro de limite depois.

### Não rodaram / observações

- `scripts/verify-compose` não roda dentro do container `terminal` (sem `docker`/socket); rodar no host/CI.
- Runtime real depende de recriar o container `terminal` e aguardar o banner do limite.

## Latest Verification - 2026-10-21 (repo pós-share; suíte 44/44 no host e em container)

### Passaram

- `./scripts/verify-docs` ("Documentação e perfis consistentes."), `./scripts/verify-compose` (8 perfis), `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`, `git diff --check`.
- Suíte Linux 44/44 **no host com a stack no ar** (após tornar a suíte host-safe) e 44/44 em container descartável (`docker run --rm` da imagem `vpn-dev-workspace-terminal`).
- Git: `master` == `origin/master` (0/0); nenhum segredo rastreado (`.secrets/*` em 600).

### Não rodaram / observações

- Antes do ajuste, os 9 falsos negativos no host tinham causas ambientais: `~/.local/bin/env` sombreia o coreutils `env` (35/39); portas fixas 10061-10065 ocupadas pela faixa publicada 10000-10100 (40-44); `container_busy` lê o `/proc` do host e via `opencode serve` vivo (36/37). Corrigido na suíte: `/usr/bin/env`, porta livre + `VPN_PORT_RANGE` restrita, stub de `docker` e `VPN_SESSION_SYNC_FORCE=1` (opt-out do busy).
- ShellCheck local ausente (sem binário e sem imagem); coberto pela CI. O primeiro run do push reprovou por dívida pré-existente (`SC2148` no `scripts/vpn-title-hook.zsh`); após excluir `*.zsh` do ShellCheck/`bash -n` e validar com `zsh -n`, o run `39611786149` ficou verde (validate + secret-scan + Windows, incl. build).

## Latest Verification - 2026-10-17 (ambiente Docker restaurado; stack religada)

### Passaram

- Engine: `docker desktop start` -> `SERVER=29.8.2` (Docker Desktop 4.94.0, containerd 2.3.6); dados em `D:\Docker\vm-data` via junction; pull+build+run do ciclo completo sem incidente.
- Stack: `.\scripts\vpn.ps1 start custom-openvpn` -> 3 containers de pe (`vpn-1` e `vpn-auto-reconnect-1` healthy); `LOCAL_HOSTS` (`host.docker.internal`) aplicado no terminal.
- `vpn-status` no terminal: `VPN: running`, `Perfil: custom (openvpn)`, `IP publico: 189.1.170.11 (Sao Paulo, Brazil)`; `docker exec ... sh -c "whoami"` -> `developer`.

### Nao rodaram / observacoes

- Runtime do `XKIRO_API_KEY` (TUI `xkiro/meta/muse-spark-1.3-contributor:free`) agora possivel (engine de pe); nao executado nesta rodada.
- Push das conversas do container pendente (OpenCode do host ativo durante o start): fechar e rodar `.\scripts\vpn.ps1 sessions-sync --push`.

## Latest Verification - 2026-10-17 (XKIRO_API_KEY no container)

### Passaram

- Estatico: `bash -n` (wrapper, suite e verify-docs) OK; `docker compose config` resolve o mount do segredo (`.secrets/xkiro_api_key` -> `/run/secrets/xkiro_api_key`, ro) no terminal e no supervisor.
- Diagnostico: o host tem `XKIRO_API_KEY` no ambiente do usuario; o container nao a recebia. O gateway (api.xkiro.com) responde 401 sem a chave; a mensagem do Console nao existe no binario (vem do servidor).

### Runtime (feito no container)

- `/run/secrets/xkiro_api_key` montado (54 bytes); o wrapper exporta `XKIRO_API_KEY` antes do binário real.
- `xkiro/meta/muse-spark-1.3-contributor:free` (o modelo do print) → `Model "..." was retired by its provider on 2026-10-17` (aposentado pelo provider hoje) — trocar de modelo.
- `xkiro/qwen/qwen3-coder-plus:free` (default da config) inicia sem o erro do Console.
- Reset do backend do Docker (troca para o distro Ubuntu) recriou o volume `vpn_windows_home`: CLI 2.0.28 reinstalado; `/home/developer/.local` estava root-owned e foi corrigido (`docker run -u root` sobre o volume, pois o terminal tem `cap_drop: ALL`); `.npmrc` do host tem `cache=D:\...` → `NPM_CONFIG_CACHE=/home/developer/.npm` no compose; wrapper movido para `/opt/vpn/bin/opencode` (o bind mount em `~/.local/bin` criava diretórios root-owned na home).

### Não rodaram / observações

- Suíte Linux/CI: o teste 13 (wrapper carrega a chave) roda na CI; não foi possível rodar a suíte localmente durante a janela de instabilidade do Docker.

## Latest Verification - 2026-10-16 IX (título da aba + vpn-ai)

### Passaram

- Causa raiz: `docker compose exec` sem `-e TERM` deixa `TERM` vazio dentro (`TERM_INSIDE=<empty>` medido no container ativo); com `-e TERM` → `xterm-256color`. `TERM: ${TERM:-xterm-256color}` no Compose cobre o exec direto (container `terminal` recriado; direto → `xterm-256color` sem `-e`).
- Bytes OSC atravessam o exec sem filtro: `printf '\e]0;TESTE-TITULO-123\a'` dentro chega como `033 ] 0 ; … \a` fora (validado via `od -c`); cadeia completa sob pty (`script`): precmd do OMZ emite `\e]2;developer@…:/projetos\a` + `\e]1;…\a` intactos.
- Medição nas IAs: `opencode` TUI emite zero OSC 0/1/2 (1230 ESC, nenhum título); `claude` emite `✳ Claude Code` uma vez na abertura — por isso `vpn-ai` anuncia 🤖/✅❌ (sequência sob pty: 🤖, ✅, ✅ via hook; `vpn-ai false` → ❌ exit 1 com código preservado).
- Estático: `bash -n` limpo; `verify-docs` OK; `verify-compose` OK (8 perfis); suite Linux 34/42 — as 8 falhas (home-link, session-sync, socat) reproduzidas na árvore limpa via `stash`, portanto pré-existentes e ambientais.
- Novo teste: `vpn-shell --help` exit 0 (teste 14).

### Não rodaram / observações

- Teste interativo real (aba GNOME refletindo sessão longa de IA via `vpn-ai`) pendente no host com terminal TTY.
- `vpn.ps1 terminal` (bloco `-e TERM` + `WindowTitle`) validado só por leitura — requer Windows real com Docker Desktop.
- Cores dos scripts usam `[[ -t 1 ]]`, não `TERM` — injetar TERM não colore pipes/logs.

## Latest Verification - 2026-10-16 VIII (TUI sem ruído de ALSA)

### Passaram

- Repro em container descartável (com `alsa-utils` instalado só para o teste): `ALSA_CONFIG_PATH=/dev/null aplay -d 1 /dev/zero` → exit 1 + `ALSA lib pcm.c:2664:(snd_pcm_open_noupdate) Unknown PCM default`; com `config/alsa-null.conf` → exit 0 e silencioso; `aplay -L` lista `null` e `default`.
- `docker compose config --quiet` OK nos perfis `vpn` e `vpn+opencode` (env + mounts do ALSA nos dois serviços).
- Suíte Linux 42/42 (teste 12 novo: `alsa-null.conf` define `pcm.!default` como `null`); Pester 9/9; `verify-docs` OK (trava nova do `alsa-null.conf`); shellcheck/`bash -n` limpos.

### Não rodaram / observações

- O container em execução precisa ser recriado para pegar `ALSA_CONFIG_PATH` e o mount (env/vínculo de compose).

## Latest Verification - 2026-10-16 VII (caminhos Windows das instrucoes no container)

### Passaram

- `bash -n scripts/vpn-home-link` OK; teste em sandbox: cria `$HOME/C:/Users/<user>` -> `HOST_HOME_MOUNT` e `$HOME/C:/Dev` -> `/workspace`, idempotente e respeitando os overrides de ambiente.
- No container (com as env do compose): 13/14 referências `(file: ...)` do `AGENTS.md` resolvem a partir da home; a hierarquia obrigatória (`rules.md`, `maestro.md`, `PERSISTENCE.md`, `AGENTS.md`) resolve.
- `AGENTS.md` do host corrigido (`.codex/skills/<nome>` → `.opencode/skills/<nome>`), com backup `AGENTS.md.bak-<ts>`; as linhas `.codex/skills/.system/*` (skill-creator/skill-installer) foram preservadas.

### Não rodaram / observações

- `doctor` é referenciada no `AGENTS.md` mas não existe em `.opencode/skills`, `.orquestrador-maestro/skills` nem `.codex/skills`.
- As referências resolvem quando o runtime resolve o caminho relativo à home (comportamento observado do opencode); a partir de outro diretório, não.

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
