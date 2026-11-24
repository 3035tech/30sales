import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { EVOLUTION_WEBHOOK_EVENT } from './provider-webhook-events.constants';

type JsonRecord = Record<string, unknown>;
const WEBHOOK_ENVELOPE_PROTOCOL = { metaChallengeMode: 'subscribe', signaturePrefix: 'sha256=', unknownField: 'unknown' } as const;

export type EvolutionWebhookEnvelope = {
  readonly instance: string | null;
  readonly eventName: string;
  readonly items: unknown[];
};

export type MetaCloudWebhookChange = {
  readonly entryId: string | null;
  readonly field: string;
  readonly value: JsonRecord;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function matchesWebhookSecret(presented: string | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false;
  const actual = Buffer.from(presented);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export class EvolutionWebhookEnvelopeAdapter {
  authenticate(presentedSecret: string | undefined, expectedSecret: string | undefined): void {
    if (!matchesWebhookSecret(presentedSecret, expectedSecret)) throw new UnauthorizedException();
  }

  normalize(payload: unknown): EvolutionWebhookEnvelope {
    const event = record(payload);
    const eventName = string(event.event)?.toLowerCase().replaceAll('_', '.').replaceAll('-', '.') ?? '';
    const eventData = record(event.data);
    const items = eventName === EVOLUTION_WEBHOOK_EVENT.chatsSet && Array.isArray(eventData.chats)
      ? eventData.chats
      : eventName === EVOLUTION_WEBHOOK_EVENT.contactsSet && Array.isArray(eventData.contacts)
        ? eventData.contacts
        : eventName === EVOLUTION_WEBHOOK_EVENT.messagesDelete && Array.isArray(eventData.keys)
          ? eventData.keys
          : Array.isArray(event.data) ? event.data : [event.data];
    return { instance: string(event.instance), eventName, items };
  }
}

export class MetaCloudWebhookEnvelopeAdapter {
  verifyChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined, expectedToken: string | undefined): string {
    if (mode !== WEBHOOK_ENVELOPE_PROTOCOL.metaChallengeMode || !challenge || !matchesWebhookSecret(token, expectedToken)) throw new UnauthorizedException();
    return challenge;
  }

  authenticate(signature: string | undefined, rawBody: Buffer, appSecret: string | undefined): void {
    if (!appSecret || !signature?.startsWith(WEBHOOK_ENVELOPE_PROTOCOL.signaturePrefix)) throw new UnauthorizedException();
    const expected = createHmac('sha256', appSecret).update(rawBody).digest();
    const suppliedHex = signature.slice(WEBHOOK_ENVELOPE_PROTOCOL.signaturePrefix.length);
    if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) throw new UnauthorizedException();
    const supplied = Buffer.from(suppliedHex, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new UnauthorizedException();
  }

  normalize(payload: unknown): MetaCloudWebhookChange[] {
    const root = record(payload);
    const changes: MetaCloudWebhookChange[] = [];
    for (const entryValue of Array.isArray(root.entry) ? root.entry : []) {
      const entry = record(entryValue);
      for (const changeValue of Array.isArray(entry.changes) ? entry.changes : []) {
        const change = record(changeValue);
        const field = string(change.field)?.replace(/[^a-z0-9_-]/gi, '_').slice(0, 120) || WEBHOOK_ENVELOPE_PROTOCOL.unknownField;
        changes.push({ entryId: string(entry.id), field, value: record(change.value) });
      }
    }
    return changes;
  }
}
