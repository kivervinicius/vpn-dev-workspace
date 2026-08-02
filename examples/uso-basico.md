# Exemplo de uso básico

Este exemplo inicia o ambiente usando NordVPN com OpenVPN. Os mesmos comandos podem ser adaptados para outro perfil disponível em `profiles/`.

## 1. Preparar os arquivos locais

Na raiz do projeto:

```bash
cp .env.example .env
mkdir -p .secrets
```

Gere a chave da API interna do Gluetun:

```bash
docker run --rm qmcgaw/gluetun:v3.40.0 genkey
```

Grave a chave e as credenciais de serviço da NordVPN nos arquivos indicados pelo `.env`:

```bash
printf '%s' 'COLE_A_CHAVE_GERADA_AQUI' > .secrets/gluetun_api_key
printf '%s' 'COLE_O_USUARIO_DE_SERVICO_AQUI' > .secrets/nordvpn_user
printf '%s' 'COLE_A_SENHA_DE_SERVICO_AQUI' > .secrets/nordvpn_password
chmod 600 .secrets/*
```

Os valores acima são apenas placeholders. Substitua-os localmente e nunca faça commit desses arquivos.

## 2. Iniciar o perfil

```bash
./scripts/vpn-switch nordvpn-openvpn
```

O comando valida o Compose, inicia o Gluetun e aguarda o healthcheck da VPN.

## 3. Entrar no terminal de desenvolvimento

```bash
docker compose \
  -f docker-compose.yml \
  -f profiles/nordvpn-openvpn.yml \
  exec terminal bash
```

Dentro do container, o projeto está disponível em `/workspace`:

```bash
cd /workspace
node --version
java -version
npm --version
vpn-status
```

Arquivos criados em `/workspace` aparecem na pasta local do projeto.

## 4. Reconectar a VPN

Ainda dentro do terminal:

```bash
vpn-reconnect
```

A reconexão pode manter o mesmo IP. Para trocar de provedor ou protocolo, saia do terminal e execute `vpn-switch` com outro perfil.

## 5. Encerrar o ambiente

No host:

```bash
docker compose \
  -f docker-compose.yml \
  -f profiles/nordvpn-openvpn.yml \
  down --remove-orphans
```

Para apagar também volumes anônimos:

```bash
docker compose \
  -f docker-compose.yml \
  -f profiles/nordvpn-openvpn.yml \
  down --volumes --remove-orphans
```
