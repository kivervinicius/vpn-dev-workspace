# OpenCode v2 model fallback

Status: implementado e validado em 2026-11-23. `make verify` passou, E2E no
OpenCode 2.3.2 com provider local passou, e a cópia global do plugin foi
instalada no terminal Docker. Sessões OpenCode já abertas precisam iniciar
novamente para carregar o plugin atualizado.

## Objetivo

Em `provider.free-limit` específico de um modelo gratuito, selecionar uma
alternativa compatível pelo catálogo atual e continuar o mesmo turno usando o
retry nativo do OpenCode. O limite é de três modelos distintos por turno,
contando o original. A TUI informa o modelo que esgotou a cota e o que concluiu
a execução. Não se submete uma nova cópia da mensagem do usuário.

O fallback aceita somente modelos habilitados do provider OpenCode com preço
explicitamente zero em todas as faixas e cache, suporte a ferramentas e todas
as entradas do turno. Imagens, áudio, vídeo e PDF exigem a capacidade
correspondente; arquivos de modalidade desconhecida não são reenviados.
`OPENCODE_MODEL_FALLBACK_FAVORITES` define preferências opcionais por
`provider/model`; os demais candidatos usam ordem estável por ID. O catálogo
permanece dinâmico, portanto modelos novos/retirados não exigem edição do
plugin. Se o provider não informar prazo, aplica-se o cooldown configurável de
uma hora.

Somente `provider.free-limit` explícito habilita troca automática. HTTP 429
genérico, quota de conta, autenticação e créditos não trocam modelo. Nenhuma
quota força restart de túnel ou troca de IP; o recovery de rede só atua quando
Gluetun confirma o túnel parado.

## Implementação

1. **Contrato 2.3.2.** E2E isolado confirmou `session.hook("retry")`,
   `session.switchModel` e `experimental.model.resolve`. O hook de retry reserva
   a alternativa e autoriza o retry; a resolução aplica o modelo escolhido à
   chamada seguinte antes do dispatch. O histórico e a identidade do turno
   ficam sob controle nativo do OpenCode.
2. **Seleção dinâmica.** Consultar `ctx.model.list()` em cada fallback. Excluir
   modelos pagos, com preço incompleto/desconhecido, sem ferramentas, com
   modalidade de entrada incompatível, bloqueados por `Retry-After` ou já
   usados no turno. Favoritos configurados vêm primeiro; o desempate dos demais
   é determinístico por ID. Não há nome de modelo embutido no plugin.
3. **Coordenação da tentativa.** O estado transitório fica no plugin do
   servidor, por sessão, com no máximo três modelos distintos. Tentativas são
   reservadas antes de `switchModel`; eventos concorrentes/repetidos para o
   mesmo modelo e número de tentativa são vetados. Uma mudança manual para
   outro modelo antes da resolução seguinte é preservada. Não se admite uma
   nova mensagem nem se reproduzem ferramentas anteriores.
4. **TUI e Docker.** Quando um retry termina com sucesso em outro modelo, a TUI
   mostra um toast com o modelo original e o escolhido. Se as alternativas
   acabam, mostra a falha e o `Retry-After` conhecido. Falhas genéricas seguem
   a política de notificação e recovery de rede confirmada. A opção
   `OPENCODE_MODEL_FALLBACK_ENABLED=false` volta ao modo manual. O Compose ativa
   o fallback por padrão; favoritos e cooldown são configuráveis pelo `.env`.

## Critérios e evidências

| Cenário | Resultado |
|---|---|
| A recebe quota, B conclui | Mesmo turno; uma chamada em A e uma em B; toast com A/B |
| A e B recebem quota, C conclui | Uma chamada por modelo; retry nativo termina no mesmo turno |
| A, B e C recebem quota | Sem quarta chamada; falha final com o prazo conhecido; sem restart de VPN |
| Modelo novo/removido, favorito ausente | Catálogo é lido novamente; elegíveis são encontrados sem nomes fixos |
| Modelo pago, preço desconhecido ou entrada incompatível | Não é selecionado |
| 429 genérico ou limite de conta/crédito/autenticação | Nenhuma troca automática |
| Evento duplicado ou resolução após escolha manual | Uma reserva por modelo/tentativa; escolha manual preservada |
| Túnel confirmado parado | Helper de rede mantém o lock compartilhado e fluxo existente |

Verificação automatizada:

- `node --test tests/opencode/vpn-recovery.test.mjs` cobre catálogo, custos,
  modalidades, cooldown, deduplicação, escolha manual, política de VPN e toast.
- `docker exec -w /projetos/vpn-dev-workspace vpn-dev-workspace-terminal-1 node tests/opencode/model-fallback-e2e.mjs`
  executa OpenCode 2.3.2 real com home descartável e provider HTTP local; dois
  `429` estruturados são seguidos de sucesso no terceiro modelo. Nenhum provider
  real ou quota do usuário é usado.
- Gate, instalação, saúde da VPN e processos ativos estão registrados em
  `DEV/VERIFY.md`. As sessões que já estavam abertas não foram reiniciadas.
