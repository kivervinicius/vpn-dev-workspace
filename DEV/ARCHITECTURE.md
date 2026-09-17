# Architecture

`docker-compose.yml` define a infraestrutura comum: `vpn`, `terminal` e `vpn-auto-reconnect`. Todos pertencem ao perfil Compose interno `vpn` e não iniciam sem ele.

O `terminal` usa `network_mode: service:vpn`, portanto todo o seu tráfego compartilha o namespace de rede e o kill switch do Gluetun. Ele monta `HOST_HOME_DIR` (por padrão, a home do usuário que executa o Compose) e `WORKSPACE_DIR` nos mesmos caminhos do host. Dessa forma, o Zsh encontra as configurações e ferramentas já instaladas pelo usuário, inclusive o OpenCode; a imagem também mantém uma versão verificada compatível como fallback. O `PATH` do terminal prioriza `${HOST_HOME_DIR}/.opencode/bin`, de modo que atualizar o OpenCode no host reflete de imediato no container sem rebuild. O serviço usa `init: true` para colher processos zumbis de shells/filhos.

Os arquivos em `profiles/` definem exclusivamente o provedor, protocolo e mapeamentos de segredos. `scripts/vpn-switch` habilita o perfil interno e aplica exatamente um perfil de provedor; assim, o Gluetun só recebe credenciais como arquivos montados em `/run/secrets/`. Todos os perfis de provedor (exceto `custom-*`) aceitam `SERVER_HOSTNAMES` (`VPN_SERVER_HOSTNAMES`); os `*-openvpn` aceitam `OPENVPN_PROTOCOL` (udp/tcp).

O serviço `vpn` define `dns: 127.0.0.1` para que todos os contêineres que compartilham sua rede resolvam DNS pelo servidor embutido do Gluetun, completando o isolamento do tráfego pelo túnel.

Os scripts de operação conversam com o HTTP Control Server do Gluetun (`/v1/vpn/status`, `/v1/vpn/settings`, `/v1/publicip/ip`, `/v1/dns/status`) com autenticação por `X-API-Key`, sem acesso ao socket Docker:

- `vpn-status` — status, perfil, servidor/pais configurados e IP público (com localização).
- `vpn-check` — saúde do túnel, IP, DNS do túnel, resolução e checagem básica de vazamento de DNS; usado pelo `vpn-auto-reconnect`. Com `INTERNAL_TEST_HOST`, testa também o alcance à rede interna do host.
- `vpn-reconnect` — reconexão `stopped→running` com polling até o IP público voltar.
- `vpn-server-rotate` — troca de servidor via `PUT /v1/vpn/settings` (cicla `VPN_SERVER_HOSTNAMES` ou re-seleciona no país configurado).
- `vpn-top` — painel de status com serviços Docker (quando disponível), túnel e auto-reconexão.
- `vpn-auto-reconnect` — valida a saúde a cada intervalo e recupera a conectividade; com `VPN_ROTATE_SERVERS=true`, troca de servidor após falhas consecutivas.
- `vpn-opencode` — executa `opencode web|serve` dentro do `terminal` na faixa publicada (o tráfego de LLM fica 100% no túnel); lê a senha em `OPENCODE_GUI_PASSWORD_FILE` e expõe basic auth (`opencode`).
- `vpn-hosts-gen` — valida `LOCAL_HOSTS` e gera `.hosts.local.gen` (git-ignorado, linhas `IP nome`). Não fala com o Gluetun nem com o Docker.
- `vpn-hosts-apply` — injeta o snippet no `/etc/hosts` de `terminal` e `vpn-auto-reconnect` via `docker exec -u 0` (idempotente); o `vpn-switch` chama pós-up. Não fala com o Gluetun.
- `vpn-hosts-import` — sugere a linha `LOCAL_HOSTS` a partir do `/etc/hosts` do host filtrado por domínio; roda só no host.

## Acesso à rede interna do host (opt-in)

O serviço `vpn` recebe `FIREWALL_OUTBOUND_SUBNETS` (lista de sub-redes permitidas fora do túnel) e, quando `INTERNAL_DNS` está definido, usa esse upstream em texto puro para o servidor DNS embutido (`DNS_UPSTREAM_PLAIN_ADDRESSES`), com `DNS_REBINDING_PROTECTION_EXEMPT_HOSTNAMES` liberando os hostnames internos listados (nomes explícitos; curingas são rejeitados pelo Gluetun). O `vpn-switch` detecta a sub-rede da interface da rota padrão do host e a injeta quando `FIREWALL_SUBNETS` não está configurado.

Nomes que só existem no `/etc/hosts` do host (ex: `gitlab.omega`) usam outro caminho: `LOCAL_HOSTS` vira snippet aplicado ao `/etc/hosts` dos containers pós-up, e o glibc resolve via `files` antes do DNS do túnel — sem Gluetun, sem rebinding (`extra_hosts` é rejeitado pelo Docker com `network_mode`, daí a injeção pós-up; `recreate` perde as entradas, por isso o `vpn-switch` sempre reaplica). O `vpn-check` valida cada `nome=ip`; o alcance continua exigindo `FIREWALL_SUBNETS`.

## Paridade com a home do host

A imagem do terminal é construída com `HOST_UID`/`HOST_GID` (padrão 1000) para herdar as permissões do usuário do host. Quando definidos, `SSH_AUTH_SOCK` é montado em `/run/vpn-ssh-agent.sock` (leitura) e `RUN_USER_DIR` no mesmo caminho (keyring/dbus da sessão). Ambos usam `/dev/null` como fallback para não quebrar o Compose quando a sessão não existe.
