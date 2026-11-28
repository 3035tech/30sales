import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { MediaStorage } from './media-storage';

@Injectable()
export class S3MediaStorageService implements MediaStorage {
  private readonly bucketName = '30sales';
  private readonly client = new S3Client({ region: 'eu-west-1' });

  async put(organizationId: string, attachmentId: string, content: Buffer, mimeType: string | null): Promise<string> {
    const key = this.createKey(organizationId, attachmentId);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: this.safeMimeType(mimeType),
      ServerSideEncryption: 'AES256',
    }));
    return key;
  }

  async putProfilePicture(organizationId: string, personId: string, content: Buffer, mimeType: string): Promise<string> {
    const key = this.validateProfilePictureKey(`profile-pictures/${organizationId}/${personId}`);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: this.safeMimeType(mimeType),
      ServerSideEncryption: 'AES256',
    }));
    return key;
  }

  async read(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: this.validateAnyKey(key) }));
    if (!(response.Body instanceof Readable)) throw new Error('S3 returned a non-streaming media body.');
    return response.Body;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: this.validateAnyKey(key) }));
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: this.validateAnyKey(key) }));
  }

  private createKey(organizationId: string, attachmentId: string): string {
    return this.validateKey(`${organizationId}/${attachmentId}`);
  }

  private validateKey(key: string): string {
    const [organizationId, attachmentId, ...rest] = key.split('/');
    if (rest.length || !/^[0-9a-f-]{36}$/i.test(organizationId ?? '') || !/^[0-9a-f-]{36}$/i.test(attachmentId ?? '')) {
      throw new Error('Invalid media storage key.');
    }
    return key;
  }

  private validateProfilePictureKey(key: string): string {
    const [prefix, organizationId, personId, ...rest] = key.split('/');
    if (prefix !== 'profile-pictures' || rest.length || !/^[0-9a-f-]{36}$/i.test(organizationId ?? '') || !/^[0-9a-f-]{36}$/i.test(personId ?? '')) {
      throw new Error('Invalid profile picture storage key.');
    }
    return key;
  }

  private validateAnyKey(key: string): string {
    return key.startsWith('profile-pictures/') ? this.validateProfilePictureKey(key) : this.validateKey(key);
  }

  private safeMimeType(value: string | null): string {
    const mimeType = value?.split(';', 1)[0]?.trim().toLowerCase();
    return mimeType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType) ? mimeType : 'application/octet-stream';
  }

  private isNotFound(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('$metadata' in error)) return false;
    const metadata = error.$metadata;
    return typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata && metadata.httpStatusCode === 404;
  }
}
