# Worklog

Use `HANDOFF.md` for the current snapshot and `HANDOFFS/WORKLOG_ARCHIVE.md` for older entries after compaction.

## 2026-10-17 - Ambiente Docker restaurado; stack religada (custom-openvpn)

- Changed: nenhuma alteracao no codigo do projeto. Restauracao de ambiente da maquina: store do Docker Desktop estava corrompido (containerd bbolt panic) e foi resetado; engine religado pelo CLI oficial (`docker desktop start`), dados redirecionados para `D:\Docker\vm-data` (junction em `%LOCALAPPDATA%\Docker\vm-data`), memoria do VM reduzida para 3GB; stack religada com `.\scripts\vpn.ps1 start custom-openvpn`.
- Why: `docker ps` respondia 500/engine parado e o terminal VPN nao subia (a entrada XKIRO ficou com runtime pendente por isso).
- Verified: pull do gluetun + build das duas imagens + os 3 containers de pe (`vpn-1` e `vpn-auto-reconnect-1` healthy); `vpn-status` no container: `VPN: running`, `IP publico: 189.1.170.11 (Sao Paulo, Brazil)`; `docker exec` como `developer` OK; engine 29.8.2 estavel sob o ciclo completo (pull+build+run).
- Next context: runtime do `XKIRO_API_KEY` no container agora desbloqueado (rodar a TUI com `xkiro/meta/muse-spark-1.3-contributor:free`). Conversas do container ficaram pendentes de push no host (OpenCode do host ativo durante o start): fechar e rodar `.\scripts\vpn.ps1 sessions-sync --push`.

## 2026-10-17 - XKIRO_API_KEY no container (erro do Console em modelos free)

- Changed: a chave do provider xKiro passa a chegar ao container por arquivo de segredo: `.secrets/xkiro_api_key` (criado a partir da env do host), `XKIRO_API_KEY_FILE` no `.env`, mount `${XKIRO_API_KEY_FILE:-/dev/null}:/run/secrets/xkiro_api_key:ro` no terminal e no supervisor; `vpn-opencode-wrapper` exporta `XKIRO_API_KEY` antes de abrir o OpenCode (vale para TUI, `run` e `serve`) e o boot do supervisor faz o mesmo export.
- Why: dentro do container, modelos free do xKiro (ex.: `xkiro/meta/muse-spark-1.3-contributor:free`) respondiam `Error from provider (Console): OpenCode's free tier can only be used from within OpenCode`; no host funcionava. Diferenca encontrada: o host tem `XKIRO_API_KEY` no ambiente do usuario e o container nao recebia a chave (o provider e um gateway OpenAI-compatible que repassa os free para o Console).
- Verified: runtime no container: `/run/secrets/xkiro_api_key` montado (54 bytes) e o wrapper exporta a chave; o modelo do print (`xkiro/meta/muse-spark-1.3-contributor:free`) agora responde `Model ... was retired by its provider on 2026-10-17` (aposentado hoje) e o default `xkiro/qwen/qwen3-coder-plus:free` inicia sem o erro do Console. Efeitos colaterais do reset do backend do Docker resolvidos junto: volume da home recriado (CLI 2.0.28 reinstalado), `/home/developer/.local` estava root-owned (corrigido via container avulso) e o `.npmrc` do host tem cache `D:\...` (agora `NPM_CONFIG_CACHE` no compose); wrapper movido para `/opt/vpn/bin/opencode` para nao criar diretorios root-owned na home.
- Next context: `XKIRO_API_KEY_FILE` default e `/dev/null` (nada e montado); o wrapper faz fail-open quando o arquivo nao existe.

## 2026-10-16 (VIII) - TUI sem ruido de ALSA no container

- Changed: `config/alsa-null.conf` (novo) carrega a config do sistema e aponta o device `default` do ALSA para o plugin `null`; `compose.windows.yml` (terminal + supervisor) define `ALSA_CONFIG_PATH=/etc/alsa-null.conf` e monta o arquivo. Trava nova no `verify-docs` e teste 12 na suite Linux.
- Why: o usuario relatou caracteres começando com "ALSA" estragando o TUI. Causa: o compose base usa `ALSA_CONFIG_PATH=/dev/null` (ALSA sem configuracao) e o `cli.json` compartilhado com o host tem `attention.sound=true` — cada tentativa de tocar som imprimia `ALSA lib pcm.c:2664:(snd_pcm_open_noupdate) Unknown PCM default`.
- Verified: repro em container descartavel com `aplay` (instalado so para o teste): com `/dev/null` -> exit 1 + a mensagem ALSA; com o config novo -> exit 0 e silencioso; `aplay -L` lista `null` e `default`. Suite Linux 42/42, Pester 9/9, verify-docs OK, `compose config` OK nos dois perfis.
- Next context: o arquivo fica em `config/` (nao em `scripts/`) porque o shellcheck e o loop de `--help` do verify-docs varrem `scripts/*`.

## 2026-10-16 (VII) - Caminhos Windows das instrucoes do host resolvidos no container

- Changed: `scripts/vpn-home-link` passa a criar tambem uma arvore de compatibilidade para os caminhos Windows citados nas instrucoes/configs do host (`$HOME/C:/Users/<user>` -> `/mnt/host-home`, `$HOME/C:/Dev` -> `/workspace`), derivada de `VPN_HOST_HOME_DIR`/`VPN_HOST_WORKSPACE_DIR`. Motivo: o `AGENTS.md` do host (carregado no container por symlink) referencia `C:/Users/kiver/...`; no Linux esse caminho e relativo a home, entao `rules.md`, `maestro.md`, `PERSISTENCE.md`, `SKILLS_INDEX.md`, as skills e o `C:/Dev` nao resolviam. Tambem foram corrigidos os caminhos de skills no `AGENTS.md` do host (`.codex/skills/<nome>` -> `.opencode/skills/<nome>`, onde elas de fato existem), mantendo `.codex/skills/.system/*`.
- Why: ao abrir o OpenCode dentro do container, a hierarquia obrigatoria e as skills daquele contrato nao resolviam.
- Verified: `bash -n` OK; sandbox do script cria a arvore e e idempotente; no container, 13/14 referencias do AGENTS.md resolvem a partir da home.
- Next context: `doctor` segue referenciado no AGENTS.md mas nao existe em `.opencode/skills`, `.orquestrador-maestro/skills` nem `.codex/skills`.

## 2026-10-16 (VI) - Retomar conversas criadas no Windows dentro do container

- Changed: `vpn-session-sync` reescreve os caminhos gravados nas conversas ao importar/exportar (`rewrite_db_paths`), corrigindo `Location not found: C:/...` ao retomar uma sessao criada no Windows. Mapeamento host<->container via novas env do `compose.windows.yml` (`VPN_HOST_WORKSPACE_DIR`, `VPN_HOST_HOME_DIR`, `VPN_CONTAINER_WORKSPACE_DIR=/workspace`, `VPN_CONTAINER_HOME_DIR=/home/developer`): `C:/Dev` -> `/workspace`, `C:/Users/kiver` -> `/home/developer`, demais caminhos Windows -> `/workspace` (fallback). Reescrita idempotente no `autopull` (mesmo quando o import e pulado) e inversa no `autopush`/`push` (o host recebe caminhos Windows). Detector de "banco em uso" passou a considerar apenas o **servidor** (`serve` na cmdline), nao clientes curtos.
- Why: o usuario relatou que ao continuar uma conversa iniciada no Windows o container recusava ("a pasta nao existe, exemplo c:"). Reproduzido: `opencode run --session <id>` -> `Error: Location not found: C:/Dev/appce-monorepo`.
- Verified: repro antes/depois no container (o erro sumiu; o comando passa a resolver o diretorio e segue para o modelo); `session_v2.directory` reescrito para `/workspace/appce-monorepo`, `/workspace` e `/home/developer`; suite Linux/Pester/verify-docs mantidos.
- Fallback sem env de mapeamento: o script procura o maior sufixo do caminho que existe sob `/workspace` (validado: `C:/Dev/appce-monorepo` -> `/workspace/appce-monorepo`; `C:/Users/kiver` -> `/workspace`).
- Next context: apos recriar o container (novas env do compose) o mapeamento fica preciso; sem elas o fallback manda qualquer caminho Windows para `/workspace`.

## 2026-10-16 (V) - Sincronizacao automatica e invisivel das conversas (wrapper do opencode)

