import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env';
import type { ChannelCredentialsDto } from './channels.dto';

export type EncryptedChannelCredentials = { ciphertext: string; iv: string; authTag: string };

@Injectable()
export class ChannelCredentialCryptoService {
  encrypt(organizationId: string, channelId: string, credentials: ChannelCredentialsDto): EncryptedChannelCredentials {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    cipher.setAAD(Buffer.from(`${organizationId}:${channelId}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
    return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
  }

  decrypt(organizationId: string, channelId: string, encrypted: EncryptedChannelCredentials): ChannelCredentialsDto {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(Buffer.from(`${organizationId}:${channelId}`));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as ChannelCredentialsDto;
  }

  private encryptionKey(): Buffer {
    const encoded = env.CHANNEL_CREDENTIALS_ENCRYPTION_KEY;
    if (!encoded) throw new ServiceUnavailableException({ code: 'CHANNEL_CREDENTIALS_KEY_MISSING', message: 'Channel credentials encryption is not configured.' });
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) throw new ServiceUnavailableException({ code: 'CHANNEL_CREDENTIALS_KEY_INVALID', message: 'Channel credentials encryption is not configured correctly.' });
    return key;
  }
}
