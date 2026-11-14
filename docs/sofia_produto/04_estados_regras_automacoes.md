# 4. 30Sales — estados, regras e automações

## 4.1 Máquinas de estado independentes

### Lead BDR

`new → researching → ready → queued → contacting → responded → converted_to_sdr`.

Saídas controladas: `invalid_contact`, `no_channel`, `out_of_profile`, `duplicate_review`, `no_response`, `paused`, `do_not_contact`. Cada terminal exige reason, timestamp e autor. `no_response` não equivale a recusa; `do_not_contact` é bloqueio forte e separado.

### Conversa

`new → awaiting_automation | awaiting_agent → open → waiting_contact | waiting_internal → handoff_pending → assigned_human → resolved`.

Finais/contexto: `closed`, `opted_out`, `spam`, `channel_failed`. Reabrir por nova mensagem recebida cria evento e reavalia política; não apaga resolução passada. Quando humano assume, `automation_owner=human` trava resposta automática até transferência explícita de volta.

### Qualificação SDR

`not_started → discovering → ready_for_handoff → handoff_requested → accepted_by_closer`.

Outras rotas: `follow_up_scheduled`, `nurture`, `not_fit`, `declined`, `needs_review`, `do_not_contact`. Aceite para falar é evidência de intenção/transferência; não implica meeting confirmed.

### Oportunidade

`qualification → accepted_for_contact → closer_contact_pending → discovery_scheduled → discovery_done → solution_confirmed → proposal_preparing → proposal_sent → negotiation → won | lost`.

Rota `nurture` é aberta/suspensa com data ou condição. Estados terminais não reabrem silenciosamente; reabertura cria evento e motivo. `stage` separado de `outcome` e forecast.

### Job técnico

`received → validated → reserved → running → succeeded`.

Falhas: `retry_wait`, `needs_review`, `blocked`, `failed_permanent`, `cancelled`, `duplicate_noop`. O job pode falhar sem marcar lead como contatado, conversa como respondida ou tarefa como concluída.

## 4.2 Matriz de transições sensíveis

| Transição | Quem pode | Pré-condições | Efeito |
| --- | --- | --- | --- |
| Conta pronta → campanha | BDR/gestor | Conta elegível, canal saudável, sem opt-out, quota | Cria job idempotente; status “contato solicitado” |
| Envio → abordado | Sistema | Provider confirma envio conforme contrato disponível | Grava mensagem/attempt, hora real e external ID |
| Conversa → humano assume | SDR/closer | Permissão e owner definido | Bloqueia bot; registra handoff/ownership e SLA |
| Qualificação → handoff | Sofia/SDR | Aceite ou pedido humano; snapshot; destino | Cria tarefa/oportunidade conforme política e alerta |
| Handoff solicitado → aceito | Closer/dono | Pessoa assume e aceita | Transfere ownership; inicia SLA |
| Handoff → devolvido | Closer/gestor | Motivo obrigatório e próxima ação/dono | Retorna para fila SDR; preserva tentativa e notas |
| Oportunidade → proposta enviada | Closer | Proposta/valor/versão e data enviados | Cria atividade/evidência; não presume recebimento |
| Oportunidade → ganho | Closer autorizado | Confirmação comercial, data real e campos exigidos | Marca outcome; fecha tarefas incompatíveis; evento de ganho |
| Oportunidade → perdida | Closer autorizado | Motivo de perda | Fecha; cancela cadências; preserva histórico |
| Qualquer estado → opt-out | Qualquer operador/sistema | Pedido identificável ou fonte confiável | Bloqueio imediato central; cancela jobs pendentes |

## 4.3 Políticas de envio

Checagem em tempo de execução imediatamente antes do provider:

1. Destinatário resolvido e canal válido.
2. Nenhum opt-out aplicável.
3. Ownership e estado permitem automação; humano não assumiu.
4. Campanha/canal/chip ativos e saudáveis.
5. Horário, timezone, feriados, quota e limite de frequência válidos.
6. Conteúdo aprovado para playbook/versão e regras de preço/alegações satisfeitas.
7. Chave idempotente reservada; dedupe de evento externo concluído.
8. Envio executado; provider response gravada; estado “entregue” só se callback ou evidência suportar.

Pausa global, por canal, por chip, campanha, conta e pessoa. Pausa manual tem precedência sobre reconexão automática. Recuperar sessão não reativa campanhas pausadas manualmente.

