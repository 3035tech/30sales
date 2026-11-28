import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';

export class UnsafeExternalTargetError extends Error {
  constructor() {
    super('Evolution API host resolves to a non-public address.');
    this.name = 'UnsafeExternalTargetError';
  }
}

export async function assertPublicEvolutionTarget(baseUrl: string): Promise<void> {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new UnsafeExternalTargetError();
  const addresses = await resolvePublicAddresses(url.hostname.replace(/^\[|\]$/g, '').toLowerCase());
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new UnsafeExternalTargetError();
}

/** Validate DNS only when Node opens a socket; pooled connections skip repeated DNS work. */
export const lookupPublicEvolutionTarget: LookupFunction = (rawHostname, options, callback) => {
  const hostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase();
  void resolvePublicAddresses(hostname).then((addresses) => {
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new UnsafeExternalTargetError();
    const family = options.family;
    const candidates = family ? addresses.filter((entry) => entry.family === family) : addresses;
    if (!candidates.length) throw new UnsafeExternalTargetError();
    if (options.all) callback(null, candidates);
    else {
      const selected = candidates[0];
      if (!selected) throw new UnsafeExternalTargetError();
      callback(null, selected.address, selected.family);
    }
  }).catch((error: unknown) => callback(error as NodeJS.ErrnoException, '', 0));
};

async function resolvePublicAddresses(host: string): Promise<Array<{ address: string; family: number }>> {
  if (isIP(host)) return [{ address: host, family: isIP(host) }];
  return lookup(host, { all: true, verbatim: true });
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && ((b === 0 && (c === 0 || c === 2 || c === 88)) || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);
  const value = ipv6ToBigInt(normalized);
  if (value === null) return true;
  const inRange = (prefix: bigint, prefixLength: number): boolean => value >> BigInt(128 - prefixLength) === prefix;
  return value === 0n || value === 1n || inRange(0xfc00n >> 9n, 7) || inRange(0xfe80n >> 6n, 10) || inRange(0xff00n >> 8n, 8) ||
    inRange(0x0064ff9b0000000000000000n, 96) || inRange(0x0100000000000000n, 64) || inRange(0x20010db8n, 32) ||
    inRange(0x20010000n >> 9n, 23) || inRange(0x2002n, 16) || !inRange(0x2000n, 3);
}

function ipv6ToBigInt(address: string): bigint | null {
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[\da-f]{1,4}$/i.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}
