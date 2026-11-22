# Decisions

## OpenCode session sync and provider status policy (2026-11-22)

- Cross-version session transfer uses each CLI's native JSON export/import and
  a local ID ledger. It copies supported transcript history into a new session;
  it never copies database files between v1 and v2. Attachments, running tools,
  summaries, forks, reverts, and unknown message parts stay pending for manual
  continuation.
- Provider quota, account, credit, auth, and rate-limit events are status-only:
  no VPN/model change, automatic retry, prompt replay, or tool replay. The v1
  plugin cancels recognized retries when the API confirms cancellation; v2
  sets `retry: false`. Both show notification-only status.
- The supervisor handles confirmed connectivity failures separately. It
  verifies the exact saved session and prints a manual resume command; it never
  resubmits the interrupted request.
- Windows host/container SQLite staging remains a separate same-version v2
  path. Failed pushes return nonzero and do not apply stale staging data.
- Tested baseline: v1 1.19.6, v2 2.3.2. Native synthetic conversion and
  isolated CLI round-trips are covered; Windows Docker Desktop runtime remains
  a platform verification item.

## Inicialização obrigatória por perfil

Os serviços Compose usam o perfil interno `vpn` e são iniciados por `./scripts/vpn-switch <perfil>`. O seletor combina a infraestrutura comum com o arquivo do provedor e seus segredos. A decisão evita que `docker compose up` inicie o Gluetun sem as credenciais exigidas pelo perfil.

## Terminal como extensão direta do host

O terminal monta integralmente a home do usuário e o workspace nos mesmos caminhos, em vez de montar apenas diretórios isolados do OpenCode. A decisão preserva configurações, referências absolutas e ferramentas já instaladas no host, enquanto `network_mode: service:vpn` mantém a saída de rede protegida pelo Gluetun. Como consequência, o terminal tem leitura e escrita na home montada e só deve receber a home do próprio usuário.

O OpenCode da imagem é fixado com checksum na mesma versão do host no momento da alteração. O Zsh interativo também enxerga a instalação compartilhada na home do host; ao atualizar o OpenCode do host, a versão e os checksums da imagem devem ser atualizados juntos.

## Suporte Windows sem distribuição WSL

O PowerShell usa o motor Linux do Docker Desktop sem exigir uma distribuição
WSL instalada. A home Windows não é usada como home Linux: o override coloca a
home em `vpn_windows_home` e monta somente o projeto em `/workspace`. Isso
evita misturar executáveis Windows com ferramentas Linux e mantém a home entre
recriações dos serviços.

O agente Windows é exposto apenas por uma ponte local temporária, autenticada
por token e acessível pelo `host.docker.internal`. O terminal recebe um socket
Unix intermediário; chaves privadas continuam no agente Windows. A ponte
falha cedo quando o named pipe `openssh-ssh-agent` não está disponível.

No WSL2, a autodetecção de LAN foi desativada porque a rota padrão aponta para
a sub-rede virtual do WSL. `FIREWALL_SUBNETS` explícito é o contrato para
liberar a LAN em ambos os modos Windows.

## Bug do IP pós-reconexão e polling

O endpoint `/v1/publicip/ip` do Gluetun só publica o IP público segundos depois de o túnel subir; consultá-lo imediatamente após `stopped→running` retorna vazio e derrubava o `vpn-reconnect` (erro silencioso, sem IP). O `vpn-reconnect` espera o IP com polling (30 tentativas × 5s) antes de encerrar; a falha em obter IP resulta em exit não-zero para o `vpn-auto-reconnect` retentar.

## Troca de servidor pela API de controle

A rotação de servidor usa `PUT /v1/vpn/settings` do HTTP Control Server (`provider.server_selection`), que valida e reinicia o túnel internamente, com autenticação por chave da API. A decisão evita o socket Docker no `vpn-auto-reconnect` e mantém a política de menor privilégio. A rotação automática é opt-in (`VPN_ROTATE_SERVERS=false` por padrão); `vpn-server-rotate` manual continua disponível sempre.

## Gluetun v3.41.3 e DNS pelo túnel

