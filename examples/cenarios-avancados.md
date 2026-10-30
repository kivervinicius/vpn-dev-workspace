# Guia de Cenários Avançados e Opt-ins

> Cola-rápida: [docs/TLDR.md](../docs/TLDR.md). Índice: 1 intranet · 2 `LOCAL_HOSTS` · 3 proxy · 4 supervisor · 5 home read-only · 6 senhas via arquivo.

Este guia demonstra como utilizar os recursos avançados de rede, segurança e integração do `vpn-dev-workspace`.

---

## Cenário 1: Acesso Concorrente à Internet (VPN) e Intranet Corporativa

Por padrão, o kill switch do Gluetun bloqueia qualquer tráfego direcionado a IPs privados para evitar vazamentos de dados fora da VPN. Em ambientes corporativos, é comum necessitar de acesso a servidores internos (ex.: CI/CD, banco de desenvolvimento, documentações locais).

### Configuração no `.env`

```ini
# 1. Sub-redes privadas liberadas para tráfego fora do túnel VPN
FIREWALL_SUBNETS=192.168.30.0/24,192.168.105.0/24

# 2. Servidor DNS interno da empresa
INTERNAL_DNS=192.168.5.4:53
INTERNAL_DNS_RESOLVERS=

# 3. Nomes internos liberados da proteção contra DNS Rebinding (sem curingas)
INTERNAL_DNS_EXEMPT_HOSTNAMES=dev.go.omega.local,dev.mt.omega.local

# 4. Host e porta de teste para validação automática no vpn-check
INTERNAL_TEST_HOST=192.168.30.20
INTERNAL_TEST_PORT=80
```

### Validação
```bash
docker exec vpn-dev-workspace-terminal-1 vpn-check --only internal
```

---

## Cenário 2: Mapeamento de Nomes Locais com `LOCAL_HOSTS`

Quando você possui entradas customizadas no `/etc/hosts` da máquina host (ex.: `gitlab.omega=192.168.105.10`) que não existem em nenhum DNS público, o terminal não as resolveria normalmente porque todo o DNS passa pelo Gluetun.

### 1. Importação Assistida
Você pode extrair automaticamente as entradas do seu host filtradas por domínio:
```bash
./scripts/vpn-hosts-import --domain omega
```
Saída sugerida:
```bash
# Cole no .env:
LOCAL_HOSTS=gitlab.omega=192.168.105.10,registry.omega=192.168.105.11
```

### 2. Aplicação
Adicione a linha gerada ao seu `.env` e execute:
```bash
./scripts/vpn-hosts-apply
```
O `vpn-switch` também injeta o snippet automaticamente após cada `up`.

### 3. Validação
```bash
docker exec vpn-dev-workspace-terminal-1 vpn-check --only hosts
```

---

## Cenário 3: Proxy HTTP para Browser e IDEs do Host

Se você deseja navegar por sites internos ou testar APIs através da VPN sem abrir um terminal Docker, ative o Proxy HTTP do Gluetun.

### Configuração no `.env`
```ini
VPN_HTTP_PROXY=on
VPN_HTTP_PROXY_PORT=10002
VPN_HTTP_PROXY_STEALTH=on
```

### Uso no Host
No seu terminal do host, configure as variáveis de ambiente:
```bash
export http_proxy=http://127.0.0.1:10002
export https_proxy=http://127.0.0.1:10002

# Teste: seu IP refletirá a saída da VPN
curl https://ipinfo.io/json
```
No navegador (Firefox/Chrome), configure o proxy manual HTTP/HTTPS apontando para `127.0.0.1:10002`.

---

## Cenário 4: OpenCode Supervisor Persistente (Self-Heal com Preservação de Sessão)

Para desenvolvimento contínuo via interface Web ou Desktop App:

```bash
# Inicia o supervisor no modo serve para o Desktop App
./scripts/vpn-opencode supervise --mode serve

# Acompanha logs do supervisor
./scripts/vpn-opencode supervise-logs

# Status detalhado
./scripts/vpn-opencode supervise-status
```

Benefícios:
- Se a VPN cair (desconexão real de rede ou túnel unhealthy), o supervisor serializa a recuperação, rotaciona/reconecta, aguarda o túnel saudável e retoma o OpenCode preservando a mesma sessão de chat.
- Limites do provider não são falhas de rede: free-tier e HTTP 429 estruturados são tratados pelos plugins `vpn-recovery` (v1/v2), que trocam servidor/IP automaticamente (melhor esforço, sem reenvio de prompt); conta e crédito nunca alteram a VPN.

Os plugins só existem depois de instalados uma vez no host: `./scripts/opencode-vpn-install` (guia em `DEV/RUNBOOKS/opencode-v1-v2.md`).

---

## Cenário 5: Home somente-leitura (`HOST_HOME_MODE`)

Quando o fluxo só lê a home (lint, review, CI local), trave a montagem:

```ini
HOST_HOME_DIR=/home/desenvolvedor
HOST_HOME_MODE=ro
```

O `vpn-switch` valida `rw|ro` antes do up. O workspace (`WORKSPACE_DIR`) segue `rw` — o código editável fica lá. Volte para `rw` (ou remova a linha) quando precisar escrever na home (ex: `opencode`, `npm -g`).

---

## Cenário 6: Senhas via arquivo (sem vazar em `docker inspect`)

Valores diretos em env aparecem em `docker inspect`. Prefira arquivos `0600`:

```ini
# Proxy HTTP do Gluetun
VPN_HTTP_PROXY_PASSWORD_FILE=.secrets/httpproxy_password
# (legado) VPN_HTTP_PROXY_PASSWORD=... ← evita; o entrypoint prefere o FILE
```

```bash
printf '%s' 'SENHA_DO_PROXY' > .secrets/httpproxy_password
chmod 600 .secrets/httpproxy_password
./scripts/vpn-switch nordvpn-openvpn
```

O mesmo vale para o painel OpenCode: `OPENCODE_GUI_PASSWORD_FILE=.secrets/opencode_gui_password` (montado em `/run/secrets/`; o supervisor prefere o arquivo ao env). Com `HOST_BIND_ADDRESS` em LAN o arquivo é obrigatório — `vpn-switch`/`vpn.ps1` recusam subir sem ele, porque o painel ficaria aberto para a rede local.
