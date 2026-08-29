# Worklog

Use `HANDOFF.md` for the current snapshot and `HANDOFFS/WORKLOG_ARCHIVE.md` for older entries after compaction.

## 2026-08-29 - Atualização do OpenCode para 1.18.25 e priorização do PATH do host

- Changed: atualizado [`Dockerfile`](file:///projetos/vpn-dev-workspace/Dockerfile) para OpenCode `1.18.25` (com fallback fixado) e adicionado `PATH` no [`docker-compose.yml`](file:///projetos/vpn-dev-workspace/docker-compose.yml) priorizando `${HOST_HOME_DIR}/.opencode/bin` e caminhos locais do host; configurado `HOST_HOME_DIR=/home/desenvolvedor` no [`.env`](file:///projetos/vpn-dev-workspace/.env).
- Why: ao atualizar o OpenCode no host, o contêiner passa a utilizar instantaneamente a versão mais recente da home montada (`~/.opencode/bin/opencode`), sem necessidade de refazer build manual do Dockerfile a cada nova versão.
- Verified: `docker exec ... which opencode` resolvendo para `/home/desenvolvedor/.opencode/bin/opencode`, `./scripts/verify-docs` ok.
- Next context: atualizações no host refletem imediatamente dentro do container.

## 2026-08-29 - Correção de conexão dos perfis com repasse de SERVER_HOSTNAMES

- Changed: adicionado `SERVER_HOSTNAMES: ${VPN_SERVER_HOSTNAMES:-}` aos perfis Compose ([`nordvpn-openvpn.yml`](file:///projetos/vpn-dev-workspace/profiles/nordvpn-openvpn.yml), [`nordvpn-wireguard.yml`](file:///projetos/vpn-dev-workspace/profiles/nordvpn-wireguard.yml), [`protonvpn-openvpn.yml`](file:///projetos/vpn-dev-workspace/profiles/protonvpn-openvpn.yml), [`surfshark-openvpn.yml`](file:///projetos/vpn-dev-workspace/profiles/surfshark-openvpn.yml)) e configurado `VPN_SERVER_HOSTNAMES` no [`.env`](file:///projetos/vpn-dev-workspace/.env) com servidores ativos/acessíveis no Brasil para contornar bloqueio de faixa de IP do ISP.
- Why: a seleção aleatória do Gluetun no país configurado (Brazil) caía em servidores na faixa `185.153.176.x`, que sofrem bloqueio de rota pelo provedor local, impedindo o handshake OpenVPN e estourando o timeout do healthcheck.
- Verified: `./scripts/vpn-switch nordvpn-openvpn` executado com sucesso e túnel saudável (`vpn-status` e `vpn-check` operacionais com IP público brasileiro), `verify-docs` ok.
- Next context: manter `VPN_SERVER_HOSTNAMES` configurado caso novos perfis precisem de restrição a servidores com conectividade na rede local.

## 2026-08-19 - Documentação dos passos práticos (runbook GUI/Desktop)

- Changed: criado `DEV/RUNBOOKS/opencode-desktop-vpn.md` (passo a passo validado: subir `vpn-opencode serve`, conectar o Desktop App em `http://127.0.0.1:10001` com login `opencode`/senha do `.secrets/opencode_gui_password`, alternativas `web`/`attach`, troca de senha, atualização do Desktop via `.deb` sem repositório apt e sincronização de versão com o Dockerfile, tabela de troubleshooting). README ganhou a seção "Conectar o Desktop App (passo a passo)"; `DEV/INDEX.md` mapeia o runbook.
- Why: consolidar em documentação durável os passos executados e os cuidados operacionais (versões, senha, apt).
- Verified: `verify-docs`, `bash -n`, `git diff --check`.
- Next context: manter o runbook atualizado quando a GUI/Desktop mudar; ao atualizar o Desktop via .deb, alinhar `OPENCODE_VERSION`/checksums do Dockerfile.

## 2026-08-19 - Validação de runtime no host (Parte B/C/D + achados)

- Spec: `SPECS/ACTIVE.md`.
- Changed: `.env` ativado com LAN/DNS interno/paridade/GUI (achados: `INTERNAL_DNS_EXEMPT_HOSTNAMES` não aceita curingas — corrigido para nomes explícitos); `vpn-check` com teste TCP real (`INTERNAL_TEST_PORT`) e aceite de DNS "starting" (peculiaridade do endpoint com upstream plain; resolução é validada à parte); `vpn-reconnect` com polling 30×5s (o ciclo de servidores do OpenVPN passa de 36s); Dockerfile ganhou `openssh-client` (paridade SSH real); `vpn-opencode` sem `BROWSER` (ignorado — `xdg-open` é ruído cosmético); README/.env.example com notas de DNS fora da LAN e pinning de servidores.
- Why: validar o conjunto completo em runtime e corrigir o que só aparece com túnel real.
- Verified: todo o plano de runtime — `vpn-switch`, `vpn-check` ok, `github.com`/internet pelo túnel, `http://192.168.30.20/ → 200` (LAN), `ssh-add -l` com chave do host, `vpn-reconnect` imprimindo IP (após fixar `br72.nordvpn.com`), `vpn-server-rotate` aplicado, `vpn-top`, `vpn-opencode web` (401/200 com basic auth) e `serve` (200). `VERIFY.md` completo.
- Risks: faixa 185.153.176.x do NordVPN bloqueada pela rede local (rotação aleatória pode cair nela; usar `VPN_SERVER_HOSTNAMES` com servidores conhecidos); `.omega.local` só existe no `/etc/hosts` do host (DNS da LAN NXDOMAIN) — alcance interno por IP validado; Desktop App real ainda não conectado à ponta `serve`; ShellCheck pendente na CI.
- Next context: conectar o Desktop App em `127.0.0.1:10001` via `vpn-opencode serve`; manter `VPN_SERVER_HOSTNAMES` com servidores acessíveis se a rotação aleatória reincidir em falhas.

## 2026-08-19 - Rede interna, paridade de home e GUI do OpenCode pela VPN

- Spec: `SPECS/ACTIVE.md` (escopo ampliado).
- Changed: firewall opt-in `FIREWALL_SUBNETS` (o `vpn-switch` detecta a sub-rede da rota padrão do host); DNS interno `INTERNAL_DNS` + `INTERNAL_DNS_EXEMPT_HOSTNAMES` (upstream plain único; `vpn-switch` avisa se `INTERNAL_DNS_RESOLVERS` ficar preenchido); `vpn-check` testa `INTERNAL_TEST_HOST`; Dockerfile com `HOST_UID`/`HOST_GID`; compose do `terminal` com mounts de `SSH_AUTH_SOCK` e `RUN_USER_DIR` (fallback `/dev/null`) e senha do painel; novo `scripts/vpn-opencode` (web|serve, `OPENCODE_GUI_PORT`); README, `.env.example`, `verify-docs`, DEV atualizados.
- Why: alcançar hosts `.omega`/LAN e resolver nomes internos pelo túnel, herdar identidade/sessão do host e usar a GUI/Desktop do OpenCode com tráfego 100% na VPN.
- Verified: `bash -n` em todos os scripts, `sh -n` entrypoint, `./scripts/verify-docs`, `git diff --check`, `docker compose --profile vpn config --quiet` (8 perfis).
- Risks: DNS público passa pelo DNS da LAN quando `INTERNAL_DNS` ativo (decisão aceita); container lê agente SSH/sessão do host (documentado); validação de runtime (túnel real, `.omega`, browser do painel, Desktop App) pendente no host com Docker.
- Next context: executar o plano de verificação runtime no host: build, `vpn-switch nordvpn-openvpn`, `vpn-reconnect` ×2, `vpn-check` (incl. host interno), `vpn-top`, `vpn-opencode web` e `serve`.

## 2026-08-19 - Aumento de poderes: IP pós-reconexão, saúde, dashboard e rotação

- Spec: `SPECS/ACTIVE.md`.
- Changed: `vpn-reconnect` agora aguarda o IP público com polling (fix do bug de IP não impresso no NordVPN); novos `vpn-check`, `vpn-top` e `vpn-server-rotate`; `vpn-auto-reconnect` valida saúde e suporta rotação opt-in; Gluetun v3.40.0 → v3.41.3 (digest via registry API); `jq` na imagem; `dns: 127.0.0.1` no serviço `vpn` (DNS pelo túnel).
- Why: recuperação confiável com IP visível, diagnóstico de vazamento de DNS, fallback de servidor quando autorizado e painel de status.
- Verified: `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`, `./scripts/verify-docs`, `./scripts/verify-compose` (com Docker do host? não — pendente), `git diff --check`; digest do Gluetun v3.41.3 confirmado na Docker Hub Registry API. ShellCheck e validação de runtime (túnel real) pendentes no host com Docker.
- Risks: host sem Docker no ambiente de edição — build/run precisam de validação do usuário; hostnames inválidos em `VPN_SERVER_HOSTNAMES` são rejeitados pela API do Gluetun; rotação sem lista re-seleciona aleatoriamente no país.
- Next context: validar com Docker no host (`verify-compose`, build da imagem, `vpn-switch nordvpn-openvpn` + `vpn-reconnect` ×2, `vpn-check`, `vpn-top`).

## 2026-08-10 - Objetivo documental consolidado

- Changed: README, exemplo de uso, especificação, arquitetura e decisões passaram a declarar o terminal VPN como extensão direta do host; a verificação documental cobre esse contrato.
- Why: eliminar a divergência entre a intenção atual do projeto e a sua memória técnica durável.
- Verified: sintaxe do verificador, `verify-docs`, `verify-compose` e ausência de falhas de whitespace no diff.
- Next context: mantenha o objetivo, a montagem da home e a rede compartilhada com a VPN documentados quando a arquitetura mudar.

## 2026-08-10 - Terminal VPN alinhado ao host

- Changed: OpenCode da imagem atualizado para `1.18.16` com checksums oficiais; o terminal agora monta a home e o workspace do host nos mesmos caminhos.
- Why: o terminal deve funcionar como extensão direta do host, preservando o estado e os caminhos absolutos enquanto sua rede continua passando pelo Gluetun.
- Verified: documentação, os oito perfis Compose, build da imagem e execução isolada com `HOME=/home/desenvolvedor`, workspace montado e OpenCode `1.18.16`.
- Risks: a home inteira fica acessível para leitura e escrita pelo terminal; use somente uma home própria e mantenha o início por `vpn-switch`.
- Next context: ao atualizar o OpenCode do host, atualize `OPENCODE_VERSION` e os checksums no Dockerfile na mesma alteração.

## 2026-08-10 - Endurecimento do ambiente VPN

- Spec: `SPECS/ACTIVE.md`.
- Changed: imagem com artefatos fixados e verificados, Zsh e usuário não-root; Compose com faixa LAN, health dependency e serviço de recuperação; documentação, CI e scripts de validação.
- Why: reduzir exposição do host, tornar builds reprodutíveis e recuperar conectividade VPN autorizada.
- Verified: documentação, todos os perfis Compose, sintaxe de shell, Compose base, bloqueio de bind público e build/runtime da imagem.
- Risks: teste real de túnel depende de provedor autorizado; ShellCheck é delegado à CI.
- Next context: manter versões/checksums em conjunto e evitar exposição com `0.0.0.0`.

## 2026-08-10 - Correção de credenciais de perfil

- Changed: serviços foram associados ao perfil Compose interno `vpn`, e `vpn-switch` passou a ativá-lo antes de combinar o perfil do provedor.
- Why: uma execução direta de `docker compose up` iniciava o Gluetun sem o arquivo `profiles/nordvpn-openvpn.yml`, resultando em `OpenVPN settings: user is empty` apesar dos segredos locais existirem.
- Verified: sintaxe Shell, `verify-docs`, `verify-compose` para oito perfis, Compose NordVPN e túnel NordVPN saudável com IP público.
- Next context: use `./scripts/vpn-switch <perfil>` para iniciar o ambiente.
