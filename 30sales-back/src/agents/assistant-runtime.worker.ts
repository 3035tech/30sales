import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../config/env';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { ChannelMessagingAdapterRegistry } from '../inbox/channel-messaging-adapter.registry';
import { AssistantLanguageModelService, AssistantRuntimeModelError } from './assistant-language-model.service';
import { AssistantRuntimeRepository } from './assistant-runtime.repository';
import { assistantInboundEventSchema, type AssistantQueueEventDto } from './assistant-runtime.dto';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AssistantAudioTranscriptionService } from './assistant-audio-transcription.service';
import { ASSISTANT_RUN_OPERATIONS, ASSISTANT_TRANSCRIPTION_MODEL, estimateAssistantTranscriptionCostUsd } from './assistant-runtime.constants';
import { isWithinBusinessHours } from '../channels/channel-assistant-schedule';

const AFTER_HOURS_ASSISTANT_GUIDANCE = [
  'The regular service schedule is closed or a date-specific availability exception is active.',
  'Continue answering from the organization instructions when you can do so confidently.',
  'If a person needs to follow up or the customer asks for a person, say the team will respond during the next service period.',
  'Do not claim a teammate is available now or promise an exact response time unless the organization instructions explicitly provide one.',
].join(' ');

@Injectable()
export class AssistantRuntimeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistantRuntimeWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: AssistantRuntimeRepository, private readonly model: AssistantLanguageModelService, private readonly transcription: AssistantAudioTranscriptionService, private readonly credentialResolver: ChannelCredentialResolverService, private readonly messagingAdapters: ChannelMessagingAdapterRegistry, private readonly webhooks: WebhooksService) {}

  onModuleInit(): void {
    if (!env.ANTHROPIC_API_KEY) {
      this.logger.warn('Assistant runtime is disabled because ANTHROPIC_API_KEY is not configured.');
      return;
    }
    this.timer = setInterval(() => { void this.processNext() }, 1000);
    this.timer.unref();
    void this.processNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async processNext(): Promise<void> {
    if (this.processing || !env.ANTHROPIC_API_KEY) return;
    this.processing = true;
    let queueEvent: AssistantQueueEventDto | null = null;
    let assistantRunId: string | null = null;
    let modelStartedAt: number | null = null;
    let assistantModelCompleted = false;
    try {
      queueEvent = await this.repository.claimNextEvent();
      if (!queueEvent) return;
      const context = await this.repository.loadContext(queueEvent);
      if (!context || !context.enabled || context.automationMode !== 'assistant' || context.ownerUserId || !context.systemPrompt.trim()) {
        await this.repository.completeEvent(queueEvent);
        return;
      }
      const messageType = context.event.messageType.toLowerCase();
      if (messageType === 'audio') {
        if (!context.transcribeAudio) {
          await this.repository.escalateUnsupportedMessage(queueEvent, context.event);
          return;
        }
        if (!context.audioAttachment || ['pending', 'processing'].includes(context.audioAttachment.status)) {
          if (context.audioAttachment) await this.repository.deferEvent(queueEvent);
          else await this.repository.escalateUnsupportedMessage(queueEvent, context.event);
          return;
        }
        if (context.audioAttachment.status !== 'available' || !context.audioAttachment.storageKey) {
          await this.repository.escalateUnsupportedMessage(queueEvent, context.event);
          return;
        }
        let transcript = context.audioTranscript;
        if (!transcript) {
          assistantRunId = await this.repository.startAssistantRun({
            organizationId: context.event.organizationId,
            conversationId: context.event.conversationId,
            inboundMessageId: context.event.messageId,
            queueEventId: queueEvent.id,
            attempt: queueEvent.attempts,
            modelKey: ASSISTANT_TRANSCRIPTION_MODEL,
            operation: ASSISTANT_RUN_OPERATIONS.audioTranscription,
          });
          modelStartedAt = Date.now();
          const transcription = await this.transcription.transcribe({ organizationId: context.event.organizationId, attachmentId: context.audioAttachment.id, storageKey: context.audioAttachment.storageKey, mimeType: context.audioAttachment.mimeType, fileName: context.audioAttachment.fileName });
          transcript = transcription.text;
          await this.repository.completeAssistantTranscriptionRun({
            organizationId: context.event.organizationId,
            runId: assistantRunId,
            durationSeconds: transcription.durationSeconds,
            audioSizeBytes: transcription.audioSizeBytes,
            latencyMs: transcription.latencyMs,
            estimatedCostUsd: transcription.durationSeconds === null ? null : estimateAssistantTranscriptionCostUsd(transcription.durationSeconds),
          });
          assistantRunId = null;
          modelStartedAt = null;
        }
        if (!context.audioTranscript) await this.repository.saveTranscript(context.event.organizationId, context.event.messageId, transcript);
        const audioContent = [context.event.bodyText, transcript].filter(Boolean).join('\n');
        const lastMessage = context.messages.at(-1);
        if (lastMessage?.role === 'user' && lastMessage.content.includes(transcript)) {
          if (context.event.bodyText && !lastMessage.content.includes(context.event.bodyText)) lastMessage.content = `${lastMessage.content}\n${context.event.bodyText}`;
        } else if (lastMessage?.role === 'user') lastMessage.content = [lastMessage.content, audioContent].filter(Boolean).join('\n');
        else context.messages.push({ role: 'user', content: audioContent });
      } else if (messageType !== 'text') {
        await this.repository.escalateUnsupportedMessage(queueEvent, context.event);
        return;
      }
      if (!context.recipientPhone) {
        await this.repository.completeEvent(queueEvent);
        return;
      }
      if (context.messages.at(-1)?.role !== 'user') {
        await this.repository.escalateUnsupportedMessage(queueEvent, context.event);
        return;
      }
      const afterHours = context.hasScheduleException || !isWithinBusinessHours({ timeZone: context.timeZone, businessHours: context.businessHours });
      const systemPrompt = afterHours ? `${context.systemPrompt}\n\n${AFTER_HOURS_ASSISTANT_GUIDANCE}` : context.systemPrompt;
      assistantRunId = await this.repository.startAssistantRun({
        organizationId: context.event.organizationId,
        conversationId: context.event.conversationId,
        inboundMessageId: context.event.messageId,
        queueEventId: queueEvent.id,
        attempt: queueEvent.attempts,
        modelKey: context.model,
        promptHash: this.model.promptFingerprint(systemPrompt),
      });
      modelStartedAt = Date.now();
      const execution = await this.model.generateReply({ model: context.model, systemPrompt, messages: context.messages });
      await this.repository.completeAssistantRun({
        organizationId: context.event.organizationId,
        runId: assistantRunId,
        intent: execution.result.intent,
        usageInputTokens: execution.usageInputTokens,
        usageOutputTokens: execution.usageOutputTokens,
        latencyMs: execution.latencyMs,
        stopReason: execution.stopReason,
      });
      assistantModelCompleted = true;
      const delivery = await this.repository.sendIfStillAutomated({
        queueEventId: queueEvent.id,
        context,
        result: execution.result,
        send: async (channel) => {
          const credentials = await this.credentialResolver.resolve(context.event.organizationId, channel.channelId, channel.credentials);
          return this.messagingAdapters.sendText({ providerChannelId: channel.providerChannelId, recipientPhone: channel.recipientPhone, bodyText: execution.result.replyText, credentials, targetMessage: null, mode: 'reply' });
        },
      });
      await this.repository.completeAssistantRunDelivery({
        organizationId: context.event.organizationId,
        runId: assistantRunId,
        outboundMessageId: delivery.skipped ? null : delivery.outboundMessageId,
        deliveryState: delivery.skipped ? null : delivery.deliveryState,
        skipped: delivery.skipped,
      });
      await this.repository.completeEvent(queueEvent);
    } catch (error) {
      if (!queueEvent) {
        this.logger.error(`Assistant queue polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        return;
      }
      const code = error instanceof AssistantRuntimeModelError ? error.code : 'ASSISTANT_RUNTIME_PROCESSING_FAILED';
      const retryable = error instanceof AssistantRuntimeModelError ? error.retryable : true;
      try {
        if (assistantRunId) await this.repository.failAssistantRun({
          organizationId: queueEvent.organizationId,
          runId: assistantRunId,
          errorCode: code,
          latencyMs: assistantModelCompleted || modelStartedAt === null ? null : Math.max(0, Date.now() - modelStartedAt),
          modelCompleted: assistantModelCompleted,
        });
        const terminal = !retryable || queueEvent.attempts >= 5;
        if (terminal && error instanceof AssistantRuntimeModelError && ['ASSISTANT_MODEL_RESPONSE_INVALID', 'ASSISTANT_MODEL_REFUSED'].includes(error.code)) {
          const parsedEvent = assistantInboundEventSchema.safeParse(queueEvent.payload);
          const payload = parsedEvent.success && parsedEvent.data.organizationId === queueEvent.organizationId ? parsedEvent.data : null;
          if (payload) await this.webhooks.recordRuntimeInterpretationFailure({
            organizationId: payload.organizationId,
            channelId: payload.channelId,
            provider: payload.provider,
            externalConversationId: payload.externalConversationId,
            externalMessageId: payload.externalMessageId,
            reason: `Assistant could not interpret this message (${code}).`,
          });
        }
        const failed = await this.repository.retryOrFail(queueEvent, code, retryable);
        const modelDiagnostics = error instanceof AssistantRuntimeModelError ? error.diagnostics : null;
        this.logger.error(JSON.stringify({
          event: 'assistant_runtime_failure',
          outcome: failed ? 'review_required' : 'retry_scheduled',
          eventId: queueEvent.id,
          organizationId: queueEvent.organizationId,
          errorCode: code,
          retryable,
          ...(modelDiagnostics ?? {}),
        }));
      } catch (retryError) {
        this.logger.error(`Assistant event ${queueEvent.id} could not be rescheduled: ${retryError instanceof Error ? retryError.message : 'unknown error'}`);
      }
    } finally {
      this.processing = false;
    }
  }
}
