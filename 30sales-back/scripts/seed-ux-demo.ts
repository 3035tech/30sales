import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as auth from '../src/db/auth-schema';
import * as schema from '../src/db/schema';

const datasetVersion = 'ui-demo-v1';
const expectedOrganizationName = 'Acme Brasil (dados de demonstração)';
const expectedDatabaseName = '30sales';
const expectedDatabasePort = '55432';
const demoRowCount = 60;
const demoConversationCount = 50;
const now = new Date();

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function stableUuid(key: string) {
  const bytes = createHash('sha1').update(`30sales:${datasetVersion}:${process.env.DEMO_ORGANIZATION_ID}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function daysFromNow(days: number, hour = 10) {
  const value = new Date(now);
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function verifyTarget(databaseUrl: string) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo data cannot be loaded in production.');
  if (process.env.DEMO_SEED_CONFIRM !== 'LOAD_SYNTHETIC_DATA_IN_LOCAL_UX_DB') {
    throw new Error('Set DEMO_SEED_CONFIRM=LOAD_SYNTHETIC_DATA_IN_LOCAL_UX_DB to confirm this local-only load.');
  }

  const target = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || target.port !== expectedDatabasePort || target.pathname !== `/${expectedDatabaseName}`) {
    throw new Error(`Refusing non-demo database target. Expected a loopback connection to ${expectedDatabaseName} on port ${expectedDatabasePort}.`);
  }
}

async function main() {
  const databaseUrl = requiredEnvironment('DEMO_DATABASE_URL');
  const organizationId = requiredEnvironment('DEMO_ORGANIZATION_ID');
  const actorUserId = requiredEnvironment('DEMO_ACTOR_USER_ID');
  verifyTarget(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  const database = drizzle(pool, { schema: { ...auth, ...schema } });

  try {
    const [organization] = await database.select({ id: auth.organization.id, name: auth.organization.name })
      .from(auth.organization).where(eq(auth.organization.id, organizationId)).limit(1);
    if (!organization || organization.name !== expectedOrganizationName) {
      throw new Error(`The target organization must be exactly "${expectedOrganizationName}".`);
    }

    const [membership] = await database.select({ userId: auth.member.userId })
      .from(auth.member).where(and(eq(auth.member.organizationId, organizationId), eq(auth.member.userId, actorUserId))).limit(1);
    if (!membership) throw new Error('The demo actor must already be a member of the target organization.');

    const markerId = stableUuid('dataset-marker');
    const [existingMarker] = await database.select({ id: schema.auditEvents.id }).from(schema.auditEvents)
      .where(and(eq(schema.auditEvents.organizationId, organizationId), eq(schema.auditEvents.id, markerId))).limit(1);
    if (existingMarker) {
      process.stdout.write(`Demo dataset ${datasetVersion} already exists; no rows were changed.\n`);
      return;
    }

    const industries = ['Educação', 'Tecnologia', 'Saúde', 'Serviços', 'Indústria', 'Logística', 'Varejo', 'Finanças'];
    const companyRoots = ['Horizonte', 'Aurora', 'Ponte', 'Raiz', 'Farol', 'Nexo', 'Serra', 'Caminho', 'Vértice', 'Essencial'];
    const firstNames = ['Ana', 'Bruno', 'Camila', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas'];
    const lastNames = ['Almeida', 'Barbosa', 'Costa', 'Dias', 'Esteves', 'Freitas', 'Gomes', 'Lima', 'Moraes', 'Nunes', 'Oliveira', 'Ribeiro'];
    const leadStatuses: (typeof schema.leadStatus.enumValues)[number][] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact'];
    const leadSources: (typeof schema.leadSource.enumValues)[number][] = ['manual', 'import', 'whatsapp', 'referral'];
    const opportunityStages: (typeof schema.opportunityStage.enumValues)[number][] = ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost'];
    const activityTypes: (typeof schema.activityType.enumValues)[number][] = ['call', 'meeting', 'email', 'message', 'task', 'note', 'research'];
    const pipelineStageNames = ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost'];
    const eventTypes = ['qualified_handoff', 'human_requested', 'buying_intent', 'closer_question', 'lead_replied_after_handoff', 'interpretation_failure'] as const;
    const tagNames = ['Prioridade alta', 'Retorno hoje', 'Proposta enviada', 'Sem resposta', 'Indicação', 'Demonstração'];

    const accounts = Array.from({ length: demoRowCount }, (_, index) => {
      const number = index + 1;
      const name = `${companyRoots[index % companyRoots.length]} ${industries[index % industries.length]} ${String(number).padStart(2, '0')}`;
      return { id: stableUuid(`account:${number}`), organizationId, name, createdAt: daysFromNow(-120 + (index % 90)), updatedAt: daysFromNow(-(index % 20)) };
    });
    const people = Array.from({ length: demoRowCount }, (_, index) => {
      const number = index + 1;
      return {
        id: stableUuid(`person:${number}`), organizationId,
        name: `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`,
        email: `contato.${String(number).padStart(3, '0')}@example.test`,
        phone: `+551198${String(1000000 + number).padStart(7, '0')}`,
        createdAt: accounts[index].createdAt, updatedAt: accounts[index].updatedAt,
      };
    });
    const leads = Array.from({ length: demoRowCount }, (_, index) => {
      const number = index + 1;
      const status = leadStatuses[(index * 5) % leadStatuses.length];
      return {
        id: stableUuid(`lead:${number}`), organizationId, accountId: accounts[index].id, personId: people[index].id,
        createdByUserId: actorUserId, assignedToUserId: index % 7 === 0 ? null : actorUserId,
        source: leadSources[index % leadSources.length], status,
        nextActionAt: index % 9 === 0 ? null : daysFromNow((index % 17) - 8, 9 + index % 8),
        createdAt: accounts[index].createdAt, updatedAt: accounts[index].updatedAt,
      };
    });
    const leadHistory = leads.map((lead, index) => ({
      id: stableUuid(`lead-history:${index + 1}`), organizationId, leadId: lead.id,
      fromStatus: null, toStatus: lead.status, changedByUserId: actorUserId, changedAt: lead.updatedAt,
    }));

    const tasks = Array.from({ length: demoRowCount }, (_, index) => {
      const number = index + 1;
      const status: (typeof schema.taskStatus.enumValues)[number] = index % 11 === 0 ? 'cancelled' : index % 4 === 0 ? 'completed' : 'open';
      const dueAt = daysFromNow((index % 21) - 10, 9 + index % 8);
      const completionResult = status === 'completed' ? (['contacted', 'no_response', 'follow_up', 'completed'] as const)[index % 4] : null;
      return {
        id: stableUuid(`task:${number}`), organizationId, leadId: leads[index].id,
        title: ['Confirmar decisor e orçamento', 'Retomar conversa do WhatsApp', 'Enviar material de apresentação', 'Agendar reunião de descoberta', 'Validar prazo de implantação'][index % 5],
        dueAt, status, createdByUserId: actorUserId, assignedToUserId: actorUserId,
        completedAt: status === 'completed' ? daysFromNow(-((index % 6) + 1), 15) : null,
        completionResult, completionNote: status === 'completed' ? 'Atividade de demonstração concluída.' : null,
        createdAt: daysFromNow(-((index % 30) + 1)), updatedAt: now,
      };
    });

    const opportunities = Array.from({ length: demoConversationCount }, (_, index) => {
      const number = index + 1;
      const stage = opportunityStages[(index * 3) % opportunityStages.length];
      const isClosed = stage === 'won' || stage === 'lost';
      const nextActionAt = isClosed || index % 5 === 0 ? null : daysFromNow((index % 19) - 9, 14);
      return {
        id: stableUuid(`opportunity:${number}`), organizationId, leadId: leads[index].id,
        accountId: accounts[index].id, primaryPersonId: people[index].id,
        name: `${accounts[index].name} · Plano anual`, stage, pipelineStageKey: null,
        ownerUserId: actorUserId, createdByUserId: actorUserId,
        amount: String(5000 + (index * 2137) % 85000), currency: 'BRL',
        closedAt: isClosed ? daysFromNow(-((index % 24) + 1), 17) : null,
        lossReason: stage === 'lost' ? ['Sem prioridade neste trimestre', 'Escolheu outra solução', 'Orçamento suspenso'][index % 3] : null,
        nextAction: nextActionAt ? ['Ligar para o decisor', 'Enviar proposta revisada', 'Confirmar participantes da reunião', 'Retomar após avaliação interna'][index % 4] : null,
        nextActionAt, stageChangedAt: daysFromNow(-(index % 14)), createdAt: accounts[index].createdAt, updatedAt: now,
      };
    });
    const stageHistory = opportunities.flatMap((opportunity, index) => {
      const initial = { id: stableUuid(`opportunity-stage:${index + 1}:1`), organizationId, opportunityId: opportunity.id, fromStage: null, fromPipelineStageKey: null, toStage: 'qualification' as const, toPipelineStageKey: null, actorUserId, reason: 'Registro inicial de demonstração.', occurredAt: opportunity.createdAt };
      if (opportunity.stage === 'qualification') return [initial];
      return [initial, { id: stableUuid(`opportunity-stage:${index + 1}:2`), organizationId, opportunityId: opportunity.id, fromStage: 'qualification' as const, fromPipelineStageKey: null, toStage: opportunity.stage, toPipelineStageKey: null, actorUserId, reason: 'Avanço de etapa de demonstração.', occurredAt: opportunity.stageChangedAt }];
    });
    const activities = opportunities.flatMap((opportunity, index) => [0, 1, 2].map((activityIndex) => ({
      id: stableUuid(`activity:${index + 1}:${activityIndex + 1}`), organizationId, opportunityId: opportunity.id,
      type: activityTypes[(index + activityIndex) % activityTypes.length],
      subject: ['Primeiro contato realizado', 'Necessidade e cenário mapeados', 'Próximo passo combinado'][activityIndex],
      details: `Registro fictício ${String(index + 1).padStart(2, '0')} para visualizar a linha do tempo comercial.`,
      result: activityIndex === 2 ? 'Aguardando retorno do cliente.' : 'Conversa registrada.',
      occurredAt: daysFromNow(-((index % 26) + activityIndex + 1), 11 + activityIndex), createdByUserId: actorUserId,
      createdAt: daysFromNow(-((index % 26) + activityIndex + 1), 11 + activityIndex),
    })));

    const handoffs = opportunities.map((opportunity, index) => {
      const number = index + 1;
      const status: (typeof schema.handoffStatus.enumValues)[number] = index % 10 === 0 ? 'returned' : index % 7 === 0 ? 'cancelled' : index % 3 === 0 ? 'accepted' : 'requested';
      const requestedAt = daysFromNow(-((index % 21) + 1), 10 + index % 7);
      const acceptedAt = status === 'accepted' || status === 'returned' ? new Date(requestedAt.getTime() + (30 + index * 9) * 60_000) : null;
      const returnedAt = status === 'returned' && acceptedAt ? new Date(acceptedAt.getTime() + 2 * 60 * 60_000) : null;
      return {
        id: stableUuid(`handoff:${number}`), organizationId, opportunityId: opportunity.id, status,
        reason: ['Solicitou uma proposta comercial', 'Confirmou interesse em demonstração', 'Pediu conversa com especialista'][index % 3],
        evidence: `Mensagem fictícia do contato ${String(number).padStart(2, '0')} confirmou interesse no próximo passo.`,
        confirmedFacts: ['Contato responsável identificado', 'Prazo de decisão informado'],
        unknowns: ['Critério final de aprovação', 'Número de usuários na primeira etapa'],
        nextStep: ['Agendar conversa de descoberta', 'Enviar proposta inicial', 'Confirmar agenda do decisor'][index % 3],
        nextStepAt: daysFromNow((index % 15) - 5, 14), requestedByUserId: actorUserId,
        requestedByAgent: index % 2 === 0, acceptedByUserId: acceptedAt ? actorUserId : null,
        returnReason: status === 'returned' ? 'Ainda faltam informações para uma conversa produtiva.' : null,
        requestedAt, acceptedAt, returnedAt, createdAt: requestedAt, updatedAt: returnedAt ?? acceptedAt ?? requestedAt,
      };
    });
    const handoffHistory = handoffs.flatMap((handoff, index) => {
      const history: (typeof schema.handoffHistory.$inferInsert)[] = [{ id: stableUuid(`handoff-history:${index + 1}:requested`), organizationId, handoffId: handoff.id, event: 'requested', actorUserId, note: 'Solicitação fictícia criada para demonstração.', occurredAt: handoff.requestedAt }];
      if (handoff.acceptedAt) history.push({ id: stableUuid(`handoff-history:${index + 1}:accepted`), organizationId, handoffId: handoff.id, event: 'accepted' as const, actorUserId, note: 'Passagem aceita para demonstração.', occurredAt: handoff.acceptedAt });
      if (handoff.returnedAt) history.push({ id: stableUuid(`handoff-history:${index + 1}:returned`), organizationId, handoffId: handoff.id, event: 'returned' as const, actorUserId, note: handoff.returnReason, occurredAt: handoff.returnedAt });
      return history;
    });

    const channelId = stableUuid('messaging-channel');
    const existingChannel = await database.select({ id: schema.messagingChannels.id }).from(schema.messagingChannels)
      .where(and(eq(schema.messagingChannels.organizationId, organizationId), eq(schema.messagingChannels.providerChannelId, 'demo-ux-channel-v1'))).limit(1);
    const effectiveChannelId = existingChannel[0]?.id ?? channelId;
    const channelRows = existingChannel.length ? [] : [{
      id: effectiveChannelId, organizationId, provider: 'evolution', displayName: 'Canal fictício de demonstração',
      phoneNumber: '+5511999900001', providerChannelId: 'demo-ux-channel-v1', providerAccountId: 'local-demo-only',
      credentialsCiphertext: null, credentialsIv: null, credentialsAuthTag: null, isActive: false,
      createdAt: now, updatedAt: now,
    }];
    const conversations = Array.from({ length: demoConversationCount }, (_, index) => {
      const number = index + 1;
      const status: (typeof schema.conversationStatus.enumValues)[number] = index % 9 === 0 ? 'resolved' : index % 6 === 0 ? 'snoozed' : index % 4 === 0 ? 'pending' : 'open';
      const automationMode = (['assistant', 'human', 'paused'] as const)[index % 3];
      const lastMessageAt = daysFromNow(-((index % 8) + 1), 8 + index % 10);
      const hasLatestInbound = status !== 'resolved' && index % 3 !== 0;
      const finalMessageAt = hasLatestInbound ? lastMessageAt : new Date(lastMessageAt.getTime() - 10 * 60_000);
      return {
        id: stableUuid(`conversation:${number}`), organizationId, provider: 'evolution',
        externalConversationId: `demo-thread-${String(number).padStart(3, '0')}`, channelId: effectiveChannelId,
        accountId: accounts[index].id, personId: people[index].id, opportunityId: opportunities[index].id,
        status, ownerUserId: index % 8 === 0 ? null : actorUserId, automationMode,
        assistantQualificationIntent: index % 3 === 0 ? ['qualification', 'information_request', 'meeting_request', 'proposal_request'][index % 4] : null,
        assistantQualificationSummary: index % 3 === 0 ? 'Busca reduzir o tempo de atendimento e organizar o acompanhamento comercial.' : null,
        assistantConfirmedFacts: index % 3 === 0 ? ['Equipe com 12 pessoas', 'Avalia implantação neste trimestre'] : [],
        assistantUnknowns: index % 3 === 0 ? ['Orçamento aprovado', 'Data de decisão'] : [],
        assistantNextStep: index % 3 === 0 ? 'Confirmar participantes e sugerir dois horários para demonstração.' : null,
        assistantQualificationUpdatedAt: index % 3 === 0 ? finalMessageAt : null,
        lastMessageAt: finalMessageAt, createdAt: daysFromNow(-((index % 18) + 2)), updatedAt: finalMessageAt,
      };
    });
    const messageRows = conversations.flatMap((conversation, index) => {
      const count = conversation.status === 'resolved' || index % 3 === 0 ? 4 : 5;
      const messages = [
        { direction: 'inbound' as const, actorType: 'contact' as const, text: 'Olá! Gostaria de entender como funciona a solução para minha equipe.' },
        { direction: 'outbound' as const, actorType: 'assistant' as const, text: 'Olá! Posso ajudar. Hoje, como vocês organizam os contatos e os próximos passos?' },
        { direction: 'inbound' as const, actorType: 'contact' as const, text: 'Hoje usamos planilhas e queremos acompanhar as oportunidades em um só lugar.' },
        { direction: 'outbound' as const, actorType: 'user' as const, text: 'Entendi. Podemos mapear o processo e mostrar um fluxo adequado para o time.' },
        { direction: 'inbound' as const, actorType: 'contact' as const, text: 'Perfeito. Pode me enviar opções de horário para uma demonstração?' },
      ].slice(0, count);
      return messages.map((message, messageIndex) => ({
        id: stableUuid(`message:${index + 1}:${messageIndex + 1}`), organizationId, conversationId: conversation.id,
        externalMessageId: `demo-message-${String(index + 1).padStart(3, '0')}-${messageIndex + 1}`,
        direction: message.direction, actorType: message.actorType, actorUserId: message.actorType === 'user' ? actorUserId : null,
        bodyText: message.text, deliveryState: message.direction === 'inbound' ? 'received' as const : message.actorType === 'assistant' ? 'delivered' as const : 'read' as const,
        idempotencyKey: null, occurredAt: new Date(conversation.lastMessageAt!.getTime() - (count - messageIndex - 1) * 8 * 60_000),
        createdAt: new Date(conversation.lastMessageAt!.getTime() - (count - messageIndex - 1) * 8 * 60_000),
      }));
    });
    const lastInboundMessageByConversation = new Map<string, typeof messageRows[number]>();
    for (const message of messageRows) if (message.direction === 'inbound') lastInboundMessageByConversation.set(message.conversationId, message);

    const tagRows = tagNames.map((name, index) => ({ id: stableUuid(`conversation-tag:${index + 1}`), organizationId, name, normalizedName: name.toLocaleLowerCase('en-US'), createdByUserId: actorUserId, createdAt: now }));
    const conversationReads = conversations.filter((_, index) => index % 2 === 0).map((conversation) => ({
      id: stableUuid(`conversation-read:${conversation.id}`), organizationId, conversationId: conversation.id,
      userId: actorUserId, lastReadAt: now, createdAt: now, updatedAt: now,
    }));

    const handoffByOpportunity = new Map(handoffs.map((handoff) => [handoff.opportunityId, handoff]));
    const closerEvents = conversations.map((conversation, index) => {
      const number = index + 1;
      const eventType = eventTypes[index % eventTypes.length];
      const status: 'new' | 'acknowledged' | 'snoozed' | 'resolved' = index % 13 === 0 ? 'resolved' : index % 7 === 0 ? 'snoozed' : index % 4 === 0 ? 'acknowledged' : 'new';
      const occurredAt = daysFromNow(-(index % 9), 9 + index % 8);
      const dueAt = daysFromNow(index % 3 === 0 ? 2 : -((index % 5) + 1), 12);
      return {
        id: stableUuid(`closer-event:${number}`), organizationId, eventType,
        priority: index % 8 === 0 ? 'urgent' : index % 3 === 0 ? 'high' : 'normal', status,
        idempotencyKey: `demo:${datasetVersion}:closer-event:${number}`,
        conversationId: conversation.id, opportunityId: conversation.opportunityId!,
        sourceMessageId: lastInboundMessageByConversation.get(conversation.id)!.id,
        assignedToUserId: actorUserId,
        summary: eventType === 'buying_intent' ? 'O contato pediu próximos passos para avançar.' : 'Conversa requer acompanhamento do closer.',
        evidence: 'Registro sintético para demonstrar prioridades e prazos.', occurredAt, dueAt,
        slaNotifiedAt: dueAt < now ? new Date(dueAt.getTime() + 5 * 60_000) : null,
        slaEscalateToManagers: false,
        acknowledgedAt: status === 'acknowledged' ? new Date(occurredAt.getTime() + 5 * 60_000) : null,
        snoozedUntil: status === 'snoozed' ? daysFromNow(1, 10) : null,
        resolvedAt: status === 'resolved' ? new Date(occurredAt.getTime() + 60 * 60_000) : null,
        createdAt: occurredAt, updatedAt: now,
      };
    });
    const notificationTypes = ['closer_event_sla_overdue', 'closer_event_sla_escalated', 'inbox_new_message', 'task_overdue', 'handoff_accepted', 'handoff_returned', 'conversation_assigned', 'opportunity_assigned'] as const;
    const notifications = Array.from({ length: 60 }, (_, index) => {
      const notificationType = notificationTypes[index % notificationTypes.length];
      const conversation = conversations[index % conversations.length];
      const task = tasks[index % tasks.length];
      const opportunity = opportunities[index % opportunities.length];
      const handoff = handoffByOpportunity.get(opportunity.id)!;
      const closerEvent = closerEvents[index % closerEvents.length];
      return {
        id: stableUuid(`notification:${index + 1}`), organizationId, recipientUserId: actorUserId,
        closerEventId: notificationType === 'closer_event_sla_overdue' || notificationType === 'closer_event_sla_escalated' ? closerEvent.id : null,
        conversationId: notificationType === 'inbox_new_message' || notificationType === 'conversation_assigned' ? conversation.id : null,
        taskId: notificationType === 'task_overdue' ? task.id : null,
        handoffId: notificationType === 'handoff_accepted' || notificationType === 'handoff_returned' ? handoff.id : null,
        opportunityId: notificationType === 'opportunity_assigned' ? opportunity.id : null,
        notificationType, idempotencyKey: `demo:${datasetVersion}:notification:${index + 1}`,
        readAt: index % 4 === 0 ? daysFromNow(-1) : null, createdAt: daysFromNow(-((index % 12) + 1), 16),
      };
    });
    const auditEvents = Array.from({ length: demoRowCount }, (_, index) => {
      const entityIndex = index % demoRowCount;
      const entityType = (['lead', 'opportunity', 'task', 'handoff', 'conversation'] as const)[index % 5];
      const entityId = entityType === 'lead' ? leads[entityIndex].id
        : entityType === 'opportunity' ? opportunities[entityIndex % opportunities.length].id
          : entityType === 'task' ? tasks[entityIndex].id
            : entityType === 'handoff' ? handoffs[entityIndex % handoffs.length].id
              : conversations[entityIndex % conversations.length].id;
      return {
        id: stableUuid(`audit-event:${index + 1}`), organizationId, actorUserId, actorType: 'user',
        action: `${entityType}.demo_record_created`, entityType, entityId,
        reason: 'Carga fictícia para inspeção visual do produto.',
        beforeState: null, afterState: { dataset: datasetVersion, record: index + 1 },
        correlationId: `${datasetVersion}-${String(index + 1).padStart(3, '0')}`,
        occurredAt: daysFromNow(-((index % 30) + 1), 10 + index % 8),
      };
    });
    const slaPolicies = eventTypes.map((eventType, index) => ({
      organizationId, eventType, targetMinutes: [30, 15, 60, 120, 90, 45][index],
      escalateToManagers: false, updatedByUserId: actorUserId, createdAt: now, updatedAt: now,
    }));
    const stages = pipelineStageNames.map((key, position) => ({ organizationId, key, name: null, position, isSystem: true, isActive: true, createdByUserId: actorUserId, createdAt: now, updatedAt: now }));
    const policyId = stableUuid('assistant-settings');
    const marker = {
      id: markerId, organizationId, actorUserId, actorType: 'system', action: 'demo.dataset_seeded',
      entityType: 'demo_dataset', entityId: null, reason: datasetVersion,
      beforeState: null,
      afterState: {
        accounts: accounts.length, people: people.length, leads: leads.length, tasks: tasks.length,
        opportunities: opportunities.length, activities: activities.length, handoffs: handoffs.length,
        conversations: conversations.length, messages: messageRows.length, closerEvents: closerEvents.length,
        notifications: notifications.length, auditEvents: auditEvents.length,
      },
      correlationId: datasetVersion, occurredAt: now,
    };

    await database.transaction(async (transaction) => {
      await transaction.insert(schema.pipelineStages).values(stages).onConflictDoNothing();
      await transaction.insert(schema.accounts).values(accounts).onConflictDoNothing();
      await transaction.insert(schema.people).values(people).onConflictDoNothing();
      await transaction.insert(schema.leads).values(leads).onConflictDoNothing();
      await transaction.insert(schema.leadStatusHistory).values(leadHistory).onConflictDoNothing();
      await transaction.insert(schema.tasks).values(tasks).onConflictDoNothing();
      await transaction.insert(schema.opportunities).values(opportunities).onConflictDoNothing();
      await transaction.insert(schema.opportunityStageHistory).values(stageHistory).onConflictDoNothing();
      await transaction.insert(schema.activities).values(activities).onConflictDoNothing();
      await transaction.insert(schema.handoffs).values(handoffs).onConflictDoNothing();
      await transaction.insert(schema.handoffHistory).values(handoffHistory).onConflictDoNothing();
      if (channelRows.length) await transaction.insert(schema.messagingChannels).values(channelRows).onConflictDoNothing();
      await transaction.insert(schema.conversations).values(conversations).onConflictDoNothing();
      await transaction.insert(schema.messages).values(messageRows).onConflictDoNothing();
      await transaction.insert(schema.conversationTags).values(tagRows).onConflictDoNothing();
      const savedTags = await transaction.select({ id: schema.conversationTags.id, normalizedName: schema.conversationTags.normalizedName })
        .from(schema.conversationTags).where(and(eq(schema.conversationTags.organizationId, organizationId), inArray(schema.conversationTags.normalizedName, tagRows.map((tag) => tag.normalizedName))));
      const tagIds = new Map(savedTags.map((tag) => [tag.normalizedName, tag.id]));
      const tagLinks = conversations.flatMap((conversation, index) => [0, 1].map((tagOffset) => {
        const tag = tagRows[(index + tagOffset * 3) % tagRows.length];
        return { id: stableUuid(`conversation-tag-link:${index + 1}:${tagOffset + 1}`), organizationId, conversationId: conversation.id, tagId: tagIds.get(tag.normalizedName)!, createdByUserId: actorUserId, createdAt: now };
      }));
      await transaction.insert(schema.conversationTagLinks).values(tagLinks).onConflictDoNothing();
      await transaction.insert(schema.conversationReads).values(conversationReads).onConflictDoNothing();
      await transaction.insert(schema.closerEvents).values(closerEvents).onConflictDoNothing();
      await transaction.insert(schema.closerEventSlaPolicies).values(slaPolicies).onConflictDoNothing();
      await transaction.insert(schema.userNotifications).values(notifications).onConflictDoNothing();
      await transaction.insert(schema.auditEvents).values(auditEvents).onConflictDoNothing();
      await transaction.insert(schema.agentSettings).values({
        id: policyId, organizationId, agentKey: 'assistant', enabled: false,
        model: 'claude-haiku-5-5', systemPrompt: 'Configuração fictícia desativada para demonstração. Nenhuma mensagem será enviada.',
        updatedByUserId: actorUserId, createdAt: now, updatedAt: now,
      }).onConflictDoNothing();
      await transaction.insert(schema.auditEvents).values(marker).onConflictDoNothing();
    });

    process.stdout.write(`Loaded ${datasetVersion} into the isolated UX demo organization.\n`);
    process.stdout.write(`Accounts ${accounts.length}; people ${people.length}; leads ${leads.length}; tasks ${tasks.length}; opportunities ${opportunities.length}; activities ${activities.length}; handoffs ${handoffs.length}; conversations ${conversations.length}; messages ${messageRows.length}; closer events ${closerEvents.length}; notifications ${notifications.length}; audit events ${auditEvents.length}.\n`);
    process.stdout.write('Channel is inactive with no credentials; the seed cannot send external messages.\n');
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined;
  const databaseMessage = cause instanceof Error ? `\nDatabase: ${cause.message}` : '';
  process.stderr.write(`${databaseMessage || (error instanceof Error ? error.message : 'Demo seed failed.')}\n`);
  process.exitCode = 1;
});
