# Runbook — OpenCode Desktop/Web pela VPN

Guia prático dos passos validados em 2026-08-19: usar o OpenCode Desktop do host
conectado ao servidor que roda DENTRO do túnel VPN (`vpn-opencode serve`).

## Pré-requisitos

- Ambiente ativo: `./scripts/vpn-switch nordvpn-openvpn` (ou outro perfil) com os
  três serviços `healthy`.
- `.env` com `OPENCODE_GUI_PORT` (padrão `10001`) dentro de `VPN_PORT_RANGE` e
  `OPENCODE_GUI_PASSWORD_FILE` (padrão `.secrets/opencode_gui_password`).
- A porta é publicada pelo Gluetun apenas em `127.0.0.1` (`HOST_BIND_ADDRESS`).
  Com bind em LAN, `vpn-switch`/`vpn.ps1` exigem `OPENCODE_GUI_PASSWORD_FILE`
  com arquivo não vazio e recusam subir sem ele.

## 1. Subir o servidor (ponta para o app)

Em um terminal do host (fica em primeiro plano; use `tmux`/`zellij` para deixar de pé):

```bash
./scripts/vpn-opencode serve
# OpenCode serve pela VPN em http://127.0.0.1:10001 (Ctrl+C para encerrar)...
```

O `serve` responde `200` com basic auth — validado.

## 2. Conectar o Desktop App

1. No OpenCode Desktop (instalado no host), adicione o servidor:
   `http://127.0.0.1:10001`
2. Credenciais:
   - Usuário: `opencode`
   - Senha: conteúdo de `.secrets/opencode_gui_password` (`cat .secrets/opencode_gui_password`)
3. O estado é compartilhado com o CLI do container (mesma home/projetos).

## 3. Alternativas

- Painel web no navegador do host: `./scripts/vpn-opencode web` → `http://127.0.0.1:10001` (mesma auth).
- CLI/TUI no host apontando para a ponta:

  ```bash
  opencode attach http://127.0.0.1:10001 -u opencode -p "$(cat .secrets/opencode_gui_password)"
  ```

## 4. Trocar a senha do painel

```bash
openssl rand -hex 16 > .secrets/opencode_gui_password
chmod 600 .secrets/opencode_gui_password
# reinicie o vpn-opencode serve/web para aplicar
```

## 5. Atualizar o Desktop App (host)

Não existe repositório apt; `apt upgrade` não atualiza o pacote. Sempre
baixar o .deb mais recente e reinstalar:

```bash
wget https://opencode.ai/br/download/stable/linux-x64-deb -O opencode-desktop.deb
sudo apt-get install ./opencode-desktop.deb
```

> O .deb novo pode não instalar o binário `opencode` no PATH (versões recentes
> só instalam o app/`opencode-cli`). Se precisar do CLI no host, crie o symlink.

### Sincronização de versões (importante)

