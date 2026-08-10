# Decisions

## Inicialização obrigatória por perfil

Os serviços Compose usam o perfil interno `vpn` e são iniciados por `./scripts/vpn-switch <perfil>`. O seletor combina a infraestrutura comum com o arquivo do provedor e seus segredos. A decisão evita que `docker compose up` inicie o Gluetun sem as credenciais exigidas pelo perfil.

## Terminal como extensão direta do host

O terminal monta integralmente a home do usuário e o workspace nos mesmos caminhos, em vez de montar apenas diretórios isolados do OpenCode. A decisão preserva configurações, referências absolutas e ferramentas já instaladas no host, enquanto `network_mode: service:vpn` mantém a saída de rede protegida pelo Gluetun. Como consequência, o terminal tem leitura e escrita na home montada e só deve receber a home do próprio usuário.

O OpenCode da imagem é fixado com checksum na mesma versão do host no momento da alteração. O Zsh interativo também enxerga a instalação compartilhada na home do host; ao atualizar o OpenCode do host, a versão e os checksums da imagem devem ser atualizados juntos.
