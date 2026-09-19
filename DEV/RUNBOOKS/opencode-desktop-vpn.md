# Runbook — OpenCode Desktop/Web pela VPN

Guia prático dos passos validados em 2026-08-19: usar o OpenCode Desktop do host
conectado ao servidor que roda DENTRO do túnel VPN (`vpn-opencode serve`).

## Pré-requisitos

- Ambiente ativo: `./scripts/vpn-switch nordvpn-openvpn` (ou outro perfil) com os
  três serviços `healthy`.
- `.env` com `OPENCODE_GUI_PORT` (padrão `10001`) dentro de `VPN_PORT_RANGE` e
  `OPENCODE_GUI_PASSWORD_FILE` (padrão `.secrets/opencode_gui_password`).
- A porta é publicada pelo Gluetun apenas em `127.0.0.1` (`HOST_BIND_ADDRESS`).

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

O Desktop do host é cliente; o servidor roda no container. O `PATH` do
terminal prioriza o binário da home montada do host
(`${HOST_HOME_DIR}/.opencode/bin`), então atualizar o OpenCode no host reflete
instantaneamente no container; a versão fixada no `Dockerfile`
(`OPENCODE_VERSION` + checksums, hoje 1.18.31) é o fallback usado quando a home
não fornece o binário. Desktop mais novo que o servidor pode dar tela
branca/falha de conexão (anomalyco/opencode#23851).

Ao atualizar o Desktop, atualize na MESMA alteração:

1. `Dockerfile`: `OPENCODE_VERSION` e os `sha256` das duas arquiteturas
   (obtidos nas releases oficiais do GitHub).
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
| Diálogo "quota acabou" no OpenCode | crédito do provider esgotado | recarregar crédito; `check` confirma `quota`; `watch` nunca reinicia quota |
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