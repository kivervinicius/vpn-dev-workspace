# Exemplo de uso básico

Este exemplo inicia o ambiente com NordVPN e OpenVPN. Antes de começar, leia a seção [Configuração](../README.md#configuração) e os [exemplos de provedores](../README.md#exemplos-de-provedores).

## Pré-requisitos

- Linux com Docker Engine e Docker Compose Plugin;
- `/dev/net/tun` disponível;
- credenciais de serviço da NordVPN;
- permissão para executar Docker.

No Windows, use Docker Desktop + PowerShell sem instalar uma distribuição WSL:
consulte [o fluxo PowerShell no README](../README.md#windows-powershell-sem-distribuição-wsl).
O fluxo Bash abaixo é para Linux nativo ou para uma distribuição WSL2
integrada ao Docker Desktop; no WSL2, mantenha o clone dentro do sistema de
arquivos Linux (`~/projetos`).

## 1. Preparar arquivos locais

Na raiz do projeto:

```bash
cp .env.example .env
mkdir -p .secrets
```

Gere a chave da API local do Gluetun:

```bash
docker run --rm qmcgaw/gluetun:v3.41.3 genkey
```

Grave a chave e as credenciais de serviço nos arquivos indicados por `.env`:

```bash
printf '%s' 'COLE_A_CHAVE_GERADA_AQUI' > .secrets/gluetun_api_key
printf '%s' 'COLE_O_USUARIO_DE_SERVICO_AQUI' > .secrets/nordvpn_user
printf '%s' 'COLE_A_SENHA_DE_SERVICO_AQUI' > .secrets/nordvpn_password
chmod 600 .secrets/*
```

Os valores são placeholders locais e nunca devem ser enviados ao Git.

## 2. Iniciar a VPN

```bash
./scripts/vpn-switch nordvpn-openvpn
```

O comando valida o Compose, verifica conflitos na `VPN_PORT_RANGE`, inicia o Gluetun e aguarda seu healthcheck.

`vpn-switch` também seleciona o perfil Compose interno necessário e combina o arquivo do provedor com os arquivos de segredo. Não substitua esse comando por `docker compose up`: sem o perfil `nordvpn-openvpn`, o Gluetun não recebe `nordvpn_user` nem `nordvpn_password`.

Se aparecer `OpenVPN settings: user is empty`, confirme sem revelar nenhum dado que os dois arquivos existem e não estão vazios, depois execute novamente o comando de início:

```bash
test -s .secrets/nordvpn_user && test -s .secrets/nordvpn_password
./scripts/vpn-switch nordvpn-openvpn
```

## 3. Abrir o terminal Zsh

```bash
docker compose \
  -f docker-compose.yml \
  -f profiles/nordvpn-openvpn.yml \
  exec terminal zsh
```

O terminal é uma extensão direta do host: a home e o workspace são montados nos mesmos caminhos. Por padrão, o workspace está em `/projetos`; se `WORKSPACE_DIR` estiver definido, use o caminho correspondente. Confirme que o OpenCode compartilhado está ativo antes de trabalhar:

```zsh
cd /projetos
command -v opencode
opencode --version
node --version
java --version
npm --version
vpn-status
vpn-check
```

O caminho do OpenCode deve pertencer à home montada do host, e sua versão deve corresponder à instalada no host. Uma resposta `running` seguida de um IP público confirma que o perfil selecionado carregou as credenciais e estabeleceu o túnel.

## 4. Expor uma aplicação de desenvolvimento

Configure a aplicação para usar uma porta da faixa `VPN_PORT_RANGE`, que por padrão é `10000-10100`. Com a configuração padrão, por exemplo, a aplicação em `10000` estará disponível apenas em `http://127.0.0.1:10000` no host.

Para permitir acesso de outros dispositivos da LAN, defina `HOST_BIND_ADDRESS` com o IP local específico da máquina e reinicie o perfil. Não use `0.0.0.0`.

## 5. Reconectar e acompanhar recuperação

Para uma reconexão manual dentro do terminal:

```zsh
vpn-reconnect
```

O comando aguarda o IP público voltar (o Gluetun só o publica segundos depois de o túnel subir) e o imprime ao final; se o IP não voltar, encerra com erro.

Para um painel de status completo — serviços, perfil, servidor, IP público, DNS e estado da auto-reconexão — use:

```zsh
vpn-top
```

O serviço `vpn-auto-reconnect` valida a saúde do ambiente (túnel, IP e DNS) a cada hora. Se uma verificação falhar, ele repete a reconexão a cada 30 segundos até a recuperação; com `VPN_ROTATE_SERVERS=true` (opt-in), troca de servidor após falhas consecutivas, conforme configurado em `.env`.

## 6. Encerrar o ambiente

No host:

```bash
docker compose \
  -f docker-compose.yml \
  -f profiles/nordvpn-openvpn.yml \
  down --remove-orphans
```

## 7. Próximos passos (opt-ins)

- Rede interna/LAN: `FIREWALL_SUBNETS`, `INTERNAL_DNS`/`INTERNAL_DNS_EXEMPT_HOSTNAMES` — veja [README](../README.md#acesso-à-rede-interna-do-host-opt-in); nomes que só existem no `/etc/hosts` do host usam `LOCAL_HOSTS` (mapeamento validado pelo `vpn-check`), e `INTERNAL_TEST_HOST`/`INTERNAL_TEST_PORT` habilitam o teste de alcance no `vpn-check`.
- Servidores bloqueados pelo provedor de acesso (ex: faixa `185.153.176.x`): fixe `VPN_SERVER_HOSTNAMES` com servidores conhecidos.
- Painel/Desktop do OpenCode pela VPN: `./scripts/vpn-opencode web|serve` — guia em `DEV/RUNBOOKS/opencode-desktop-vpn.md`.
- Verificação local: `./scripts/verify-docs` e `./scripts/verify-compose`.
