# Sofia runtime inside 30Sales

Sofia is a first-party 30Sales capability. Chatwoot, Twenty CRM, and n8n are not part of the target runtime. Evolution API and WhatsApp Business Cloud API remain channel providers only.

## Inbound message event

`WebhooksRepository.recordIncomingMessage` persists the provider event, conversation, contact message, and `agent.inbound_message_received` outbox event in one database transaction. The idempotency key is based on the internal message UUID, so provider retries do not create duplicate Sofia work.

Each organization can configure Sofia's enabled state and system prompt through the authenticated agent settings API and workspace screen. Settings are stored under the organization ID, audited without copying prompt text into the audit log, and default to disabled. The model is currently fixed to Claude Haiku 5.5 (`claude-haiku-5-5`). Enabling the setting does not activate automated replies yet; the queue consumer remains a separate implementation step.

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

## Inbox real-time updates

The authenticated inbox SSE endpoint streams tenant-scoped conversation update identifiers. PostgreSQL `NOTIFY` is issued in the same transaction as inbound message persistence and inbox ownership, mode, note, and delivery changes, so each backend instance listening on the shared database receives committed updates. The stream sends no message body; the browser reloads authorized conversation data through the existing inbox API. A `ready` event makes the client refresh after initial connection and automatic EventSource reconnection. Heartbeats keep long-lived connections active through common proxies.

## Current boundary

The internal runtime queue still has no consumer. This implementation does not call an external orchestration service, model, CRM, or support inbox, and it does not send an automated Sofia reply yet. The SSE stream currently publishes provider-ingested inbound message updates; other conversation mutations will be added as they are moved onto the internal event flow. The agent-settings table migration is additive; rollback is `DROP TABLE agent_settings` after disabling any consumer that may read it. To roll back migration 0023 after first rolling back application code, drop `agent_settings_model_check`, update model values from `claude-haiku-5-5` to `claude-haiku-4-5-20251001`, restore that default, then restore the 4.5 model check.
