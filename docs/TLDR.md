# TL;DR — VPN Dev Workspace (1 página)

Terminal Docker com 100% do tráfego forçado pela VPN (Gluetun + kill switch).
Se o túnel cair, a saída é bloqueada em vez de vazar pelo host.

## Subir (Linux/WSL2)

```bash
./scripts/vpn-setup --provider nordvpn   # cria .secrets/ (0700) e placeholders
# preencha .secrets/nordvpn_user, .secrets/nordvpn_password e .env
./scripts/vpn-switch nordvpn-openvpn     # valida, sobe o perfil e espera o healthcheck
./scripts/vpn-shell                      # Zsh no container, no diretório atual
```

Com o dispatcher no `PATH`, o mesmo fluxo vira:

```bash
vpn up nordvpn-openvpn   # sem argumento, usa o último perfil ativo
vpn sh                   # shell no diretório atual
vpn run git fetch        # um comando pela VPN
vpn down
```

## Subir (Windows PowerShell)

```powershell
Set-ExecutionPolicy -Scope Process Bypass
pwsh -File .\scripts\windows\bootstrap.ps1   # winget idempotente (-DryRun só relata)
.\scripts\vpn.ps1 start nordvpn-openvpn
.\scripts\vpn.ps1 terminal
. .\scripts\windows\vpn-completion.ps1       # autocomplete do vpn.ps1 (opcional)
```

## Checar

```bash
vpn-status                # perfil + IP público
vpn-check                 # túnel + DNS + leak básico (6 checks)
vpn-check --deep          # + egress IPv6 e DNS exposto
vpn-top                   # painel completo + sparkline de latência
vpn-history --since 24h   # série de IP/latência
```

`vpn-check` sai `0` saudável / `1` com falha; `--json` e `-q` para automação.

## Dia a dia

```bash
vpn-reconnect               # reconecta agora (aguarda o IP voltar)
vpn-server-rotate --list    # ver / trocar servidor
vpn-server-rotate           # próximo servidor da lista
vpn-history --record        # grava uma amostra manual
./scripts/vpn-doctor        # diagnóstico completo (host, segredos, containers)
```

## Diagnóstico para anexar em issue

```bash
./scripts/vpn-doctor --bundle diag.tar.gz --redact-ips
tar -tzf diag.tar.gz    # allowlist: sem .secrets/, sem valores do .env
```

## OpenCode na VPN

```bash
./scripts/vpn-opencode web                     # foreground
./scripts/vpn-opencode serve --detach          # fundo para o Desktop App
./scripts/vpn-opencode supervise --mode serve  # recomendado: self-heal persistente
./scripts/vpn-opencode check                   # ok|down|quota
./scripts/opencode-vpn-install                 # launchers + plugins vpn-recovery
opencode1 | opencode2                          # v1 (home isolada) / v2 (compartilhada)
```

Desktop App → `http://127.0.0.1:10001`, login `opencode`, senha em
`.secrets/opencode_gui_password`. O fallback do v2 só alterna entre modelos
**gratuitos** (`provider.free-limit`); nunca vai de free para pago.

## Rede interna (opt-in)

```ini
FIREWALL_SUBNETS=192.168.240.10
INTERNAL_DNS=192.168.240.10:53
INTERNAL_DNS_RESOLVERS=
INTERNAL_DNS_EXEMPT_HOSTNAMES=dev.go.internal.example
LOCAL_HOSTS=gitlab.internal.example=192.168.240.10
```

## Verificar antes de enviar

```bash
make verify-fast   # sintaxe + ShellCheck + compose + docs + testes (sem build)
make verify        # verify-fast + build das imagens terminal e Gluetun
```

## Encerrar

```bash
./scripts/vpn-switch stop   # ou: vpn down
```

Detalhes: `README.md` (referência completa) · `examples/uso-basico.md` (passo a
passo) · `examples/cenarios-avancados.md` (receitas) ·
`DEV/RUNBOOKS/dx-diagnostics-history.md` (dispatcher, `--deep`, bundle,
histórico, patches do Gluetun) · `DEV/RUNBOOKS/` (operação geral).