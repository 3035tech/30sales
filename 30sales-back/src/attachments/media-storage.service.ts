import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { env } from '../config/env';
import type { MediaStorage } from './media-storage';

@Injectable()
export class MediaStorageService implements MediaStorage {
  async put(organizationId: string, attachmentId: string, content: Buffer): Promise<string> {
    const key = `${organizationId}/${attachmentId}`;
    const destination = this.resolveKey(key);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await chmod(dirname(destination), 0o700);
    await writeFile(destination, content, { mode: 0o600 });
    return key;
  }

  read(key: string) {
    return createReadStream(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try { return (await stat(this.resolveKey(key))).isFile(); }
    catch { return false; }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    const root = resolve(env.MEDIA_STORAGE_DIR);
    const destination = resolve(root, key);
    const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
    if (!isAbsolute(root) || !destination.startsWith(rootPrefix)) throw new Error('Invalid media storage key.');
    return destination;
  }
}