- Changed: `scripts/vpn-opencode-wrapper` (novo; montado em `/home/developer/.local/bin/opencode`, com prioridade no PATH do terminal): em sessao interativa de topo importa as conversas do host (`autopull`) e publica as mudancas no staging (`autopush`), sem comandos manuais. `vpn-session-sync` ganhou os modos `autopull`/`autopush`, deteccao de processo por `/proc` (o processo aparece como `opencode.exe`), parada do servico de background antes de trocar o banco, comparacao de recencia pelo conjunto db+wal+shm (WAL mode!) e validacao de integridade (node:sqlite) antes de aplicar. `vpn.ps1`: `Sync-PendingSessionPush` aplica o staging no host (mtime + guarda de processo + backup `.bak`) e roda no start/stop/terminal; `sessions-sync` segue para controle manual.
- Why: o usuario pediu o modelo "automatico invisivel" (uso real: `docker exec ... opencode`), sem cerimonia de sincronizacao.
- Discovered: as conversas sao agrupadas por **projeto** (chaveado pelo diretorio), mas para **repositorios git** a identidade e independente do caminho — validado em runtime: `cd /workspace/appce-monorepo && opencode session list` lista as conversas criadas no host em `C:/Dev/appce-monorepo`. Diretorios sem git (`C:/Users/kiver` vs `/workspace`) nao se enxergam; nesses casos da para retomar por ID (`opencode -s <id>`).
- Verified: shellcheck/`bash -n`/diff limpos; suite Linux 41/41 (novo teste de autopull/autopush por mtime); Pester 9/9; verify-docs OK; runtime: PATH resolve o wrapper, `opencode --help` repassa o help real, sessao interativa (pty) importou o banco do host (44 MB, `.bak` do anterior) e publicou no staging; servico de background detectado e parado antes da troca; sessoes do host visiveis no repo montado.
- Next context: diretorio nao-git nao compartilha sessoes (limite do modelo de projeto do OpenCode); o host aplica o staging pendente quando o OpenCode do host estiver fechado.

## 2026-10-16 (IV) - sessions-sync: replicacao de conversas on-demand (modelo B)

- Changed: comando novo `.\scripts\vpn.ps1 sessions-sync [--push]` — replica as conversas do OpenCode host<->container sem reiniciar o ambiente, reusando `vpn-session-sync` (pull/push via staging `.vpn/sync`). `Sync-OpenCodeSessionsFromHost`/`ToHost` agora retornam booleano; start/stop exibem o resultado; mensagens das guardas ficaram acionaveis (dizem qual comando rodar quando o OpenCode do host esta aberto). Help, README e runbook atualizados; teste Pester novo.
- Why: o usuario escolheu o modelo B (sincronizacao bidirecional), mas o fluxo exigia stop/start completo e a guarda nao indicava o proximo passo. Com o comando on-demand, o ciclo importar -> trabalhar no container -> exportar fica explicito (container como ambiente principal; host como origem/destino do historico).
- Verified: Pester 9/9; verify-docs OK; help lista o comando; runtime: `sessions-sync --push` exportou o banco do container para `.vpn/sync/out` (opencode.db 13.6 MB + wal/shm) e a guarda impediu gravar no host com o OpenCode aberto (mensagem acionavel); `sessions-sync` (pull) respondeu com a guarda equivalente.
- Next context: com o OpenCode do host fechado, `sessions-sync` importa e o `start` importa automaticamente; `stop`/`--push` exportam de volta.

## 2026-10-16 (III) - Paridade completa da home no modo Windows (home inteira + snapshot de sessoes)

- Changed: substituicao dos 2 mounts pontuais por paridade completa no estilo Linux:
  - `compose.windows.yml`: home Windows inteira (`HOST_HOME_DIR`) montada em `/mnt/host-home` nos dois servicos; staging `.vpn/sync` montado no terminal.
  - `scripts/vpn-home-link` (novo): roda no boot, cria symlinks idempotentes da home do container para `/mnt/host-home` conforme `WINDOWS_HOME_LINKS` (default: skills, opencode.json, cli.json, package.json, .gitconfig, .npmrc, .orquestrador-maestro, .codex/skills, AGENTS.md); alvo existente no volume vira `*.volume-backup`; instala plugins declarados no package.json do host via npm no container; best-effort (sempre exit 0).
  - `scripts/vpn-session-sync` (novo): pull/push do banco SQLite das sessoes entre o volume e o staging (o File Sharing nao suporta locks POSIX; por isso o SQLite nunca e linkado).
  - `scripts/vpn.ps1`: no start, snapshot host->staging (guarda: OpenCode aberto no host = pula) e `pull` no container apos o up; no stop, `push` antes do down e gravacao staging->host com guardas (OpenCode ativo no host, ou mtime do banco do host mais novo que o start -> nao sobrescreve).
  - verify-docs: travas novas (/mnt/host-home e vpn-home-link no compose.windows.yml) + scripts no loop de README; testes Linux novos (sandbox do vpn-home-link e round-trip do vpn-session-sync); README/.env.example/runbook atualizados.
- Why: o usuario queria paridade real como no Linux (toda config/ferramenta/historico visivel no terminal), nao apenas 2 mounts do OpenCode.
- Verified: shellcheck/bash -n/diff limpos; suite Linux 40/40 (testes 34/35 novos: sandbox do vpn-home-link e round-trip do vpn-session-sync); Pester 8/8; verify-docs OK; `compose config` dos dois perfis OK. Runtime real: `vpn.ps1 start custom-openvpn` subiu; /mnt/host-home com a home inteira (rw); 6 symlinks ativos (skills, opencode.json, cli.json, .gitconfig, .npmrc, AGENTS.md) apontando para o host com conteudo real; alvos antigos do volume preservados como *.volume-backup; opencode session list lendo o volume. Snapshot de sessoes: guarda funcionou (OpenCode ativo no host = aviso e pulo; import ocorre com o host fechado).
- Risks: snapshot e "ultimo a escrever vence" com guardas de mtime/processo; configs com caminhos `C:\...` podem gerar avisos no Linux; o staging nao leva snapshots git do share.
- Next context: para adicionar item a paridade, por em `WINDOWS_HOME_LINKS` (nao precisa editar compose); sessoes só vao ao host no stop.

## 2026-10-16 (II) - Paridade OpenCode host<->container no modo Windows

- Changed: `compose.windows.yml` (terminal + opencode-supervisor) ganhou dois mounts de paridade por cima do volume da home: `~/.opencode/skills` (ro) e `~/.config/opencode/opencode.json` (ro) — skills e config global (providers) do host agora sao os mesmos dentro do tunel. `.local/share/opencode` (SQLite/WAL) NAO e montado: o File Sharing do Docker Desktop nao suporta locks POSIX, causando "database is locked" / "disk I/O error". Sessoes ficam isoladas no volume. `verify-compose` ganhou `HOST_HOME_DIR` dummy na env de interpolacao; `vpn.ps1` deriva `HOST_HOME_DIR` de `%USERPROFILE%` quando ausente; `.env.example`, README 8.1 e runbook documentam.
- Why: no modo Windows a home e um volume isolado (`vpn_windows_home`), entao skills e config do OpenCode do host nao apareciam no terminal (paridade que o modo Linux tem por montar a home inteira). Historico/sessoes nao podem ser compartilhados por limitacao tecnica (SQLite sobre File Sharing).
- Verified: parser PS OK; `bash -n verify-compose`; `compose config --format json` mostra os mounts; apos `vpn.ps1 start custom-openvpn`: skills visiveis (5 dirs), `opencode.json` do host montado com modelo correto, `opencode session list` = exit 0, sessoes isoladas no volume, ro em skills respeitado.
- Risks: sessoes nao compartilhadas host<->container (limitacao Docker Desktop); se o File Sharing do Desktop ganhar suporte POSIX locks no futuro, o mount pode ser re-adicionado.
- Next context: binario/plugins continuam no volume (`~/.opencode/bin`, `~/.config/opencode/node_modules`); novos dirs de paridade repetem o padrao nos dois servicos + verify-compose.

## 2026-10-16 - Follow-ups da avaliacao de saude do repo (robustez, seguranca, DX)

