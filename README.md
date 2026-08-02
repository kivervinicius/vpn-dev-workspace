# VPN Dev Workspace

Ambiente local de desenvolvimento baseado em Docker que roteia o tráfego de um terminal Linux por uma conexão NordVPN usando [Gluetun](https://github.com/qdm12/gluetun). A imagem do terminal inclui Java, Node.js, Git, ferramentas de compilação, `curl`, `wget` e [OpenCode](https://opencode.ai).

Este projeto é um ambiente de desenvolvimento local. Ele não é um gateway VPN para outras máquinas e não substitui uma política corporativa de segurança ou privacidade.

## Recursos

- Roteamento do terminal pelo contêiner VPN com `network_mode: service:vpn`.
- Kill switch fornecido pelo firewall do Gluetun quando o túnel não está disponível.
- OpenVPN com NordVPN e seleção de país configurável.
- Node.js LTS via NVM, Java padrão do Ubuntu, Git e ferramentas de compilação.
- OpenCode persistido nos diretórios de configuração do usuário.
- Portas de desenvolvimento 3000, 4200, 5173 e 8080 vinculadas a `127.0.0.1` por padrão.
- Script `mudarip` para reconectar a VPN usando a API interna autenticada do Gluetun.

## Pré-requisitos

- Linux com Docker Engine e o plugin Docker Compose.
- Serviço Docker em execução.
- `/dev/net/tun` disponível no host.
- Credenciais de serviço da NordVPN, obtidas em `NordVPN → Manual Setup`.
- Permissão do usuário para executar Docker.

O projeto foi validado com `docker compose` e com uma construção real da imagem. A conexão VPN em si exige credenciais válidas e não é testada automaticamente para evitar expor ou usar credenciais do usuário.

## Configuração

Clone o repositório e crie o arquivo local de ambiente:

```bash
git clone URL_DO_REPOSITORIO vpn-dev-workspace
cd vpn-dev-workspace
cp .env.example .env
```

Gere uma chave para a API do Gluetun:

```bash
docker run --rm qmcgaw/gluetun:v3.40.0 genkey
```

Edite `.env` e informe os valores reais:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `NORDVPN_USER` | Sim | Usuário de serviço da NordVPN; não use o e-mail comum. |
| `NORDVPN_PASSWORD` | Sim | Senha de serviço da NordVPN; não use a senha comum. |
| `GLUETUN_API_KEY` | Sim | Chave da API interna do Gluetun. |
| `VPN_COUNTRY` | Não | País preferido; padrão: `United States`. |
| `HOST_BIND_ADDRESS` | Não | Endereço das portas de desenvolvimento; padrão: `127.0.0.1`. |

O `.env` é ignorado pelo Git e pelo contexto de build do Docker. Nunca substitua os placeholders do `.env.example` por credenciais reais antes de fazer commit.

## Uso

Construa a imagem e inicie os serviços:

```bash
docker compose up -d --build
```

Verifique o estado:

```bash
docker compose ps
docker compose logs -f vpn
```

Abra um terminal dentro do ambiente:

```bash
docker compose exec terminal bash
```

Dentro do terminal, os arquivos de `/workspace` correspondem à pasta local do projeto. Para confirmar o IP público depois que a VPN estiver conectada:

```bash
mudarip
```

O comando `mudarip` para e inicia novamente o OpenVPN, aguarda a reconexão e consulta o IP público pela API autenticada do Gluetun. Ele não reinicia os contêineres.

Pare os serviços:

```bash
docker compose down
```

Para parar e remover também os volumes anônimos criados pelo Compose:

```bash
docker compose down --volumes
```

## Portas

Por padrão, as portas abaixo ficam acessíveis somente no computador local:

| Host | Contêiner | Uso comum |
| ---: | ---: | --- |
| 3000 | 3000 | React/Node.js |
| 4200 | 4200 | Angular |
| 5173 | 5173 | Vite |
| 8080 | 8080 | Java/Spring ou outros serviços |

Para expor essas portas na rede local, defina `HOST_BIND_ADDRESS=0.0.0.0` conscientemente no `.env`. Isso aumenta a superfície de exposição e deve ser evitado em redes não confiáveis.

A API de controle do Gluetun usa a porta interna 8000, mas não é publicada no host. O terminal acessa essa API por `127.0.0.1` dentro do namespace de rede compartilhado.

## Arquitetura

```text
host
├── serviço vpn (Gluetun + NET_ADMIN + /dev/net/tun)
│   └── portas de desenvolvimento publicadas localmente
└── serviço terminal (Ubuntu + Java + Node.js + OpenCode)
    └── compartilha a rede do serviço vpn
```

O serviço `terminal` não possui uma rede independente: seu tráfego passa pelo namespace de rede do serviço `vpn`. As configurações locais do OpenCode são montadas do host para preservar sessões e preferências.

## Segurança

- Não há credenciais reais neste repositório. O `.env.example` contém somente placeholders.
- O `.env` é ignorado pelo Git e pelo Docker; confirme isso antes de publicar:

  ```bash
  git status --short --ignored
  ```

- A API do Gluetun usa `GLUETUN_API_KEY` e não é publicada no host.
- As portas de desenvolvimento ficam limitadas a `127.0.0.1` por padrão.
- O Docker precisa de `NET_ADMIN` e acesso a `/dev/net/tun`; conceda esses privilégios apenas a ambientes confiáveis.
- O terminal executa como `root` e recebe acesso de escrita à pasta montada do projeto e às configurações locais do OpenCode. Use este ambiente somente com código e arquivos que você confia.
- A imagem instala NVM e OpenCode a partir de instaladores externos. Para ambientes de alta confiança, revise os instaladores, fixe versões e valide checksums antes de usar.
- Não coloque credenciais em issues, logs, screenshots, commits ou mensagens de erro. Se uma credencial for exposta, revogue-a e gere outra imediatamente.

## Troubleshooting

### `NORDVPN_USER is required` ou `GLUETUN_API_KEY is required`

Confirme que `.env` existe na raiz e contém todos os valores obrigatórios:

```bash
ls -l .env
docker compose config
```

### `/dev/net/tun` não existe

Verifique o dispositivo no host:

```bash
ls -l /dev/net/tun
```

Em máquinas Linux, o módulo TUN pode precisar ser carregado com `sudo modprobe tun`. Em Docker Desktop, confirme se a configuração escolhida oferece suporte ao dispositivo necessário.

### A VPN não conecta

Veja os logs do Gluetun:

```bash
docker compose logs --tail=200 vpn
```

Confirme que são usadas credenciais de serviço da NordVPN, que `VPN_COUNTRY` é um país válido e que o host consegue acessar a Internet para baixar a imagem e os arquivos necessários.

### Uma porta já está ocupada

Altere ou remova a publicação correspondente em `docker-compose.yml`, ou pare o processo que usa a porta no host:

```bash
docker compose down
```

## Verificações locais

Os comandos abaixo validam a configuração sem iniciar uma conexão VPN:

```bash
bash -n scripts/mudarip.sh
NORDVPN_USER=test-user NORDVPN_PASSWORD=test-password GLUETUN_API_KEY=test-api-key \
  docker compose config --quiet
docker build --check .
docker build -t vpn-dev-workspace:review .
```

## Licença

Nenhuma licença foi definida ainda. Escolha e adicione uma licença antes de conceder permissões formais de reutilização ou distribuição do projeto.