O Gluetun está em v3.41.3 (digest fixado), com o control server autenticado por arquivo TOML criado em `/run` (tmpfs, modo 0600) a partir do segredo montado; a chave não fica em variável JSON do Compose. O serviço `vpn` define `dns: 127.0.0.1` para que as consultas passem pelo DNS embutido do Gluetun, e a imagem do terminal inclui `jq` para parsing das respostas da API.

## Acesso à rede interna: sub-rede da LAN do host + upstream plain interno

O firewall do Gluetun libera somente a sub-rede da interface com a rota padrão do host (detectada pelo `vpn-switch` quando `FIREWALL_SUBNETS` não está configurado) mais qualquer sub-rede extra listada em `FIREWALL_SUBNETS`. A decisão evita liberar a rede toda e não colide com a faixa privada do túnel. Para resolução de nomes internos, `INTERNAL_DNS` troca o upstream DoT por um upstream plain único da LAN; nesse modo `INTERNAL_DNS_RESOLVERS` deve ficar vazio, senão o Gluetun divide as consultas entre upstreams e nomes internos falham aleatoriamente. `INTERNAL_DNS_EXEMPT_HOSTNAMES` libera os hostnames internos listados (nomes explícitos, sem curingas) da proteção contra rebinding (respostas apontando para IPs privados). Sem `INTERNAL_DNS`, o comportamento padrão (DoT Cloudflare) permanece.

## Paridade de home: UID/GID dinâmico, agente SSH e sessão do usuário

A imagem do terminal é construída com `HOST_UID`/`HOST_GID` (padrão 1000) para que arquivos criados no terminal tenham o mesmo dono do host, evitando acesso negado. Quando `SSH_AUTH_SOCK` e `RUN_USER_DIR` existem no host, são montados no terminal (`/run/vpn-ssh-agent.sock` e o mesmo caminho), dando acesso ao agente SSH e à sessão do usuário (keyring/dbus). Fallbacks `/dev/null` mantêm o Compose válido sem sessão. Risco aceito e documentado: o container lê a sessão e o agente SSH do usuário; por isso o ambiente deve ser iniciado somente com a sessão do próprio usuário.

## GUI do OpenCode dentro do túnel via helper `vpn-opencode`

O OpenCode GUI é executado dentro do `terminal` (tráfego de LLM 100% pela VPN) e publicado na faixa do Gluetun via `vpn-opencode web|serve` (porta `OPENCODE_GUI_PORT`, padrão 10001). `web` serve o painel no navegador do host; `serve` expõe a ponta para o Desktop App. A senha vem de `OPENCODE_GUI_PASSWORD_FILE` (basic auth, usuário `opencode`); sem o arquivo, o painel abre sem senha, apenas para uso local. Com `HOST_BIND_ADDRESS` em LAN, `vpn-switch`/`vpn.ps1` recusam subir sem um arquivo de senha não vazio, porque o painel ficaria exposto na rede local. O estado é compartilhado com o CLI porque ambos usam a mesma home e os mesmos projetos.

## Achados de runtime (2026-08-19)
- `DNS_REBINDING_PROTECTION_EXEMPT_HOSTNAMES` do Gluetun rejeita curingas (`*.internal.example` inválido): exigem-se nomes explícitos separados por vírgula.
- Com upstream plain (`INTERNAL_DNS`), o endpoint `/v1/dns/status` permanece `starting` mesmo com o servidor `ready` e resolvendo; o `vpn-check` trata `running|ready|starting` como ok e valida a resolução real à parte.
- O polling do `vpn-reconnect` subiu para 30×5s porque a troca de servidor do OpenVPN pode demorar mais de um minuto para reconectar.
- A imagem do terminal passou a incluir `openssh-client`: `git`/`ssh` dependem dele e a paridade do agente SSH do host exige `ssh-add` no container.
- O provedor de acesso pode bloquear faixas de IP de alguns servidores NordVPN (185.153.176.x inacessível do próprio host); a rotação aleatória pode cair repetidamente neles — para esse caso, fixar servidores conhecidos via `VPN_SERVER_HOSTNAMES` ou pin direto por hostname na API.
- Nomes `.internal.example` só existem no `/etc/hosts` do host (o DNS da LAN responde NXDOMAIN); o alcance interno real é validado por IP/sub-rede via firewall, e o `vpn-check` aceita `INTERNAL_TEST_HOST` como IP com teste TCP em `INTERNAL_TEST_PORT`.

