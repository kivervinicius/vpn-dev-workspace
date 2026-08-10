# VPN Dev Workspace

Ambiente local de desenvolvimento em Docker que força o tráfego do terminal por uma VPN operada pelo [Gluetun](https://github.com/qdm12/gluetun). O terminal compartilha a rede do serviço VPN; se o túnel falhar, o kill switch do Gluetun bloqueia a saída.

> Use somente provedores, contas e redes para os quais você tem autorização. A manutenção automática existe para recuperar conectividade, não para ocultar atividade ou contornar políticas.

## Objetivo

Oferecer um terminal conectado à VPN que seja uma extensão direta do ambiente do host. Ele reutiliza a home, o workspace, as configurações e as ferramentas do usuário nos mesmos caminhos, incluindo o OpenCode, sem permitir que o tráfego de rede do terminal contorne o Gluetun.

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

- Por padrão, `HOST_BIND_ADDRESS=127.0.0.1`, acessível somente na máquina host.
- Para acesso pela LAN, informe o IP específico da interface local, por exemplo `HOST_BIND_ADDRESS=192.168.1.20`.
- Não use `0.0.0.0` ou `::`: eles expõem a faixa em todas as interfaces, inclusive onde um firewall pode não protegê-la.
- Antes de parar o ambiente, `vpn-switch` verifica conflitos TCP da faixa. A verificação reduz conflitos, mas o Docker ainda é a autoridade final para o bind de portas.

## Manutenção da VPN

O serviço interno `vpn-auto-reconnect` valida o IP público pelo endpoint local do Gluetun. Ele executa uma reconexão a cada hora e, se não houver IP público válido depois disso, repete a tentativa a cada 30 segundos até recuperar conectividade.

As variáveis são configuráveis em `.env`:

```ini
VPN_RECONNECT_INTERVAL_SECONDS=3600
VPN_RECONNECT_RETRY_SECONDS=30
```

Para consultar ou solicitar uma reconexão manual dentro do terminal:

```bash
vpn-status
vpn-reconnect
```

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

Troque o argumento de `vpn-switch` e o arquivo de perfil nos comandos Compose pelo perfil desejado. Os caminhos de segredo e configurações customizadas estão descritos em `.env.example`.

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

O contêiner de terminal é uma extensão direta do usuário do host: ele monta a home completa no mesmo caminho e o workspace no mesmo caminho. Isso preserva referências absolutas e permite usar as mesmas configurações e ferramentas, inclusive os dados do OpenCode. A imagem fixa o OpenCode na mesma versão do host no momento da atualização; ao atualizar o OpenCode do host, atualize também `OPENCODE_VERSION` e os checksums verificados do `Dockerfile`.

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
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml down --remove-orphans
```
