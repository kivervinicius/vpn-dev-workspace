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

Paridade de dados no modo Windows (2026-10-16): o `compose.windows.yml` monta,
por cima do volume da home, dois caminhos do host (`HOST_HOME_DIR`; a pasta
precisa estar no File Sharing do Docker Desktop):

| Origem no host | Destino no container | Modo |
|---|---|---|
| `~/.opencode/skills` | `/home/developer/.opencode/skills` | somente leitura |
| `~/.config/opencode/opencode.json` | `/home/developer/.config/opencode/opencode.json` | somente leitura |

O histórico/sessões (`~/.local/share/opencode`) **não** é montado do host
porque o SQLite em modo WAL exige locks POSIX que o File Sharing do Docker
Desktop (9P/gRPC-FUSE) não implementa. As sessões do container ficam no volume
`vpn_windows_home` (isoladas). Se precisar migrar sessões, use `opencode
session move` dentro de cada ambiente.

Assim o terminal usa os mesmos skills e a mesma configuração global (providers)
do host. Limitações: o binário e os plugins npm instalados na home do container
continuam no volume (`~/.opencode/bin`, `~/.config/opencode/node_modules`); se
o `opencode.json` do host referenciar plugins, instale-os também dentro do
container.

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

## 8. Detecção de limites do Zen

O supervisor e o `check` detectam automaticamente os limites do Zen:

| Tipo | HTTP | Padrão detectado | Ação do supervisor |
|---|---|---|---|
| `FreeUsageLimitError` | 429 | `freeusagelimiterror`, `free limit reached`, `subscribe to go` | Mantém app vivo; VPN não altera franquia |
| `GoUsageLimitError` | 429 | `go limit reached`, `weekly/monthly usage limit reached` | Mantém app vivo; aguarda reset |
| `CreditLimitExceeded` | 402 | `creditlimitexceeded`, `credit_limit` | Mantém app vivo; hook é disparado |
| `InsufficientFunds` | 402 | `insufficientfunds`, `payment required` | Mantém app vivo; hook é disparado |
| `LimitExceeded` (budget) | 429 | `limitexceeded`, `budget_exceeded` | Mantém app vivo; hook é disparado |
| Provider rate limit | 429 | `429`, `too many requests`, `rate limit exceeded` | Rotaciona VPN e reinicia OpenCode |

O `check` retorna `quota` com detalhe: `credit-exhausted`, `zen-usage-limit`, `rate-limit`, `quota-pattern-in-http`, `quota-pattern-in-logs`.

### Hook de limite personalizado (`OPENCODE_LIMIT_HOOK`)

Quando um limite é detectado, o supervisor executa um script personalizado:

```bash
# .env
OPENCODE_LIMIT_HOOK=/projetos/scripts/meu-hook-zen.sh
```

O hook recebe dois argumentos — o tipo de limite (`free_tier_limit`, `account_limit`, `credit_limit`, `rate_limit`) e o `retry-after` extraído dos logs (segundos quando há `Retry-After`, ou a frase `reset in <n> <unidade>`; string vazia quando não há) — e roda em background (não bloqueia o supervisor). O caminho precisa estar dentro de `WORKSPACE_DIR` para ser visível no container. Exemplo:

```bash
#!/usr/bin/env bash
# meu-hook-zen.sh — notifica quando limite do Zen é atingido
event_type="$1"
retry_after="$2"
echo "[$(date)] Limite detectado: ${event_type} (retry_after=${retry_after:-n/d})" >> /tmp/zen-limit.log
# Exemplo: notificação, troca de provider, recarregar crédito, etc.
case "$event_type" in
  credit_limit) curl -s -X POST https://hooks.example.com/zen ;;
  rate_limit) echo "Rate limit — VPN será rotacionada pelo supervisor" ;;
esac
```

O hook é opcional. Sem ele, o supervisor apenas loga (com a dica de reset, quando houver) e toma a ação padrão (manter vivo ou rotacionar VPN).