## Robustez dos scripts (2026-09-17)

- Todo `curl` contra o Gluetun usa `--connect-timeout 5 --max-time 10` (e `--retry-all-errors` onde há `--retry`): sem isso, um Gluetun travado pendurava o script indefinidamente e o `--retry 3` não retentava erros `--fail`.
- Dependências (`curl`, `jq`, `docker`, `ss`, `ip`, `awk`) são checadas cedo com `need()` e mensagem clara, em vez de falhar de forma críptica sob `set -e` (ex: `ss` ausente gerava falso-negativo de "porta livre").
- `vpn-top` não aborta em falha transitória de settings e usa `// empty`/`desconhecido` em todo `jq`; `vpn-server-rotate` filtra hostnames vazios/espaçados (`, ,`) antes do `PUT`; helpers resolvem via PATH com fallback para `/usr/local/bin`, funcionando no host e no container.
- `vpn-auto-reconnect` e `vpn-switch` tratam `TERM`/`INT` para encerrar rápido; o teste TCP do `vpn-check` é limitado a 5s via `timeout` e `INTERNAL_TEST_PORT` é validada (1-65535).
- Credenciais de API e basic auth são entregues ao `curl` por config via stdin (`--config -`), sem valor em argv. O helper do painel passa apenas o nome da variável ao `docker exec`; a senha é carregada do arquivo montado como segredo dentro do container.

## Paridade de perfis e init (2026-09-17)

- `profiles/protonvpn-wireguard.yml` ganhou `SERVER_HOSTNAMES`: era o único perfil de provedor sem a linha, então `VPN_SERVER_HOSTNAMES` não tinha efeito nele (bug por omissão, não decisão).
- `init: true` no serviço `terminal` (estava no working tree sem commit nem doc): mantido e documentado — colhe zumbis de `tail`/`zsh`/`opencode exec` sem mudar comportamento de rede.

## Hosts locais via /etc/hosts pós-up (2026-09-17, rev. 2)

- Tentativa inicial com `extra_hosts` no Compose foi rejeitada pelo Docker (`conflicting options: custom host-to-IP mapping and the network mode`) com `network_mode: service:vpn` — validado no erro real do daemon, não em teoria.
- Mecanismo atual: `LOCAL_HOSTS` → snippet `.hosts.local.gen` → `vpn-switch` injeta via `docker exec -u 0 ... >> /etc/hosts` pós-up (idempotente, sem duplicar). Recreate perde as entradas, por isso o `vpn-switch` sempre reaplica e existe `vpn-hosts-apply` manual para `restart`.
- Nomes que só existem no `/etc/hosts` do host não resolvem no terminal porque lá todo DNS passa pelo Gluetun; em vez de mexer no DNS (sidecar ou upstream), o glibc resolve via `files` antes do túnel — sem exceção de rebinding.
- Entrada via `LOCAL_HOSTS` no `.env` (`nome=ip`, vírgula/espaço); override gerado é git-ignorado e reescrito a cada `vpn-switch` (vazio remove o arquivo — opt-in inerte). Validação estrita com falha rápida (hostname RFC, IPv4 octeto ≤255, sem curingas).
- `LOCAL_HOSTS` é repassado no ambiente dos 2 serviços para o `vpn-check` validar cada mapeamento; alcance real continua sendo papel de `FIREWALL_SUBNETS`.
- Risco aceito: IP da LAN muda → stale (re-sync via `vpn-hosts-import --domain`, que só sugere a linha, nunca escreve sozinho).

## Revisão lote D (2026-09-17)

