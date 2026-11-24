import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { EVOLUTION_WEBHOOK_EVENT } from './provider-webhook-events.constants';
import { EvolutionWebhookEnvelopeAdapter, MetaCloudWebhookEnvelopeAdapter } from './provider-webhook-envelope.adapters';

const WEBHOOK_FIXTURE = {
  evolutionSecret: 'evolution-webhook-secret-fixture',
  metaSecret: 'meta-app-secret-fixture',
  metaToken: 'meta-verify-token-fixture',
  signaturePrefix: 'sha256=',
  instance: 'instance-fixture',
  challengeMode: 'subscribe',
} as const;

describe('provider webhook envelope adapters', () => {
  it('authenticates and normalizes Evolution batch events without provider fields leaking further', () => {
    const adapter = new EvolutionWebhookEnvelopeAdapter();
    const payload = {
      event: EVOLUTION_WEBHOOK_EVENT.contactsSet.toUpperCase().replaceAll('.', '_'),
      instance: WEBHOOK_FIXTURE.instance,
      data: { contacts: [{ id: 'contact-fixture' }] },
    };

    expect(() => adapter.authenticate(WEBHOOK_FIXTURE.evolutionSecret, WEBHOOK_FIXTURE.evolutionSecret)).not.toThrow();
    expect(adapter.normalize(payload)).toEqual({
      instance: WEBHOOK_FIXTURE.instance,
      eventName: EVOLUTION_WEBHOOK_EVENT.contactsSet,
      items: [{ id: 'contact-fixture' }],
    });
    expect(() => adapter.authenticate('invalid-secret', WEBHOOK_FIXTURE.evolutionSecret)).toThrow(UnauthorizedException);
  });

  it('verifies Meta signatures against raw bytes and normalizes every entry change', () => {
    const adapter = new MetaCloudWebhookEnvelopeAdapter();
    const rawBody = Buffer.from('{"entry":[{"id":"account-fixture","changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"phone-fixture"}}}]}]}');
    const signature = createHmac('sha256', WEBHOOK_FIXTURE.metaSecret).update(rawBody).digest('hex');

    expect(() => adapter.authenticate(`${WEBHOOK_FIXTURE.signaturePrefix}${signature}`, rawBody, WEBHOOK_FIXTURE.metaSecret)).not.toThrow();
    expect(adapter.normalize(JSON.parse(rawBody.toString()))).toEqual([{
      entryId: 'account-fixture', field: 'messages', value: { metadata: { phone_number_id: 'phone-fixture' } },
    }]);
    expect(() => adapter.authenticate(`${WEBHOOK_FIXTURE.signaturePrefix}${signature}`, Buffer.from('different-body'), WEBHOOK_FIXTURE.metaSecret)).toThrow(UnauthorizedException);
    expect(adapter.verifyChallenge(WEBHOOK_FIXTURE.challengeMode, WEBHOOK_FIXTURE.metaToken, 'challenge-fixture', WEBHOOK_FIXTURE.metaToken)).toBe('challenge-fixture');
  });
});
