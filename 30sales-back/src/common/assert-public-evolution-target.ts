import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeExternalTargetError extends Error {
  constructor() {
    super('Evolution API host resolves to a non-public address.');
    this.name = 'UnsafeExternalTargetError';
  }
}

export async function assertPublicEvolutionTarget(baseUrl: string): Promise<void> {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new UnsafeExternalTargetError();
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('2001:db8:');
}
