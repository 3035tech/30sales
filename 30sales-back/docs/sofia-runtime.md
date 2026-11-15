# Sofia runtime inside 30Sales

Sofia is a first-party 30Sales capability. Chatwoot, Twenty CRM, and n8n are not part of the target runtime. Evolution API and WhatsApp Business Cloud API remain channel providers only.

## Inbound message event

`WebhooksRepository.recordIncomingMessage` persists the provider event, conversation, contact message, and `agent.inbound_message_received` outbox event in one database transaction. The idempotency key is based on the internal message UUID, so provider retries do not create duplicate Sofia work.

Each organization can configure Sofia's enabled state and system prompt through the authenticated agent settings API and workspace screen. Settings are stored under the organization ID, audited without copying prompt text into the audit log, and default to disabled. The model is currently fixed to Claude Haiku 5.5 (`claude-haiku-5-5`). Set `ANTHROPIC_API_KEY` on the backend and restart it to enable the runtime; the setting API refuses to enable Sofia without the key.

The event includes the tenant, channel, conversation, and internal message UUIDs plus the provider's exact external conversation/message IDs, message type, and occurrence time. Message text stays in the tenant-scoped messages table; the queue payload contains no duplicate message body. Sofia work must always resolve the conversation and message by their internal IDs and organization ID; phone or text similarity is not a supported correlation mechanism.

The event is consumed by the in-process 30Sales Sofia runtime. Before generating or sending a reply, the worker re-reads the conversation and proceeds only when `automationMode` is `sofia`, the channel is active, and the event still refers to the latest inbound message. Human ownership and paused mode suppress automated replies.

## Delivery and reply contract

- The outbox row is committed atomically with the inbound message.
- The worker claims rows safely across multiple backend instances and retries transient failures idempotently.
- AI calls happen outside the message-ingest transaction. Provider sends are serialized against conversation ownership changes so a closer cannot take over during an automated send.
- The AI result is forced through a typed tool schema and validated before any CRM or messaging effects are applied.
- Sending goes through the existing channel provider service. The resulting provider message ID must be stored against the same 30Sales conversation.
- Changes to `sofia`, `human`, or `paused` mode must be checked immediately before send to avoid replying after a closer takes over.
- Provider and model failures must remain visible as conversation events for a human operator; they must not silently mark a lead as handled.

## Inbox real-time updates

The authenticated inbox SSE endpoint streams tenant-scoped conversation update identifiers. PostgreSQL `NOTIFY` is issued in the same transaction as inbound message persistence and inbox ownership, mode, note, and delivery changes, so each backend instance listening on the shared database receives committed updates. The stream sends no message body; the browser reloads authorized conversation data through the existing inbox API. A `ready` event makes the client refresh after initial connection and automatic EventSource reconnection. Heartbeats keep long-lived connections active through common proxies.

Conversation owners can resolve a thread or reopen a resolved thread from the inbox. Status changes require current ownership, are tenant-scoped, audited, and broadcast over the same SSE stream. A new inbound message automatically reopens the conversation.

## Qualification and closer handoff

For each text turn, Sofia returns a customer reply plus an intent, internal summary, confirmed facts, open questions, and next step. The qualification snapshot is stored on the tenant-scoped conversation and shown in the inbox. Questions and general qualification do not create a closer handoff. An explicit meeting/demo or proposal request creates a qualified handoff; an explicit request to speak with a person creates an urgent human handoff that may have open qualification questions.

When a handoff intent is returned for a conversation linked to an eligible lead, the same database transaction creates or reuses the opportunity, writes the handoff dossier, moves the lead to `converted_to_sdr`, pauses Sofia, and creates a closer event. A human request receives urgent priority and is recorded as `closer_contact_pending` when Sofia creates the opportunity; it does not imply a meeting or completed qualification. The event is assigned to the opportunity's existing closer when possible, otherwise to the eligible closer with the smallest active event load. The handoff is labeled as prepared by Sofia. Its next action is due 24 hours after the handoff; that due time is operational follow-up and is not represented as a meeting time. Accepting the handoff assigns the conversation to the closer, resolves its matching queue event, and the closer's central queue opens that conversation directly when one is linked. Accepted handoffs owned by the current closer remain in the queue until a first customer-facing activity is recorded; this includes manually logged calls/meetings/emails/messages and outbound inbox messages whose provider confirms acceptance. The elapsed time is shown without inventing an SLA threshold.

If no lead is linked, Sofia still saves the qualification snapshot, but no opportunity or handoff is created. The closer handoff requires migration `0024_harsh_dark_beast.sql` in addition to the Sofia settings migrations `0022` and `0023`.

## Current boundary

Sofia consumes inbound outbox events within 30Sales. It only responds when the tenant setting is enabled, the conversation is in `sofia` mode, the channel is active, and no human owns the conversation. The final mode and latest-message check is performed while locking the conversation row; a closer taking ownership waits for an in-flight send and prevents later automated replies. Model failures retry with backoff, then create an internal review note. Non-text messages pause automation for that conversation and create an internal notice for a teammate to review; audio transcription remains future work. The inbox SSE stream publishes conversation updates without exposing message bodies.

When model refusal or invalid structured output is classified as a permanent failure, the worker also records the existing tenant-scoped interpretation-failure signal using the provider's external message identifiers. The repository correlates those identifiers to the stored inbound message and applies the same idempotent urgent closer event path as authenticated channel signals. Transient model errors continue through bounded retries and do not escalate early. If no eligible owned opportunity exists, the signal remains unroutable while the internal review note is still recorded.

The agent-settings table migration is additive; rollback is `DROP TABLE agent_settings` after disabling any consumer that may read it. To roll back migration 0024 after reverting application code, drop the six added conversation columns and `handoffs.requested_by_agent`. To roll back migration 0023 after first rolling back application code, drop `agent_settings_model_check`, update model values from `claude-haiku-5-5` to `claude-haiku-4-5-20251001`, restore that default, then restore the 4.5 model check.
