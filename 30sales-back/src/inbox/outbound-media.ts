import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { OutboundMediaInputDto } from './inbox.dto';
import { OUTBOUND_MEDIA_ERROR, OUTBOUND_MEDIA_LIMIT_BYTES, OUTBOUND_MEDIA_MIME_TYPE, OUTBOUND_MEDIA_TYPE } from './outbound-media.constants';

export type IncomingMediaFile = { readonly originalname: string; readonly mimetype: string; readonly size: number; readonly buffer: Buffer };
export type PreparedOutboundMedia = { readonly metadata: OutboundMediaInputDto; readonly content: Buffer };
type MediaType = typeof OUTBOUND_MEDIA_TYPE[keyof typeof OUTBOUND_MEDIA_TYPE];

const mediaTypeByMime: Readonly<Record<string, MediaType>> = {
  [OUTBOUND_MEDIA_MIME_TYPE.jpeg]: OUTBOUND_MEDIA_TYPE.image,
  [OUTBOUND_MEDIA_MIME_TYPE.png]: OUTBOUND_MEDIA_TYPE.image,
  [OUTBOUND_MEDIA_MIME_TYPE.webp]: OUTBOUND_MEDIA_TYPE.image,
  [OUTBOUND_MEDIA_MIME_TYPE.mp4Video]: OUTBOUND_MEDIA_TYPE.video,
  [OUTBOUND_MEDIA_MIME_TYPE.threeGppVideo]: OUTBOUND_MEDIA_TYPE.video,
  [OUTBOUND_MEDIA_MIME_TYPE.pdf]: OUTBOUND_MEDIA_TYPE.document,
  [OUTBOUND_MEDIA_MIME_TYPE.mpegAudio]: OUTBOUND_MEDIA_TYPE.audio,
  [OUTBOUND_MEDIA_MIME_TYPE.aacAudio]: OUTBOUND_MEDIA_TYPE.audio,
  [OUTBOUND_MEDIA_MIME_TYPE.oggAudio]: OUTBOUND_MEDIA_TYPE.audio,
  [OUTBOUND_MEDIA_MIME_TYPE.amrAudio]: OUTBOUND_MEDIA_TYPE.audio,
  [OUTBOUND_MEDIA_MIME_TYPE.mp4Audio]: OUTBOUND_MEDIA_TYPE.audio,
  [OUTBOUND_MEDIA_MIME_TYPE.wavAudio]: OUTBOUND_MEDIA_TYPE.audio,
};

export function prepareOutboundMedia(file: IncomingMediaFile | undefined): PreparedOutboundMedia {
  if (!file) throw new BadRequestException({ code: OUTBOUND_MEDIA_ERROR.missing, message: 'Choose a file before sending.' });
  if (file.size === 0 || file.buffer.byteLength === 0) throw new BadRequestException({ code: OUTBOUND_MEDIA_ERROR.invalidContent, message: 'The selected file is empty.' });
  if (file.size > OUTBOUND_MEDIA_LIMIT_BYTES || file.buffer.byteLength > OUTBOUND_MEDIA_LIMIT_BYTES) throw new PayloadTooLargeException({ code: OUTBOUND_MEDIA_ERROR.tooLarge, message: 'The file exceeds the 16 MiB limit.' });
  const mimeType = file.mimetype.toLowerCase().split(';', 1)[0]?.trim() ?? '';
  const mediaType = mediaTypeByMime[mimeType];
  if (!mediaType) throw new BadRequestException({ code: OUTBOUND_MEDIA_ERROR.unsupportedType, message: 'This file type cannot be sent from the Inbox.' });
  if (!hasExpectedSignature(mimeType, file.buffer)) throw new BadRequestException({ code: OUTBOUND_MEDIA_ERROR.invalidContent, message: 'The file contents do not match the selected file type.' });
  const fileName = file.originalname.replace(/[\\/\r\n\u0000-\u001f]/g, '_').slice(0, 160) || 'attachment';
  return { metadata: { id: randomUUID(), mediaType, mimeType, fileName, sizeBytes: file.buffer.byteLength, sha256: createHash('sha256').update(file.buffer).digest('hex') }, content: file.buffer };
}

function hasExpectedSignature(mimeType: string, content: Buffer): boolean {
  const prefix = content.subarray(0, 12);
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.jpeg) return prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.png) return prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.webp) return prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP';
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.pdf) return prefix.toString('ascii', 0, 5) === '%PDF-';
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.oggAudio) return prefix.toString('ascii', 0, 4) === 'OggS' && content.includes(Buffer.from('OpusHead'));
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.wavAudio) return prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WAVE';
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.amrAudio) return prefix.toString('ascii', 0, 6) === '#!AMR\n';
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.mpegAudio) return prefix.toString('ascii', 0, 3) === 'ID3' || (prefix[0] === 0xff && ((prefix[1] ?? 0) & 0xe0) === 0xe0);
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.aacAudio) return prefix[0] === 0xff && (((prefix[1] ?? 0) & 0xf6) === 0xf0);
  if (mimeType === OUTBOUND_MEDIA_MIME_TYPE.mp4Audio || mimeType === OUTBOUND_MEDIA_MIME_TYPE.mp4Video || mimeType === OUTBOUND_MEDIA_MIME_TYPE.threeGppVideo) return prefix.toString('ascii', 4, 8) === 'ftyp';
  return false;
}