O Desktop do host é cliente; o servidor roda no container. No fluxo Linux, o
`PATH` do terminal prioriza o binário da home montada do host
(`${HOST_HOME_DIR}/.opencode/bin`), então atualizar o OpenCode no host reflete
instantaneamente no container; a versão fixada no `Dockerfile`
(`OPENCODE_VERSION` + checksums, hoje 1.18.31) é o fallback usado quando a home
não fornece o binário. Desktop mais novo que o servidor pode dar tela
branca/falha de conexão (anomalyco/opencode#23851).

No fluxo Windows a home do host não é montada (o `/workspace` vem de
`WORKSPACE_DIR`), então o slot `~/.opencode/bin` do container fica vazio e o
fallback do `Dockerfile` assume. Para a linha 2.x — que NÃO é publicada no
GitHub Releases (lá o máximo é a 1.x; o canal oficial é o npm) — instale no
slot PATH-first, dentro do volume `vpn_windows_home`:

```bash
docker exec vpn-dev-workspace-terminal-1 npm install -g @opencode/cli@2.0.28 --prefix /home/developer/.opencode
docker exec vpn-dev-workspace-terminal-1 opencode --version  # confirma o 2.x
```

O binário persiste entre starts (volume); reinstale apenas se `down -v` remover
o volume. O fallback 1.18.31 da imagem permanece como rede de segurança.

Paridade de dados no modo Windows (2026-10-16): a home Windows inteira
(`HOST_HOME_DIR`, precisa estar no File Sharing do Docker Desktop) é montada
em `/mnt/host-home`. No boot, `vpn-home-link` cria symlinks da home do
container (`vpn_windows_home`) para a montagem — paridade de skills, configs
e ferramentas sem tocar no SQLite.

Lista padrão (`WINDOWS_HOME_LINKS`, sobrescrevível no `.env`):

| Item (relativo à home) | Uso |
|---|---|
| `.opencode/skills` | skills do OpenCode |
| `.config/opencode/` (exceto `node_modules`) | config completa: `opencode.json`, `cli.json`, `tui.json`, `package.json`, `agents/`, `commands/`, `plugins/`, `skills/`, `hooks/` |
| `.local/share/opencode/auth.json` | logins/providers do OpenCode |
| `.gitconfig`, `.npmrc` | identidade e registries |
| `.orquestrador-maestro`, `.codex/skills`, `AGENTS.md` | contratos/ferramentas |

`WINDOWS_OPENCODE_FULL_LINKS=true` (padrão) linka todas as entradas visíveis de
`~/.config/opencode` do host; `node_modules` fica local ao container (npm
instala no boot) e backups são ignorados.

Sessões/conversas do OpenCode: **sincronização automática** — o wrapper
`vpn-opencode-wrapper` (prioridade no PATH do container) importa o banco do
host ao abrir uma sessão interativa e publica as mudanças no staging ao
fechar; o `vpn.ps1` aplica o staging pendente no host quando o OpenCode do
host está fechado (com backup `.bak` do banco anterior). Uso normal, sem
comandos extras:

```bash
docker exec -it -e TERM=xterm-256color vpn-dev-workspace-terminal-1 opencode
# ou, do host: .\scripts\vpn.ps1 terminal   →   opencode
```

Controle manual (opcional): `.\scripts\vpn.ps1 sessions-sync` força a
importação do host e `sessions-sync --push` força a exportação. O SQLite nunca
é montado (File Sharing sem locks POSIX); a cópia valida a integridade antes
de aplicar e mantém backup do banco substituído.

> **Projetos (importante):** o OpenCode agrupa as conversas por *projeto
> (diretório)*. Repositórios **git** têm identidade independente do caminho, então
> o mesmo repo montado em `/workspace/<repo>` enxerga as conversas criadas no host
> em `C:\Dev\<repo>` (validado). Diretórios **sem git** não se enxergam entre
> host e container; nesses casos retome a conversa pelo ID (`opencode -s <id>`).
>
> **Caminhos:** ao importar, os diretórios gravados nas conversas são reescritos
> (`C:\Dev` → `/workspace`, `C:\Users\<user>` → `/home/developer`) para que o
> `opencode -s <id>` funcione dentro do container; ao exportar, o caminho inverso
> é aplicado. O mapeamento vem das variáveis `VPN_HOST_WORKSPACE_DIR`,
> `VPN_HOST_HOME_DIR`, `VPN_CONTAINER_WORKSPACE_DIR` e `VPN_CONTAINER_HOME_DIR`
> (compose.windows.yml). Sem elas, o script usa o maior sufixo do caminho que
> existir sob `/workspace` (ex.: `C:\Dev\appce-monorepo` →
> `/workspace/appce-monorepo`) e, na falta dele, `/workspace`.

Limitações: o binário (`~/.opencode/bin`) e o `node_modules` do container
ficam no volume; configs com caminhos Windows (`C:\...`) podem gerar avisos
inofensivos no Linux. Em especial, um `.npmrc` do host com `cache`/`prefix`
apontando para `D:\...` quebra o npm no container — por isso o compose define
`NPM_CONFIG_CACHE=/home/developer/.npm`.

Som: sem placa de som no container, `attention.sound` (ligado no `cli.json`
compartilhado) imprimia `ALSA lib ... Unknown PCM default` no terminal. O
`compose.windows.yml` aponta `ALSA_CONFIG_PATH` para `config/alsa-null.conf`
(device default -> plugin `null`): o som vira no-op silencioso.

> **Provider xKiro / modelos free ("Console"):** o host tem `XKIRO_API_KEY` no
> ambiente; o container não herda isso. A chave é montada de
> `.secrets/xkiro_api_key` (`XKIRO_API_KEY_FILE` no `.env`) e exportada pelo
> `vpn-opencode-wrapper` antes de abrir o OpenCode. Sem ela, modelos free do
> xKiro respondem `Error from provider (Console): OpenCode's free tier can only
> be used from within OpenCode`.

Ao atualizar o Desktop, atualize na MESMA alteração:

1. `Dockerfile`: `OPENCODE_VERSION` e os `sha256` das duas arquiteturas
   (obtidos nas releases oficiais do GitHub — válido para a linha 1.x, o
   fallback).
2. `./scripts/vpn-switch <perfil>` para reconstruir a imagem.

## 6. Troubleshooting conhecidos

| Sintoma | Causa | Ação |
|---|---|---|
| Ruído `xdg-open` no stderr do helper | sem navegador no container | ignorar; servidor continua (cosmético) |
| Desktop abre tela em branco | Desktop e servidor com versões diferentes | alinhar versões (item 5) |
| `*.omega.local` rejeitado no `.env` | Gluetun não aceita curingas em `INTERNAL_DNS_EXEMPT_HOSTNAMES` | usar nomes explícitos |
| Rotação aleatória cai em servidor morto | provedor de acesso bloqueia faixas (ex: 185.153.176.x) | `VPN_SERVER_HOSTNAMES` com servidores conhecidos |
| `vpn-check` mostra DNS "starting" | endpoint do Gluetun com upstream plain | normal; resolução é validada à parte |
| Nomes `.omega.local` NXDOMAIN no túnel | DNS da LAN não conhece; vivem no `/etc/hosts` do host | alcançar por IP; `INTERNAL_TEST_HOST` como IP |
| Diálogo de limite no OpenCode | classe/estado do provider; `vpn-opencode check` é só observacional | consulte a política estruturada abaixo; não trate aviso nem resultado do check como gatilho VPN |
| `vpn-opencode check` diz `down` | `web/serve` morreu ou porta fechada | `watch` reinicia sozinho (limitado) ou suba manual com `web|serve --detach` |

## 7. Verificação automática (opt-in)

```bash
./scripts/vpn-opencode check --port 10001        # ok (0) | down|quota (1); --json para automação
./scripts/vpn-opencode check --port 10001 --json # {"status":"ok|down|quota","port":10001,"detail":"..."}
./scripts/vpn-opencode watch --mode serve --interval 30 --restart-max 3
# down = ALERTA + restart limitado; quota = ALERTA puro, zero restart.
```

- Sonda no `vpn-auto-reconnect` (só alerta, sem socket Docker, sem reconnect do túnel): `.env` com `OPENCODE_AUTOCHECK=true`.
- `vpn-top` mostra a seção OpenCode (TCP + detalhe via `check` quando disponível).
- Padrões de quota sobrescrevíveis via `OPENCODE_QUOTA_PATTERNS`; linhas varridas via `OPENCODE_CHECK_LOG_LINES`.

## 8. Eventos estruturados de limite do provider

`vpn-opencode check [--json]` é observacional: informa `ok`, `down` ou `quota`,
mas não aciona recuperação nem rotação. O supervisor recupera apenas falha
real de processo/rede/túnel; mensagens ou logs de limite não são evidência de
falha VPN.

Os plugins globais `vpn-recovery` das versões suportadas usam somente campos e
eventos estruturados, nunca texto arbitrário de resposta ou logs:

| Evento estruturado | Comportamento |
|---|---|
| Free-tier | solicita troca automaticamente |
| HTTP 429 / rate-limit | solicita troca automaticamente |
| Conta / crédito | pode notificar; nunca altera VPN |

A tentativa de recuperação por limite exige VPN running, túnel saudável e IP
público válido diferente do anterior; ações são serializadas pelo lock
compartilhado `/var/lib/vpn-control/operation.lock`. Candidatos são hostnames
não vazios de `VPN_SERVER_HOSTNAMES`, sem seleção aleatória ou troca de país.
Política: cooldown de 300 s, no máximo 6 eventos admitidos em janela móvel de
3600 s, até 3 alvos distintos por evento e timeout de helper de 600 s. Um
evento admitido consome orçamento mesmo se falhar. Só é reportado o alvo
solicitado, não o peer remoto efetivamente conectado. É best effort: IP
diferente não garante reset da quota do provider.

No v1, um retry só solicita recovery após o abort da sessão ser confirmado;
falha/abort falso não troca VPN. Um `session.error` terminal estruturado pode
solicitar recovery sem abort. No v2, o hook server veta retries classificados
e uma única falha `session.execution.failed` na TUI pode solicitar recovery;
modo headless não tem recuperação TUI. Nenhum fluxo reenvia prompt.

Instale os launchers e plugins globais com:

```bash
./scripts/opencode-vpn-install
opencode1 --version
opencode2 --version
```

Não interprete a troca de IP como renovação garantida de quota; confira as
regras do provider e reenvie manualmente se decidir continuar.
