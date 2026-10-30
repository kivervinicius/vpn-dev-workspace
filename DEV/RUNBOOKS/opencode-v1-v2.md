# OpenCode v1 e v2 no container

Atalhos instalados em `~/.local/bin` (visíveis no host e no container):

```bash
opencode2   # OpenCode v2.1.3, home compartilhada (~/.local/share/opencode)
opencode1   # OpenCode v1.19.5, dados isolados (~/.opencode-v1)
opencode1 --version       # 1.19.5
opencode2 --version       # 2.1.3
opencode1 models          # catálogo atual
```

## Como cada um funciona

| Item | v2 (`opencode2`) | v1 (`opencode1`) |
|---|---|---|
| Binário | `~/.opencode/bin/opencode` (host) | `~/.opencode-v1/bin/opencode` (1.19.5; fallback `/usr/local/bin/opencode` 1.18.31) |
| Dados | `~/.local/share/opencode/opencode.db` | `~/.opencode-v1/.local/share/opencode/opencode.db` |
| Config | `~/.config/opencode` | `~/.opencode-v1/.config/opencode` |
| Estado | `~/.local/state/opencode` (`service.json`) | `~/.opencode-v1/.local/state` |
| Sessões | compartilhadas host/container | próprias do v1 |

- No **host**, `opencode1` entra no container `terminal` via `docker exec` com `HOME`/XDG apontando para `~/.opencode-v1`.
- **Dentro do container**, `opencode1` roda `~/.opencode-v1/bin/opencode` (1.19.5) ou o fallback da imagem diretamente com o mesmo isolamento.
- O projeto é o `$PWD`; o tráfego passa pela VPN (netns do `terminal`).
- `opencode1` copia `auth.json` do v2 **uma vez** (se o v1 ainda não tiver auth). Se o formato não for compatível, rode `opencode1 providers` para logar.

## Importar histórico do v2 (snapshot do banco)

O `import` JSON **não** é compatível entre v2.1.3 e v1.19.5 (schema de mensagens diferente; falha em `Missing key ["slug"]` e campos seguintes). O caminho que funciona é copiar um snapshot consistente do banco do v2 para o home do v1 — o v1.19.5 lê o schema do v2.

```bash
opencode1-import-v2      # snapshot + backup do banco v1 anterior
opencode1 session list   # confere o histórico
```

- Usa `VACUUM INTO` via `python3` (host), Node 22+ (`node:sqlite`, container) ou `sqlite3`; não exige python3 no container.
- Substitui o banco do v1; o anterior fica em `opencode.db.bak-<data>`.
- É **unidirecional**: rode de novo para trazer sessões novas do v2; o que você fizer no v1 não volta ao v2.
- Precisa de ~3 GB livres (tamanho do banco do v2).
- O `export` pelo wrapper pode truncar em ~192 KB por limitação do `docker exec -i`. Para exportar, use o binário direto:
  ```bash
  HOME=~/.opencode-v1 XDG_DATA_HOME=~/.opencode-v1/.local/share \
  XDG_CONFIG_HOME=~/.opencode-v1/.config XDG_STATE_HOME=~/.opencode-v1/.local/state \
  ~/.opencode-v1/bin/opencode export <id> > arquivo.json
  ```

## Limites estruturados e recuperação VPN

O plugin global `vpn-recovery` classifica somente eventos e campos
estruturados; texto arbitrário de resposta e logs nunca acionam mudança VPN.
Free-tier e HTTP 429/rate-limit estruturado solicitam recovery automaticamente.
Limites de conta e crédito nunca alteram VPN.

| Versão | Comportamento |
|---|---|
| v1.19.5 | Retry estruturado solicita recovery apenas se `session.abort` confirmar `data === true`; abort falso/erro não muda VPN. Um `session.error` terminal estruturado pode solicitar recovery sem abort. |
| v2.1.3 | Hook do servidor veta retries classificados; uma única falha `session.execution.failed` na TUI pode solicitar recovery. Headless não tem recovery TUI. |

O helper só tenta com VPN running, túnel saudável e IP público válido; sucesso
exige IP de saída diferente. Um lock compartilhado serializa mutações; cooldown
300 s, no máximo 6 eventos admitidos por janela móvel de 3600 s, até 3 alvos
distintos por evento e timeout de 600 s limitam a operação. Eventos admitidos
consomem orçamento mesmo em falha. O alvo informado é o solicitado, não uma
confirmação do peer remoto. A troca é best effort e não garante reset de quota.
Nenhum plugin reenvia prompt.

Instale launchers e plugins globais:

```bash
./scripts/opencode-vpn-install
opencode1 --version
opencode2 --version
```

Para quota não renovada após eventual troca, confira as regras do provider e
decida manualmente se deseja reenviar. Para desconexão real da VPN, use
`vpn-reconnect` ou o supervisor (`vpn-opencode supervise`), que verifica a
saúde do túnel antes de reiniciar OpenCode.

## Atualizar o v1

O binário atual fica em `~/.opencode-v1/bin/opencode`. Use o atualizador do
host para consultar a release v1 publicada e aplicar a versão disponível:

```bash
opencode-update --check
opencode-update --apply
~/.opencode-v1/bin/opencode --version
```

O launcher exige esse binário e recusa iniciar se ele estiver ausente; não usa
fallback de outra versão da imagem.

## Atualização automática

`opencode-update` verifica as duas linhas:

```bash
opencode-update --check   # só mostra instalado x latest
opencode-update --apply   # baixa/instala se houver versão nova
```

- **v1:** última release `v1.*` do GitHub (`anomalyco/opencode`), baixada para `~/.opencode-v1/bin/opencode`.
- **v2:** última versão do npm (`@opencode/cli`), instalada em `~/.opencode`.
- Log: `~/.local/state/opencode-update.log`.
- Timer systemd do usuário: `opencode-update.timer` (diário, com atraso aleatório de até 30 min).

```bash
systemctl --user list-timers opencode-update.timer
journalctl --user -u opencode-update.service -n 30
systemctl --user disable --now opencode-update.timer   # desligar
```

## Limitações

- v1.19.5 pode não conhecer modelos/providers novos do v2.
- O plugin `vpn-recovery` só atua em limites estruturados conforme a política acima; `vpn-opencode check` é observacional e o supervisor trata apenas falha real de rede/túnel.
- Não aponte o Desktop v2 para um `serve` do v1 (APIs diferentes).
- Para zerar o v1: `rm -rf ~/.opencode-v1` (não afeta o v2).
