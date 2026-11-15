import type { ReadStream } from 'node:fs';

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface MediaStorage {
  put(organizationId: string, attachmentId: string, content: Buffer): Promise<string>;
  read(key: string): ReadStream;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}