- `vpn-top` tinha a condição invertida (ramo sem-jq usava jq); `INTERNAL_DNS_RESOLVERS` vazio era anulado por `:-` (Compose e switch) — agora vazio é significativo e o switch exporta `DNS_UPSTREAM_RESOLVER_TYPE=plain`, sem o qual o Gluetun ignora o upstream plain (issues #3216/#3220/#3422).
- `vpn-check` agora sai 0/1 (contagem na mensagem/JSON); `--only tunnel` alimenta o health leve do `auto-reconnect` (cheio só informa, sem reconnect por blip de DNS).
- Bumps com prova de origem: SHASUMS oficial (Node), tarballs baixados + `sha256sum` (OpenCode), registry API (jammy); build da CI reconfere os hashes.
- Hardening conservador (cap_drop, no-new-privileges, logs, limits) — `read_only+tmpfs` adiado por exigir runtime; proxy HTTP opt-in na faixa publicada (sem `ports` novo). A senha do proxy foi migrada para arquivo secreto montado no serviço Gluetun; o histórico de decisão sobre env direto foi supersedido.

## Histórico supersedido: recuperação por limite estruturado (2026-10-30)

Naquele momento, eventos estruturados `free-tier` e HTTP 429/rate-limit podiam
acionar recovery pelo helper e retry de cliente. Esse comportamento foi
substituído pela decisão de 2026-11-22 acima: todos os limites do provider são
status-only. A remoção do watcher e da classificação por prosa/log segue
válida; `vpn-opencode check` permanece observacional.

## Histórico supersedido: cota free-tier do Zen e rotação (2026-11-05)

Diagnóstico com prova: `POST https://opencode.ai/zen/v1/messages` responde
`HTTP 429` (`FreeUsageLimitError`) com o **mesmo** `Retry-After` (~24600 s)
a partir do IP residencial e de IPs de datacenter da VPN, para todos os modelos
`-free`; uma rotação real em 2026-11-03 (`177.54.156.210 → 189.1.170.176`) não
renovou a cota. Conclusão: desde out/2026 a franquia gratuita é contada por
conta/dispositivo, não por IP (incidente global documentado na thread #59387
do OpenCode).

O diagnóstico de novembro indicou que trocar IP não renova a franquia gratuita.
Naquela fase `free_tier_limit` passou a notificar, enquanto `rate_limit`
genérico ainda podia rotacionar. A decisão de 2026-11-22 tornou todos os
eventos de quota/auth/rate-limit informativos e removeu cooldown, orçamento e
circuit breaker do fluxo do provider. `OPENCODE_ALLOW_HOST=1` permanece como
opt-in independente para execução do binário host.

## Porta de controle publicada no host e lock/estado unificados (2026-11-05)

Os scripts de host falhavam porque falavam com o Portainer (porta 8000 do host)
em vez da API do Gluetun, que só responde dentro do namespace do serviço vpn.
Em vez de scripts host falarem com o Portainer ou dependerem de `docker exec`:

- O Compose publica `127.0.0.1:${VPN_CONTROL_PORT:-18000}:8000`
  (`VPN_CONTROL_BIND`/`VPN_CONTROL_PORT` no `.env.example`; `verify-compose`
  trava a consistência do default). Publicar exige recreate via `vpn-switch`.
- `vpn-control-api.sh` centraliza defaults: URL `127.0.0.1:8000` dentro do
  container, `127.0.0.1:${VPN_CONTROL_PORT:-18000}` no host
  (`VPN_CONTROL_FORCE_HOST=1` força host em testes herméticos); segredo preferindo
  `/run/secrets/gluetun_api_key` com fallback `<repo>/.secrets/gluetun_api_key`.
- Lock com candidatos graváveis: `VPN_CONTROL_LOCK_FILE` explícito (falha alto se
  não gravável) → `VPN_CONTROL_LOCK_DIR` → `<repo>/.vpn-control-lock` (o MESMO
  bind mount que os containers veem em `/run/vpn-control-lock`: host e containers
  disputam o mesmo lock) → `/run/vpn-control-lock` → `/var/lib/vpn-control` →
  `$HOME/.vpn-control-lock`. Estados (`vpn-rotate.index`,
  `opencode-limit-recovery.json`) preferem `/var/lib/vpn-control` no container e
  caem para `<repo>/.vpn-control-state/` no host (`vpn_control_state_file`).

## Revert de rotação robusto (2026-11-05)

`vpn-server-rotate` voltou a ter o revert forte das versões anteriores, agora
baseado em snapshot: captura `provider.server_selection` antes do PUT e, se o
PUT falhar, a reconexão falhar ou o `vpn-check --only tunnel` acusar túnel
insaudável ao final, restaura a seleção anterior e reconecta (best effort),
saindo 1. `--random` passou a escolher DENTRO de `VPN_SERVER_HOSTNAMES`
(preserva a lista no runtime; antes limpava os hostnames do Gluetun até o
próximo recreate — degradou o runtime em 2026-11-03).