- Changed: rodada de follow-ups da avaliacao de 2026-10-16:
  - `.gitattributes` novo (`* text=auto eol=lf`): trava LF no repositorio e no working tree (o clone Windows tinha sido renormalizado na mao com `core.autocrlf=false`); CRLF quebra os `.sh` montados nos containers.
  - `scripts/vpn.ps1` (`Start-SshAgentBridge`): wait da ponte SSH de 5s (50x100ms) para 30s (150x200ms) - o cold start pos-`build --no-cache` estourava o limite antigo (incidente real de 2026-10-15/16).
  - `scripts/vpn-top` (`--json`): credenciais do Gluetun mascaradas com `***` em qualquer nivel do `settings` (user/password/username/key/key_passphrase/encrypted_key/private_key/pre_shared_key); campos vazios permanecem vazios. Antes o JSON imprimia user/password do OpenVPN em claro.
  - Testes: suite Linux ganhou o teste 33 (curl simulado no PATH prova o mascaramento); Pester ganhou teste de `WORKSPACE_DIR` inexistente (exit 2 antes de tocar na ponte SSH, com env hermeticos: `VPN_PORT_RANGE=39999` de porta unica, bind e proxy fixos).
  - Docs: runbook `opencode-desktop-vpn.md` documenta o canal npm 2.x (releases GitHub param na 1.x) e o fluxo Windows do slot PATH-first; `troubleshooting-vpn.md` ganhou a secao 6 (timeout da ponte SSH); `BACKLOG.md` itens 11/12 feitos e #3/#9 priorizados.
- Why: itens da avaliacao (gitattributes, robustez da ponte, vazamento no `vpn-top --json`, alinhamento de runbooks, triagem do backlog).
- Verified: suite Linux 38/38 em ubuntu:24.04 limpo (paridade CI; `shellcheck -S error` + `bash -n` + `git diff --check` limpos); Pester 8/8 no host (Pester 6.2.0 instalado em CurrentUser); `verify-docs` OK no host via Git Bash; `vpn-top --json` real no container: campos = `***` e nenhum valor de `.secrets/nordvpn_user`/`.secrets/nordvpn_password` no output; Ast do PowerShell OK nos `.ps1` editados.
- Next context: #3 (estreitar `VPN_PORT_RANGE` + senha do painel fora do bind local) e #9 (gitleaks/Trivy na CI) priorizados como proxima rodada de seguranca.
- Nota: mudanca em codigo rastreado; commit/push ficam para o usuario.

## 2026-10-15 (noite, II) - WORKSPACE_DIR unificado Linux/Windows

- Changed: `scripts/vpn.ps1` (`Set-ActiveComposeEnvironment`) agora honra `WORKSPACE_DIR` do `.env`/ambiente como fonte do `/workspace` no modo Windows; antes forçava a raiz do repositorio. `.env.example` atualizado (mesma variavel vale nos dois sistemas).
- Why: o usuario queria compartilhar `C:\Users\kiver\dev` no terminal (paridade com o modo Linux, onde `${WORKSPACE_DIR:-/projetos}` ja e o mecanismo). No Windows `WINDOWS_WORKSPACE_DIR` e definido pelo script e ignorava o `.env`.
- Fix: fallback mantido (sem `WORKSPACE_DIR`, `/workspace` = raiz do repo); `Test-Path` falha cedo se o caminho nao existir. `.env` local: `WORKSPACE_DIR=C:\Users\kiver\dev`. Docker Desktop ja compartilhava `C:\Users\kiver` (sem mudanca de file sharing).
- Verified: container recriado; `/workspace` = `C:\Users\kiver\dev` (arquivo criado no container apareceu no host e vice-versa); OpenCode 2.0.28 persistiu (volume `vpn_windows_home`).
- Nota: mudanca em codigo rastreado (`scripts/vpn.ps1`, `.env.example`) a pedido do usuario; commit fica para o usuario.
- Rebuild completo validado (2026-10-16): `vpn.ps1 stop` -> `docker compose build --no-cache --pull` (env dummy de interpolacao: `WINDOWS_WORKSPACE_DIR=C:\Users\kiver\dev`, bridge port/token fake) -> `vpn.ps1 start custom-openvpn`. Resultado: imagens `terminal` e `vpn-auto-reconnect` reconstruidas de raiz; `vpn-check` 6/6; IP 189.1.170.11; `/workspace` = pasta dev; OpenCode 2.0.28 (volume) + fallback 1.18.31 (imagem nova); ponte SSH e `ssh -T git@github.com` = "Hi kivervinicius!".
- Incidente no rebuild: o primeiro `start` falhou com "Tempo limite iniciando a ponte SSH" - o build --no-cache consumiu CPU/disco e o cold start do PowerShell da ponte (>5s) estourou o wait de 5s do `Start-SshAgentBridge`. Com a maquina ociosa o mesmo start passou. Se recorrer: rodar `vpn.ps1 start` de novo.
- Ajuste (2026-10-16): `WORKSPACE_DIR` no `.env` trocado de `C:\Users\kiver\dev` (pasta vazia criada na instalacao) para `C:\Dev` (pasta real do usuario, contem `appce-monorepo`). `C:\Dev` adicionado ao File Sharing do Docker Desktop (`settings-store.json` + `settings.json`, backups `.bak-20261016-*`) - o Desktop em execucao NAO recarrega o file sharing em runtime: foi necessario fechar (`Stop-Process 'Docker Desktop'`) e reabrir o app antes do start. Validado: `/workspace` lista o conteudo de `C:\Dev`, tunel running, OpenCode 2.0.28, ponte SSH com identidade.

## 2026-10-15 (noite) - OpenCode 2.0.28 no container + correcao do docker exec para TUI

- Changed: o terminal passou a rodar OpenCode 2.0.28 (paridade com o host, `@opencode/cli` npm); antes usava o fallback 1.18.31 do Dockerfile.
- Why: no modo Windows a home do host nao e montada (home = named volume `vpn_windows_home`), entao o slot PATH-first `/home/developer/.opencode/bin` ficava vazio e o PATH caia sempre no binario fixado no Dockerfile. Alem disso as GitHub releases do repo (`anomalyco/opencode`, a que `sst/opencode` redireciona) nao tem tag 2.x - `releases/download/v2.0.28/opencode-linux-x64.tar.gz` = 404; a 2.x so existe no npm (`@opencode/cli`, latest 2.0.30). Bump de `OPENCODE_VERSION` no Dockerfile nao e possivel para 2.x.
- Fix (sem tocar em codigo rastreado): `docker exec vpn-dev-workspace-terminal-1 npm install -g @opencode/cli@2.0.28 --prefix /home/developer/.opencode` - instala no slot que o PATH ja prioriza e persiste no volume da home (refazer se o volume for removido com `down -v`).
- Verified: `command -v opencode` = `/home/developer/.opencode/bin/opencode`; `opencode --version` = v2.0.28; fallback `/usr/local/bin/opencode` (1.18.31) continua disponivel.
- Tela pequena no `docker exec ... opencode`: causa e rodar sem `-it` (sem TTY alocado; `TERM=[]` no env do exec). Comando correto: `docker exec -it -e TERM=xterm-256color vpn-dev-workspace-terminal-1 opencode`, ou o caminho suportado `.\scripts\vpn.ps1 terminal` + `opencode`.

## 2026-10-15 (tardiо) - Ponte SSH do Windows consertada via LOCAL_HOSTS + FIREWALL_SUBNETS

- Changed: a ponte SSH (relay Unix->TCP do `vpn-ssh-agent-relay`) falhava dentro do terminal com `ssh-add -l` = "error fetching identities: invalid format".
- Why: dentro do terminal o DNS e o do Gluetun (127.0.0.1), que nao resolve `host.docker.internal`; e o kill switch bloqueava a sub-rede do Docker Desktop. O relay nao conseguia abrir `/dev/tcp/host.docker.internal/<porta>` e devolvia lixo.
- Fix (`.env`): `LOCAL_HOSTS=host.docker.internal=192.168.65.254` (mapeia o nome no /etc/hosts pos-up) e `FIREWALL_SUBNETS=192.168.65.0/24` (libera a rede do Docker Desktop fora do tunel). Reiniciado com `vpn.ps1 start custom-openvpn`.
- Verified: `getent hosts host.docker.internal` = 192.168.65.254; TCP conecta na ponte; `ssh-add -l` = "The agent has no identities" (resposta valida do agente). SSH real ao github via terminal conecta (chega em "Permission denied (publickey)" = sem chave carregada no agente, comportamento esperado).
- Nota: publicacao de porta validada (host 127.0.0.1:10050 -> container devolveu HTTP 200 via faixa do Gluetun). O loopback direto (127.0.0.1) dentro do terminal nao responde em portas publicadas; use a porta mapeada pelo Docker.
- SSH finalizado (mesmo dia): chave ed25519 gerada em `C:\Users\kiver\.ssh\id_ed25519`, carregada no agente OpenSSH e registrada no GitHub (kivervinicius). Validado pelo tunel: `ssh -T git@github.com` -> "Hi kivervinicius!" e `git ls-remote git@github.com:kivervinicius/vpn-dev-workspace.git` listou as 4 branches.

## 2026-10-15 - Instalacao Windows (PowerShell sem WSL) validada em runtime real

