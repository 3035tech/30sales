import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AssignConversationDto, ConversationAssignDto, ConversationAutomationMode, ConversationAutomationUpdateDto, ConversationContactReconcileDto, ConversationContactDetailsUpdateDto, ConversationControlDto, ConversationMessageDeliveryDto, ConversationMessageSendDto, ConversationMessagesQueryDto, ConversationNoteCreateDto, ConversationPageDto, ConversationReadDto, ConversationRepositoryListDto, ConversationStatusUpdateDto, ConversationTagMutationDto, ConversationTagRemoveDto, ConversationOpportunityCreateDto, CreateConversationNoteDto, CreateConversationTagDto, LinkPreviewDto, ListConversationsQueryDto, MarkConversationReadInputDto, MessageRecordDto, SendConversationMessageDto, SendConversationMediaDto, SendConversationContactDto, type ConversationStatusUpdateInputDto, type ReconcileConversationContactInputDto, type CreateConversationOpportunityInputDto, type ConversationTypingPresenceInputDto, type UpdateConversationContactDetailsInputDto } from './inbox.dto';
import { CHANNEL_PROVIDER } from '../channels/channels.constants';

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip.startsWith('::ffff:')) return true
  if (ip.startsWith('fd') || ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('::')) return true
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

function extractOgTag(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const a = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']{1,500})["']`, 'i').exec(html)
  if (a) return a[1].trim()
  const b = new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+property=["']${escaped}["']`, 'i').exec(html)
  return b ? b[1].trim() : null
}

function extractMetaName(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const a = new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']{1,500})["']`, 'i').exec(html)
  if (a) return a[1].trim()
  const b = new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+name=["']${escaped}["']`, 'i').exec(html)
  return b ? b[1].trim() : null
}

function extractHtmlTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)
  return match ? match[1].trim() : null
}
import { InboxRepository } from './inbox.repository';
import { ChannelCredentialResolverService } from '../channels/channel-credential-resolver.service';
import { ChannelMessagingAdapterRegistry } from './channel-messaging-adapter.registry';
import { MEDIA_STORAGE, type MediaStorage } from '../attachments/media-storage';
import { prepareOutboundMedia, type IncomingMediaFile, type PreparedOutboundMedia } from './outbound-media';
import { OUTBOUND_MEDIA_ERROR, OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';
import { InboxRealtimeService } from './inbox-realtime.service';
import { hasOrganizationRole, ORGANIZATION_MANAGEMENT_ROLES } from '../auth/authorization.constants';
import { CHANNEL_CONNECTION_ERROR, CHANNEL_MESSAGE_QUOTA_ERROR } from '../channels/channels.constants';
import { INBOX_CONTACT_RECONCILIATION_ERROR_CODE, INBOX_CONTACT_RECONCILIATION_RESULT } from './inbox.constants';
import { ConversationGroupParticipantsResultDto, ConversationTagDto } from './inbox.dto';
import { EvolutionProfilePictureAdapter } from './evolution-profile-picture.adapter';
import { EvolutionLabelsAdapter } from './evolution-labels.adapter';

const PROFILE_PICTURE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_PICTURE_MISS_CACHE_MS = 24 * 60 * 60 * 1000;
const profilePictureRequests = new Map<string, Promise<void>>();

@Injectable()
export class InboxService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: InboxRepository, private readonly credentialResolver: ChannelCredentialResolverService, private readonly messagingAdapters: ChannelMessagingAdapterRegistry, private readonly realtime: InboxRealtimeService, @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage, private readonly profilePictures: EvolutionProfilePictureAdapter, private readonly evolutionLabels: EvolutionLabelsAdapter) {}

  async profilePicture(request: ApiRequestDto, conversationId: string): Promise<{ stream: Awaited<ReturnType<MediaStorage['read']>>; mimeType: string }> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const target = await this.repository.getProfilePictureTarget(context.organizationId, conversationId, context.userId, context.isPlatformOrganizationContext);
    if (!target) throw new NotFoundException({ code: 'CONVERSATION_PROFILE_PICTURE_NOT_FOUND', message: 'The profile picture was not found for this conversation.' });
    const now = Date.now();
    const checkedAt = target.fetchedAt?.getTime() ?? 0;
    const cacheWindow = target.storageKey ? PROFILE_PICTURE_CACHE_MS : PROFILE_PICTURE_MISS_CACHE_MS;
    if (target.storageKey && target.mimeType && now - checkedAt < cacheWindow) {
      try { if (await this.storage.exists(target.storageKey)) return { stream: await this.storage.read(target.storageKey), mimeType: target.mimeType }; } catch { /* Refresh below and retain a stable service error if unavailable. */ }
    } else if (!target.storageKey && target.fetchedAt && now - checkedAt < cacheWindow) {
      throw new NotFoundException({ code: 'CONVERSATION_PROFILE_PICTURE_NOT_FOUND', message: 'The profile picture was not found for this conversation.' });
    }

    const requestKey = `${context.organizationId}:${target.personId}`;
    let pending = profilePictureRequests.get(requestKey);
    if (!pending) {
      pending = (async () => {
        const credentials = await this.credentialResolver.resolve(context.organizationId, target.channelId, target.credentials);
        if (credentials.provider !== CHANNEL_PROVIDER.evolution) throw new NotFoundException({ code: 'CONVERSATION_PROFILE_PICTURE_NOT_FOUND', message: 'The profile picture was not found for this conversation.' });
        const photo = await this.profilePictures.fetch(target.instanceName, target.recipientId, credentials);
        if (!photo) {
          await this.repository.saveProfilePicture(context.organizationId, target.personId, null, null, new Date());
          return;
        }
        const storageKey = await this.storage.putProfilePicture(context.organizationId, target.personId, photo.content, photo.mimeType);
        await this.repository.saveProfilePicture(context.organizationId, target.personId, storageKey, photo.mimeType, new Date());
      })().finally(() => profilePictureRequests.delete(requestKey));
      profilePictureRequests.set(requestKey, pending);
    }
    try { await pending; }
    catch {
      if (target.storageKey && target.mimeType) {
        try { return { stream: await this.storage.read(target.storageKey), mimeType: target.mimeType }; } catch { /* Return the stable unavailable response below. */ }
      }
      throw new ServiceUnavailableException({ code: 'PROFILE_PICTURE_UNAVAILABLE', message: 'The profile picture is temporarily unavailable.' });
    }
    const refreshed = await this.repository.getProfilePictureTarget(context.organizationId, conversationId, context.userId, context.isPlatformOrganizationContext);
    if (!refreshed?.storageKey || !refreshed.mimeType) throw new NotFoundException({ code: 'CONVERSATION_PROFILE_PICTURE_NOT_FOUND', message: 'The profile picture was not found for this conversation.' });
    try { return { stream: await this.storage.read(refreshed.storageKey), mimeType: refreshed.mimeType }; }
    catch { throw new NotFoundException({ code: 'CONVERSATION_PROFILE_PICTURE_NOT_FOUND', message: 'The profile picture was not found for this conversation.' }); }
  }
  async events(request: ApiRequestDto): Promise<Observable<MessageEvent>> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.realtime.stream(context.organizationId, context.userId);
  }
  async setTypingPresence(request: ApiRequestDto, conversationId: string, input: ConversationTypingPresenceInputDto): Promise<{ supported: boolean }> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const target = await this.repository.getTypingPresenceTarget(context.organizationId, conversationId, context.userId, context.isPlatformOrganizationContext);
    if (!target || target.provider !== CHANNEL_PROVIDER.evolution) return { supported: false };
    try {
      const credentials = await this.credentialResolver.resolve(context.organizationId, target.channelId, target.credentials);
      if (credentials.provider !== CHANNEL_PROVIDER.evolution) return { supported: false };
      await this.messagingAdapters.sendPresence({ providerChannelId: target.providerChannelId, recipientPhone: target.recipientPhone, credentials, state: input.state });
      return { supported: true };
    } catch {
      return { supported: false };
    }
  }
  async list(request: ApiRequestDto, query: ListConversationsQueryDto): Promise<ConversationPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const canManageAll = hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES);
    return this.repository.list(new ConversationRepositoryListDto(context.organizationId, context.userId, canManageAll, query));
  }
  async channels(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listChannels(context.organizationId, context.userId, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES));
  }
  async tags(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listTags(context.organizationId);
  }
  async assignees(request: ApiRequestDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    return this.repository.listAssignees(context.organizationId);
  }
  async messages(request: ApiRequestDto, conversationId: string, query: { limit: number; offset: number; search: string }): Promise<MessageRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const records = await this.repository.listMessages(new ConversationMessagesQueryDto(context.organizationId, conversationId, context.userId, query.limit, query.offset, query.search, context.isPlatformOrganizationContext));
    if (!records) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    return records;
  }
  async hideMessage(request: ApiRequestDto, conversationId: string, messageId: string) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const hidden = await this.repository.hideMessageForUser({ organizationId: context.organizationId, conversationId, messageId, userId: context.userId });
    if (!hidden) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Message was not found in the active conversation.' });
    return { hidden: true };
  }
  async groupParticipants(request: ApiRequestDto, conversationId: string): Promise<ConversationGroupParticipantsResultDto> {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const target = await this.repository.getGroupParticipantsTarget(context.organizationId, conversationId, context.userId, context.isPlatformOrganizationContext);
    if (!target) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Group conversation was not found in the active organization.' });
    if (target.provider !== 'evolution' && target.provider !== 'whatsapp_cloud_api') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Group conversation was not found in the active organization.' });
    // Provider recipient IDs are opaque in the Inbox domain. Each adapter validates
    // its own identifier format (Evolution JIDs vs Meta group IDs).
    if (!target.providerChannelId || !target.groupJid || target.groupJid.length > 300 || !target.credentialsCiphertext || !target.credentialsIv || !target.credentialsAuthTag) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Group conversation was not found in the active organization.' });
    const credentials = await this.credentialResolver.resolve(context.organizationId, target.channelId, { ciphertext: target.credentialsCiphertext, iv: target.credentialsIv, authTag: target.credentialsAuthTag });
    if (credentials.provider !== target.provider) throw new BadRequestException({ code: 'CHANNEL_PROVIDER_MISMATCH', message: 'The channel provider configuration is invalid.' });
    let result: Awaited<ReturnType<ChannelMessagingAdapterRegistry['listGroupParticipants']>>;
    try {
      result = await this.messagingAdapters.listGroupParticipants({ providerChannelId: target.providerChannelId, groupJid: target.groupJid, credentials });
    } catch (error) {
      const cached = await this.repository.listStoredGroupParticipants(context.organizationId, conversationId, target.provider);
      if (cached.length > 0) return new ConversationGroupParticipantsResultDto(true, cached, true);
      throw error;
    }
    if (!result.supported) return new ConversationGroupParticipantsResultDto(false, []);
    const participants = await this.repository.syncGroupParticipantsSnapshot({ organizationId: context.organizationId, conversationId, provider: target.provider, participants: result.participants });
    return new ConversationGroupParticipantsResultDto(true, participants);
  }
  async markRead(request: ApiRequestDto, conversationId: string, input: MarkConversationReadInputDto) {
    const context = await this.tenantAccess.require(request, 'read', 'inbox');
    const result = await this.repository.markRead(new ConversationReadDto(context.organizationId, conversationId, context.userId, input.lastInboundMessageId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'invalid_message') throw new BadRequestException({ code: 'INVALID_READ_CURSOR', message: 'The read cursor must reference an inbound message in this conversation.' });
    return result;
  }
  async getLinkPreview(request: ApiRequestDto, rawUrl: string): Promise<LinkPreviewDto | null> {
    await this.tenantAccess.require(request, 'read', 'inbox');
    if (!rawUrl || rawUrl.length > 2048) return null;
    let parsed: URL;
    try { parsed = new URL(rawUrl) } catch { return null }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    let resolvedAddress: string;
    try { resolvedAddress = (await lookup(parsed.hostname)).address } catch { return null }
    if (isPrivateIp(resolvedAddress)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    let html: string;
    try {
      const response = await fetch(rawUrl, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)', Accept: 'text/html' }, redirect: 'follow' });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) return null;
      const decoder = new TextDecoder();
      const reader = response.body?.getReader();
      let chunk = ''; let totalBytes = 0;
      if (reader) {
        while (totalBytes < 300_000) {
          const { done, value } = await reader.read();
          if (done) break;
          chunk += decoder.decode(value, { stream: true }); totalBytes += value.byteLength;
          if (chunk.includes('</head>') || chunk.includes('<body')) break;
        }
        await reader.cancel().catch(() => undefined);
      }
      html = chunk;
    } catch { return null } finally { clearTimeout(timer) }
    const title = extractOgTag(html, 'og:title') ?? extractHtmlTitle(html);
    const description = extractOgTag(html, 'og:description') ?? extractMetaName(html, 'description');
    const rawImage = extractOgTag(html, 'og:image');
    let image: string | null = null;
    if (rawImage) { try { const imgUrl = new URL(rawImage, rawUrl); if (imgUrl.protocol === 'http:' || imgUrl.protocol === 'https:') image = imgUrl.href } catch { /* ignore */ } }
    return new LinkPreviewDto(rawUrl, title, description, image);
  }
  async claim(request: ApiRequestDto, conversationId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.claim(new ConversationControlDto(context.organizationId, conversationId, context.userId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_ALREADY_ASSIGNED', message: 'Another teammate already owns this conversation.' });
    return result;
  }
  async release(request: ApiRequestDto, conversationId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.release(new ConversationControlDto(context.organizationId, conversationId, context.userId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can release this conversation.' });
    return result;
  }
  async assign(request: ApiRequestDto, conversationId: string, input: AssignConversationDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.assign(new ConversationAssignDto(context.organizationId, conversationId, context.userId, input.ownerUserId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can transfer this conversation.' });
    if (result === 'invalid_assignee') throw new BadRequestException({ code: 'INVALID_CONVERSATION_ASSIGNEE', message: 'The assignee must be an active member of the current organization.' });
    return result;
  }
  async setAutomationMode(request: ApiRequestDto, conversationId: string, mode: ConversationAutomationMode) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    if (mode === 'assistant' && !await this.repository.isAssistantEnabled(context.organizationId, conversationId)) throw new ConflictException({ code: 'ASSISTANT_AGENT_DISABLED', message: 'Enable Assistant for this business line before returning the conversation to automated handling.' });
    const result = await this.repository.setAutomationMode(new ConversationAutomationUpdateDto(context.organizationId, conversationId, context.userId, mode, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'owned') throw new ConflictException({ code: 'CONVERSATION_OWNED_BY_ANOTHER_USER', message: 'Only the current owner can change this conversation automation mode.' });
    return result;
  }
  async setStatus(request: ApiRequestDto, conversationId: string, input: ConversationStatusUpdateInputDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.setStatus(new ConversationStatusUpdateDto(context.organizationId, conversationId, context.userId, input.status, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the current conversation owner can change its status.' });
    return result;
  }
  async reconcileContact(request: ApiRequestDto, conversationId: string, input: ReconcileConversationContactInputDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.reconcileContact(new ConversationContactReconcileDto(context.organizationId, conversationId, context.userId, input.leadId, input.name, input.phone, input.isPrimary, input.isInterested, request.correlationId, context.isPlatformOrganizationContext));
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.notFound) throw new NotFoundException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.notFound, message: 'Conversation or lead was not found in the active organization.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.missingContact) throw new ConflictException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.missingContact, message: 'This conversation has no contact to associate.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.invalidPhone) throw new BadRequestException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.invalidPhone, message: 'Enter a valid international phone number.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.notOwner) throw new ForbiddenException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.ownerRequired, message: 'Take ownership of the conversation before updating its contact.' });
    if (result === INBOX_CONTACT_RECONCILIATION_RESULT.contactSharedAcrossLines) throw new ConflictException({ code: INBOX_CONTACT_RECONCILIATION_ERROR_CODE.contactSharedAcrossLines, message: 'This contact is linked to another business line. Update the shared contact from an organization management workflow.' });
    return result;
  }
  async updateContactDetails(request: ApiRequestDto, conversationId: string, input: UpdateConversationContactDetailsInputDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.updateContactDetails(new ConversationContactDetailsUpdateDto(context.organizationId, conversationId, context.userId, input.name, input.email || null, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'missing_contact') throw new ConflictException({ code: 'CONVERSATION_CONTACT_MISSING', message: 'This conversation has no contact to update.' });
    if (result === 'contact_shared_across_lines') throw new ConflictException({ code: 'CONTACT_SHARED_ACROSS_BUSINESS_LINES', message: 'This contact is linked to another business line and cannot be edited here.' });
    return result;
  }
  async createOpportunityFromConversation(request: ApiRequestDto, conversationId: string, input: CreateConversationOpportunityInputDto) {
    const context = await this.tenantAccess.require(request, 'create', 'pipeline');
    const result = await this.repository.createOpportunityFromConversation(new ConversationOpportunityCreateDto(context.organizationId, conversationId, context.userId, input, hasOrganizationRole(context.role, ORGANIZATION_MANAGEMENT_ROLES), context.isPlatformOrganizationContext, request.correlationId));
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can create an opportunity from it.' });
    if (result === 'conversation_linked_elsewhere') throw new ConflictException({ code: 'CONVERSATION_OPPORTUNITY_CONFLICT', message: 'This conversation is already linked to a different opportunity.' });
    if (result === 'lead_unavailable') throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Choose a lead in the same business line as this conversation.' });
    if (result === 'business_line_pipeline_unavailable') throw new ConflictException({ code: 'BUSINESS_LINE_PIPELINE_UNAVAILABLE', message: 'Configure an active default pipeline for this conversation’s business line before creating an opportunity.' });
    if (result === 'lead_selection_required') throw new ConflictException({ code: 'LEAD_SELECTION_REQUIRED', message: 'This contact is linked to multiple leads. Select the correct lead before continuing.' });
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    return result;
  }
  async sendMessage(request: ApiRequestDto, conversationId: string, input: SendConversationMessageDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    if (input.mode === 'reaction' && (!input.targetMessageId || [...new Intl.Segmenter().segment(input.bodyText)].length !== 1 || !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(input.bodyText))) throw new BadRequestException({ code: 'INVALID_MESSAGE_REACTION', message: 'A reaction must be a single emoji and target a message.' });
    return this.sendHumanMessage(context.organizationId, context.userId, conversationId, input.bodyText, input.idempotencyKey, request.correlationId, null, null, context.isPlatformOrganizationContext, input.targetMessageId ?? null, input.mode);
  }
  async sendMediaMessage(request: ApiRequestDto, conversationId: string, input: SendConversationMediaDto, file: IncomingMediaFile | undefined): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const media = prepareOutboundMedia(file);
    const bodyText = input.bodyText?.trim() || null;
    if (media.metadata.mediaType === OUTBOUND_MEDIA_TYPE.audio && bodyText) throw new BadRequestException({ code: OUTBOUND_MEDIA_ERROR.audioCaptionUnsupported, message: 'Audio messages cannot include a caption. Send the text separately.' });
    return this.sendHumanMessage(context.organizationId, context.userId, conversationId, bodyText, input.idempotencyKey, request.correlationId, media, null, context.isPlatformOrganizationContext);
  }
  async sendContactMessage(request: ApiRequestDto, conversationId: string, input: SendConversationContactDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const phoneDigits = input.phoneNumber.replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15 || phoneDigits.startsWith('0')) throw new BadRequestException({ code: 'INVALID_CONTACT_PHONE', message: 'Enter a valid international phone number, including the country code.' });
    const bodyText = [input.fullName, `+${phoneDigits}`, input.organization, input.email, input.url].filter(Boolean).join(' · ');
    return this.sendHumanMessage(context.organizationId, context.userId, conversationId, bodyText, input.idempotencyKey, request.correlationId, null, input, context.isPlatformOrganizationContext);
  }
  private async sendHumanMessage(organizationId: string, userId: string, conversationId: string, bodyText: string | null, idempotencyKey: string, correlationId: string | null, media: PreparedOutboundMedia | null, contact: SendConversationContactDto | null, isPlatformOrganizationContext: boolean, targetMessageId: string | null = null, mode: 'reply' | 'reaction' = 'reply'): Promise<MessageRecordDto> {
    const prepared = await this.repository.prepareMessageSend(new ConversationMessageSendDto(organizationId, conversationId, userId, bodyText, idempotencyKey, correlationId, media?.metadata ?? null, isPlatformOrganizationContext, targetMessageId, mode));
    if (prepared === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (prepared === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can send a human reply.' });
    if (prepared === 'automation_not_human') throw new ConflictException({ code: 'CONVERSATION_NOT_IN_HUMAN_MODE', message: 'Assume the conversation before sending a human reply.' });
    if (prepared === 'channel_unavailable') throw new ConflictException({ code: 'CHANNEL_UNAVAILABLE', message: 'The conversation has no active WhatsApp channel.' });
    if (prepared === 'credentials_missing') throw new ConflictException({ code: 'CHANNEL_CREDENTIALS_MISSING', message: 'Configure credentials for the WhatsApp channel before replying.' });
    if (prepared === 'recipient_missing') throw new BadRequestException({ code: 'RECIPIENT_PHONE_MISSING', message: 'The contact needs a valid phone number before sending.' });
    if (prepared === 'target_message_unavailable') throw new BadRequestException({ code: 'TARGET_MESSAGE_UNAVAILABLE', message: 'The selected message cannot be used as a reply or reaction.' });
    if (prepared === CHANNEL_MESSAGE_QUOTA_ERROR.dailyLimitReached) throw new ConflictException({ code: CHANNEL_MESSAGE_QUOTA_ERROR.dailyLimitReached, message: 'The daily message limit for this WhatsApp number has been reached.' });
    if (prepared === CHANNEL_CONNECTION_ERROR.unavailable) throw new ConflictException({ code: CHANNEL_CONNECTION_ERROR.unavailable, message: 'The Evolution API instance is not connected. Restore its connection before sending.' });
    if (prepared.kind === 'duplicate') return prepared.message;
    let delivery: { deliveryState: 'accepted' | 'failed' | 'unknown'; externalMessageId: string | null };
    if (media) {
      let storageKey: string | null = null;
      try {
        storageKey = await this.storage.put(organizationId, media.metadata.id, media.content, media.metadata.mimeType);
        if (!await this.repository.markOutboundAttachmentAvailable(organizationId, prepared.message.id, media.metadata.id, storageKey)) throw new Error('MEDIA_ATTACHMENT_RECORD_MISSING');
      } catch {
        if (storageKey) await this.storage.remove(storageKey).catch(() => undefined);
        await this.repository.markOutboundAttachmentFailed(organizationId, prepared.message.id, media.metadata.id);
        const failed = await this.repository.updateMessageDelivery(new ConversationMessageDeliveryDto(organizationId, prepared.message.id, userId, 'failed', null, correlationId));
        if (!failed) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'The outbound message could not be found.' });
        return failed;
      }
    }
    try {
      const credentials = await this.credentialResolver.resolve(organizationId, prepared.channelId, prepared.credentials);
      if (credentials.provider !== prepared.provider) throw new Error('Channel credential provider mismatch.');
      const destination = { providerChannelId: prepared.providerChannelId, recipientPhone: prepared.recipientPhone, credentials, organizationId, channelId: prepared.channelId, messageId: prepared.message.id, correlationId };
      delivery = contact
        ? await this.messagingAdapters.sendContact({ ...destination, contact })
        : media
          ? await this.messagingAdapters.sendMedia({ ...destination, bodyText: bodyText ?? '', media })
          : await this.messagingAdapters.sendText({ ...destination, bodyText: bodyText ?? '', targetMessage: prepared.targetMessage, mode });
    } catch {
      delivery = { deliveryState: 'failed', externalMessageId: null };
    }
    const updated = await this.repository.updateMessageDelivery(new ConversationMessageDeliveryDto(organizationId, prepared.message.id, userId, delivery.deliveryState, delivery.externalMessageId, correlationId));
    if (!updated) throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'The outbound message could not be found.' });
    return updated;
  }
  async addNote(request: ApiRequestDto, conversationId: string, input: CreateConversationNoteDto): Promise<MessageRecordDto> {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.addNote(new ConversationNoteCreateDto(context.organizationId, conversationId, context.userId, input.bodyText, input.idempotencyKey, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can add an internal note.' });
    return result;
  }
  async addTag(request: ApiRequestDto, conversationId: string, input: CreateConversationTagDto) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const result = await this.repository.addTag(new ConversationTagMutationDto(context.organizationId, conversationId, context.userId, input.name, input.color, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can add tags.' });
    const target = await this.repository.getEvolutionTagSyncTarget(context.organizationId, conversationId, result.id, context.userId, context.isPlatformOrganizationContext);
    if (!target || target.provider !== CHANNEL_PROVIDER.evolution || !target.phone || !target.ciphertext || !target.iv || !target.authTag) return result;
    try {
      const credentials = await this.credentialResolver.resolve(context.organizationId, target.channelId, { ciphertext: target.ciphertext, iv: target.iv, authTag: target.authTag });
      if (credentials.provider !== CHANNEL_PROVIDER.evolution) return result;
      const labels = await this.evolutionLabels.list(target.instanceName, credentials);
      const matchedLabel = labels.find((label) => label.name.trim().toLocaleLowerCase('en-US') === result.name.trim().toLocaleLowerCase('en-US'));
      if (!matchedLabel) return result;
      await this.evolutionLabels.apply(target.instanceName, target.phone.replace(/\D/g, ''), matchedLabel.id, true, credentials);
      await this.repository.setEvolutionTagProviderState(context.organizationId, conversationId, result.id, 'provider_accepted', matchedLabel.id);
      return new ConversationTagDto(result.id, result.name, result.color, 'both', 'provider_accepted');
    } catch {
      await this.repository.setEvolutionTagProviderState(context.organizationId, conversationId, result.id, 'failed', null);
      return new ConversationTagDto(result.id, result.name, result.color, 'local', 'failed');
    }
  }
  async removeTag(request: ApiRequestDto, conversationId: string, tagId: string) {
    const context = await this.tenantAccess.require(request, 'assign', 'inbox');
    const target = await this.repository.getEvolutionTagSyncTarget(context.organizationId, conversationId, tagId, context.userId, context.isPlatformOrganizationContext);
    if (target?.provider === CHANNEL_PROVIDER.evolution && target.labelId && target.origin !== 'local' && target.phone && target.ciphertext && target.iv && target.authTag) {
      try {
        const credentials = await this.credentialResolver.resolve(context.organizationId, target.channelId, { ciphertext: target.ciphertext, iv: target.iv, authTag: target.authTag });
        if (credentials.provider === CHANNEL_PROVIDER.evolution) await this.evolutionLabels.apply(target.instanceName, target.phone.replace(/\D/g, ''), target.labelId, false, credentials);
      } catch {
        await this.repository.setEvolutionTagProviderState(context.organizationId, conversationId, tagId, 'failed', target.labelId);
        throw new ServiceUnavailableException({ code: 'EVOLUTION_LABEL_SYNC_FAILED', message: 'A etiqueta permaneceu na conversa porque a Evolution não confirmou a solicitação.' });
      }
    }
    const result = await this.repository.removeTag(new ConversationTagRemoveDto(context.organizationId, conversationId, tagId, context.userId, request.correlationId, context.isPlatformOrganizationContext));
    if (result === 'not_found') throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found in the active organization.' });
    if (result === 'not_owner') throw new ForbiddenException({ code: 'CONVERSATION_OWNER_REQUIRED', message: 'Only the conversation owner can remove tags.' });
    return { success: true };
  }
}
