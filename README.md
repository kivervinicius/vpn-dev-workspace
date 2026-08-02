# VPN Dev Workspace

Ambiente local de desenvolvimento baseado em Docker que roteia o tráfego de um terminal Linux por um provedor VPN usando [Gluetun](https://github.com/qdm12/gluetun). A imagem do terminal inclui Java, Node.js, Git, ferramentas de compilação, `curl`, `wget` e [OpenCode](https://opencode.ai).

Este projeto é um ambiente de desenvolvimento local. Ele não é um gateway VPN para outras máquinas e não substitui uma política corporativa de segurança ou privacidade.

## Recursos

- Roteamento do terminal pelo contêiner VPN com `network_mode: service:vpn`.
- Kill switch fornecido pelo firewall do Gluetun quando o túnel não está disponível.
- OpenVPN ou WireGuard com o provedor definido pelo perfil.
- Node.js LTS via NVM, Java padrão do Ubuntu, Git e ferramentas de compilação.
- Todo o estado canônico do OpenCode compartilhado com o container: instalação, configuração, dados, estado e cache.
- Portas de desenvolvimento 3000, 4200, 5173 e 8080 vinculadas a `127.0.0.1` por padrão.
- Comandos `vpn-status` e `vpn-reconnect` usando a API interna autenticada do Gluetun.

## Pré-requisitos

- Linux com Docker Engine e o plugin Docker Compose.
- Serviço Docker em execução.
- `/dev/net/tun` disponível no host.
- Credenciais ou arquivos de configuração válidos do provedor escolhido.
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

Edite `.env` e informe os caminhos dos segredos do provedor escolhido. O exemplo padrão usa NordVPN, mas a estrutura não é exclusiva dela:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `NORDVPN_USER_FILE` | Sim para NordVPN OpenVPN | Arquivo com o usuário de serviço da NordVPN. |
| `NORDVPN_PASSWORD_FILE` | Sim para NordVPN OpenVPN | Arquivo com a senha de serviço da NordVPN. |
| `GLUETUN_API_KEY_FILE` | Sim | Arquivo com a chave da API interna do Gluetun. |
| `VPN_COUNTRY` | Não | País preferido; padrão: `United States`. |
| `HOST_BIND_ADDRESS` | Não | Endereço das portas de desenvolvimento; padrão: `127.0.0.1`. |
| `WORKSPACE_DIR` | Não | Diretório do projeto compartilhado em `/workspace`; padrão: `.`. |
| `OPENCODE_INSTALL_DIR` | Não | Diretório específico da instalação do OpenCode. |
| `OPENCODE_CONFIG_DIR` | Não | Diretório específico de configuração do OpenCode. |
| `OPENCODE_DATA_DIR` | Não | Diretório específico de dados do OpenCode. |
| `OPENCODE_STATE_DIR` | Não | Diretório específico de estado do OpenCode. |
| `OPENCODE_CACHE_DIR` | Não | Diretório específico de cache do OpenCode. |

O `.env` e `.secrets/` são ignorados pelo Git e pelo contexto de build do Docker. Nunca substitua os placeholders do `.env.example` por credenciais reais antes de fazer commit.

## Exemplos de provedores

### NordVPN com OpenVPN

Preencha os arquivos referenciados por `NORDVPN_USER_FILE` e `NORDVPN_PASSWORD_FILE` e execute:

```bash
./scripts/vpn-switch nordvpn-openvpn
```

### NordVPN com WireGuard

Coloque a chave privada WireGuard no arquivo referenciado por `NORDVPN_WIREGUARD_PRIVATE_KEY_FILE`:

```bash
./scripts/vpn-switch nordvpn-wireguard
```

### ProtonVPN

Crie os arquivos referenciados por `PROTONVPN_USER_FILE` e `PROTONVPN_PASSWORD_FILE` para OpenVPN, ou por `PROTONVPN_WIREGUARD_PRIVATE_KEY_FILE` para WireGuard:

```bash
./scripts/vpn-switch protonvpn-openvpn
# ou
./scripts/vpn-switch protonvpn-wireguard
```

### Surfshark

Crie os arquivos referenciados por `SURFSHARK_USER_FILE` e `SURFSHARK_PASSWORD_FILE`:

```bash
./scripts/vpn-switch surfshark-openvpn
```

### Mullvad

Crie o arquivo referenciado por `MULLVAD_WIREGUARD_PRIVATE_KEY_FILE`:

```bash
./scripts/vpn-switch mullvad-wireguard
```

Os nomes exatos das variáveis, países e requisitos de cada provedor devem ser conferidos na documentação da versão do Gluetun utilizada. Não reutilize credenciais ou chaves de um provedor em outro.

### OpenVPN customizado

Configure no `.env` os caminhos locais `CUSTOM_OPENVPN_CONFIG_FILE`, `CUSTOM_OPENVPN_USER_FILE` e `CUSTOM_OPENVPN_PASSWORD_FILE`, coloque o arquivo `.ovpn` em `.secrets/` e execute:

```bash
./scripts/vpn-switch custom-openvpn
```

### WireGuard customizado

Configure `CUSTOM_WIREGUARD_CONFIG_FILE` apontando para um arquivo local `wg0.conf` e execute:

```bash
./scripts/vpn-switch custom-wireguard
```

Perfis customizados podem exigir endpoint IP, certificados, chaves, endereços, `AllowedIPs` e MTU específicos.

## Uso

Para começar pelo fluxo guiado, consulte o [exemplo de uso básico](examples/uso-basico.md). Ele também aponta de volta para a configuração completa deste README.

Inicie um perfil explicitamente:

```bash
./scripts/vpn-switch nordvpn-openvpn
```

Verifique o estado:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml ps
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml logs -f vpn
```

Abra um terminal dentro do ambiente:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml exec terminal bash
```

Dentro do terminal, os arquivos de `/workspace` correspondem à pasta local do projeto. Para confirmar o IP público depois que a VPN estiver conectada:

```bash
vpn-status
```

Para reconectar o perfil atual:

```bash
vpn-reconnect
```

A reconexão pode manter o mesmo IP; não existe garantia de troca de endereço.

Pare os serviços:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml down --remove-orphans
```

Para parar e remover também os volumes anônimos criados pelo Compose:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml down --volumes --remove-orphans
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

O serviço `terminal` não possui uma rede independente: seu tráfego passa pelo namespace de rede do serviço `vpn`. Todo o estado canônico do OpenCode é montado do host para preservar instalação, configuração, dados, estado e cache.

### Personalização dos mounts

Os mounts podem ser personalizados no `.env`, sem editar o Compose. Cada variável deve apontar para uma pasta específica e necessária:

```dotenv
WORKSPACE_DIR=/projetos/meu-projeto
OPENCODE_CONFIG_DIR=/dados/opencode/config
OPENCODE_DATA_DIR=/dados/opencode/data
OPENCODE_STATE_DIR=/dados/opencode/state
OPENCODE_CACHE_DIR=/dados/opencode/cache
OPENCODE_INSTALL_DIR=/dados/opencode/install
```

Não aponte nenhuma variável para a home inteira (`~`), `/`, `/home`, `.config`, `.local`, `.cache` ou outro diretório genérico. Confira os mounts resolvidos antes de iniciar:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml config
```

### Mounts compartilhados

O Compose monta somente:

- o repositório em `/workspace`;
- `~/.opencode` em `/root/.opencode`;
- `~/.config/opencode` em `/root/.config/opencode`;
- `~/.local/share/opencode` em `/root/.local/share/opencode`;
- `~/.local/state/opencode` em `/root/.local/state/opencode`;
- `~/.cache/opencode` em `/root/.cache/opencode`;
- scripts do projeto em modo somente leitura;
- arquivos de segredo em `/run/secrets`.

Não são montados `~/.config` genérico, `~/.local` genérico, `~/.cache` genérico, SSH, credenciais Git ou outras pastas pessoais.

## Segurança

- Não há credenciais reais neste repositório. O `.env.example` contém somente placeholders.
- O `.env` e `.secrets/` são ignorados pelo Git e pelo Docker; confirme isso antes de publicar:

  ```bash
  git status --short --ignored
  ```

- A API do Gluetun usa `GLUETUN_API_KEY_FILE` por Docker secret e não é publicada no host. A chave é necessária porque a API pode iniciar/parar a VPN e consultar configurações e IP; sem autenticação, um processo que alcançasse a porta 8000 poderia controlar o túnel.
- As portas de desenvolvimento ficam limitadas a `127.0.0.1` por padrão.
- O Docker precisa de `NET_ADMIN` e acesso a `/dev/net/tun`; conceda esses privilégios apenas a ambientes confiáveis.
- O terminal executa como `root` e recebe acesso de escrita à pasta montada do projeto e aos diretórios canônicos do OpenCode. Nenhuma pasta pessoal genérica, SSH ou credencial Git é montada.
- A imagem instala NVM e OpenCode a partir de instaladores externos. Para ambientes de alta confiança, revise os instaladores, fixe versões e valide checksums antes de usar.
- Não coloque credenciais em issues, logs, screenshots, commits ou mensagens de erro. Se uma credencial for exposta, revogue-a e gere outra imediatamente.

## Aviso de uso e responsabilidade

Este projeto é disponibilizado para fins educacionais e de desenvolvimento. O usuário é o único responsável por configurar, operar e utilizar o ambiente de acordo com as leis, contratos, políticas de rede e termos de serviço aplicáveis.

Os mantenedores não assumem responsabilidade por danos, perdas, indisponibilidade, bloqueios de conta, vazamento de dados ou qualquer consequência decorrente do uso, configuração ou mau uso deste projeto. Não há garantia de anonimato, privacidade absoluta, disponibilidade da VPN ou ausência de vazamentos em todos os ambientes.

É proibido utilizar este projeto para atividades ilegais, invasão, fraude, abuso de serviços, evasão de controles de acesso ou qualquer finalidade que viole direitos de terceiros. Consulte o [disclaimer completo](DISCLAIMER.md) antes de utilizar ou redistribuir o projeto.

## Troubleshooting

### `*_FILE is required` ou segredo ausente

Confirme que `.env` existe, aponta para arquivos válidos e que os arquivos não estão vazios:

```bash
ls -l .env .secrets
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml config --quiet
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
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml logs --tail=200 vpn
```

Confirme que são usadas as credenciais ou configurações exigidas pelo provedor escolhido, que `VPN_COUNTRY` é válido para ele e que o host consegue acessar a Internet para baixar a imagem e os arquivos necessários.

### Uma porta já está ocupada

Altere ou remova a publicação correspondente em `docker-compose.yml`, ou pare o processo que usa a porta no host:

```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml down --remove-orphans
```

## Verificações locais

Os comandos abaixo validam a configuração sem iniciar uma conexão VPN:

```bash
bash -n scripts/vpn-entrypoint.sh scripts/vpn-status scripts/vpn-reconnect scripts/vpn-switch
scripts/verify-docs
printf test > /tmp/vpn-dev-gluetun-api-key
printf test > /tmp/vpn-dev-nordvpn-user
printf test > /tmp/vpn-dev-nordvpn-password
GLUETUN_API_KEY_FILE=/tmp/vpn-dev-gluetun-api-key \
NORDVPN_USER_FILE=/tmp/vpn-dev-nordvpn-user \
NORDVPN_PASSWORD_FILE=/tmp/vpn-dev-nordvpn-password \
  docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml config --quiet
docker build --check .
docker build -t vpn-dev-workspace:review .
```

## Licença

Este projeto está disponível sob a [Licença MIT](LICENSE). Consulte também o [disclaimer de uso](DISCLAIMER.md).
