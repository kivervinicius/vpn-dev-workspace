# TL;DR — VPN Dev Workspace (1 página)

Terminal Docker com 100% do tráfego forçado pela VPN (Gluetun + kill switch).

## Subir (Linux/WSL2)

```bash
./scripts/vpn-setup --provider nordvpn
# preencha .secrets/* + .env
./scripts/vpn-switch nordvpn-openvpn
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml exec terminal zsh
```

## Subir (Windows PowerShell)

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\vpn.ps1 start nordvpn-openvpn
.\scripts\vpn.ps1 terminal
```

## Checar

```bash
vpn-status   # perfil + IP público
vpn-check    # túnel + DNS
vpn-top      # painel completo
```

## Dia a dia

```bash
vpn-reconnect              # reconecta agora
vpn-server-rotate --list   # ver / trocar servidor
./scripts/vpn-doctor       # diagnóstico completo
./scripts/vpn-switch stop  # encerrar
```

## OpenCode na VPN

```bash
./scripts/vpn-opencode web                  # foreground
./scripts/vpn-opencode serve --detach       # fundo p/ Desktop App
./scripts/vpn-opencode supervise --mode serve  # self-heal persistente
./scripts/vpn-opencode check                # ok|down|quota
```

Desktop App → `http://127.0.0.1:10001`, login `opencode`, senha em `.secrets/opencode_gui_password`.

## Rede interna (opt-in)

```ini
FIREWALL_SUBNETS=192.168.1.0/24
INTERNAL_DNS=192.168.1.1:53
INTERNAL_DNS_RESOLVERS=
INTERNAL_DNS_EXEMPT_HOSTNAMES=dev.go.omega.local
LOCAL_HOSTS=gitlab.omega=192.168.30.5
```

Detalhes: `README.md` (referência) · `examples/uso-basico.md` (passo a passo) · `examples/cenarios-avancados.md` (receitas) · `DEV/RUNBOOKS/` (operação).
