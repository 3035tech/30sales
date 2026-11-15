# Sofia runtime inside 30Sales

Sofia is a first-party 30Sales capability. Chatwoot, Twenty CRM, and n8n are not part of the target runtime. Evolution API and WhatsApp Business Cloud API remain channel providers only.

## Inbound message event

`WebhooksRepository.recordIncomingMessage` persists the provider event, conversation, contact message, and `agent.inbound_message_received` outbox event in one database transaction. The idempotency key is based on the internal message UUID, so provider retries do not create duplicate Sofia work.

The event includes the tenant, channel, conversation, and internal message UUIDs plus the provider's exact external conversation/message IDs, message type, normalized body, and occurrence time. Sofia work must always resolve the conversation and message by their internal IDs and organization ID; phone or text similarity is not a supported correlation mechanism.

The event is a durable handoff point for the in-process 30Sales Sofia runtime. It is not yet consumed: runtime configuration, prompt management, an AI provider client, queue claiming/retries, and reply generation are still required. Before generating or sending a reply, the consumer must re-read the conversation and proceed only when `automationMode` is `sofia`, the channel is active, and the event has not already been handled. Human ownership and paused mode must suppress automated replies.

## Delivery and reply contract

- The outbox row is committed atomically with the inbound message.
- A future worker must claim rows safely across multiple backend instances and retry transient failures idempotently.
- AI calls and provider sends must happen outside the message-ingest transaction.
- The AI result must be structured (reply text, intent/action, lead updates, and escalation reason) and validated before effects are applied.
- Sending goes through the existing channel provider service. The resulting provider message ID must be stored against the same 30Sales conversation.
- Changes to `sofia`, `human`, or `paused` mode must be checked immediately before send to avoid replying after a closer takes over.
- Provider and model failures must remain visible as conversation events for a human operator; they must not silently mark a lead as handled.

## Current boundary

This change creates the transactional inbound event only. It does not call an external orchestration service, model, CRM, or support inbox, and it does not send an automated reply yet.
