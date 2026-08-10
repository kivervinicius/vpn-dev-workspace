# Worklog

Use `HANDOFF.md` for the current snapshot and `HANDOFFS/WORKLOG_ARCHIVE.md` for older entries after compaction.

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
