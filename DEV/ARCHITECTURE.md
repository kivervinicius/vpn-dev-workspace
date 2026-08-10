# Architecture

`docker-compose.yml` define a infraestrutura comum: `vpn`, `terminal` e `vpn-auto-reconnect`. Todos pertencem ao perfil Compose interno `vpn` e não iniciam sem ele.

O `terminal` usa `network_mode: service:vpn`, portanto todo o seu tráfego compartilha o namespace de rede e o kill switch do Gluetun. Ele monta `HOST_HOME_DIR` (por padrão, a home do usuário que executa o Compose) e `WORKSPACE_DIR` nos mesmos caminhos do host. Dessa forma, o Zsh encontra as configurações e ferramentas já instaladas pelo usuário, inclusive o OpenCode; a imagem também mantém uma versão verificada compatível como fallback.

Os arquivos em `profiles/` definem exclusivamente o provedor, protocolo e mapeamentos de segredos. `scripts/vpn-switch` habilita o perfil interno e aplica exatamente um perfil de provedor; assim, o Gluetun só recebe credenciais como arquivos montados em `/run/secrets/`.
