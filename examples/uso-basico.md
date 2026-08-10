# Exemplo de uso básico

Este exemplo inicia o ambiente com NordVPN e OpenVPN. Antes de começar, leia a seção [Configuração](../README.md#configuração) e os [exemplos de provedores](../README.md#exemplos-de-provedores).

## Pré-requisitos

- Linux com Docker Engine e Docker Compose Plugin;
- `/dev/net/tun` disponível;
- credenciais de serviço da NordVPN;
- permissão para executar Docker.

## 1. Preparar arquivos locais

Na raiz do projeto:

```bash
cp .env.example .env
mkdir -p .secrets
```

Gere a chave da API local do Gluetun:

```bash
docker run --rm qmcgaw/gluetun:v3.40.0 genkey
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

O serviço `vpn-auto-reconnect` faz manutenção a cada hora. Se o endpoint local não confirmar um IP público após uma tentativa, ele repetirá a reconexão a cada 30 segundos até a recuperação.

## 6. Encerrar o ambiente

No host:

```bash
docker compose \
  -f docker-compose.yml \
  -f profiles/nordvpn-openvpn.yml \
  down --remove-orphans
```
