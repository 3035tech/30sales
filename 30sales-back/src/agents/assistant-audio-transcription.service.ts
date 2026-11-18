import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../config/env';
import { MEDIA_STORAGE, type MediaStorage } from '../attachments/media-storage';
import { AssistantRuntimeModelError } from './assistant-language-model.service';
import { ASSISTANT_TRANSCRIPTION_MODEL } from './assistant-runtime.constants';

const transcriptionResponseSchema = z.object({
  text: z.string().trim().min(1).max(16000),
  usage: z.object({ type: z.literal('duration'), seconds: z.number().finite().positive() }).optional(),
});
const maximumAudioBytes = 25_000_000;

@Injectable()
export class AssistantAudioTranscriptionService {
  constructor(@Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  async transcribe(input: { organizationId: string; attachmentId: string; storageKey: string; mimeType: string | null; fileName: string | null }): Promise<{ text: string; durationSeconds: number | null; audioSizeBytes: number; latencyMs: number }> {
    const startedAt = Date.now();
    if (!env.OPENAI_API_KEY) throw new AssistantRuntimeModelError('ASSISTANT_TRANSCRIPTION_KEY_MISSING', false);
    if (input.storageKey !== `${input.organizationId}/${input.attachmentId}`) throw new AssistantRuntimeModelError('ASSISTANT_AUDIO_STORAGE_KEY_INVALID', false);
    const stream = await this.storage.read(input.storageKey);
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) throw new AssistantRuntimeModelError('ASSISTANT_AUDIO_STREAM_INVALID', false);
      const content = Buffer.from(chunk);
      totalBytes += content.byteLength;
      if (totalBytes > maximumAudioBytes) throw new AssistantRuntimeModelError('ASSISTANT_AUDIO_TOO_LARGE', false);
      chunks.push(content);
    }
    if (!totalBytes) throw new AssistantRuntimeModelError('ASSISTANT_AUDIO_EMPTY', false);

    const mimeType = input.mimeType?.split(';', 1)[0]?.trim() || 'application/octet-stream';
    const extension = input.fileName?.split('.').at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    const safeFileName = `audio.${extension || 'ogg'}`;
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(Buffer.concat(chunks))], { type: mimeType }), safeFileName);
    form.append('model', ASSISTANT_TRANSCRIPTION_MODEL);

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form,
        signal: AbortSignal.timeout(45000), redirect: 'error',
      });
    } catch {
      throw new AssistantRuntimeModelError('ASSISTANT_TRANSCRIPTION_CONNECTION_FAILED', true);
    }
    if (!response.ok) throw new AssistantRuntimeModelError(`ASSISTANT_TRANSCRIPTION_HTTP_${response.status}`, response.status === 429 || response.status >= 500);
    const parsed = transcriptionResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AssistantRuntimeModelError('ASSISTANT_TRANSCRIPTION_RESPONSE_INVALID', false);
    return { text: parsed.data.text, durationSeconds: parsed.data.usage?.seconds ?? null, audioSizeBytes: totalBytes, latencyMs: Math.max(0, Date.now() - startedAt) };
  }
}
