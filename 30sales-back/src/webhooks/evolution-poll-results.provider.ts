import { Injectable } from '@nestjs/common';
import { evolutionFetch } from '../common/evolution-http-client';
import { assertPublicEvolutionTarget } from '../common/assert-public-evolution-target';
import { readLimitedJsonResponse } from '../common/read-limited-json-response';
import type { EvolutionPollResults } from './webhooks.dto';

type JsonRecord = Record<string, unknown>;
type PollCredentials = { readonly baseUrl: string; readonly apiKey: string; readonly instanceName: string; readonly remoteJid: string; readonly pollMessageId: string };

function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }

@Injectable()
export class EvolutionPollResultsProvider {
  async getVotes(input: PollCredentials): Promise<{ kind: 'results'; results: EvolutionPollResults } | { kind: 'unsupported' } | { kind: 'retry' }> {
    try {
      await assertPublicEvolutionTarget(input.baseUrl);
      const response = await evolutionFetch(`${input.baseUrl.replace(/\/+$/, '')}/chat/getPollVote/${encodeURIComponent(input.instanceName)}`, {
        method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', apikey: input.apiKey },
        body: JSON.stringify({ message: { key: { remoteJid: input.remoteJid, id: input.pollMessageId } } }),
        signal: AbortSignal.timeout(5_000), redirect: 'error',
      });
      if (response.status === 404 || response.status === 405) return { kind: 'unsupported' };
      if (!response.ok) return { kind: 'retry' };
      const result = await readLimitedJsonResponse(response, 256_000);
      if (!result.ok) return { kind: 'retry' };
      const root = record(result.payload); const poll = record(root.poll ?? record(root.data).poll ?? root.data ?? root);
      if (!Array.isArray(poll.options)) return { kind: 'retry' };
      const options = poll.options.slice(0, 20).flatMap((entry): EvolutionPollResults['options'] => {
        const option = record(entry); const name = text(option.optionName) ?? text(option.name);
        if (!name) return [];
        const rawVoters = Array.isArray(option.voters) ? option.voters.slice(0, 1000) : [];
        const voters = rawVoters.flatMap((entry): EvolutionPollResults['options'][number]['voters'] => {
          const voter = record(entry); const id = typeof entry === 'string' ? entry : text(voter.jid) ?? text(voter.id) ?? text(voter.phoneNumber);
          if (!id || id.length > 250) return [];
          const rawPhone = text(voter.phone) ?? text(voter.phoneNumber) ?? (id.includes('@') ? id.split('@')[0].split(':')[0] : id);
          const phone = rawPhone.replace(/\D/g, '');
          return [{ id, name: (text(voter.name) ?? text(voter.pushName))?.trim().slice(0, 160) || null, phone: phone.length >= 8 && phone.length <= 15 ? phone : null }];
        });
        const rawCount = option.votes ?? option.count ?? option.totalVotes;
        const count = typeof rawCount === 'number' && Number.isSafeInteger(rawCount) && rawCount >= voters.length ? rawCount : voters.length;
        return [{ name: name.trim().slice(0, 200), count, voters }];
      });
      return options.length ? { kind: 'results', results: { updatedAt: new Date().toISOString(), options } } : { kind: 'retry' };
    } catch {
      return { kind: 'retry' };
    }
  }
}
