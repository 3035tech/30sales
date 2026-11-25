import { and, asc, eq, sql } from 'drizzle-orm';
import { database } from '../db';
import { inboxEvents, messageDeliveryState } from '../db/schema';
import { PROVIDER_EVENT_FAMILY, PROVIDER_MESSAGE_DELIVERY_STATE, PROVIDER_MESSAGE_STATUS_EVENT, WEBHOOK_EVENT_PROCESSING_STATE } from './provider-webhook-events.constants';

type WebhooksTransaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
type DeliveryState = (typeof messageDeliveryState.enumValues)[number];

export async function applyPendingEvolutionMessageStatuses(
  transaction: WebhooksTransaction,
  input: { organizationId: string; channelId: string; messageId: string; externalMessageId: string; currentState: DeliveryState },
): Promise<DeliveryState> {
  const events = await transaction.select({ id: inboxEvents.id, payloadRedacted: inboxEvents.payloadRedacted })
    .from(inboxEvents)
    .where(and(
      eq(inboxEvents.organizationId, input.organizationId),
      eq(inboxEvents.provider, 'evolution'),
      eq(inboxEvents.eventType, PROVIDER_MESSAGE_STATUS_EVENT.unmatched),
      sql`${inboxEvents.payloadRedacted}->>'channelId' = ${input.channelId}`,
      sql`${inboxEvents.payloadRedacted}->>'externalMessageId' = ${input.externalMessageId}`,
    ))
    .orderBy(asc(inboxEvents.receivedAt))
    .for('update');

  let state: DeliveryState = input.currentState;
  for (const event of events) {
    const payload = event.payloadRedacted;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('deliveryState' in payload)) continue;
    const incoming = payload.deliveryState;
    if (incoming !== PROVIDER_MESSAGE_DELIVERY_STATE.accepted && incoming !== PROVIDER_MESSAGE_DELIVERY_STATE.delivered && incoming !== PROVIDER_MESSAGE_DELIVERY_STATE.read && incoming !== PROVIDER_MESSAGE_DELIVERY_STATE.failed) continue;
    state = nextDeliveryState(state, incoming) ?? state;
    const correlationId = 'correlationId' in payload && typeof payload.correlationId === 'string' ? payload.correlationId : null;
    await transaction.update(inboxEvents).set({
      eventType: PROVIDER_MESSAGE_STATUS_EVENT.matched,
      status: WEBHOOK_EVENT_PROCESSING_STATE.processed,
      processedAt: new Date(),
      lastErrorCode: null,
      payloadRedacted: { channelId: input.channelId, eventFamily: PROVIDER_EVENT_FAMILY.message, messageId: input.messageId, deliveryState: incoming, ...(correlationId ? { correlationId } : {}) },
    }).where(and(eq(inboxEvents.id, event.id), eq(inboxEvents.organizationId, input.organizationId)));
  }
  return state;
}

function nextDeliveryState(current: string, incoming: DeliveryState): DeliveryState | null {
  if (current === incoming || current === 'read' || current === 'failed') return null;
  if (incoming === 'failed') return current === 'requested' || current === 'accepted' || current === 'unknown' ? 'failed' : null;
  const rank: Record<string, number> = { requested: 0, unknown: 0, accepted: 1, delivered: 2, read: 3 };
  return (rank[incoming] ?? -1) > (rank[current] ?? -1) ? incoming : null;
}
