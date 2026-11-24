# VPN Dev Workspace

> **Projeto comunitário — ambiente de desenvolvimento por VPN.** O objetivo
> é diagnóstico, isolamento e recuperação verificável; não existe garantia
> de uso ilimitado de modelos externos. Contribua: [Contributing](CONTRIBUTING.md),
> [Compatibility](docs/compatibility.md), [Security](SECURITY.md).


Ambiente local de desenvolvimento em Docker que força o tráfego do terminal por uma VPN operada pelo [Gluetun](https://github.com/qdm12/gluetun). O terminal compartilha a rede do serviço VPN; se o túnel falhar, o kill switch do Gluetun bloqueia a saída.

> Use somente provedores, contas e redes para os quais você tem autorização. A manutenção automática existe para recuperar conectividade, não para ocultar atividade ou contornar políticas.

## Sumário

| Parte | Seção | Para quê |
|---|---|---|
| — | [Objetivo](#objetivo) | O que o projeto promete |
| — | [TL;DR](#tldr--do-zero-ao-túnel-em-5-minutos) | Do zero ao túnel em 5 minutos |
| — | [Requisitos](#requisitos) | O que precisa existir na máquina |
| — | [Mapa da documentação](#mapa-da-documentação) | Onde está cada procedimento |
| — | [Novidades](#novidades) | O que mudou nesta entrega |
| A | [1. Configuração inicial](#1-configuração-inicial) | Segredos, `.env`, primeiro start |
| A | [2. Perfis e credenciais](#2-perfis-e-credenciais) | Como cada provedor é carregado |
| B | [3. Terminal, portas e proxy](#3-terminal-portas-e-proxy) | Faixa publicada e proxy HTTP |
| B | [4. Manutenção da VPN](#4-manutenção-da-vpn) | Reconexão, rotação, histórico, diagnóstico |
| C | [5. Rede interna do host](#5-acesso-à-rede-interna-do-host-opt-in) | `FIREWALL_SUBNETS`, DNS e hosts internos |
| C | [6. Paridade com a home](#6-paridade-com-a-home-do-host) | UID/GID, agente SSH, sessão do usuário |
| D | [7. OpenCode pela VPN](#7-painel-web-e-desktop-do-opencode-pela-vpn-opt-in) | Painel, Desktop, supervisor, fallback free→free |
| D | [8. Windows](#8-windows) | PowerShell + Docker Desktop, WSL2 |
| D | [9. Perfis disponíveis](#9-exemplos-de-provedores) | Tabela de provedores |
| E | [10. Estrutura e verificação](#10-estrutura-verificação-e-encerramento) | Containers, gates, CI |
| E | [11. Control Plane](#11-control-plane-opt-in) | Observabilidade read-only e gráfico de latência |
| E | [12. Privacidade e segredos](#12-privacidade-segredos-e-dados-que-saem-da-máquina) | O que trafega, o que é gravado |
| E | [13. Diagnóstico rápido](#13-diagnóstico-rápido) | Sintoma → comando |

## TL;DR — do zero ao túnel em 5 minutos

```bash
./scripts/vpn-setup --provider nordvpn   # cria .secrets/ (0700) + API key + placeholders (0600)
# edite .secrets/nordvpn_user, .secrets/nordvpn_password e .env (VPN_COUNTRY etc.)
./scripts/vpn-switch nordvpn-openvpn     # valida, sobe o perfil e aguarda o healthcheck
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml exec terminal zsh
```

Com o dispatcher instalado (`scripts/vpn` no `PATH`), o mesmo fluxo fica:

```bash
vpn up nordvpn-openvpn   # sobe (usa o último perfil ativo se omitir o perfil)
vpn sh                  # abre o Zsh do container terminal no diretório atual
vpn check               # túnel + DNS + leak básico
vpn down                # encerra
```

Dentro do terminal:

```zsh
vpn-status   # perfil, servidor e IP público
vpn-check    # túnel + DNS + leak básico
```

Encerrar: `./scripts/vpn-switch stop` (ou `vpn down`). Versão imprimível de 1
página: [docs/TLDR.md](docs/TLDR.md). Passo a passo comentado: [o exemplo de uso
básico](examples/uso-basico.md).

| Quero… | Comando |
|---|---|
| Subir / trocar de VPN | `./scripts/vpn-switch <perfil>` ou `vpn up <perfil>` |
| Abrir o shell | `./scripts/vpn-shell` (ou `make shell`, ou `vpn sh`) |
| Executar algo pela VPN | `vpn run <comando>` |
| Saúde rápida | `vpn-status`, `vpn-check`, `vpn-top` |
| Checagem profunda (IPv6/DNS) | `vpn-check --deep` |
| Reconectar / trocar servidor | `vpn-reconnect`, `vpn-server-rotate --list` |
| Diagnosticar tudo | `./scripts/vpn-doctor` (ou `make doctor`) |
| Diagnosticar para anexar em issue | `./scripts/vpn-doctor --bundle diag.tar.gz --redact-ips` |
| Histórico de IP/latência | `vpn-history --record`, `vpn-history --since 7d` |
| Abrir o OpenCode na VPN | `./scripts/vpn-opencode web\|serve\|supervise` ou `vpn ai 2` |
| Rede da casa/empresa | `FIREWALL_SUBNETS` + `INTERNAL_DNS` + `LOCAL_HOSTS` |

## Requisitos

| Onde | Precisa de |
|---|---|
| Linux / WSL2 | Docker Engine + Compose ≥ 2.24, `curl`, `jq`, `awk`, Bash; `zsh` e `socat` só para extras (veja `make lint`) |
| Windows | Docker Desktop com backend WSL2, PowerShell 7+ (`pwsh`), Compose ≥ 2.24.4 |
| Todo o ambiente | Um provedor VPN válido e credenciais próprias em `.secrets/` (modo `0600`) |
| Desarrollo do repo | Node.js 18+ (testes), Go 1.26+ (patch do Gluetun), Pester 5+ (`make test-windows`) |

Portas usadas por padrão: `10000-10010` (`VPN_PORT_RANGE`), `10001` painel do
OpenCode, `10002` proxy HTTP, `10003` Control Plane. O bind é local
(`127.0.0.1`) por padrão.

## Mapa da documentação

| Documento | Conteúdo |
|---|---|
| **Este README** | Referência completa, em 13 seções |
| [docs/TLDR.md](docs/TLDR.md) | Cola-rápida de 1 página (imprimir) |
| [Exemplo de uso básico](examples/uso-basico.md) | NordVPN + OpenVPN passo a passo |
| [Cenários avançados](examples/cenarios-avancados.md) | Intranet, `LOCAL_HOSTS`, proxy, supervisor, home read-only, senhas via arquivo |
| [docs/compatibility.md](docs/compatibility.md) | Matriz de compatibilidade OpenCode v1/v2 |
| [Runbook DX/diagnóstico](DEV/RUNBOOKS/dx-diagnostics-history.md) | Dispatcher, `--deep`, bundle, histórico, patches do Gluetun |
| [Runbook OpenCode Desktop](DEV/RUNBOOKS/opencode-desktop-vpn.md) | Desktop/Web pela VPN |
| [Runbook OpenCode v1/v2](DEV/RUNBOOKS/opencode-v1-v2.md) | Launchers, versões, importação de histórico e recuperação por limite |
| [Runbook de troubleshooting](DEV/RUNBOOKS/troubleshooting-vpn.md) | Diagnóstico e resolução |
| [DEV/SPECS/PLAN-GOAL-VPN-DX-SEGURANCA.md](DEV/SPECS/PLAN-GOAL-VPN-DX-SEGURANCA.md) | Plano do goal de DX/segurança (issue [#9](https://github.com/kivervinicius/vpn-dev-workspace/issues/9)) |

## Novidades

- **Dispatcher `vpn`** — um comando para o dia a dia: `up`, `down`, `sh`, `run`,
  `ai`, `check`, `status`, `top`, `history`, `doctor`, `reconnect`, `rotate`,
  `logs`, `hosts`, `opencode`, `profiles`. Completion zsh em `scripts/_vpn`.
- **`vpn-check --deep`** — acrescenta egress IPv6 e detector de resolver DNS
  exposto aos 6 checks padrão.
- **`vpn-doctor --bundle`** — `.tar.gz` sanitizado por allowlist (sem
  `.secrets/`, sem valores do `.env`), com `--redact-ips` para ocultar IPv4/IPv6.
- **`vpn-history`** — série JSONL de IP/latência com `flock` e rotação; o
  auto-reconnect grava ao recuperar; `vpn-top` mostra a sparkline e o Control
  Plane mostra o gráfico (`/api/v1/history`).
- **Windows** — `scripts/windows/bootstrap.ps1` (winget idempotente) e
  completion PowerShell para `vpn.ps1`.
- **CI** — `actions/checkout` por SHA, `actionlint` com checksum fixo e
  `zizmor` pinado para análise estática dos workflows.
- **Fallback free→free** — o OpenCode v2 só troca para modelos explicitamente
  gratuitos (provider `opencode`, custo `0`); nunca sai de free para pago.

## Objetivo

Oferecer um terminal conectado à VPN que seja uma extensão direta do ambiente do host. Ele reutiliza a home, o workspace, as configurações e as ferramentas do usuário nos mesmos caminhos, incluindo o OpenCode, sem permitir que o tráfego de rede do terminal contorne o Gluetun. As consultas de DNS também passam pelo servidor DNS embutido do Gluetun (`127.0.0.1`), evitando vazamento pelo resolver do host.

---

# Parte A — Começar

## 1. Configuração inicial

### 1.1 Assistente de primeiro uso (vpn-setup)

```bash
./scripts/vpn-setup --provider nordvpn
# ou: make setup
```

O assistente cria o diretório `.secrets/` (modo 0700), gera a chave de API do Gluetun e cria os placeholders de credenciais em modo 0600. Em seguida, preencha os arquivos criados dentro de `.secrets/`. Também cobre `vpn-setup`, `vpn-doctor` e `vpn-hosts-gen`/`vpn-hosts-apply` internos.

### 1.2 Configuração manual

1. Copie o exemplo: `cp .env.example .env`.
2. Crie os arquivos de segredo indicados em `.env` dentro de `.secrets/` e proteja-os com `chmod 600 .secrets/*`.
3. Escolha um perfil e inicie-o:

   ```bash
   ./scripts/vpn-switch nordvpn-openvpn
   ```

   Não execute `docker compose up` diretamente: ele não seleciona um provedor nem seus arquivos de segredo. Use sempre `vpn-switch <perfil>`. Na primeira execução o Compose também constrói a imagem local do Gluetun (`gluetun/`, versão fixada + patch de retry da coleta de IP público), o que exige acesso à internet.

4. Abra o terminal Zsh:

   ```bash
   ./scripts/vpn-shell
   # ou: make shell
   ```

   O `vpn-shell` encaminha `TERM` (+ `COLORTERM`/`TERM_PROGRAM` quando existirem) para dentro do container e marca a aba como `VPN ▸ …` até você sair. Com o `TERM` correto, todo título mudado lá dentro — oh-my-zsh (`precmd`/`preexec`), IAs como o OpenCode, `title` ou `printf '\e]0;…\a'` manual — atravessa o `exec` e replica na aba do host. Em tmux, ele libera `allow-rename` da janela atual para o rename in-band virar nome da janela.

   O Compose também injeta `TERM` no container (interpolado do host, fallback `xterm-256color`), então o `exec` direto já herda um `TERM` válido após recriar o terminal (`vpn-switch` recria tudo; ou `docker compose --profile vpn up -d --force-recreate --no-deps terminal`). Equivalente manual: `docker compose --profile vpn exec -e TERM="$TERM" terminal zsh`.

   **IAs e título da aba:** medido no fio, o `opencode` nunca emite título e o `claude` emite só `Claude Code` na abertura — não há progresso para replicar. Para ver 🤖 trabalhando… / ✅ concluído na aba, ative o hook (uma vez): `echo 'source /projetos/vpn-dev-workspace/scripts/vpn-title-hook.zsh' >> ~/.zshrc` (ajuste o caminho), reabra o shell e rode a IA via `vpn-ai opencode …` / `vpn-ai claude …`. O resultado fica grudado até o próximo comando.

O usuário do terminal não é root e o Zsh é seu shell de login padrão. A home do usuário do host é montada integralmente no mesmo caminho, portanto configurações, ferramentas, credenciais locais e arquivos do host ficam disponíveis no terminal pelo túnel VPN. Confirme o OpenCode ativo com `command -v opencode` e `opencode --version`.

Para um guia passo a passo, consulte [o exemplo de uso básico](examples/uso-basico.md).

## 2. Perfis e credenciais

### 2.1 Como os perfis carregam credenciais

O arquivo `docker-compose.yml` contém apenas a infraestrutura comum. Cada arquivo em `profiles/` acrescenta um provedor e mapeia seus arquivos locais de segredo para o Gluetun. Por isso, o comando abaixo é a única forma suportada de iniciar o ambiente:

```bash
./scripts/vpn-switch <perfil>
```

Por exemplo, `./scripts/vpn-switch nordvpn-openvpn` carrega `profiles/nordvpn-openvpn.yml`, que usa `NORDVPN_USER_FILE` e `NORDVPN_PASSWORD_FILE` definidos em `.env`. Os valores nunca são impressos, copiados para o Git ou passados como argumentos de linha de comando.

Os serviços usam o perfil Compose interno `vpn`; uma execução direta de `docker compose up` não os inicia. Isso evita iniciar uma VPN com o provedor, porém sem o perfil e sem suas credenciais.

### 2.2 Diagnóstico de credenciais ausentes

Se o log disser `OpenVPN settings: user is empty`, os arquivos de segredo não foram associados ao contêiner — isso não significa que a credencial foi apagada. Confirme a presença sem mostrar o conteúdo:

```bash
test -s .secrets/nordvpn_user && test -s .secrets/nordvpn_password && echo 'Segredos NordVPN disponíveis'
```

Em seguida, inicie novamente pelo seletor:

```bash
./scripts/vpn-switch nordvpn-openvpn
```

Para outro provedor, troque o argumento pelo perfil correto e use os respectivos caminhos `*_FILE` de `.env`. Após a inicialização, confirme a conexão com `vpn-status` dentro do terminal ou com `docker compose -f docker-compose.yml -f profiles/<perfil>.yml ps` no host. Se os arquivos não existirem ou estiverem vazios, recrie somente os arquivos indicados pelo provedor; não coloque valores de credencial diretamente em `.env`.

### 2.3 Diagnóstico automatizado (vpn-doctor)

Se houver problemas de conexão, loop de reconexão ou dúvidas sobre o estado da stack:

```bash
./scripts/vpn-doctor
# ou com correção automática de permissões:
./scripts/vpn-doctor --fix
# ou via make:
make doctor
```

O `vpn-doctor` valida ferramentas do host, integridade de segredos (modo 0600), status dos contêineres Docker e dispara o teste interno de conectividade e DNS do túnel. Em caso de dúvidas ou falhas persistentes, consulte o [Runbook de Diagnóstico e Resolução da VPN](DEV/RUNBOOKS/troubleshooting-vpn.md).

---

# Parte B — Operação diária

## 3. Terminal, portas e proxy

### 3.1 Portas de desenvolvimento

O serviço `vpn` publica a faixa TCP configurada por `VPN_PORT_RANGE` (padrão `10000-10010`, 11 portas; `10001` = painel OpenCode e `10002` = proxy HTTP). Projete aplicações expostas para escutar uma porta dentro dessa faixa; amplie a faixa só quando precisar — cada porta extra é superfície de rede publicada.

- Por padrão, `HOST_BIND_ADDRESS=127.0.0.1`, acessível somente na máquina host.
- Para acesso pela LAN, informe o IP específico da interface local, por exemplo `HOST_BIND_ADDRESS=192.168.1.20`; nesse caso o `vpn-switch` exige `OPENCODE_GUI_PASSWORD_FILE` com um arquivo de senha não vazio (o painel web do OpenCode fica exposto na faixa e não pode abrir sem senha em LAN).
- Não use `0.0.0.0` ou `::`: eles expõem a faixa em todas as interfaces, inclusive onde um firewall pode não protegê-la.
- Antes de parar o ambiente, `vpn-switch` verifica conflitos TCP da faixa. A verificação reduz conflitos, mas o Docker ainda é a autoridade final para o bind de portas.

### 3.2 Proxy HTTP pela VPN (opt-in)

Com `VPN_HTTP_PROXY=on` no `.env` (e `vpn-switch` para aplicar), o Gluetun expõe um proxy HTTP na porta `VPN_HTTP_PROXY_PORT` (padrão `10002`, dentro da faixa publicada):

```bash
export http_proxy=http://127.0.0.1:10002 https_proxy=http://127.0.0.1:10002
```

- O `vpn-switch` valida que a porta está dentro de `VPN_PORT_RANGE`.
- Auth opcional: `VPN_HTTP_PROXY_USER` + senha **via arquivo** `VPN_HTTP_PROXY_PASSWORD_FILE` (ex: `.secrets/httpproxy_password`, modo 0600). Evite `VPN_HTTP_PROXY_PASSWORD` direto em env — ele vaza em `docker inspect`; o bind segue só local.
- Útil para browser/IDE/plugins do host passarem pela VPN sem `exec` no container.

## 4. Manutenção da VPN

O serviço interno `vpn-auto-reconnect` valida a saúde do ambiente (túnel ativo, IP público obtido e DNS do túnel funcionando) e executa uma reconexão a cada hora. Se não houver IP público válido depois disso, repete a tentativa a cada 30 segundos até recuperar conectividade.

As variáveis são configuráveis em `.env`:

```ini
VPN_RECONNECT_INTERVAL_SECONDS=3600
VPN_RECONNECT_RETRY_SECONDS=30
```

Para consultar, validar ou solicitar uma reconexão manual dentro do terminal:

```bash
vpn-status          # status, perfil, servidor e IP público
vpn-check           # saúde do túnel, DNS e checagem básica de vazamento de DNS
vpn-reconnect       # reconecta e aguarda o IP público voltar
vpn-top             # painel de status (serviços, túnel, DNS e auto-reconexão)
vpn-server-rotate   # troca de servidor pelo controle do Gluetun
```

No host, os utilitários e assistentes ficam em `./scripts/`; o dispatcher
`scripts/vpn` (ou `make …`) é o atalho recomendado:

| Tarefa | Host | Dentro do terminal |
|---|---|---|
| Diagnóstico completo | `./scripts/vpn-doctor` | `vpn-doctor` |
| Assistente inicial (segredos) | `./scripts/vpn-setup --provider nordvpn` | — |
| Subir / parar | `./scripts/vpn-switch <perfil>` / `stop` | `vpn up` / `vpn down` |
| Shell na VPN | `./scripts/vpn-shell` | `vpn sh` |
| Comando na VPN | `vpn run <cmd>` | `vpn run <cmd>` |
| Estado / saúde | `./scripts/vpn-status`, `./scripts/vpn-check` | `vpn-status`, `vpn-check` |
| Painel completo | `./scripts/vpn-top` | `vpn-top` |
| Histórico de IP/latência | `./scripts/vpn-history` | `vpn-history` |
| OpenCode | `./scripts/vpn-opencode …` | `vpn-opencode …` |

Atalhos do `Makefile`: `make help`, `make setup`, `make doctor`, `make up`,
`make down`, `make shell DIR=/caminho`, `make check`, `make status`, `make ai`,
`make lint`, `make test`, `make test-windows`, `make gluetun-patch`,
`make verify-fast` (sem build Docker) e `make verify` (gate completo).

O `vpn-reconnect` aguarda o IP público do Gluetun após a reconexão (o endpoint só
o publica segundos depois de o túnel subir) e imprime o IP quando disponível; se
o IP não voltar, encerra com erro para o `vpn-auto-reconnect` retentar.

O Gluetun usa `ifconfig.co` para obter o IP público. A imagem local é construída
a partir da versão fixada do Gluetun (`v3.41.3`) com um patch que tenta a
coleta até três vezes, com dois segundos entre tentativas; não reinicia o
túnel para repetir a consulta. O `v3.41.4` stable ainda não existe upstream
(só `rc1`/`rc2`): o patch do RC está preparado e testado
(`gluetun/publicip-recovery-rc2.patch`, conferido por `make gluetun-patch`),
sem cutover. A disponibilidade e os limites do serviço externo ainda podem
afetar a verificação de saúde e a reconexão. O build exige acesso à fonte
fixada e às dependências Go, e executa os testes do patch.

### 4.1 Histórico de IP e latência

```bash
vpn-history --record            # grava uma amostra agora
vpn-history --since 24h         # janela
vpn-history --since 7d --json   # saída máquina
vpn-history --limit 10          # últimas amostras
```

- Arquivo JSONL: `.vpn-control-state/history.jsonl` no host e
  `/var/lib/vpn-control/history/history.jsonl` no container — é o **mesmo**
  arquivo (bind), então host e container enxergam a mesma série.
- Escrita com `flock`; rotação em `VPN_HISTORY_MAX_LINES` (padrão 2000).
- O `vpn-auto-reconnect` grava automaticamente quando a VPN volta a `healthy`;
  falha ao gravar nunca derruba a recuperação.
- `vpn-top` desenha a sparkline; `vpn-top --json` expõe `.history`; o Control
  Plane mostra o gráfico (`/api/v1/history`).
- Procedimento completo: [runbook DX/diagnóstico](DEV/RUNBOOKS/dx-diagnostics-history.md).

### 4.2 Automação e saída máquina

Para automação: `vpn-status --json|-q`, `vpn-check --json|-q [--only tunnel|dns|internal|hosts] [--deep]`, `vpn-top --json|--no-color`, `vpn-history --json|--since 24h|--limit N`; todo script responde `--help`. O `vpn-check` sai `0` saudável / `1` com falha (a contagem vai na mensagem/JSON). O `--deep` acrescenta a checagem de egress IPv6 e de resolver DNS exposto, e o `vpn-doctor --bundle <arquivo> [--redact-ips]` gera um `.tar.gz` sanitizado por allowlist (sem `.secrets/`, `auth.json` nem valores do `.env`) para anexar em issues.

### 4.3 Rotação automática de servidor (opt-in)

Por padrão a rotação automática está desligada. Para ativá-la, configure em `.env` e reinicie o ambiente:

```ini
VPN_ROTATE_SERVERS=true
# VPN_SERVER_HOSTNAMES=server1.nordvpn.com,server2.nordvpn.com
# VPN_RECONNECT_ATTEMPTS_BEFORE_ROTATE=3
# Rotação periódica (privacidade), independente de falhas; 0 = desligada.
# VPN_ROTATE_INTERVAL_SECONDS=86400
```

Com `VPN_ROTATE_SERVERS=true`, após `VPN_RECONNECT_ATTEMPTS_BEFORE_ROTATE` falhas consecutivas (padrão 3), o `vpn-auto-reconnect` chama `vpn-server-rotate` e recomeça a contagem. Com `VPN_SERVER_HOSTNAMES` preenchido, os servidores são ciclados na ordem; sem a lista, o Gluetun re-seleciona um servidor aleatório no país configurado. Hostnames inválidos para o provedor são rejeitados pela API do Gluetun. Manual: `vpn-server-rotate [--to <host>|--random|--countries "Brazil,Argentina,Chile"|--list]`. Com `--countries`, a lista de hostnames é limpa e o Gluetun escolhe aleatoriamente entre os países informados; para rotação entre países via `.env`, use `VPN_COUNTRY` com vírgulas e deixe `VPN_SERVER_HOSTNAMES` vazio. Em redes restritivas, servidores aleatórios podem não completar o handshake — nesse caso fixe hostnames alcançáveis em `VPN_SERVER_HOSTNAMES`.

> Se o seu provedor de acesso bloquear faixas de IP de alguns servidores (a re-seleção aleatória pode cair repetidamente neles), preencha `VPN_SERVER_HOSTNAMES` com uma lista de servidores conhecidamente acessíveis para a rotação.

A troca acontece pelo HTTP Control Server do Gluetun (`PUT /v1/vpn/settings`), sem acesso ao socket do Docker, e respeita a autenticação por chave da API.

Os logs do serviço podem ser acompanhados no host:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml logs -f vpn-auto-reconnect
```

---

# Parte C — Rede interna e home

## 5. Acesso à rede interna do host (opt-in)

Por padrão, o kill switch do Gluetun bloqueia todo o tráfego fora do túnel. Para permitir alcance à rede interna do host (ex: servidores `.internal.example`, NAS, impressoras):

```ini
# Sub-redes extras permitidas fora do túnel (a LAN do host é detectada sozinha).
FIREWALL_SUBNETS=192.168.240.0/24,10.0.0.0/24
# DNS interno da LAN (resolução pública E interna passa por ele; deixe
# INTERNAL_DNS_RESOLVERS vazio nesse modo).
INTERNAL_DNS=192.168.240.10:53
INTERNAL_DNS_RESOLVERS=
# Hostnames internos liberados da proteção contra rebinding. Sem curingas:
# o Gluetun rejeita "*.internal.example"; liste os nomes explícitos.
INTERNAL_DNS_EXEMPT_HOSTNAMES=dev.go.internal.example,dev.mt.internal.example
```

- No Linux nativo, sem `FIREWALL_SUBNETS`, o `vpn-switch` injeta a sub-rede da interface com a rota padrão do host (a LAN local).
- No PowerShell e no WSL2, a rota padrão pode ser a rede virtual do Docker/WSL; por isso nenhuma sub-rede é inferida. Configure `FIREWALL_SUBNETS` explicitamente nos modos Windows para liberar a LAN do Windows.
- Quando `INTERNAL_DNS` aponta para um servidor fora da sub-rede da LAN (ex: DNS em outra VLAN), inclua também a sub-rede dele em `FIREWALL_SUBNETS`, senão as consultas são bloqueadas pelo firewall do túnel.
- Com `INTERNAL_DNS`, o servidor DNS embutido do Gluetun usa esse upstream em texto puro; sem ele, mantém o padrão DoT (Cloudflare).
- `INTERNAL_DNS_EXEMPT_HOSTNAMES` é obrigatório para nomes internos: sem ele o Gluetun descarta respostas que apontam para IPs privados (proteção contra rebinding). Curingas não são aceitos (`*.internal.example` é rejeitado) — liste os nomes explícitos, separados por vírgula.
- O `vpn-check` testa `INTERNAL_TEST_HOST` (nome ou IP) quando configurado, com teste TCP real na `INTERNAL_TEST_PORT` quando definida (ex: `INTERNAL_TEST_HOST=192.168.240.10`, `INTERNAL_TEST_PORT=80`); sem a porta, valida apenas que o nome resolve.
- Não inclua a faixa privada do túnel em `FIREWALL_SUBNETS`.

### 5.1 Hosts locais que só existem no host (opt-in)

Nomes que vivem apenas no `/etc/hosts` do host (ex: `gitlab.internal.example`) não resolvem dentro do terminal, porque lá todo DNS passa pelo túnel. Para mapeá-los:

```ini
LOCAL_HOSTS=gitlab.internal.example=192.168.240.10,registry.internal.example=192.168.240.10
```

- O `vpn-switch` gera um snippet a partir de `LOCAL_HOSTS` e injeta no `/etc/hosts` do terminal pós-up (idempotente; `extra_hosts` é rejeitado pelo Docker com `network_mode`, por isso a injeção pós-up).
- Para importar do `/etc/hosts` do host por domínio: `./scripts/vpn-hosts-import --domain internal.example` (só sugere a linha — você cola no `.env`). O gerador interno é `vpn-hosts-gen`.
- Reaplicar após `restart` manual: `./scripts/vpn-hosts-apply` (o `vpn-switch` sempre reaplica; `down`/`recreate` perde as entradas). Se `opencode-supervisor` estiver ativo, ele também recebe os mesmos `LOCAL_HOSTS`.
- O `vpn-check` valida que cada nome resolve para o IP declarado.
- O mapeamento resolve só o **nome**; o **alcance** continua exigindo a sub-rede em `FIREWALL_SUBNETS` (acima). Se o IP mudar na LAN, atualize o mapeamento (o import facilita o re-sync).

Para receitas completas de configuração de redes internas, DNS de múltiplos domínios e VLANs, consulte [o guia de cenários avançados](examples/cenarios-avancados.md).

## 6. Paridade com a home do host

O terminal herda o UID/GID do usuário do host (`HOST_UID`/`HOST_GID`, padrão `1000`) e, quando as variáveis estão definidas, a sessão SSH e o diretório de sessão do usuário:

```ini
HOST_HOME_DIR=/home/desenvolvedor
# Trava a home como somente-leitura quando só leitura basta:
# HOST_HOME_MODE=ro
HOST_UID=1000
HOST_GID=1000
SSH_AUTH_SOCK=/run/user/1000/keyring/ssh
RUN_USER_DIR=/run/user/1000
```

- `HOST_HOME_DIR` seleciona a home montada (padrão: quem roda o Compose). O modo padrão `rw` permite ao OpenCode compartilhar e atualizar configurações, autenticação e dados de sessão com o host; `HOST_HOME_MODE=ro` serve para fluxos que só leem a home e não precisam persistir alterações.
- `SSH_AUTH_SOCK` monta o agente SSH do host em `/run/vpn-ssh-agent.sock` (leitura) — `git push`, `ssh` e ferramentas que usam o agente funcionam dentro do terminal.
- `RUN_USER_DIR` monta a sessão do usuário (keyring, dbus) no mesmo caminho.
- **Risco consciente**: o container passa a ler seu agente SSH e sua sessão. Inicie apenas o seu próprio ambiente e não rode o terminal com agentes de outros usuários.

---

# Parte D — OpenCode, Windows, referência

## 7. Painel web e Desktop do OpenCode pela VPN (opt-in)

O helper `vpn-opencode` roda o OpenCode dentro do container (tráfego de LLM 100% pela VPN), expondo a interface na faixa publicada:

```bash
./scripts/vpn-opencode web                     # execução direta/foreground
./scripts/vpn-opencode serve                   # execução direta para o Desktop App
./scripts/vpn-opencode supervise --mode serve  # modo recomendado: persistente + self-heal
./scripts/vpn-opencode supervise-status
./scripts/vpn-opencode supervise-logs
./scripts/vpn-opencode supervise-stop
```

- Porta: `OPENCODE_GUI_PORT` (padrão `10001`); validada dentro de `VPN_PORT_RANGE`.
- Gerenciar: `vpn-opencode status|logs [--port P]`, `vpn-opencode stop [--port P]`, fundo com `web|serve --detach`.
- Verificação: `vpn-opencode check [--port P] [--json|-q]` distingue `ok|down|quota` (exit `0` ok / `1` down|quota); `vpn-top` mostra a seção OpenCode.
- Supervisor persistente (recomendado): `vpn-opencode supervise --mode serve` inicia o serviço `opencode-supervisor`. Ele roda no mesmo namespace da VPN, usa a mesma home/workspace e **não** recebe o socket Docker.
- Recuperação automática: queda do processo com VPN saudável reinicia apenas o OpenCode; somente desconexão real ou túnel unhealthy acionam recuperação VPN pelo supervisor. O `vpn-opencode check` é observacional e não inicia rotação; limites de provider não são falhas de túnel.
- Plugins v1/v2 classificam somente eventos e campos estruturados. No OpenCode v2, `provider.free-limit` troca para um modelo gratuito explicitamente elegível do catálogo e usa o retry nativo para continuar o mesmo turno, até três modelos distintos contando o original. Modelos pagos, sem preço conhecido ou incompatíveis com as ferramentas/anexos ficam fora. O toast de sucesso informa os modelos usados; ao esgotar alternativas, a TUI mostra a cota e o `Retry-After` quando conhecido. Outros limites, incluindo HTTP 429 sem escopo por modelo, não trocam modelo. Quotas nunca forçam restart de túnel ou troca de IP; recovery de rede só age após Gluetun confirmar túnel parado. Para priorizar modelos, configure `OPENCODE_MODEL_FALLBACK_FAVORITES` no `.env`; a lista elegível continua dinâmica. Para desligar, use `OPENCODE_MODEL_FALLBACK_ENABLED=false`. O v1 não faz fallback de modelo. Texto arbitrário e logs não acionam ações. Para executar no host fora do túnel, use `OPENCODE_ALLOW_HOST=1 opencode1|opencode2`.
- Falhas confirmadas de conectividade continuam separadas dos limites do provider. O `opencode-supervisor` recupera apenas desconexão de rede ou túnel unhealthy. Ele salva o ID da sessão mais recente, verifica que a sessão exata ainda pode ser exportada e informa `opencode2 --session <id>` para retomada manual; prompts e ferramentas nunca são repetidos automaticamente.
- Proteção anti-loop do supervisor (`OPENCODE_RECOVERY_MAX_ROTATIONS`, `OPENCODE_RECOVERY_WINDOW_SECONDS` e `OPENCODE_RECOVERY_COOLDOWN_SECONDS`) limita recuperação de conectividade, separada dos limites do plugin.
- `vpn-opencode watch` permanece como compatibilidade: inicia o supervisor persistente e acompanha seus logs.
- Launchers e plugins globais: `./scripts/opencode-vpn-install` instala `opencode1` (v1, dados isolados em `~/.opencode-v1`), `opencode2` (v2, home compartilhada), o helper de sync e os plugins de status do provider. O launcher exige túnel saudável. Guia completo em `DEV/RUNBOOKS/opencode-v1-v2.md`.
- Sessões entre clientes v1/v2: os launchers sincronizam as cinco sessões recentes do workspace por native JSON export/import e uma ledger de IDs. `--session <id>` explícito também sincroniza sessões antigas. A conversão preserva texto, raciocínio e resultados de ferramentas concluídas; recusa anexos, ferramentas em execução e partes desconhecidas. É uma cópia verificada, sem replay de prompt ou ferramentas.
- No Windows, `vpn-opencode-wrapper` mantém a sincronização do banco v2 entre o host e o container separada da conversão v1/v2. `vpn.ps1 sessions-sync --push` reporta falhas e não aplica staging antigo quando o push falha.
- Validação por plataforma: gates Linux e Pester no runner Windows do GitHub
  Actions passaram. A integração real do SQLite com Docker Desktop ainda exige
  validação em um host Windows antes de declarar o caminho Windows validado.
- Sonda no `vpn-auto-reconnect` (`OPENCODE_AUTOCHECK=true`) continua apenas observacional; a responsabilidade de recuperar o OpenCode fica centralizada no `opencode-supervisor`.
- Senha (basic auth, usuário `opencode`): arquivo `OPENCODE_GUI_PASSWORD_FILE` (padrão `.secrets/opencode_gui_password`). Sem o arquivo, o painel abre sem senha — apenas para uso local; com `HOST_BIND_ADDRESS` em LAN, `vpn-switch`/`vpn.ps1` exigem o arquivo não vazio e recusam subir sem ele.
- O estado é compartilhado com o CLI: o mesmo `$HOME` e os mesmos projetos são usados por `opencode` no terminal e pela GUI.

### 7.1 Conectar o Desktop App (passo a passo)

1. Suba a ponta: `./scripts/vpn-opencode serve` (mantenha o terminal aberto; use `tmux`/`zellij` para deixá-lo de pé).
2. No OpenCode Desktop do host, adicione o servidor `http://127.0.0.1:10001`.
3. Login `opencode`; senha: conteúdo de `.secrets/opencode_gui_password` (`cat .secrets/opencode_gui_password`).
4. Alternativa por CLI no host: `opencode attach http://127.0.0.1:10001 -u opencode -p "$(cat .secrets/opencode_gui_password)"`.

Para atualizar o Desktop: não há repositório apt (`apt upgrade` não o atualiza); baixe o `.deb` oficial e reinstale (`sudo apt-get install ./opencode-desktop-linux-amd64.deb`). O `PATH` do terminal prioriza o binário da home montada do host (`${HOST_HOME_DIR}/.opencode/bin`), então a atualização do host reflete de imediato no container; a versão fixada no `Dockerfile` (`OPENCODE_VERSION` + checksums) é o fallback. Ainda assim, mantenha Desktop e fallback alinhados — tela branca indica versões divergentes. Guia completo em `DEV/RUNBOOKS/opencode-desktop-vpn.md`.

## 8. Windows

### 8.1 Windows: PowerShell sem distribuição WSL

No Windows, o caminho recomendado é o Docker Desktop com backend WSL2 e o
script PowerShell. Ele não exige Ubuntu, Debian ou outra distribuição WSL
instalada: o Docker Desktop fornece o motor Linux e o projeto Windows é
montado em `/workspace`. A home Linux fica no volume Docker persistente
`vpn_windows_home`, separada da home Windows.

Para preparar as dependências, use o bootstrap idempotente (winget):
`pwsh -File .\scripts\windows\bootstrap.ps1 -DryRun` só relata; sem `-DryRun`
instala Docker Desktop, Git e Node.js LTS que estiverem ausentes. Para Tab no
`vpn.ps1`, faça dot-source de `.\scripts\windows\vpn-completion.ps1` no perfil.

Por padrão o `/workspace` recebe a raiz do repositório. Defina `WORKSPACE_DIR`
no `.env` para montar outra pasta do host como workspace — é a mesma variável
usada no modo Linux, e vale nos dois sistemas (ex.: `WORKSPACE_DIR=C:\Dev`).
A pasta precisa estar em **Settings > Resources > File Sharing** do Docker
Desktop; após adicionar uma nova pasta, reinicie o Desktop, porque ele não
recarrega o file sharing em runtime (o `start` falha com `the path is not
shared`). Sem `WORKSPACE_DIR`, o comportamento volta ao padrão: `/workspace` =
raiz do repositório.

A home Windows inteira é montada em `/mnt/host-home` dentro do container. No
boot, o `vpn-home-link` cria symlinks da home Linux para essa montagem. Com
`WINDOWS_OPENCODE_FULL_LINKS=true` (padrão), todo o `~/.config/opencode` do
host é linkado (agents, commands, plugins, skills, `tui.json`, `cli.json`,
`opencode.json`, ...), exceto `node_modules` — que é instalado no container
para não misturar binários de SO. Também entram `auth.json` (providers do
OpenCode), skills, `.gitconfig`, `.npmrc`, `.orquestrador-maestro`,
`.codex/skills` e `AGENTS.md`. A lista pode ser ajustada via
`WINDOWS_HOME_LINKS` no `.env` (itens relativos à home); para voltar à lista
explícita, use `WINDOWS_OPENCODE_FULL_LINKS=false`.
Plugins declarados no `package.json` do host são instalados no container
(`node_modules` Windows nunca é usado).

Som/ALSA: o container não tem placa de som e o `cli.json` compartilhado liga
`sound`, então o device default do ALSA é redirecionado para o plugin `null`
(`config/alsa-null.conf`), evitando linhas `ALSA lib ... Unknown PCM default`
que quebrariam a TUI do OpenCode.

Provider xKiro: a `XKIRO_API_KEY` existe no ambiente do Windows, mas o
container não a herda. Ela é montada de `.secrets/xkiro_api_key`
(`XKIRO_API_KEY_FILE` no `.env`) e exportada pelo `vpn-opencode-wrapper`;
sem isso, modelos free respondem `free tier can only be used from within
OpenCode`.

O histórico/conversas (`~/.local/share/opencode`) **não** é linkado porque o
SQLite (WAL) não funciona sobre o File Sharing do Docker Desktop (sem locks
POSIX). Em vez disso as conversas são **sincronizadas automaticamente**: o
wrapper `vpn-opencode-wrapper` (prioridade no PATH do container) importa o
banco do host ao abrir uma sessão interativa e publica as mudanças no staging
ao fechar (`vpn-session-sync`); o `vpn.ps1` aplica o staging pendente no host
quando o OpenCode do host está fechado, com backup `.bak`. Nenhum comando
extra é necessário além do `docker exec ... opencode`. Para controle manual:
`.\scripts\vpn.ps1 sessions-sync` (importar do host) e `sessions-sync --push`
(exportar para o host). O binário real segue em `~/.opencode/bin/opencode`; o
wrapper só intercepta sessões interativas de topo.

> **Projetos:** o OpenCode agrupa conversas por projeto (diretório). Repositórios
> **git** têm identidade independente do caminho — o mesmo repo em
> `/workspace/<repo>` enxerga as conversas do host em `C:\Dev\<repo>`. Diretórios
> sem git não se enxergam entre host e container (retome por ID: `opencode -s <id>`).

Abra PowerShell na raiz do projeto e use:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\vpn.ps1 start nordvpn-openvpn
.\scripts\vpn.ps1 terminal
.\scripts\vpn.ps1 status
.\scripts\vpn.ps1 check
.\scripts\vpn.ps1 top
.\scripts\vpn.ps1 reconnect
.\scripts\vpn.ps1 rotate --list
.\scripts\vpn.ps1 opencode web
.\scripts\vpn.ps1 opencode supervise --mode serve
.\scripts\vpn.ps1 opencode supervise-status
.\scripts\vpn.ps1 hosts-import --domain internal.example
.\scripts\vpn.ps1 hosts-apply
.\scripts\vpn.ps1 stop
```

O Docker Compose precisa ser 2.24.4 ou superior, porque o override
`compose.windows.yml` usa `!override` para substituir integralmente os mounts
Linux. O `start` valida o perfil, arquivos de segredo, portas, healthcheck e
`LOCAL_HOSTS` como o `vpn-switch`; caminhos Windows com espaços são aceitos.

O agente OpenSSH do Windows deve estar ativo e acessível pelo named pipe
`openssh-ssh-agent`. O `vpn.ps1` inicia uma ponte temporária com porta dinâmica
e token por sessão; dentro do terminal, `SSH_AUTH_SOCK` aponta para um socket
Unix encaminhado pela ponte. Nenhuma chave privada é copiada para o container.
Se o agente não estiver disponível, o início falha com uma mensagem explícita.
Use `ssh-add -l` no terminal para confirmar a conexão e
`.\scripts\vpn.ps1 agent-stop` para encerrar a ponte manualmente.

### 8.2 Windows com WSL2

O fluxo Bash continua suportado dentro de uma distribuição WSL2 instalada no
sistema de arquivos Linux. Instale o projeto em `~/projetos` (não em
`/mnt/c/...`), habilite a integração dessa distribuição no Docker Desktop e
continue usando `./scripts/vpn-switch <perfil>`. Esse modo mantém a home Linux
e o agente SSH do WSL2 atuais. O fluxo PowerShell e o fluxo WSL2 são distintos:
não misture os mounts ou os arquivos de estado entre eles.

## 9. Exemplos de provedores

| Perfil | Descrição |
|---|---|
| `nordvpn-openvpn` | NordVPN por OpenVPN |
| `nordvpn-wireguard` | NordVPN por WireGuard |
| `protonvpn-openvpn` | Proton VPN por OpenVPN |
| `protonvpn-wireguard` | Proton VPN por WireGuard |
| `surfshark-openvpn` | Surfshark por OpenVPN |
| `mullvad-wireguard` | Mullvad por WireGuard |
| `custom-openvpn` | Arquivo e credenciais OpenVPN próprios |
| `custom-wireguard` | Arquivo WireGuard próprio |

(Surfshark não tem perfil WireGuard: o provedor não expõe chave WireGuard reutilizável como os demais; use `surfshark-openvpn` ou `custom-wireguard`.)

Troque o argumento de `vpn-switch` e o arquivo de perfil nos comandos Compose pelo perfil desejado. Os caminhos de segredo e configurações customizadas estão descritos em `.env.example`. Os perfis `*-openvpn` aceitam `OPENVPN_PROTOCOL` (`udp`, padrão, ou `tcp`); `SERVER_HOSTNAMES` (`VPN_SERVER_HOSTNAMES`) restringe/fixa servidores em todos os perfis de provedor (exceto `custom-*`, que usam config própria).

## 10. Estrutura, verificação e encerramento

```text
host
├── vpn (Gluetun + NET_ADMIN)
│   └── faixa TCP publicada no endereço configurado do host
├── terminal (usuário developer + Zsh + home do host)
│   └── network_mode: service:vpn
├── vpn-auto-reconnect
│   └── verifica o IP público e recupera conectividade
└── opencode-supervisor (opt-in)
    └── monitora opencode serve/web com self-healing e reconexão
```

O contêiner de terminal é uma extensão direta do usuário do host: ele monta a home completa no mesmo caminho e o workspace no mesmo caminho. Isso preserva referências absolutas e permite usar as mesmas configurações e ferramentas, inclusive os dados do OpenCode. O `PATH` do terminal prioriza `${HOST_HOME_DIR}/.opencode/bin` (binário do host, atualizado de imediato); a imagem mantém uma versão verificada compatível (`OPENCODE_VERSION` + checksums no `Dockerfile`) como fallback.

Por padrão, a home montada é a do usuário que executa o Compose. Para selecionar explicitamente o diretório, defina `HOST_HOME_DIR` com um caminho absoluto em `.env`:

```ini
HOST_HOME_DIR=/home/desenvolvedor
```

Esse mount concede ao terminal acesso de leitura e escrita a toda a home indicada. Use somente a sua própria home e inicie o ambiente por `vpn-switch`, para manter a saída de rede protegida pela VPN.

### Verificação local

```bash
make verify-fast   # sintaxe + ShellCheck + compose + docs + testes (sem build Docker)
make verify        # verify-fast + build das imagens terminal e Gluetun
```

Ou piece a peça:

```bash
./scripts/verify-syntax                 # bash -n, zsh -n, node --check, ShellCheck
./scripts/verify-compose                # interpola os 8 perfis + compose.windows.yml
./scripts/verify-docs                   # trava de drift README ↔ scripts ↔ Compose
./tests/linux/test-scripts.sh           # suíte Linux (dispatcher, histórico, patches…)
node --test tests/opencode/*.test.mjs tests/control/*.test.cjs
node tests/opencode/model-fallback-e2e.mjs   # E2E do fallback (provider local)
pwsh -File scripts/vpn.Tests.ps1        # ou: make test-windows (Pester)
make gluetun-patch                      # patches do Gluetun aplicados por tag
```

| Gate | O que trava |
|---|---|
| `verify-syntax` | Erro de sintaxe/ShellCheck em qualquer script |
| `verify-compose` | Perfil ou Compose quebrado (8 provedores + Windows) |
| `verify-docs` | README/script/Compose dessincronizados |
| `test-scripts.sh` | Regressão de comportamento no shell |
| `node --test` | Regressão nos plugins e no control-plane |
| `model-fallback-e2e` | Fallback free→free com provider local (sem chamada real) |
| Pester | Interface Windows (`vpn.ps1`) e helpers `scripts/windows` |
| `gluetun-patch` | Patch local não aplica no upstream da tag |

### CI (GitHub Actions)

A pipeline `Validate` roda em cada push/PR e está dividida em jobs:

| Job | O que faz |
|---|---|
| `validate` | `make verify` completo (inclui build das imagens) |
| `secret-scan` | gitleaks no histórico completo (imagem pinada por digest, `--redact`) |
| `supply-chain` | Trivy (misconfig + secrets), falha só em `CRITICAL` |
| `workflow-lint` | `actionlint` (binário com checksum fixo) e `zizmor` pinado |
| `validate-windows-cli` | Pester no runner `windows-latest` |

`actions/checkout` é usado por SHA (com a versão no comentário), o Trivy por
SHA de tag e as demais imagens por digest. Bumps das Actions e da imagem base
são propostos pelo Dependabot (`.github/dependabot.yml`, semanal);
`NODE_VERSION`/`OPENCODE_VERSION` e os checksums do `Dockerfile` continuam
sendo bumps manuais (ver runbook do OpenCode em `DEV/RUNBOOKS/`).

### Encerrar o ambiente

```bash
./scripts/vpn-switch stop
# ou: vpn down
```

## 11. Control Plane (opt-in)

Ferramentas read-only de observabilidade: `vpn-state --json`,
`opencode-compat --json`, `vpn-events list`, `vpn-backup` e o painel web
local.

- O painel é um serviço local sem acesso à home, workspace, Docker socket ou segredos do OpenCode.
- O observer roda no namespace VPN, agrega sinais sem executar rotação e grava snapshots sanitizados no volume `vpn_control_state`.
- Para habilitar a UI, crie `.secrets/control_ui_password` com senha aleatória de pelo menos 16 caracteres (modo `0600`), configure `CONTROL_UI_PASSWORD_FILE` no `.env` e use o mesmo arquivo de perfil de VPN que foi iniciado:

```bash
# Exemplo apenas se o perfil ativo for nordvpn-openvpn:
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml --profile vpn --profile control up -d vpn-control-observer vpn-control-ui
# Acesse http://127.0.0.1:10003 e autentique com usuario 'control'.
```

Depois de iniciar o ambiente, gere a matriz de compatibilidade pelo container
(usa somente binários e arquivos locais; sem chamadas a modelos):

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml exec terminal opencode-compat --json --publish
```

`vpn-backup` e `opencode-compat` também ficam disponíveis no terminal Linux e
no container Windows, preservando o contrato dos comandos existentes. A
publicação de compatibilidade armazena apenas versões e resultados de hash
sanitizados no volume de controle, para a UI ler sem acesso à home.

O painel **falha fechado** se `HOST_BIND_ADDRESS` for diferente de loopback. O modo control não é iniciado pelo `vpn-switch` por padrão. GETs não executam reconexão. A UI utiliza HTML/CSS/JS estático, sem dependências externas, para manter superfície de ataque e manutenção pequenas.

Backups: a CLI `vpn-backup create --scope v2 --offline` exige que todos os escritores do OpenCode (inclusive host) tenham sido encerrados antes da operação; `--offline` é confirmação do operador, e não prova de ausência de processos em outros namespaces. `vpn-backup verify --id ID` verifica hashes e `PRAGMA integrity_check`; `plan-restore` é read-only; `restore ... --offline` cria snapshot pre-restore e journal para `recover --offline`. `auth.json` não é copiado. Os backups devem ser exportados para fora do volume Docker quando relevantes; a CLI não garante por si só persistência em outro host.

**Limitação importante:** as mudanças de IP demonstram somente egress diferente; não comprovam recuperação de franquia de um provedor de IA. O journal distingue eventos de rede de aceitação real de requisição. A observação remota depende de evidência do provedor e não é automatizada neste MVP.


### Prova experimental de resposta do provedor (manual)

O comando `vpn-provider-probe --model provider/model --confirm` roda **uma invocação**
do OpenCode v2 dentro do container e registra um resultado sanitizado. Ele exige
consentimento explícito porque **consome uma requisição** e cria uma sessão
arquivada (não apaga nem renumera sessões). A invocação é `--standalone --archived
--format json --agent plan`; sem `--auto`, sem replay e sem rotação de IP.

O wrapper não repete a execução; o próprio OpenCode pode fazer retries internos.
Aceitação requer exit 0 mais parte de texto estruturada; erro estruturado
reconhecido informa rejeição; falhas genéricas permanecem **unverified**.
A API local mostra a última prova e a marca como desatualizada em 120 segundos,
sem concluir que a quota foi restaurada permanentemente.

O resultado inclui `publicIp` apenas quando o endereço público da VPN
foi observado igual **antes e depois** da execução; caso contrário
`egressStable=false` e não há atribuição segura da resposta a um IP específico.
Os eventos de resultado preservam o IP confirmado, quando existir, permitindo
correlacionar alterações de saída e respostas do provedor sem registrar prompts.

O teste roda a CLI em um diretório temporário vazio, sem contexto do workspace, e remove esse diretório ao terminar. Configurações globais autorizadas do OpenCode ainda podem ser carregadas pelo cliente; não há aprovação automática de permissões.

### Matriz de compatibilidade OpenCode v1/v2 (2026-11-22)

O baseline testado é **v1 1.19.6** e **v2 2.3.2**. O instalador exige v1
1.19.6 e aceita v2 a partir de 2.2.6; versões v2 diferentes de 2.3.2 são
marcadas como não homologadas pelo `opencode-compat --json` e pelo
`opencode2-service --check`. A sincronização nativa de sessões foi exercitada
com dados sintéticos isolados nas duas versões; os detalhes e limites estão
em `docs/compatibility.md` e `DEV/RUNBOOKS/opencode-v1-v2.md`.

O probe conservador exige `--archived`, disponível a partir do v2.2.6. A
política de limites do provider é status-only: nenhuma versão altera VPN ou
modelo, nem repete automaticamente prompts ou ferramentas. Recuperação de
rede permanece no supervisor e, após verificar a sessão exata, fornece o
comando para retomada manual.

Referências oficiais:
- https://opencode.ai/changelog/v2.2.6
- https://opencode.ai/changelog/v2.3.2
- https://opencode.ai/docs/plugins/

O serviço `opencode2-service` exige exatamente o baseline testado 2.3.2 para
`serve`, `web` e `supervise`. Outra versão falha fechada; `OPENCODE_V2_ALLOW_UNVERIFIED=true`
é uma exceção explícita para canário isolado. `opencode2-service --check`
informa a versão instalada, a versão testada e o estado de homologação.

```bash
opencode2-service --check
```

## 12. Privacidade, segredos e dados que saem da máquina

**O que passa pela VPN:** todo o tráfego do `terminal`, do `opencode-supervisor`
e dos clientes OpenCode (incluindo chamadas de modelo), porque os containers
usam `network_mode: "service:vpn"`. Se o túnel cair, o kill switch do Gluetun
bloqueia a saída em vez de vazar pela interface do host.

**O que sai da máquina, por finalidade:**

| Destino | Quando | Conteúdo |
|---|---|---|
| Servidor VPN do provedor | Sempre que o túnel está ativo | Tráfego do terminal (cifrado) |
| `ifconfig.co` (via Gluetun) | Healthcheck e pós-reconexão | Requisição para ler o IP público do túnel |
| `api6.ipify.org` | Apenas `vpn-check --deep` | Requisição para comparar egress IPv6 |
| `1.1.1.1:443` | `vpn-history` ao gravar amostra | Handshake TCP para medir latência |
| Provedor de IA | Ao usar o OpenCode | Prompts e contexto, pelo túnel |

`VPN_IPV6_TEST_URL` e `VPN_LATENCY_TARGET` mudam os dois últimos destinos.

**O que fica gravado no disco local:**

| Caminho | Conteúdo | Sensível? |
|---|---|---|
| `.secrets/` (0700, arquivos 0600) | Credenciais do provedor, senha da UI, API keys | Sim — nunca versionar |
| `.env` | Configuração, sem segredos por padrão | Sim — ignorado pelo Git |
| `.vpn-control-state/` | Perfil ativo, locks, `history.jsonl` (IP público + latência) | Sim — contém seu IP |
| `~/.local/share/opencode` | Sessões e histórico do OpenCode | Sim — não sai da máquina |

`.secrets/`, `.env` e `.vpn-control-state/` estão no `.gitignore`. O hook
opcional `.githooks/pre-commit` (ative com `git config core.hooksPath .githooks`)
roda Gitleaks e `bash -n`/`node --check` antes de versionar. Nenhum script envia
`.secrets/`, `auth.json` ou valores do `.env` para lugar algum.

**Antes de compartilhar diagnóstico:** use `vpn-doctor --bundle` (allowlist
estrita, sem segredos) e, se o IP importa, `--redact-ips`. O bundle contém
apenas `manifest.txt`, `doctor.tsv|json`, `environment.txt`, `env-keys.txt`
(nomes de variáveis, sem valores), `compose-ps.txt`, `vpn-check.json` e as
últimas 100 linhas dos logs de `vpn`/`terminal`. Confira com `tar -tzf` antes de
anexar.

**Limites que o projeto não resolve:** o provedor VPN vê seu IP de origem; o
provedor de IA vê o conteúdo dos prompts; `history.jsonl` guarda o IP público
observado, então trate-o como dado pessoal. Trocar de IP não restaura franquia
de provedor de IA — veja a limitação na seção 11.

## 13. Diagnóstico rápido

| Sintoma | Primeiro comando | Se persistir |
|---|---|---|
| Container não sobe | `docker compose ps` | `./scripts/vpn-doctor` |
| "OpenVPN settings: user is empty" | `ls -l .secrets/` | `./scripts/vpn-setup --provider <nome>` |
| Túnel unhealthy | `vpn-status` | `vpn-reconnect` |
| Sem internet no terminal | `vpn-check` | `vpn-check --deep`, depois `vpn-reconnect` |
| Suspeita de vazamento IPv6/DNS | `vpn-check --deep` | `vpn-doctor --bundle diag.tar.gz --redact-ips` |
| DNS interno não resolve | `vpn-check --only dns` | revisar `INTERNAL_DNS` e `FIREWALL_SUBNETS` |
| Host interno inacessível | `vpn-check --only internal` | revisar `FIREWALL_SUBNETS` e `LOCAL_HOSTS` |
| Painel do OpenCode não abre | `vpn-opencode status` | `vpn-opencode logs`, depois `vpn-opencode supervise` |
| OpenCode responde `quota` | `vpn-opencode check --json` | aguardar `Retry-After`; não é falha de túnel |
| Control Plane sem dados | `curl -u control:… /api/v1/state` | conferir `--profile control` no `up` |
| Script falha só na CI | `make verify-fast` local | `./scripts/vpn-lint`, `./scripts/verify-compose` |
| Dúvida sobre o que mudou | `vpn-history --since 24h` | `git log`, `DEV/WORKLOG.md` |

Regra de bolso: **mutação** (subir, parar, reconectar, rotacionar) passa por
`vpn-switch`/`vpn`; **leitura** (`status`, `check`, `top`, `history`, `doctor`)
nunca muda o túnel.
