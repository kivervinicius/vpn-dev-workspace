# Plano de troca de modelo e reenvio no OpenCode v2

Status: planejado. Alvo inicial: TUI do OpenCode 2.3.2 no terminal Docker.

## Comportamento esperado

Quando o modelo gratuito do turno receber `provider.free-limit` ou um `429`
estruturado identificado como limite daquele modelo, selecionar uma alternativa
na mesma sessão. Mostrar o modelo anterior e o novo no banner e reenviar a
mensagem automaticamente quando o turno puder ser repetido com segurança. O
limite é de três modelos distintos por turno, contando o original.

Se houver execução parcial, ação de ferramenta, nova mensagem do usuário ou
dúvida sobre o estado do envio, selecionar a alternativa quando possível e
mostrar que o reenvio requer ação manual. Ao esgotar as alternativas, mostrar o
próximo horário de liberação conhecido. A recuperação da VPN segue o estado
do túnel. Cota de modelo, cota geral, falha de autenticação e saldo insuficiente
não forçam troca de IP.

## Implementação

1. **Validar o contrato da versão instalada.** Em uma sessão descartável do
   v2.3.2, inspecionar os eventos de falha e o histórico/estado do turno após
   um `429` simulado. Confirmar como correlacionar execução, modelo, mensagem
   original, fila e atividade de ferramentas. Validar a troca pela API
   `session.switchModel` e o comportamento do rascunho nativo da TUI.
   Preferir uma ação nativa sobre o turno original se a versão permitir trocar
   o modelo e preservar sua identidade. Caso contrário, validar a admissão de
   um reenvio com a API de sessão usando o conteúdo original. Examinar o
   contrato de admissão, o tratamento de timeout e a representação do histórico
   para evitar processar a mensagem duas vezes. Sem evidência suficiente para
   uma dessas opções, liberar somente a troca com aviso de envio manual.
   Pontos de partida: [plugin de servidor](../../opencode/v2/vpn-recovery/server-core.js),
   [TUI](../../opencode/v2/vpn-recovery/tui-core.js) e
   [API de sessões do OpenCode](https://opencode.ai/docs/build/plugins/server/#sessions).
2. **Montar a lista a partir do catálogo.** A cada necessidade de troca,
   consultar os modelos habilitados no projeto, do mesmo provedor permitido,
   com indicação explícita de gratuidade e com as capacidades que o turno usa,
   como ferramentas e imagens. Considerar o favorito configurado, seguir com
   os modelos com histórico local de sucesso em turnos comparáveis e usar um
   desempate estável entre candidatos sem histórico. Nenhum nome fixo é
   requisito. Um modelo novo elegível entra na lista e um modelo removido deixa
   de ser candidato sem editar o plugin. Guardar o bloqueio por provedor e
   modelo até o prazo informado em `retryAfterMs` ou `Retry-After`. Se o prazo
   faltar, aplicar uma espera conservadora configurável e identificar o
   horário como estimativa. Um sinal explícito de limite compartilhado encerra
   a seleção dentro daquele provedor. Preço ou escopo desconhecido impede a
   seleção automática do candidato. Fontes: [classificador](../../opencode/v2/vpn-recovery/classify.js)
   e [catálogo do OpenCode](https://opencode.ai/docs/build/plugins/server/#models).
3. **Coordenar um único reenvio por alternativa.** Fazer a coordenação no
   plugin de servidor. Confirmar que a falha foi na chamada principal antes
   de saída do assistente ou início de ferramenta, que a sessão está ociosa e
   que o turno original continua sendo o último, sem nova mensagem na fila.
   Preservar conteúdo, anexos, menções e agente quando o contrato suportar
   cada um. Associar cada tentativa à sessão, ao turno original e ao modelo.
   Serializar por sessão, reservar a tentativa antes de enviar e deduplicar
   eventos repetidos, clientes simultâneos e reinícios. Usar uma chave de
   idempotência nativa quando disponível. Se a admissão ficar incerta, só
   voltar a enviar após comprovar que o servidor não aceitou a tentativa.
   Usar metadados mínimos para a coordenação. O conteúdo original continua
   na sessão do OpenCode. Tratar uma troca manual ocorrida durante a
   recuperação como cancelamento da ação automática. Pontos de partida:
   [hook de servidor](../../opencode/v2/vpn-recovery/server-core.js) e
   [política](../../opencode/v2/vpn-recovery/policy.js).
4. **Acompanhar na TUI e ativar no Docker.** O servidor informa que iniciou a
   recuperação, qual modelo escolheu e se o reenvio foi aceito. O banner só
   anuncia o envio após a admissão e informa quando o turno precisa de ação
   manual ou quando a lista acabou. Se a TUI recuperar o rascunho original,
   coordenar com o comportamento nativo para preservar edições do usuário e
   evitar um segundo envio. Remover do caminho de cota v2 o restart forçado
   por `429`. Manter a recuperação de túnel confirmado como parado. Entregar
   configuração para ativar/desativar a troca e o reenvio e escolher favorito
   opcional. Depois do teste isolado, instalar o plugin no terminal Docker e
   ativar o modo automático nesse ambiente. Documentar como voltar ao modo de
   aviso com recuperação de rede independente. Entradas: [TUI](../../opencode/v2/vpn-recovery/tui-core.js),
   [helper de rede](../../scripts/opencode-network-recover),
   [instalador](../../scripts/opencode-vpn-install) e
   [runbook](../RUNBOOKS/opencode-v1-v2.md).

## Aceite e verificação

| Cenário | Resultado esperado |
|---|---|
| A atinge cota na primeira chamada, B responde | Mesma sessão e agente, banner identifica A e B, uma tentativa em B, nenhuma repetição manual necessária |
| A e B atingem cota, C responde | Uma tentativa em cada modelo, sem retorno a A ou B até seu prazo de liberação |
| A, B e C atingem cota com túnel saudável | Zero novas tentativas, banner com o próximo reset conhecido, zero restart da VPN |
| Modelo removido, favorito indisponível ou novo modelo compatível | A seleção é atualizada pelo catálogo e candidatos pagos, de escopo incerto ou incompatíveis ficam fora |
| `429` de origem incerta ou limite de conta, autenticação ou créditos | Banner com o motivo, zero reenvios automáticos e zero restart forçado por cota |
| Saída parcial, ferramenta iniciada, anexo sem suporte ou sessão alterada pelo usuário | Zero reenvios automáticos e banner com a ação manual quando aplicável |
| Evento repetido, duas TUIs, reinício ou timeout de admissão | No máximo uma submissão aceita por modelo no turno, sem reenvio às cegas e sem duplicação do turno no fluxo normal |
| Rascunho nativo recuperado ou editado pelo usuário | O envio aceito não volta como uma ação pendente, e o texto editado pelo usuário é preservado |
| Túnel confirmado parado | O helper de rede segue o fluxo já protegido pelo lock de mutação |

Atualizar [testes do plugin](../../tests/opencode/vpn-recovery.test.mjs) com
casos de catálogo, classificador, concorrência, admissão, banner e prazos.
Executar E2E com OpenCode v2.3.2, home descartável e provedor simulado no
Docker, incluindo zero chamadas ao helper de restart nos cenários de cota.
Rodar `make verify` e publicar as evidências em `DEV/VERIFY.md` antes de ativar
o modo no terminal de uso diário. O teste E2E não consome a cota real.
