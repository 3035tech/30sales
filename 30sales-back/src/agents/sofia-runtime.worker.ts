import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../config/env';
import { ChannelCredentialCryptoService } from '../channels/channel-credential-crypto.service';
import { WhatsappTextProviderService } from '../inbox/whatsapp-text-provider.service';
import { SofiaLanguageModelService, SofiaRuntimeModelError } from './sofia-language-model.service';
import { SofiaRuntimeRepository } from './sofia-runtime.repository';
import type { SofiaQueueEventDto } from './sofia-runtime.dto';

@Injectable()
export class SofiaRuntimeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SofiaRuntimeWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repository: SofiaRuntimeRepository, private readonly model: SofiaLanguageModelService, private readonly credentialCrypto: ChannelCredentialCryptoService, private readonly textProvider: WhatsappTextProviderService) {}

  onModuleInit(): void {
    if (!env.ANTHROPIC_API_KEY) {
      this.logger.warn('Sofia runtime is disabled because ANTHROPIC_API_KEY is not configured.');
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
    let queueEvent: SofiaQueueEventDto | null = null;
    try {
      queueEvent = await this.repository.claimNextEvent();
      if (!queueEvent) return;
      const context = await this.repository.loadContext(queueEvent);
      if (!context || !context.enabled || context.automationMode !== 'sofia' || context.ownerUserId || !context.systemPrompt.trim()) {
        await this.repository.completeEvent(queueEvent.id);
        return;
      }
      const replyText = await this.model.generateReply({ model: context.model, systemPrompt: context.systemPrompt, messages: context.messages });
      await this.repository.sendIfStillAutomated({
        queueEventId: queueEvent.id,
        context,
        replyText,
        send: async (channel) => {
          const credentials = this.credentialCrypto.decrypt(context.event.organizationId, channel.channelId, channel.credentials);
          return this.textProvider.send({ provider: channel.provider, providerChannelId: channel.providerChannelId, recipientPhone: channel.recipientPhone, bodyText: replyText, credentials });
        },
      });
      await this.repository.completeEvent(queueEvent.id);
    } catch (error) {
      if (!queueEvent) {
        this.logger.error(`Sofia queue polling failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        return;
      }
      const code = error instanceof SofiaRuntimeModelError ? error.code : 'SOFIA_RUNTIME_PROCESSING_FAILED';
      const retryable = error instanceof SofiaRuntimeModelError ? error.retryable : true;
      try {
        const terminal = await this.repository.retryOrFail(queueEvent, code, retryable);
        this.logger.error(`Sofia event ${queueEvent.id} failed with ${code}${terminal ? ' and was sent to human review' : ' and will be retried'}.`);
      } catch (retryError) {
        this.logger.error(`Sofia event ${queueEvent.id} could not be rescheduled: ${retryError instanceof Error ? retryError.message : 'unknown error'}`);
      }
    } finally {
      this.processing = false;
    }
  }
}