## 4.4 Handoff com pacote completo

1. Sofia/SDR registra motivo e mensagem de evidência.
2. Sistema monta snapshot com conta, contato, fatos e estado de confirmação da agenda.
3. Roteador escolhe owner conforme equipe, segmento/capacidade e regras; guarda explicação.
4. Cria oportunidade ou associa a existente segundo regra de dedupe; não cria duplicata por evento repetido.
5. Cria atividade com SLA e notificação com link profundo.
6. Closer aceita ou devolve com motivo; silêncio escala ao gestor.
7. Ao assumir, humano torna-se owner da conversa. O sistema verifica que automação não responde por cima.

Brief inclui dados conhecidos, desconhecidos e conflitantes separadamente. Evidência linka mensagens concretas. Score/readiness nunca bloqueia pedido explícito de humano.

## 4.5 Follow-up, tarefas e silêncio

- Um compromisso de retorno possui data/hora, timezone, quem executa e canal.
- Antes de executar: revalidar resposta nova, opt-out, ownership, status, feriado, horário e última mensagem; cancelar job obsoleto se estado mudou.
- Se retorno é humano, criar tarefa, não mensagem automática. Se Sofia executa, marcar dono automation e registrar política.
- Sem resposta não vira automaticamente perdido; aplicar cadência aprovada e limites. A política atual da Sofia que evita segunda abordagem de silêncio deve ser mantida até mudança explícita.
- Lead pediu tempo: não cutucar antes do prazo. Nova mensagem do lead cancela retorno antigo incompatível.
- Encerrar conversa não equivale a perder oportunidade se existe negócio ativo; estado de conversa e oportunidade são independentes.

## 4.6 Classificação e uso de IA

O serviço de IA retorna JSON tipado: `intent`, `facts[]`, `suggested_reply`, `suggested_action`, `confidence`, `evidence_message_ids`, `unknowns`, `policy_flags`. Parser valida schema. Truncamento, recusa do provider ou JSON inválido não executa ação externa.

Políticas determinísticas decidem se a ação pode ser executada. Para baixa confiança, conteúdo conflitante, preço não autorizado, marca/empresa divergente, opt-out incerto ou indicação para outra empresa: mover para revisão ou resposta segura configurada.

Modelo não classifica “enviado” como “recebido”, “aceite” como “reunião”, “interesse” como “ganho”, nem nome do perfil como nome declarado. Cada fato deve apontar origem; inferência vem identificada.

## 4.7 Eventos de domínio recomendados

`account.created/updated`, `lead.queued`, `outreach.requested/sent/delivered/failed`, `message.received`, `conversation.owner_changed`, `qualification.updated`, `handoff.requested/accepted/returned`, `appointment.proposed/confirmed/cancelled`, `activity.created/completed`, `opportunity.stage_changed/won/lost`, `contact.opted_out`, `channel.health_changed`, `integration.sync_conflict`, `policy.blocked`.

Eventos são append-only; consumidores usam outbox/inbox e idempotência. Payloads carregam IDs e referências, minimizando PII em filas/logs.

## 4.8 Notificações e escalonamento

Notificações in-app são canônicas; e-mail/WhatsApp interno são entregas. Preferências não podem silenciar alertas críticos de falha ou handoff vencido para todos os responsáveis. Deduplicar alerta por incidente/versão e registrar sucesso de cada canal.

Exemplos de regra: novo handoff sem aceite dentro do SLA → avisar owner e gestor; webhook parado → operação; canal desconectado → pausar e alertar; oportunidade sem próxima ação → fila do owner, não mensagem ao cliente.


## Estados implementados na fila BDR inicial

A primeira migration usa a máquina de estados desta especificação: `new → researching → ready → queued → contacting → responded → converted_to_sdr`. Saídas controladas: `invalid_contact`, `no_channel`, `out_of_profile`, `duplicate_review`, `no_response`, `paused` e `do_not_contact`. O service restringe as transições; cada mudança grava ator, timestamp e estado anterior/novo em `lead_status_history`. O handoff implementado exige lead respondido, cria/reutiliza oportunidade e envia brief com evidência; aceite atribui owner closer. Devolução exige motivo, próxima ação e prazo, retorna lead a `responded` e cria tarefa para o solicitante. O histórico do handoff é preservado em `handoff_history`. A retomada `converted_to_sdr → responded` só ocorre pelo fluxo de devolução.
