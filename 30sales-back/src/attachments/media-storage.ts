import type { Readable } from 'node:stream';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface MediaStorage {
  put(organizationId: string, attachmentId: string, content: Buffer, mimeType: string | null): Promise<string>;
  putProfilePicture(organizationId: string, personId: string, content: Buffer, mimeType: string): Promise<string>;
  read(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}
