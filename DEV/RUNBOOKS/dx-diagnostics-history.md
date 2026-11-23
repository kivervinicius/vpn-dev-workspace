# Runbook — DX, diagnóstico e histórico

Procedimentos curtos para o dispatcher `vpn`, as checagens profundas, o bundle
sanitizado, o histórico de IP/latência, o gráfico do control-plane, o setup
Windows e a conferência dos patches do Gluetun.

## Dispatcher `vpn`

```bash
vpn up [perfil]       # usa o último perfil ativo quando o perfil é omitido
vpn down               # encerra a stack
vpn sh [dir]           # Zsh no container terminal, no diretório informado
vpn run <cmd...>       # executa comando no terminal pela VPN
vpn ai 1|2            # OpenCode v1/v2 dentro da VPN
vpn check|status|top|history|doctor|reconnect|rotate|logs|hosts|opencode|profiles
```

O diretório do `vpn sh`/`vpn run` precisa estar sob uma raiz montada
(`VPN_WORKSPACE_ROOTS`, padrão `/projetos:/home:/tmp`); o helper
`scripts/vpn-workdir.sh` é a fonte única dessa regra.

## Checagem profunda (`vpn-check --deep`)

```bash
vpn-check --deep --json
```

Acrescenta ao check padrão:

- **egress IPv6**: tenta `curl -6` e compara o IP de saída com o IPv6
  publicado pelo Gluetun; divergência é falha.
- **DNS exposto**: lista listeners em `:53` e falha se algum não estiver em
  loopback.

Sem argumentos extras, `vpn-check` continua sendo o health leve (6 checks).

## Bundle sanitizado (`vpn-doctor --bundle`)

```bash
vpn-doctor --bundle /tmp/diag.tar.gz --redact-ips
```

Allowlist estrita: `manifest.txt`, `doctor.tsv`, `doctor.json`,
`environment.txt`, `env-keys.txt` (só nomes de variáveis), `compose-ps.txt`,
`vpn-check.json`, `logs-vpn.txt`, `logs-terminal.txt` (100 linhas cada).
Nunca inclui `.secrets/`, `auth.json`, bancos de sessão nem valores do `.env`.
`--redact-ips` troca IPv4/IPv6 por `<ip-redigido>`.

Antes de anexar em issue, confira o conteúdo:

```bash
tar -tzf /tmp/diag.tar.gz
tar -xzOf /tmp/diag.tar.gz ./doctor.json | jq .
```

## Histórico de IP e latência (`vpn-history`)

```bash
vpn-history --record              # grava uma amostra agora
vpn-history --since 24h           # últimas 24h
vpn-history --since 7d --json     # saída máquina
vpn-history --limit 10            # últimas 10 amostras
```

- Arquivo JSONL: `.vpn-control-state/history.jsonl` no host,
  `/var/lib/vpn-control/history/history.jsonl` no container (bind do mesmo
  diretório, então host e container enxergam o mesmo arquivo).
- Escrita protegida por `flock`; rotação em `VPN_HISTORY_MAX_LINES`
  (padrão 2000).
- O `vpn-auto-reconnect` grava automaticamente quando a VPN volta a
  `healthy`; falha ao gravar nunca derruba a recuperação.
- `vpn-top` mostra a série (sparkline) e `vpn-top --json` expõe
  `.history`; o control-plane mostra o gráfico em `/api/v1/history`.

## Gráfico no control-plane

```bash
curl -u control:"$CONTROL_UI_PASSWORD" http://127.0.0.1:10003/api/v1/history?limit=60
```

Somente leitura; o arquivo vem do mesmo bind do `vpn-history`.

## Windows

```powershell
pwsh -File .\scripts\windows\bootstrap.ps1 -DryRun   # só relata
pwsh -File .\scripts\windows\bootstrap.ps1            # instala o que falta via winget
. .\scripts\windows\vpn-completion.ps1                # autocomplete do vpn.ps1
```

O bootstrap é idempotente (consulta `winget list` antes de instalar) e exige
PowerShell 7+.

## Patches do Gluetun

```bash
make gluetun-patch          # confere aplicação por tag
./scripts/verify-gluetun-patch --tag v3.41.4-rc2 --patch gluetun/publicip-recovery-rc2.patch
```

O runtime usa `v3.41.3` + `gluetun/publicip-recovery.patch`. O
`v3.41.4` stable ainda não existe (só rc1/rc2); o patch do RC está preparado
e testado, sem cutover.