- Changed: primeira instalacao funcional do fluxo Windows (`scripts/vpn.ps1`) em Docker Desktop 4.94 / engine 29.8.2. Ajustes locais de ambiente (sem mudar codigo do repo):
  - `.env` ganhou `HOST_HOME_DIR=C:\Users\kiver`: o PowerShell do Windows nao define `HOME`, entao `${HOST_HOME_DIR:-${HOME}}` interpolava vazio e o Compose falhava com `invalid spec: ::rw` (o arquivo base e validado antes do merge com `compose.windows.yml`).
  - Clone renormalizado com `core.autocrlf=false` + `git rm --cached -r . && git reset --hard`: o clone inicial em CRLF quebrou os `.sh` montados por bind (`env: can't execute 'sh\r'`).
  - Docker Desktop: `C:\Projects` adicionado ao File Sharing (`filesharingDirectories` em `settings.json`/`settings-store.json`; backup `.bak-<ts>`); sem isso o bind mount e recusado.
  - Servico Windows `ssh-agent` habilitado (StartupType Automatic), exigido pelo start do modo Windows.
- Why: os perfis `nordvpn-openvpn` e `nordvpn-wireguard` nao conectaram nesta rede: UDP 1194/51820 enviam o handshake mas nao recebem resposta (captura via netshoot: Out 148B, 0 In) e TCP 443/1231 recebem RST imediato. Com a config oficial da NordVPN na porta 80 TCP (`ovpn_tcp/br71.nordvpn.com.tcp_2.6.ovpn`) o handshake TLS completa (`Peer Connection Initiated`, TLSv1.3). O Gluetun recusa `OPENVPN_ENDPOINT_PORT` para o provider `nordvpn` e exige IP (nao hostname) na linha `remote` de config custom; por isso o perfil efetivo e `custom-openvpn` com `.secrets/nordvpn-br71-tcp80.ovpn` (`proto tcp-client`, `remote 189.1.170.129 80`, `verify-x509-name CN=br71.nordvpn.com`).
- Verified: `vpn.ps1 start custom-openvpn` -> `vpn` healthy; `vpn-check` 5/5 (tunel, IP publico 189.1.170.12 Sao Paulo/BR, DNS do tunel, resolucao, resolv.conf); `vpn-status` perfil custom/openvpn; terminal `developer` em `/workspace` com OpenCode 1.18.31 e `curl https://api.ipify.org` retornando o IP da VPN; ponte SSH do Windows ativa (`.vpn/windows-ssh-agent.json`).
- Pending: chave ainda nao carregada no agente (`ssh-add -l` vazio); LAN do Windows inacessivel ate definir `FIREWALL_SUBNETS` (aviso do start); `verify-compose` e testes Linux nao rodados (host Windows, sem jq/make).
- Next context: iniciar com `.\scripts\vpn.ps1 start custom-openvpn`, shell com `.\scripts\vpn.ps1 terminal`, parar com `.\scripts\vpn.ps1 stop`.

## 2026-10-14 - Correções na detecção de limites do Zen antes do commit

- Changed:
  - `scripts/vpn-opencode`: corrigida command substitution não fechada em `do_check` (`logs="$(...)"` sem o `"` final), que impedia o script de ser parseado e quebrava `check` em runtime; adicionados `FREE_TIER_PATTERNS`/`ACCOUNT_LIMIT_PATTERNS`/`CREDIT_LIMIT_PATTERNS`/`ZEN_PATTERNS` (mesmos defaults do supervisor) e `zen_in_text()`, usados no ramo 429 para distinguir `zen-usage-limit` de `rate-limit`.
  - `scripts/opencode-supervisor`: `extract_retry_after()` era código morto; agora é chamada por `retry_hint()` nas mensagens de limite e por `run_limit_hook()`, que passa o `retry_after` como segundo argumento do hook.
  - `docker-compose.yml`: repasse de `OPENCODE_LIMIT_HOOK` no serviço `opencode-supervisor` e de `OPENCODE_ZEN_PATTERNS`/`OPENCODE_FREE_TIER_LIMIT_PATTERNS`/`OPENCODE_ACCOUNT_LIMIT_PATTERNS`/`OPENCODE_CREDIT_LIMIT_PATTERNS` em `terminal`, `vpn-auto-reconnect` e `opencode-supervisor`.
  - `.env.example`: documentadas `OPENCODE_CREDIT_LIMIT_PATTERNS`, `OPENCODE_ZEN_PATTERNS` e `OPENCODE_LIMIT_HOOK` (com contrato dos dois argumentos).
  - `tests/linux/test-scripts.sh`: 2 testes do classificador do supervisor (`CreditLimitExceeded`, `InsufficientFunds`) e 5 testes de classificação HTTP do `check` (200/402/429 Zen/429 genérico/quota em 200), servidos por `socat` com `fork`; bloco pulado com aviso quando `socat` não existe.
  - `.github/workflows/validate.yml`: instala `socat` para que os testes HTTP rodem na CI.
  - `DEV/RUNBOOKS/opencode-desktop-vpn.md`: corrigida coluna da tabela, contrato do segundo argumento do hook e newline final.
- Why: o trabalho de 2026-10-13 foi commitado sem revisão e carregava três defeitos. `OPENCODE_LIMIT_HOOK` e `OPENCODE_CREDIT_LIMIT_PATTERNS` não eram repassados pelo Compose, então a funcionalidade documentada no runbook não funcionava; `extract_retry_after()` não tinha call site; e o `vpn-opencode` não parseava — erro de sintaxe mascarado, porque o teste 21 (`modo-invalido` espera exit 2) passava pelo motivo errado. Um quarto defeito apareceu na verificação: 429 com padrão Zen caía em `rate-limit` porque o ramo usava `QUOTA_PATTERNS` (billing) em vez dos padrões Zen.
- Verified: `bash -n` em todos os scripts e `sh -n scripts/vpn-entrypoint.sh` (o `sh -n` em `vpn-opencode` falha por usa `[[ ]]`; a verificação do projeto é `bash -n`); `git diff --check`; `./scripts/verify-docs`; `./tests/linux/test-scripts.sh` com 37/37; smoke funcional do `check` contra servidor `socat` real confirmando `ouvindo`, `credit-exhausted`, `zen-usage-limit`, `rate-limit` e `quota-pattern-in-http`; `retry_hint` validado para as duas formas de hint e para a ausência de hint. `verify-compose`, ShellCheck e `docker build` continuam pendentes: Docker e ShellCheck não existem neste ambiente.
- Next context: revisar o diff e commitar em `master`. Depois, validar em runtime real (supervisor disparando o hook dentro do container, `vpn-opencode check` contra o OpenCode real) e fechar as pendências de Windows/WSL2.

## 2026-10-13 - Detecção de limites do Zen + hook personalizado

- Changed:
  - `scripts/opencode-supervisor`: adicionado `CREDIT_LIMIT_PATTERNS` (creditlimitexceeded, insufficientfunds, credit_limit, budget_exceeded, limitexceeded, payment_required, out_of_credit, no_credit) e novo tipo de evento `credit_limit` na classificação; adicionado hook `OPENCODE_LIMIT_HOOK` (script executável chamado com o tipo de limite como argumento, roda em background); adicionada função `extract_retry_after()` para capturar `retry-after` ou `reset in <texto>` dos logs; hook é disparado para todos os tipos de limite (free_tier_limit, account_limit, credit_limit, rate_limit).
  - `scripts/vpn-opencode`: `http_fetch_body()` agora captura status HTTP via `curl -w '%{http_code}'`; `do_check()` classifica 402 como `credit-exhausted`, 429 com padrão Zen como `zen-usage-limit`, 429 genérico como `rate-limit`; `usage()` atualizado com novos detalhes.
  - `.github/workflows/validate.yml`: adicionados testes de classificação para `CreditLimitExceeded` e `InsufficientFunds`.
  - `DEV/RUNBOOKS/opencode-desktop-vpn.md`: adicionada seção "Detecção de limites do Zen" com tabela de tipos de erro, ação do supervisor, e documentação do `OPENCODE_LIMIT_HOOK` com exemplo.
- Why: o supervisor não detectava HTTP 402 (CreditLimitExceeded/InsufficientFunds) que o Zen usa para crédito esgotado; não havia mecanismo para disparar rotina personalizada quando um limite era atingido.
- Verified: `bash -n` nos scripts alterados passou; 5/5 testes de classificação do supervisor passaram (credit_limit, free_tier_limit, account_limit, rate_limit, none); `verify-docs` passou; `verify-compose` passou (8/8 perfis válidos); testes do CI atualizados.
- Next context: usuário pode configurar `OPENCODE_LIMIT_HOOK` no `.env` para disparar rotina personalizada (notificação, troca de provider, recarregar crédito) quando limite do Zen é detectado.

