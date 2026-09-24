# VPN Dev Workspace

Ambiente local de desenvolvimento em Docker que força o tráfego do terminal por uma VPN operada pelo [Gluetun](https://github.com/qdm12/gluetun). O terminal compartilha a rede do serviço VPN; se o túnel falhar, o kill switch do Gluetun bloqueia a saída.

> Use somente provedores, contas e redes para os quais você tem autorização. A manutenção automática existe para recuperar conectividade, não para ocultar atividade ou contornar políticas.

## Objetivo

Oferecer um terminal conectado à VPN que seja uma extensão direta do ambiente do host. Ele reutiliza a home, o workspace, as configurações e as ferramentas do usuário nos mesmos caminhos, incluindo o OpenCode, sem permitir que o tráfego de rede do terminal contorne o Gluetun. As consultas de DNS também passam pelo servidor DNS embutido do Gluetun (`127.0.0.1`), evitando vazamento pelo resolver do host.

## Configuração

1. Copie o exemplo: `cp .env.example .env`.
2. Crie os arquivos de segredo indicados em `.env` dentro de `.secrets/` e proteja-os com `chmod 600 .secrets/*`.
3. Escolha um perfil e inicie-o:

   ```bash
   ./scripts/vpn-switch nordvpn-openvpn
   ```

   Não execute `docker compose up` diretamente: ele não seleciona um provedor nem seus arquivos de segredo. Use sempre `vpn-switch <perfil>`.

4. Abra o terminal Zsh:

   ```bash
   docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml exec terminal zsh
   ```

O usuário do terminal não é root e o Zsh é seu shell de login padrão. A home do usuário do host é montada integralmente no mesmo caminho, portanto configurações, ferramentas, credenciais locais e arquivos do host ficam disponíveis no terminal pelo túnel VPN. Confirme o OpenCode ativo com `command -v opencode` e `opencode --version`.

Para um guia passo a passo, consulte [o exemplo de uso básico](examples/uso-basico.md).

### Windows: PowerShell sem distribuição WSL

No Windows, o caminho recomendado é o Docker Desktop com backend WSL2 e o
script PowerShell. Ele não exige Ubuntu, Debian ou outra distribuição WSL
instalada: o Docker Desktop fornece o motor Linux e o projeto Windows é
montado em `/workspace`. A home Linux fica no volume Docker persistente
`vpn_windows_home`, separada da home Windows.

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
.\scripts\vpn.ps1 hosts-import --domain omega
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

### Windows com WSL2

O fluxo Bash continua suportado dentro de uma distribuição WSL2 instalada no
sistema de arquivos Linux. Instale o projeto em `~/projetos` (não em
`/mnt/c/...`), habilite a integração dessa distribuição no Docker Desktop e
continue usando `./scripts/vpn-switch <perfil>`. Esse modo mantém a home Linux
e o agente SSH do WSL2 atuais. O fluxo PowerShell e o fluxo WSL2 são distintos:
não misture os mounts ou os arquivos de estado entre eles.

### Como os perfis carregam credenciais

O arquivo `docker-compose.yml` contém apenas a infraestrutura comum. Cada arquivo em `profiles/` acrescenta um provedor e mapeia seus arquivos locais de segredo para o Gluetun. Por isso, o comando abaixo é a única forma suportada de iniciar o ambiente:

```bash
./scripts/vpn-switch <perfil>
```

Por exemplo, `./scripts/vpn-switch nordvpn-openvpn` carrega `profiles/nordvpn-openvpn.yml`, que usa `NORDVPN_USER_FILE` e `NORDVPN_PASSWORD_FILE` definidos em `.env`. Os valores nunca são impressos, copiados para o Git ou passados como argumentos de linha de comando.

Os serviços usam o perfil Compose interno `vpn`; uma execução direta de `docker compose up` não os inicia. Isso evita iniciar uma VPN com o provedor, porém sem o perfil e sem suas credenciais.

### Diagnóstico de credenciais ausentes

Se o log disser `OpenVPN settings: user is empty`, os arquivos de segredo não foram associados ao contêiner — isso não significa que a credencial foi apagada. Confirme a presença sem mostrar o conteúdo:

```bash
test -s .secrets/nordvpn_user && test -s .secrets/nordvpn_password && echo 'Segredos NordVPN disponíveis'
```

Em seguida, inicie novamente pelo seletor:

```bash
./scripts/vpn-switch nordvpn-openvpn
```

Para outro provedor, troque o argumento pelo perfil correto e use os respectivos caminhos `*_FILE` de `.env`. Após a inicialização, confirme a conexão com `vpn-status` dentro do terminal ou com `docker compose -f docker-compose.yml -f profiles/<perfil>.yml ps` no host. Se os arquivos não existirem ou estiverem vazios, recrie somente os arquivos indicados pelo provedor; não coloque valores de credencial diretamente em `.env`.

## Portas de desenvolvimento

O serviço `vpn` publica a faixa TCP configurada por `VPN_PORT_RANGE` (padrão `10000-10100`). Projete aplicações expostas para escutar uma porta dentro dessa faixa.

### Proxy HTTP pela VPN (opt-in)

Com `VPN_HTTP_PROXY=on` no `.env` (e `vpn-switch` para aplicar), o Gluetun expõe um proxy HTTP na porta `VPN_HTTP_PROXY_PORT` (padrão `10080`, dentro da faixa publicada):

```bash
export http_proxy=http://127.0.0.1:10080 https_proxy=http://127.0.0.1:10080
```

- O `vpn-switch` valida que a porta está dentro de `VPN_PORT_RANGE`.
- Auth opcional: `VPN_HTTP_PROXY_USER`/`VPN_HTTP_PROXY_PASSWORD` (a senha viaja em env do container; bind é só local).
- Útil para browser/IDE/plugins do host passarem pela VPN sem `exec` no container.

- Por padrão, `HOST_BIND_ADDRESS=127.0.0.1`, acessível somente na máquina host.
- Para acesso pela LAN, informe o IP específico da interface local, por exemplo `HOST_BIND_ADDRESS=192.168.1.20`.
- Não use `0.0.0.0` ou `::`: eles expõem a faixa em todas as interfaces, inclusive onde um firewall pode não protegê-la.
- Antes de parar o ambiente, `vpn-switch` verifica conflitos TCP da faixa. A verificação reduz conflitos, mas o Docker ainda é a autoridade final para o bind de portas.

## Manutenção da VPN

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

O `vpn-reconnect` aguarda o IP público do Gluetun após a reconexão (o endpoint só o publica segundos depois de o túnel subir) e imprime o IP quando disponível; se o IP não voltar, encerra com erro para o `vpn-auto-reconnect` retentar.

Para automação: `vpn-status --json|-q`, `vpn-check --json|-q [--only tunnel|dns|internal|hosts]`, `vpn-top --json|--no-color`; todo script responde `--help`. O `vpn-check` sai `0` saudável / `1` com falha (a contagem vai na mensagem/JSON).

## Acesso à rede interna do host (opt-in)

Por padrão, o kill switch do Gluetun bloqueia todo o tráfego fora do túnel. Para permitir alcance à rede interna do host (ex: servidores `.omega`, NAS, impressoras):

```ini
# Sub-redes extras permitidas fora do túnel (a LAN do host é detectada sozinha).
FIREWALL_SUBNETS=192.168.1.0/24,10.0.0.0/24
# DNS interno da LAN (resolução pública E interna passa por ele; deixe
# INTERNAL_DNS_RESOLVERS vazio nesse modo).
INTERNAL_DNS=192.168.1.1:53
INTERNAL_DNS_RESOLVERS=
# Hostnames internos liberados da proteção contra rebinding. Sem curingas:
# o Gluetun rejeita "*.omega.local"; liste os nomes explícitos.
INTERNAL_DNS_EXEMPT_HOSTNAMES=dev.go.omega.local,dev.mt.omega.local
```

- No Linux nativo, sem `FIREWALL_SUBNETS`, o `vpn-switch` injeta a sub-rede da interface com a rota padrão do host (a LAN local).
- No PowerShell e no WSL2, a rota padrão pode ser a rede virtual do Docker/WSL; por isso nenhuma sub-rede é inferida. Configure `FIREWALL_SUBNETS` explicitamente nos modos Windows para liberar a LAN do Windows.
- Quando `INTERNAL_DNS` aponta para um servidor fora da sub-rede da LAN (ex: DNS em outra VLAN), inclua também a sub-rede dele em `FIREWALL_SUBNETS`, senão as consultas são bloqueadas pelo firewall do túnel.
- Com `INTERNAL_DNS`, o servidor DNS embutido do Gluetun usa esse upstream em texto puro; sem ele, mantém o padrão DoT (Cloudflare).
- `INTERNAL_DNS_EXEMPT_HOSTNAMES` é obrigatório para nomes internos: sem ele o Gluetun descarta respostas que apontam para IPs privados (proteção contra rebinding). Curingas não são aceitos (`*.omega` é rejeitado) — liste os nomes explícitos, separados por vírgula.
- O `vpn-check` testa `INTERNAL_TEST_HOST` (nome ou IP) quando configurado, com teste TCP real na `INTERNAL_TEST_PORT` quando definida (ex: `INTERNAL_TEST_HOST=192.168.30.20`, `INTERNAL_TEST_PORT=80`); sem a porta, valida apenas que o nome resolve.
- Não inclua a faixa privada do túnel em `FIREWALL_SUBNETS`.

### Hosts locais que só existem no host (opt-in)

Nomes que vivem apenas no `/etc/hosts` do host (ex: `gitlab.omega`) não resolvem dentro do terminal, porque lá todo DNS passa pelo túnel. Para mapeá-los:

```ini
LOCAL_HOSTS=gitlab.omega=192.168.30.5,registry.omega=192.168.30.6
```

- O `vpn-switch` gera um snippet a partir de `LOCAL_HOSTS` e injeta no `/etc/hosts` do terminal pós-up (idempotente; `extra_hosts` é rejeitado pelo Docker com `network_mode`, por isso a injeção pós-up).
- Para importar do `/etc/hosts` do host por domínio: `./scripts/vpn-hosts-import --domain omega` (só sugere a linha — você cola no `.env`).
- Reaplicar após `restart` manual: `./scripts/vpn-hosts-apply` (o `vpn-switch` sempre reaplica; `down`/`recreate` perde as entradas). Se `opencode-supervisor` estiver ativo, ele também recebe os mesmos `LOCAL_HOSTS`.
- O `vpn-check` valida que cada nome resolve para o IP declarado.
- O mapeamento resolve só o **nome**; o **alcance** continua exigindo a sub-rede em `FIREWALL_SUBNETS` (acima). Se o IP mudar na LAN, atualize o mapeamento (o import facilita o re-sync).

### Paridade com a home do host

O terminal herda o UID/GID do usuário do host (`HOST_UID`/`HOST_GID`, padrão `1000`) e, quando as variáveis estão definidas, a sessão SSH e o diretório de sessão do usuário:

```ini
HOST_UID=1000
HOST_GID=1000
SSH_AUTH_SOCK=/run/user/1000/keyring/ssh
RUN_USER_DIR=/run/user/1000
```

- `SSH_AUTH_SOCK` monta o agente SSH do host em `/run/vpn-ssh-agent.sock` (leitura) — `git push`, `ssh` e ferramentas que usam o agente funcionam dentro do terminal.
- `RUN_USER_DIR` monta a sessão do usuário (keyring, dbus) no mesmo caminho.
- **Risco consciente**: o container passa a ler seu agente SSH e sua sessão. Inicie apenas o seu próprio ambiente e não rode o terminal com agentes de outros usuários.

## Painel web e Desktop do OpenCode pela VPN (opt-in)

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
- Recuperação automática: queda simples do processo com túnel saudável reinicia apenas o OpenCode; mensagens de desconexão/rede ou `Provider rate limit exceeded`/HTTP 429 param o OpenCode, rotacionam o servidor pelo Control Server autenticado do Gluetun, aguardam o túnel saudável e iniciam o OpenCode novamente.
- Limite do plano OpenCode Go (`Go limit reached` / `Usage limit reached ... reset`) é `account_rate_limit`: o supervisor **não rotaciona a VPN** nesse caso, porque o limite pertence à conta e trocar IP não o reseta. O processo permanece vivo para o reset/fallback do próprio OpenCode.
- Proteção anti-loop: `OPENCODE_RECOVERY_MAX_ROTATIONS`, `OPENCODE_RECOVERY_WINDOW_SECONDS` e `OPENCODE_RECOVERY_COOLDOWN_SECONDS` impedem rotações infinitas quando o limite é vinculado à conta e não ao IP.
- `vpn-opencode watch` permanece como compatibilidade: inicia o supervisor persistente e acompanha seus logs.
- A sessão, os projetos e os dados do OpenCode permanecem na mesma home montada. Uma resposta que estava em voo só continua automaticamente se o próprio OpenCode suportar replay/continuação dessa requisição; o supervisor garante a recuperação do processo e do túnel, não inventa replay de protocolo.
- Sonda no `vpn-auto-reconnect` (`OPENCODE_AUTOCHECK=true`) continua apenas observacional; a responsabilidade de recuperar o OpenCode fica centralizada no `opencode-supervisor`.
- Senha (basic auth, usuário `opencode`): arquivo `OPENCODE_GUI_PASSWORD_FILE` (padrão `.secrets/opencode_gui_password`). Sem o arquivo, o painel abre sem senha — apenas para uso local.
- O estado é compartilhado com o CLI: o mesmo `$HOME` e os mesmos projetos são usados por `opencode` no terminal e pela GUI.

### Conectar o Desktop App (passo a passo)

1. Suba a ponta: `./scripts/vpn-opencode serve` (mantenha o terminal aberto; use `tmux`/`zellij` para deixá-lo de pé).
2. No OpenCode Desktop do host, adicione o servidor `http://127.0.0.1:10001`.
3. Login `opencode`; senha: conteúdo de `.secrets/opencode_gui_password` (`cat .secrets/opencode_gui_password`).
4. Alternativa por CLI no host: `opencode attach http://127.0.0.1:10001 -u opencode -p "$(cat .secrets/opencode_gui_password)"`.

Para atualizar o Desktop: não há repositório apt (`apt upgrade` não o atualiza); baixe o `.deb` oficial e reinstale (`sudo apt-get install ./opencode-desktop-linux-amd64.deb`). O `PATH` do terminal prioriza o binário da home montada do host (`${HOST_HOME_DIR}/.opencode/bin`), então a atualização do host reflete de imediato no container; a versão fixada no `Dockerfile` (`OPENCODE_VERSION` + checksums) é o fallback. Ainda assim, mantenha Desktop e fallback alinhados — tela branca indica versões divergentes. Guia completo em `DEV/RUNBOOKS/opencode-desktop-vpn.md`.

### Rotação automática de servidor (opt-in)

Por padrão a rotação automática está desligada. Para ativá-la, configure em `.env` e reinicie o ambiente:

```ini
VPN_ROTATE_SERVERS=true
# VPN_SERVER_HOSTNAMES=server1.nordvpn.com,server2.nordvpn.com
# VPN_RECONNECT_ATTEMPTS_BEFORE_ROTATE=3
# Rotação periódica (privacidade), independente de falhas; 0 = desligada.
# VPN_ROTATE_INTERVAL_SECONDS=86400
```

Com `VPN_ROTATE_SERVERS=true`, após `VPN_RECONNECT_ATTEMPTS_BEFORE_ROTATE` falhas consecutivas (padrão 3), o `vpn-auto-reconnect` chama `vpn-server-rotate` e recomeça a contagem. Com `VPN_SERVER_HOSTNAMES` preenchido, os servidores são ciclados na ordem; sem a lista, o Gluetun re-seleciona um servidor aleatório no país configurado. Hostnames inválidos para o provedor são rejeitados pela API do Gluetun. Manual: `vpn-server-rotate [--to <host>|--random|--list]`.

> Se o seu provedor de acesso bloquear faixas de IP de alguns servidores (a re-seleção aleatória pode cair repetidamente neles), preencha `VPN_SERVER_HOSTNAMES` com uma lista de servidores conhecidamente acessíveis para a rotação.

A troca acontece pelo HTTP Control Server do Gluetun (`PUT /v1/vpn/settings`), sem acesso ao socket do Docker, e respeita a autenticação por chave da API.

Os logs do serviço podem ser acompanhados no host:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml logs -f vpn-auto-reconnect
```

## Exemplos de provedores

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

## Estrutura

```text
host
├── vpn (Gluetun + NET_ADMIN)
│   └── faixa TCP publicada no endereço configurado do host
├── terminal (usuário developer + Zsh + home do host)
│   └── network_mode: service:vpn
└── vpn-auto-reconnect
    └── verifica o IP público e recupera conectividade
```

O contêiner de terminal é uma extensão direta do usuário do host: ele monta a home completa no mesmo caminho e o workspace no mesmo caminho. Isso preserva referências absolutas e permite usar as mesmas configurações e ferramentas, inclusive os dados do OpenCode. O `PATH` do terminal prioriza `${HOST_HOME_DIR}/.opencode/bin` (binário do host, atualizado de imediato); a imagem mantém uma versão verificada compatível (`OPENCODE_VERSION` + checksums no `Dockerfile`) como fallback.

Por padrão, a home montada é a do usuário que executa o Compose. Para selecionar explicitamente o diretório, defina `HOST_HOME_DIR` com um caminho absoluto em `.env`:

```ini
HOST_HOME_DIR=/home/desenvolvedor
```

Esse mount concede ao terminal acesso de leitura e escrita a toda a home indicada. Use somente a sua própria home e inicie o ambiente por `vpn-switch`, para manter a saída de rede protegida pela VPN.

## Verificação local

```bash
./scripts/verify-docs
./scripts/verify-compose
```

## Encerrar o ambiente

```bash
./scripts/vpn-switch stop
```
