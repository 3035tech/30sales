import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../config/env';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { WhatsappTextProviderService } from '../inbox/whatsapp-text-provider.service';
import { AssistantLanguageModelService, AssistantRuntimeModelError } from './assistant-language-model.service';
import { AssistantRuntimeRepository } from './assistant-runtime.repository';
import { assistantInboundEventSchema, type AssistantQueueEventDto } from './assistant-runtime.dto';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class AssistantRuntimeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistantRuntimeWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: AssistantRuntimeRepository, private readonly model: AssistantLanguageModelService, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly textProvider: WhatsappTextProviderService, private readonly webhooks: WebhooksService) {}

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
    try {
      queueEvent = await this.repository.claimNextEvent();
      if (!queueEvent) return;
      const context = await this.repository.loadContext(queueEvent);
      if (!context || !context.enabled || context.automationMode !== 'assistant' || context.ownerUserId || !context.systemPrompt.trim()) {
        await this.repository.completeEvent(queueEvent.id);
        return;
      }
      if (context.event.messageType.toLowerCase() !== 'text' || context.messages.at(-1)?.role !== 'user') {
        await this.repository.escalateUnsupportedMessage(queueEvent, context.event);
        return;
      }
      const result = await this.model.generateReply({ model: context.model, systemPrompt: context.systemPrompt, messages: context.messages });
      await this.repository.sendIfStillAutomated({
        queueEventId: queueEvent.id,
        context,
        result,
        send: async (channel) => {
          const credentials = this.credentialCrypto.decrypt(context.event.organizationId, channel.channelId, channel.credentials);
          return this.textProvider.send({ provider: channel.provider, providerChannelId: channel.providerChannelId, recipientPhone: channel.recipientPhone, bodyText: result.replyText, credentials });
        },
      });
      await this.repository.completeEvent(queueEvent.id);
    } catch (error) {
      if (!queueEvent) {
        this.logger.error(`Assistant queue polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        return;
      }
      const code = error instanceof AssistantRuntimeModelError ? error.code : 'ASSISTANT_RUNTIME_PROCESSING_FAILED';
      const retryable = error instanceof AssistantRuntimeModelError ? error.retryable : true;
      try {
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
        this.logger.error(`Assistant event ${queueEvent.id} failed with ${code}${failed ? ' and was sent to human review' : ' and will be retried'}.`);
      } catch (retryError) {
        this.logger.error(`Assistant event ${queueEvent.id} could not be rescheduled: ${retryError instanceof Error ? retryError.message : 'unknown error'}`);
      }
    } finally {
      this.processing = false;
    }
  }
}