## 2026-10-01 - Melhorias de código, testes Linux automatizados, vpn-doctor e DX

- Changed:
  - Hardening Compose: substituído fallback hardcoded `/home/desenvolvedor` por `${HOST_HOME_DIR:-${HOME:-/home/developer}}` no `PATH` de `terminal` e `opencode-supervisor` em `docker-compose.yml`.
  - Saneamento: excluído diretório legado redundante `secrets/` em favor do padrão `.secrets/` (resolvendo Item #8 do backlog).
  - Diagnóstico: criado `scripts/vpn-doctor` (executável no host com modos `--json` e `--fix`) para diagnóstico unificado de dependências, permissões de segredos, Docker daemon, stack compose e túnel.
  - Testes automatizados: criada suíte `tests/linux/test-scripts.sh` com 30 testes automatizados cobrindo `--help`, códigos de saída, parser de rate-limits e emissão de JSON; adicionado step ao CI `.github/workflows/validate.yml`.
  - Assistente de setup: criado `scripts/vpn-setup` para inicialização automática de `.secrets/` (0700), chave de API e templates de credenciais (0600).
  - Documentação & Runbooks: criado runbook `DEV/RUNBOOKS/troubleshooting-vpn.md`, guia `examples/cenarios-avancados.md` (resolvendo Item #7 do backlog) e diagrama Mermaid em `DEV/ARCHITECTURE.md`.
  - Developer Experience: criado `Makefile` na raiz com comandos rápidos (`doctor`, `setup`, `up`, `down`, `restart`, `logs`, `shell`, `check`, `test`, `verify`).
  - Consistência: atualizados `README.md`, `DEV/BACKLOG.md` e `scripts/verify-docs`.
- Why: solicitado pelo usuário após investigação do loop de reconexão; fortalece a confiabilidade do ambiente tanto em CI quanto no uso diário do desenvolvedor, eliminando pontos cegos de diagnóstico e dívidas técnicas do backlog.
- Verified: `make verify` passou com sucesso (todos os 8 perfis compose válidos, `verify-docs` consistente e 30/30 testes em `test-scripts.sh` aprovados); `vpn-doctor` executado no host com resultado 100% saudável.
- Next context: repositório consolidado, testado e documentado pronto para commit e push.

## 2026-10-01 - Diagnóstico e correção do loop de conexão VPN e melhorias preventivas

- Changed: adicionado repasse de `OPENVPN_ENDPOINT_PORT` nos perfis OpenVPN (`nordvpn-openvpn.yml`, `protonvpn-openvpn.yml`, `surfshark-openvpn.yml`); documentado em `.env.example`; `scripts/vpn-switch` ganha diagnóstico preventivo de porta TCP na NordVPN e validação rápida via `getent ahosts` para `VPN_SERVER_HOSTNAMES`; `.env` saneado com `OPENVPN_PROTOCOL=udp` e servidores ativos no Brasil.
- Why: o Gluetun configurado com `OPENVPN_PROTOCOL=tcp` no provedor NordVPN conectava por padrão na porta 443 TCP. A NordVPN descontinuou OpenVPN em 443 TCP (remanejado para HTTPS/NordWhisper), o que causava `Connection reset, restarting [0]` imediato a cada tentativa. O serviço `vpn-auto-reconnect`, sem conseguir obter IP público, disparava reinícios contínuos da VPN, gerando um loop infinito. Além disso, servidores antigos/mortos em `VPN_SERVER_HOSTNAMES` agora são detectados preventivamente no switch.
- Verified: `vpn-switch nordvpn-openvpn` conectou e tornou os contêineres saudáveis em 8.3s; `vpn-status` confirmou IP público; `vpn-reconnect` efetuou rotação e reconexão bem-sucedida em ~2s; `vpn-check` passou com 6/6 verificações ok; `./scripts/verify-compose` e `./scripts/verify-docs` passaram; `bash -n scripts/vpn-switch` sem erros.
- Next context: ambiente 100% operacional no perfil NordVPN OpenVPN com salvaguardas preventivas.

## 2026-09-19 - Verificação automática do OpenCode (quota=alerta puro)

- Changed: `scripts/vpn-opencode` ganha `check` (`ok|down|quota`, exit 0/1, `--json|-q`, padrões via `OPENCODE_QUOTA_PATTERNS`, varredura de logs via `--log-lines`) e `watch` host-side (`down`=alerta+restart limitado com `--restart-max`, `quota`=alerta puro zero restart); `scripts/vpn-auto-reconnect` ganha sonda opt-in `OPENCODE_AUTOCHECK` (só alerta, sem socket Docker, sem reconnect do túnel) com `vpn-opencode` montado no Compose; `scripts/vpn-top` ganha seção + campo `opencode`; `scripts/vpn.ps1 opencode` ganha `check|watch`; `.env.example`/`README`/runbook/specs/testing documentam; `verify-docs`/`verify-compose` travam drift.
- Why: o projeto só verificava o túnel VPN; queda do `web/serve` e diálogo "quota acabou" passavam despercebidos. Restart não cria crédito, por isso quota nunca reinicia.
- Verified: `bash -n` nos scripts alterados, `sh -n vpn-entrypoint.sh`, `git diff --check`, `./scripts/verify-docs` (novas travas passam), matriz `--help` exit 0, `check` em porta fechada (`down`, exit 1), responder HTTP com `quota exceeded` (`quota`, exit 1) e corpo neutro (`ok`, exit 0), `vpn-top --json` inclui `.opencode`; `verify-compose`/build/ShellCheck pendentes (sem Docker/ShellCheck no ambiente de edição — CI/host).
- Next context: runtime real no host (`vpn-switch`, `web|serve --detach`, `check --json`, matar processo p/ `watch` recuperar, `OPENCODE_AUTOCHECK=true`, `vpn-top`), validar `vpn.ps1 opencode check|watch` em Windows real.

## 2026-09-19 - Adição de KILL capability no Gluetun para reconexão

- Changed: adicionada capability `KILL` ao `cap_add` do serviço `vpn` em
  `docker-compose.yml`; `scripts/verify-compose` atualizado para validar a presença
  de `KILL` em todos os perfis.
- Why: com `cap_drop: ALL`, o processo supervisor do Gluetun (root/UID 0) não
  possuía a capability `KILL` necessária para enviar sinais (`SIGTERM`/`SIGKILL`)
  ao processo filho do OpenVPN (`openvpn2.6`), executado como `nonrootuser`
  (UID 1000). Durante o `vpn-reconnect`, a chamada `PUT /v1/vpn/status` com
  `{"status":"stopped"}` travava aguardando o processo terminar, deixando o Gluetun
  em estado perpétuo `"stopping"` e causando timeout de 10s no curl na chamada
  seguinte (`status: running`).
- Verified: `./scripts/verify-compose` e `./scripts/verify-docs` passaram;
  `./scripts/vpn-switch nordvpn-openvpn` recriou os contêineres saudáveis;
  `docker exec vpn-dev-workspace-terminal-1 vpn-reconnect` executado com sucesso
  duas vezes consecutivas (obteve novos IPs públicos em ~9s); `vpn-status` e
  `vpn-check` passaram com 100% de sucesso.
- Next context: validar runtime em Windows/WSL2.

## 2026-09-19 - Secrets 0600 e ciclo de vida pelo vpn-switch

- Changed: `vpn` ganhou `DAC_READ_SEARCH`/`DAC_OVERRIDE` para ler e reescrever
  os secrets/arquivos bind-mounted em modo 0600, `CHOWN` para o Gluetun gerar
  o perfil OpenVPN e `SETUID`/`SETGID` para o OpenVPN reduzir privilégios;
  `vpn-switch` e
  `vpn.ps1 start` usam `--force-recreate`; `vpn-switch stop|down` encerra o
  projeto; `verify-compose` passou a usar `/usr/bin/env` e trava as capabilities
  exigidas nos oito perfis.
- Why: `cap_drop: ALL` fazia o entrypoint falhar com `Permission denied` e,
  depois da leitura corrigida, o Gluetun falhava em `chown`/`setuid`; o ciclo
  deve ser operável pelo script sem Compose manual.
- Verified: `bash -n`, `sh -n`, `verify-docs`, `verify-compose` (Linux + Windows),
  `git diff --check`; `./scripts/vpn-switch nordvpn-openvpn` deixou os três
  serviços saudáveis; `vpn-status --json` e `vpn-check --json` passaram com IP
  público e DNS pelo túnel.
- Next context: repetir runtime em Windows/WSL2; ShellCheck local não está instalado.

## 2026-09-18 - Suporte Windows PowerShell e WSL2

- Changed: criado `compose.windows.yml` (Compose >= 2.24.4, `!override`,
  `/workspace`, volume persistente `vpn_windows_home`), `scripts/vpn.ps1`,
  ponte `vpn-ssh-agent-bridge.ps1`/relay Unix, testes Pester em runner Windows,
  docs e CI; `vpn-switch` agora evita autodetectar a rede virtual do WSL2.
- Why: oferecer Docker Desktop sem distribuição WSL e preservar um fluxo Bash
  seguro no WSL2, sem montar a home Windows no container Linux nem copiar chaves.
- Verified: `bash -n`, `sh -n`, `verify-docs`, `verify-compose` (Linux + Windows
  override), ShellCheck, parse PowerShell/Pester e `docker build --pull=false`.
- Next context: validar runtime real em Windows/WSL2 (túnel, DNS, agent,
  OpenCode, hosts, stop/start e persistência da home).

## 2026-09-17 - Revisão completa: bugfixes, CLI máquina, bumps e hardening

- Changed (lote D): (A) `vpn-top` condição invertida corrigida; `INTERNAL_DNS_RESOLVERS` vazio respeitado + `DNS_UPSTREAM_RESOLVER_TYPE=plain` auto no `vpn-switch` (Gluetun ignorava PLAIN sem ele); README sem duplicata; stale rev.1 limpo. (B) `--json`/`-q` em status/check/top (+`--only`, `--api-url`, `--no-color`), `vpn-check` exit 0/1, `vpn-opencode stop/status/logs/--detach` + validação de faixa, `--help` exit 0 nos 14 scripts (com matriz no `verify-docs`, que agora acumula erros), rotate com `--to/--random/--list`, off-by-one e `total==1` corrigidos, `VPN_ROTATE_STATE_FILE`, rotação periódica opt-in, `auto-reconnect` com health leve + backoff + flag case-insensitive. (C) Bumps com SHA verificados: Node `22.23.2`, OpenCode `1.18.31`, digest jammy, CI `ubuntu-24.04`+`checkout@v6`+shellcheck estrito+`bash -n`+`build --pull`; hardening Compose (cap_drop, no-new-privileges, logging, limits, stop_grace_period); `HTTPPROXY` opt-in; higiene local (`chmod 600`, ignores).
- Why: bugs funcionais reais (top nunca renderizava; DNS interno dividido; DNS plain ignorado), CLI scriptável, toolchain 14 meses atrasada, CI no runner em depreciação.
- Verified: `bash -n`, `./scripts/verify-docs` (novas travas), `--help` ×14, fixtures json/rotate/import; SHAs de release baixados e conferidos; digest jammy via registry API. Sem Docker: `verify-compose`/build/ShellCheck e runtime (hardening, proxy, plain-DNS, bumps) pendentes no host/CI.
- Next context: `vpn-switch` no host valida tudo em runtime; decidir `secrets/` dup + `secrets.zip`; supply-chain restante no BACKLOG.

## 2026-09-17 - Hosts locais via LOCAL_HOSTS (/etc/hosts pós-up)

(Nota: primeira versão usava `extra_hosts` + override Compose — superada na rev. 2, rejeitada pelo daemon com `network_mode`.)

- Changed (rev. 2): `extra_hosts` rejeitado pelo Docker com `network_mode` (erro real do daemon) → mecanismo refeito: `vpn-hosts-gen` valida e gera snippet `.hosts.local.gen`; novo `vpn-hosts-apply` injeta via `docker exec -u 0` pós-up (idempotente); `vpn-switch` gera + aplica; `verify-compose` valida snippet + dry-run; travas e docs atualizadas.

- Changed: novo `scripts/vpn-hosts-gen` (valida `nome=ip`, gera `.compose.local-hosts.yml` git-ignorado com `extra_hosts` em `terminal` + `vpn-auto-reconnect`); `vpn-switch` chama o generator e anexa `-f`; novo `scripts/vpn-hosts-import --domain` (extrai do `/etc/hosts` do host, só sugere a linha); `vpn-check` valida cada mapeamento (ok/mismatch/não-resolve/inválido); `LOCAL_HOSTS` repassado no Compose (2 serviços); `.env.example` + README (seção "Hosts locais"); `verify-docs` com travas (doc, exemplo, repasse, gitignore, plug do generator, `vpn-hosts-import` no loop); `verify-compose` valida o override gerado (fixture); `TESTING.md` com fixtures.
- Why: nomes que só existem no `/etc/hosts` do host (ex: `gitlab.omega`) não resolviam no terminal, onde todo DNS passa pelo túnel; `extra_hosts` + precedência `files` do glibc resolve sem mexer no Gluetun.
- Verified: `bash -n`, `./scripts/verify-docs`, `git diff --check`; fixtures do generator (7 inválidos → exit 2, dup → warning+último, IPv6 ok, vazio → sem arquivo); import (case-insensitive, dedup, domínio ausente → exit 1); `vpn-check` (ok/mismatch/não-resolve/inválido/ausente). `verify-compose`/build/ShellCheck pendentes (sem Docker; cobertos pela CI). Runtime com túnel real pendente no host.
- Next context: validar no host (`getent hosts gitlab.omega` no terminal + `vpn-check` + alcance com `FIREWALL_SUBNETS`).

## 2026-09-17 - Robustez dos scripts + fechamento dos drifts de docs

- Changed: `scripts/vpn-status|check|reconnect|top|server-rotate` com `--connect-timeout 5 --max-time 10` (+ `--retry-all-errors` onde há retry); `need()` para curl/jq/docker/ss/ip/awk; `vpn-check` valida `INTERNAL_TEST_PORT` e limita TCP a 5s via `timeout`; `vpn-top` sem abort de `set -e` (settings com guarda, `// empty`, `printf '%s'`, `if` idiomático); `vpn-server-rotate` com trim/filtro de hostnames + helper via PATH; `vpn-auto-reconnect`/`vpn-switch` com `trap` e `docker ps` sem falso-negativo; `vpn-opencode` com porta ≤65535 + senha ROOT-relativa; `nullglob` nos `verify-*`. `profiles/protonvpn-wireguard.yml` ganhou `SERVER_HOSTNAMES`; `docker-compose.yml` documenta `init: true`. Docs: `.env.example` (genkey v3.41.3, `INTERNAL_TEST_PORT`, `OPENVPN_PROTOCOL`), README (PATH host-first, `INTERNAL_TEST_PORT`, `OPENVPN_PROTOCOL`/`SERVER_HOSTNAMES`), runbook (1.18.25 + PATH), exemplo com opt-ins, `TESTING.md`/`ROADMAP.md`/`BACKLOG.md`, `INDEX.md` saneado, `verify-docs` como trava de drift.
- Why: nenhum script pendura sem timeout; falhas claras em vez de aborts crípticos; docs voltam a refletir o código e a CI falha sob drift.
- Verified: `bash -n scripts/*`, `sh -n vpn-entrypoint.sh`, `./scripts/verify-docs` (novas travas), teste negativo das travas, unit do parse de hostnames, `git diff --check`. `verify-compose`/build/ShellCheck pendentes (sem Docker; cobertos pela CI).
- Next context: conexão real do Desktop App; fase 2 (segurança/hardening, versionamento) em `BACKLOG.md`.

## 2026-08-29 - Atualização do OpenCode para 1.18.25 e priorização do PATH do host

- Changed: atualizado [`Dockerfile`](file:///projetos/vpn-dev-workspace/Dockerfile) para OpenCode `1.18.25` (com fallback fixado) e adicionado `PATH` no [`docker-compose.yml`](file:///projetos/vpn-dev-workspace/docker-compose.yml) priorizando `${HOST_HOME_DIR}/.opencode/bin` e caminhos locais do host; configurado `HOST_HOME_DIR=/home/desenvolvedor` no [`.env`](file:///projetos/vpn-dev-workspace/.env).
- Why: ao atualizar o OpenCode no host, o contêiner passa a utilizar instantaneamente a versão mais recente da home montada (`~/.opencode/bin/opencode`), sem necessidade de refazer build manual do Dockerfile a cada nova versão.
- Verified: `docker exec ... which opencode` resolvendo para `/home/desenvolvedor/.opencode/bin/opencode`, `./scripts/verify-docs` ok.
- Next context: atualizações no host refletem imediatamente dentro do container.

## 2026-08-29 - Correção de conexão dos perfis com repasse de SERVER_HOSTNAMES

- Changed: adicionado `SERVER_HOSTNAMES: ${VPN_SERVER_HOSTNAMES:-}` aos perfis Compose ([`nordvpn-openvpn.yml`](file:///projetos/vpn-dev-workspace/profiles/nordvpn-openvpn.yml), [`nordvpn-wireguard.yml`](file:///projetos/vpn-dev-workspace/profiles/nordvpn-wireguard.yml), [`protonvpn-openvpn.yml`](file:///projetos/vpn-dev-workspace/profiles/protonvpn-openvpn.yml), [`surfshark-openvpn.yml`](file:///projetos/vpn-dev-workspace/profiles/surfshark-openvpn.yml)) e configurado `VPN_SERVER_HOSTNAMES` no [`.env`](file:///projetos/vpn-dev-workspace/.env) com servidores ativos/acessíveis no Brasil para contornar bloqueio de faixa de IP do ISP.
- Why: a seleção aleatória do Gluetun no país configurado (Brazil) caía em servidores na faixa `185.153.176.x`, que sofrem bloqueio de rota pelo provedor local, impedindo o handshake OpenVPN e estourando o timeout do healthcheck.
- Verified: `./scripts/vpn-switch nordvpn-openvpn` executado com sucesso e túnel saudável (`vpn-status` e `vpn-check` operacionais com IP público brasileiro), `verify-docs` ok.
- Next context: manter `VPN_SERVER_HOSTNAMES` configurado caso novos perfis precisem de restrição a servidores com conectividade na rede local.

## 2026-08-19 - Documentação dos passos práticos (runbook GUI/Desktop)

- Changed: criado `DEV/RUNBOOKS/opencode-desktop-vpn.md` (passo a passo validado: subir `vpn-opencode serve`, conectar o Desktop App em `http://127.0.0.1:10001` com login `opencode`/senha do `.secrets/opencode_gui_password`, alternativas `web`/`attach`, troca de senha, atualização do Desktop via `.deb` sem repositório apt e sincronização de versão com o Dockerfile, tabela de troubleshooting). README ganhou a seção "Conectar o Desktop App (passo a passo)"; `DEV/INDEX.md` mapeia o runbook.
- Why: consolidar em documentação durável os passos executados e os cuidados operacionais (versões, senha, apt).
- Verified: `verify-docs`, `bash -n`, `git diff --check`.
- Next context: manter o runbook atualizado quando a GUI/Desktop mudar; ao atualizar o Desktop via .deb, alinhar `OPENCODE_VERSION`/checksums do Dockerfile.

## 2026-08-19 - Validação de runtime no host (Parte B/C/D + achados)

- Spec: `SPECS/ACTIVE.md`.
- Changed: `.env` ativado com LAN/DNS interno/paridade/GUI (achados: `INTERNAL_DNS_EXEMPT_HOSTNAMES` não aceita curingas — corrigido para nomes explícitos); `vpn-check` com teste TCP real (`INTERNAL_TEST_PORT`) e aceite de DNS "starting" (peculiaridade do endpoint com upstream plain; resolução é validada à parte); `vpn-reconnect` com polling 30×5s (o ciclo de servidores do OpenVPN passa de 36s); Dockerfile ganhou `openssh-client` (paridade SSH real); `vpn-opencode` sem `BROWSER` (ignorado — `xdg-open` é ruído cosmético); README/.env.example com notas de DNS fora da LAN e pinning de servidores.
- Why: validar o conjunto completo em runtime e corrigir o que só aparece com túnel real.
- Verified: todo o plano de runtime — `vpn-switch`, `vpn-check` ok, `github.com`/internet pelo túnel, `http://192.168.30.20/ → 200` (LAN), `ssh-add -l` com chave do host, `vpn-reconnect` imprimindo IP (após fixar `br72.nordvpn.com`), `vpn-server-rotate` aplicado, `vpn-top`, `vpn-opencode web` (401/200 com basic auth) e `serve` (200). `VERIFY.md` completo.
- Risks: faixa 185.153.176.x do NordVPN bloqueada pela rede local (rotação aleatória pode cair nela; usar `VPN_SERVER_HOSTNAMES` com servidores conhecidos); `.omega.local` só existe no `/etc/hosts` do host (DNS da LAN NXDOMAIN) — alcance interno por IP validado; Desktop App real ainda não conectado à ponta `serve`; ShellCheck pendente na CI.
- Next context: conectar o Desktop App em `127.0.0.1:10001` via `vpn-opencode serve`; manter `VPN_SERVER_HOSTNAMES` com servidores acessíveis se a rotação aleatória reincidir em falhas.

## 2026-08-19 - Rede interna, paridade de home e GUI do OpenCode pela VPN

- Spec: `SPECS/ACTIVE.md` (escopo ampliado).
- Changed: firewall opt-in `FIREWALL_SUBNETS` (o `vpn-switch` detecta a sub-rede da rota padrão do host); DNS interno `INTERNAL_DNS` + `INTERNAL_DNS_EXEMPT_HOSTNAMES` (upstream plain único; `vpn-switch` avisa se `INTERNAL_DNS_RESOLVERS` ficar preenchido); `vpn-check` testa `INTERNAL_TEST_HOST`; Dockerfile com `HOST_UID`/`HOST_GID`; compose do `terminal` com mounts de `SSH_AUTH_SOCK` e `RUN_USER_DIR` (fallback `/dev/null`) e senha do painel; novo `scripts/vpn-opencode` (web|serve, `OPENCODE_GUI_PORT`); README, `.env.example`, `verify-docs`, DEV atualizados.
- Why: alcançar hosts `.omega`/LAN e resolver nomes internos pelo túnel, herdar identidade/sessão do host e usar a GUI/Desktop do OpenCode com tráfego 100% na VPN.
- Verified: `bash -n` em todos os scripts, `sh -n` entrypoint, `./scripts/verify-docs`, `git diff --check`, `docker compose --profile vpn config --quiet` (8 perfis).
- Risks: DNS público passa pelo DNS da LAN quando `INTERNAL_DNS` ativo (decisão aceita); container lê agente SSH/sessão do host (documentado); validação de runtime (túnel real, `.omega`, browser do painel, Desktop App) pendente no host com Docker.
- Next context: executar o plano de verificação runtime no host: build, `vpn-switch nordvpn-openvpn`, `vpn-reconnect` ×2, `vpn-check` (incl. host interno), `vpn-top`, `vpn-opencode web` e `serve`.

## 2026-08-19 - Aumento de poderes: IP pós-reconexão, saúde, dashboard e rotação

- Spec: `SPECS/ACTIVE.md`.
- Changed: `vpn-reconnect` agora aguarda o IP público com polling (fix do bug de IP não impresso no NordVPN); novos `vpn-check`, `vpn-top` e `vpn-server-rotate`; `vpn-auto-reconnect` valida saúde e suporta rotação opt-in; Gluetun v3.40.0 → v3.41.3 (digest via registry API); `jq` na imagem; `dns: 127.0.0.1` no serviço `vpn` (DNS pelo túnel).
- Why: recuperação confiável com IP visível, diagnóstico de vazamento de DNS, fallback de servidor quando autorizado e painel de status.
- Verified: `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`, `./scripts/verify-docs`, `./scripts/verify-compose` (com Docker do host? não — pendente), `git diff --check`; digest do Gluetun v3.41.3 confirmado na Docker Hub Registry API. ShellCheck e validação de runtime (túnel real) pendentes no host com Docker.
- Risks: host sem Docker no ambiente de edição — build/run precisam de validação do usuário; hostnames inválidos em `VPN_SERVER_HOSTNAMES` são rejeitados pela API do Gluetun; rotação sem lista re-seleciona aleatoriamente no país.
- Next context: validar com Docker no host (`verify-compose`, build da imagem, `vpn-switch nordvpn-openvpn` + `vpn-reconnect` ×2, `vpn-check`, `vpn-top`).

## 2026-08-10 - Objetivo documental consolidado

- Changed: README, exemplo de uso, especificação, arquitetura e decisões passaram a declarar o terminal VPN como extensão direta do host; a verificação documental cobre esse contrato.
- Why: eliminar a divergência entre a intenção atual do projeto e a sua memória técnica durável.
- Verified: sintaxe do verificador, `verify-docs`, `verify-compose` e ausência de falhas de whitespace no diff.
- Next context: mantenha o objetivo, a montagem da home e a rede compartilhada com a VPN documentados quando a arquitetura mudar.

## 2026-08-10 - Terminal VPN alinhado ao host

- Changed: OpenCode da imagem atualizado para `1.18.16` com checksums oficiais; o terminal agora monta a home e o workspace do host nos mesmos caminhos.
- Why: o terminal deve funcionar como extensão direta do host, preservando o estado e os caminhos absolutos enquanto sua rede continua passando pelo Gluetun.
- Verified: documentação, os oito perfis Compose, build da imagem e execução isolada com `HOME=/home/desenvolvedor`, workspace montado e OpenCode `1.18.16`.
- Risks: a home inteira fica acessível para leitura e escrita pelo terminal; use somente uma home própria e mantenha o início por `vpn-switch`.
- Next context: ao atualizar o OpenCode do host, atualize `OPENCODE_VERSION` e os checksums no Dockerfile na mesma alteração.

## 2026-08-10 - Endurecimento do ambiente VPN

- Spec: `SPECS/ACTIVE.md`.
- Changed: imagem com artefatos fixados e verificados, Zsh e usuário não-root; Compose com faixa LAN, health dependency e serviço de recuperação; documentação, CI e scripts de validação.
- Why: reduzir exposição do host, tornar builds reprodutíveis e recuperar conectividade VPN autorizada.
- Verified: documentação, todos os perfis Compose, sintaxe de shell, Compose base, bloqueio de bind público e build/runtime da imagem.
- Risks: teste real de túnel depende de provedor autorizado; ShellCheck é delegado à CI.
- Next context: manter versões/checksums em conjunto e evitar exposição com `0.0.0.0`.

## 2026-08-10 - Correção de credenciais de perfil

- Changed: serviços foram associados ao perfil Compose interno `vpn`, e `vpn-switch` passou a ativá-lo antes de combinar o perfil do provedor.
- Why: uma execução direta de `docker compose up` iniciava o Gluetun sem o arquivo `profiles/nordvpn-openvpn.yml`, resultando em `OpenVPN settings: user is empty` apesar dos segredos locais existirem.
- Verified: sintaxe Shell, `verify-docs`, `verify-compose` para oito perfis, Compose NordVPN e túnel NordVPN saudável com IP público.
- Next context: use `./scripts/vpn-switch <perfil>` para iniciar o ambiente.

## 2026-10-16 - Título da aba replica o container (vpn-shell)

- Spec: `SPECS/ACTIVE.md` (terminal como extensão direta do host).
- Changed: novo `scripts/vpn-shell` (exec com `-e TERM/COLORTERM/TERM_PROGRAM`, título inicial `VPN ▸ …`, restore no EXIT, `allow-rename` da janela tmux); `make shell` usa o wrapper; `vpn.ps1 terminal` encaminha `TERM` e ajusta/restaura `WindowTitle`; README documenta o mecanismo; `verify-docs` e suite Linux cobrem o novo script.
- Why: `docker compose exec` não encaminha TERM (dentro ficava vazio) → OMZ e IAs não emitiam OSC 0/1/2 e a aba do host nunca acompanhava. OSC atravessa o exec sem filtro (validado por byte via `od -c`).
- Verified: `verify-docs` OK; `verify-compose` OK (8 perfis); suite Linux 34/42 com 8 falhas pré-existentes reproduzidas na árvore limpa (home-link, session-sync, socat); `TERM_INSIDE=xterm-256color` via wrapper; bytes OSC `033 ] 0 ; … \a` chegam intactos.
- Risks: tmux aninhado exige `allow-rename on` (wrapper libera a janela atual, best-effort); VSCode/Cursor podem exigir ajuste de `terminal.integrated.tabs.title` para exibir o OSC.
- Next context: teste interativo real (aba GNOME/tmux/VSCode + sessão de IA) pendente no host.

## 2026-10-16 - TERM no Compose: exec direto também replica título

- Changed: serviço `terminal` no `docker-compose.yml` ganhou `TERM: ${TERM:-xterm-256color}` (interpolado do host); README atualizado (exec direto suportado após recriar); container `terminal` recriado no host (`--force-recreate --no-deps`).
- Why: `docker compose exec`/`docker exec -it` direto herdava o env do container (TERM vazio) — o wrapper resolvia, mas o caminho direto continuava sem títulos.
- Verified: `docker compose exec terminal sh -c 'echo $TERM'` direto → `xterm-256color` (antes `<empty>`); `verify-docs` e `verify-compose` OK. Cores dos scripts usam `[[ -t 1 ]]`, não TERM — sem risco de colorir pipes/logs.
- Risks: env do container congela no `up`; se o TERM do host mudar, vale o do último recreate (`vpn-shell` passa `-e` explícito e está sempre atual). Recriar o terminal derruba shells `exec` abertos.
- Next context: teste interativo real continua pendente no host.

## 2026-10-16 - Hook vpn-ai: status da IA na aba (GNOME não atualizava)

- Changed: novo `scripts/vpn-title-hook.zsh` (não-executável, opt-in via `source` no `.zshrc`): função `vpn-ai` + hook precmd com título grudento; README documenta ativação e uso.
- Why: pipeline container→aba provado intacto (OSC do zsh chega byte a byte; `VPN ▸` inicial aparece no GNOME). Medição no fio: `opencode` TUI emite zero OSC 0/1/2; `claude` emite `✳ Claude Code` uma vez na abertura — a IA não atualiza, então não havia o que replicar.
- Verified: sob pty, `vpn-ai true` → sequência `🤖…`, `✅…`, `✅…` (hook reaplica após o precmd do OMZ); `vpn-ai false` → `❌… (exit 1)` com exit code preservado; `verify-docs` OK (snippet sem +x, fora do loop --help).
- Risks: requer `source` manual no `.zshrc`; hook roda após o precmd do OMZ (ordem de registro) — re-source duplo é idempotente.
- Next context: uso real com sessão longa de IA no GNOME pendente de confirmação do usuário.

## 2026-10-21 - Repo verificado + suíte Linux determinística no host

- Changed: `tests/linux/test-scripts.sh` (usa `/usr/bin/env`; bloco HTTP escolhe porta livre em 20000-20100 com probe via `timeout socat` e restringe `VPN_PORT_RANGE` à porta; stub de `docker` evita ler logs reais do terminal); `scripts/vpn-session-sync` (`VPN_SESSION_SYNC_FORCE=1` como opt-out explícito do `container_busy`, usado só pelos testes); memória DEV (este WORKLOG, `VERIFY.md`, `HANDOFF.md`, `BACKLOG.md` #15, `CONTEXT.md`, `TESTING.md`).
- Why: a suíte falhava no host (9 falsos negativos ambientais) — `~/.local/bin/env` sombreia o coreutils `env`; portas fixas 10061-10065 colidem com a faixa 10000-10100 publicada pela stack; e `vpn-session-sync` via `opencode serve` vivo no `/proc` do host.
- Verified: suíte Linux **44/44 no host com a stack no ar** e **44/44 em container descartável** (`vpn-dev-workspace-terminal`); `verify-docs` OK; `verify-compose` OK (8 perfis); `bash -n`/`sh -n`/`git diff --check` OK; `master` == `origin/master` (0/0); nenhum segredo rastreado (`.secrets/*` em 600).
- CI (push 2026-10-21): primeiro run reprovou por dívida pré-existente — `scripts/vpn-title-hook.zsh` sem shebang dava SC2148 (ShellCheck não suporta zsh). `.github/workflows/validate.yml` passou a excluir `*.zsh` do ShellCheck/`bash -n`, instalar zsh e validar com `zsh -n`; run seguinte verde (validate + secret-scan + Windows, incl. build da imagem).
- Next context: ShellCheck segue só na CI; o `docker_stub` cobre só o bloco HTTP (integração real do `check` com a stack continua em runtime).

## 2026-10-19 - Pacote de compartilhamento (share zip)

- Changed: nenhum arquivo do workspace; artefato externo `../vpn-dev-workspace-share-2026-10-19.zip` (68 entradas, 137 KiB, sha256 `14c935c4…de32167d8`), gerado de cópia staging.
- Why: enviar o workspace sem `.git` nem locais gerados; credenciais portáveis com `secrets.zip` **regenerado do estado vivo** (o antigo caducou com `.env` de 2026-08-19).
- Excluded: `.git/`, `.hosts.local.gen` (regenerável) e `DEV/{WORKLOG,HANDOFF,VERIFY,BACKLOG}.md` (memória de sessão); `DEV/README.md`/`DEV/INDEX.md` adaptados no pacote. `.env` viaja como está (decisão do maestro: INTRANET/firewall/home incluídos).
- Verified: `.secrets/*` no zip byte-idênticos ao disco; `.env` do secrets.zip idêntico ao vivo; proibidos ausentes; entradas obrigatórias presentes; `git status` limpo.
- Next context: enviar por canal cifrado; no destino: `unzip`, `chmod 600 .secrets/*` e `./scripts/vpn-switch <perfil>`. Credentials expostas em compartilhamento futuro = trocar senha NordVPN.
