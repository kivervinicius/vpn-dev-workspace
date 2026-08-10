# Active Spec - vpn-dev-workspace

## Goal

- Oferecer um terminal VPN que funcione como extensão direta do host, preservando home, workspace, ferramentas e referências absolutas, com Zsh e recuperação automática autorizada.

## In Scope

- Documentação, imagem Docker, Compose, scripts de operação, CI e memória DEV.
- Alinhamento do OpenCode da imagem com o host e montagem integral da home no mesmo caminho.

## Out Of Scope

- Integrações de VPN fora dos perfis existentes, exposição na internet pública e mecanismos de evasão.

## Acceptance

- Todos os perfis validam; documentação e scripts passam; terminal não usa root; a recuperação confirma IP público.
- A home e o workspace do host são visíveis nos mesmos caminhos, e o OpenCode no terminal corresponde ao OpenCode do host.

## Constraints

- Sem segredos em logs ou Git; bind LAN somente em endereço explícito; sem commits automáticos.
- A home montada deve pertencer ao usuário que inicia o Compose, pois o terminal tem acesso de leitura e escrita a ela.

## Verification Plan

- ShellCheck, verificações de scripts, Compose, documentação e build da imagem.

## Status

- State: complete
- Owner: Codex
- Last updated: 2026-08-10
